import { randomUUID } from "node:crypto";
import { cacheSet } from "@/lib/fpl";
import { pool } from "@/db";
import { computeOptimizerForEntry } from "@/server/optimizerTask";
import { loadRawBootstrap, loadFixtures } from "@/server/fplData";
import { captureOfficialFplSnapshots, captureOfficialFplLiveSnapshot } from "@/server/snapshots";
import { loadLiveGameweek, loadBootstrap } from "@/server/fplData";
import { loadGameweekReport } from "@/server/gameweekReport";
import { claimNextJob, failJob, finishJob, recoverExpiredJobs, renewJobLease, type QueuedJob } from "./queue";

async function runOne(job: QueuedJob): Promise<unknown> {
  if (job.kind === "optimizer") {
    const entryId = Number(job.payload.entryId);
    const horizon = Number(job.payload.horizon);
    return computeOptimizerForEntry(entryId, horizon);
  }
  if (job.kind === "refresh") {
    const [bootstrap, fixtures] = await Promise.all([loadRawBootstrap(0), loadFixtures(0)]);
    const snapshots = await captureOfficialFplSnapshots(bootstrap, fixtures);
    const result = { ok: true, refreshedAt: new Date().toISOString(),
      nextGameweek: bootstrap.events.find((event) => event.is_next)?.id ?? null,
      season: snapshots[0]?.season, snapshotIds: snapshots.map((snapshot) => snapshot.id),
      players: bootstrap.elements.length, fixtures: fixtures.length };
    await cacheSet("vortex:automation:last-refresh", result);
    return result;
  }
  if (job.kind === "live") {
    const gameweek = Number(job.payload.gameweek);
    if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
      throw new RangeError("Invalid live gameweek job.");
    }
    const [bootstrap, live] = await Promise.all([loadRawBootstrap(), loadLiveGameweek(gameweek, 0)]);
    const snapshot = await captureOfficialFplLiveSnapshot(bootstrap, gameweek, live);
    const result = { refreshedAt: new Date().toISOString(), season: snapshot.season,
      gameweek, snapshotId: snapshot.id, players: live.elements.length };
    await cacheSet("vortex:automation:last-live", result);
    return result;
  }
  if (job.kind === "report") {
    if (!job.worker_id) throw new Error("Report job must be leased to an authorized worker.");
    const entryId = Number(job.payload.entryId);
    if (!job.user_id || !Number.isSafeInteger(entryId) || entryId <= 0) throw new RangeError("Report ownership/entry missing.");
    const enabled = await pool.query<{enabled:boolean}>(`SELECT enabled FROM report_schedules
      WHERE user_id=$1 AND entry_id=$2 LIMIT 1`, [job.user_id, entryId]);
    if (!enabled.rows[0]?.enabled) return { skipped: true, reason: "Report schedule disabled before execution" };
    const slot = String(job.payload.slot ?? "");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot)) throw new RangeError("Report schedule slot missing.");
    const deduplicationKey = `report:${job.user_id}:${entryId}:${slot}`;
    const prior = await pool.query<{id:string}>(`SELECT id FROM report_runs WHERE deduplication_key=$1 LIMIT 1`, [deduplicationKey]);
    if (prior.rows[0]) return { reportId: prior.rows[0].id, alreadyArchived: true, delivery: "archive_only" };
    const current = await loadBootstrap();
    const gameweek = current.currentEvent ?? Math.max(1, (current.nextEvent ?? 2) - 1);
    const report = await loadGameweekReport(entryId, gameweek);
    const result = await pool.query<{id:string}>(`INSERT INTO report_runs
      (user_id,gameweek,format,status,payload,completed_at,deduplication_key)
      VALUES($1,$2,'html','completed',$3::jsonb,NOW(),$4)
      ON CONFLICT (deduplication_key) DO NOTHING RETURNING id`,
    [job.user_id, gameweek, JSON.stringify(report), deduplicationKey]);
    const archivedId = result.rows[0]?.id ?? (await pool.query<{id:string}>(
      `SELECT id FROM report_runs WHERE deduplication_key=$1 LIMIT 1`, [deduplicationKey])).rows[0]?.id;
    return {reportId:archivedId ?? null,gameweek,storedAt:new Date().toISOString(),delivery:"archive_only"};
  }
  throw new RangeError("Unsupported queued job kind.");
}

export async function runBackgroundWorker(options: { pollMilliseconds?: number; once?: boolean } = {}): Promise<void> {
  const workerId = randomUUID();
  const pollMilliseconds = Math.max(1_000, Math.min(60_000, options.pollMilliseconds ?? 5_000));
  let running = true;
  const stop = () => { running = false; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    do {
      await recoverExpiredJobs();
      const job = await claimNextJob(workerId);
      if (job) {
        const heartbeat = setInterval(() => {
          void renewJobLease(job.id, workerId).catch((error) => console.error("Worker lease heartbeat failed", error));
        }, 45_000);
        try {
          const result = await runOne(job);
          await finishJob(job.id, workerId, result);
        } catch (error) {
          console.error(`Background ${job.kind} job failed`, error);
          await failJob(job, workerId, error);
        } finally {
          clearInterval(heartbeat);
        }
      } else if (!options.once && running) {
        await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
      }
    } while (running && !options.once);
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await pool.end();
  }
}
