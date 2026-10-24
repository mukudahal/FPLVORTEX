import { timingSafeEqual } from "node:crypto";
import { readCronSecret } from "@/lib/runtimeConfig";
import { loadFixtures } from "@/server/fplData";
import { enqueueScheduledJob } from "@/server/jobs/queue";
import { calculateRefreshSchedule } from "@/lib/refreshSchedule";
import { enqueueDueUserReports } from "@/server/reportAutomation";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(request: Request): boolean {
  const secret = readCronSecret();
  if (!secret) return false;
  const incoming = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return incoming.length === expected.length && timingSafeEqual(incoming, expected);
}

/** Scheduled invocation only enqueues work; never blocks an HTTP request on simulations. */
export async function GET(request: Request): Promise<Response> {
  if (!readCronSecret()) return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const now = new Date();
    const fixtures = await loadFixtures(300);
    const due = calculateRefreshSchedule(fixtures, now);
    const refresh = await enqueueScheduledJob("refresh", due.hourSlot);
    const live = due.liveGameweek == null ? null
      : await enqueueScheduledJob("live", due.tenMinuteSlot, { gameweek: due.liveGameweek });
    const reportsQueued = await enqueueDueUserReports(now);
    return Response.json({ ok: true, observedAt: now.toISOString(),
      refreshQueued: Boolean(refresh), liveQueued: Boolean(live), liveGameweek: due.liveGameweek, reportsQueued },
      { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("FPL Vortex scheduler failed", error);
    return Response.json({ ok: false, error: "Could not schedule data refresh." }, { status: 503 });
  }
}
