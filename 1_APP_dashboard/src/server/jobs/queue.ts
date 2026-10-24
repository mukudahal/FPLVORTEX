import { pool } from "@/db";
import { retryDelaySeconds } from "@/lib/jobPolicy";

export type BackgroundJobKind = "optimizer" | "refresh" | "live" | "report";
export type BackgroundJobStatus = "queued" | "running" | "completed" | "failed";
export interface QueuedJob {
  id: string;
  user_id: string | null;
  job_key: string;
  kind: BackgroundJobKind;
  payload: Record<string, unknown>;
  status: BackgroundJobStatus;
  attempts: number;
  max_attempts: number;
  worker_id: string | null;
}

export async function queueOptimizerJob(
  userId: string, jobKey: string, entryId: number, horizon: number,
): Promise<{ id: string; status: string } | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), 32045)", [userId]);
    const reused = await client.query<{ id: string; status: string }>(
      "SELECT id,status FROM background_jobs WHERE job_key=$1 AND user_id=$2", [jobKey, userId]);
    if (reused.rows[0]) {
      await client.query("COMMIT");
      return reused.rows[0];
    }
    const count = await client.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM background_jobs WHERE user_id=$1 AND status IN ('queued','running')", [userId]);
    if (Number(count.rows[0]?.total ?? 0) >= 5) {
      await client.query("COMMIT");
      return null;
    }
    const result = await client.query<{ id: string; status: string }>(`
      INSERT INTO background_jobs (job_key,user_id,kind,payload)
      VALUES ($1,$2,'optimizer',$3::jsonb)
      RETURNING id,status`, [jobKey, userId, JSON.stringify({ entryId, horizon })]);
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function claimNextJob(workerId: string): Promise<QueuedJob | null> {
  const result = await pool.query<QueuedJob>(`
    WITH next_job AS (
      SELECT id FROM background_jobs
      WHERE (status='queued' AND scheduled_at <= NOW())
        OR (status='running' AND lease_expires_at < NOW() AND attempts < max_attempts)
      ORDER BY scheduled_at, created_at
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE background_jobs AS jobs
    SET status='running', attempts=jobs.attempts+1, worker_id=$1,
        claimed_at=NOW(), lease_expires_at=NOW()+INTERVAL '20 minutes', updated_at=NOW()
    FROM next_job WHERE jobs.id=next_job.id
    RETURNING jobs.id,jobs.user_id,jobs.job_key,jobs.kind,jobs.payload,jobs.status,
              jobs.attempts,jobs.max_attempts,jobs.worker_id`, [workerId]);
  return result.rows[0] ?? null;
}

export async function recoverExpiredJobs(): Promise<void> {
  await pool.query(`UPDATE background_jobs SET status='failed', finished_at=NOW(),
    last_error='Execution lease expired after retry limit',updated_at=NOW()
    WHERE status='running' AND lease_expires_at < NOW() AND attempts >= max_attempts`);
}

export async function renewJobLease(jobId: string, workerId: string): Promise<void> {
  await pool.query(`UPDATE background_jobs SET lease_expires_at=NOW()+INTERVAL '20 minutes',updated_at=NOW()
    WHERE id=$1 AND worker_id=$2 AND status='running'`, [jobId,workerId]);
}

export async function finishJob(jobId: string, workerId: string, result: unknown): Promise<void> {
  await pool.query(`UPDATE background_jobs SET status='completed',result=$3::jsonb,
    finished_at=NOW(),lease_expires_at=NULL,updated_at=NOW(),last_error=NULL
    WHERE id=$1 AND worker_id=$2 AND status='running'`, [jobId,workerId,JSON.stringify(result)]);
}

export async function failJob(job: QueuedJob, workerId: string, error: unknown): Promise<void> {
  const terminal = job.attempts >= job.max_attempts;
  const message = error instanceof Error ? error.message.slice(0, 500) : "Background job failed";
  await pool.query(`UPDATE background_jobs
    SET status=$3,scheduled_at=CASE WHEN $4::integer=0 THEN scheduled_at ELSE NOW()+($4::integer * INTERVAL '1 second') END,
        lease_expires_at=NULL,worker_id=NULL,last_error=$5,
        finished_at=CASE WHEN $3='failed' THEN NOW() ELSE NULL END,updated_at=NOW()
    WHERE id=$1 AND worker_id=$2 AND status='running'`, [
    job.id, workerId, terminal ? "failed" : "queued", terminal ? 0 : retryDelaySeconds(job.attempts), message,
  ]);
}

/** Idempotent per-slot enqueue. Existing pending tasks take precedence over redundant refreshes. */
export async function enqueueScheduledJob(
  kind: "refresh" | "live", slot: string, payload: Record<string, unknown> = {},
): Promise<{ id: string; status: string } | null> {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(slot)) {
    throw new RangeError("Invalid automation slot.");
  }
  const jobKey = `schedule:${kind}:${slot}`;
  const created = await pool.query<{ id: string; status: string }>(`
    INSERT INTO background_jobs(job_key,kind,payload)
    SELECT $1,$2,$3::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM background_jobs
      WHERE kind=$2 AND status IN ('queued','running') AND created_at > NOW()-INTERVAL '2 hours'
    )
    ON CONFLICT(job_key) DO NOTHING RETURNING id,status`,
  [jobKey,kind,JSON.stringify(payload)]);
  return created.rows[0] ?? null;
}
