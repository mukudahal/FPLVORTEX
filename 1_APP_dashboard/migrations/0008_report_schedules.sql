-- Explicit opt-in schedule; no report is sent or stored for an unconsenting user.
CREATE TABLE report_schedules (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  entry_id INTEGER NOT NULL CHECK (entry_id > 0),
  timezone TEXT NOT NULL DEFAULT 'America/New_York' CHECK (timezone = 'America/New_York'),
  am_hour INTEGER NOT NULL DEFAULT 5 CHECK (am_hour BETWEEN 0 AND 23),
  am_minute INTEGER NOT NULL DEFAULT 30 CHECK (am_minute BETWEEN 0 AND 59),
  pm_hour INTEGER NOT NULL DEFAULT 17 CHECK (pm_hour BETWEEN 0 AND 23),
  pm_minute INTEGER NOT NULL DEFAULT 20 CHECK (pm_minute BETWEEN 0 AND 59),
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, entry_id)
);
CREATE INDEX report_schedules_active_idx ON report_schedules (enabled, entry_id)
  WHERE enabled = true;
ALTER TABLE background_jobs DROP CONSTRAINT background_jobs_kind_check;
ALTER TABLE background_jobs ADD CONSTRAINT background_jobs_kind_check CHECK(kind IN ('optimizer','refresh','live','report'));
ALTER TABLE background_jobs ADD CONSTRAINT background_jobs_report_owner CHECK(kind <> 'report' OR user_id IS NOT NULL);
