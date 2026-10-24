-- Durable, owned work queue. Workers claim one task atomically using SKIP LOCKED.
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('optimizer','refresh')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  worker_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  CHECK (kind <> 'optimizer' OR user_id IS NOT NULL)
);
CREATE INDEX background_jobs_claim_idx ON background_jobs (scheduled_at, created_at)
  WHERE status IN ('queued','running');
CREATE INDEX background_jobs_owner_status_idx ON background_jobs (user_id, status, created_at DESC);
