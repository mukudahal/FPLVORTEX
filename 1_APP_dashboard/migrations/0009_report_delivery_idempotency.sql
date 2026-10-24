-- Idempotent report output records: worker lease expiry may trigger retries.
ALTER TABLE report_runs ADD COLUMN deduplication_key TEXT;
CREATE UNIQUE INDEX report_runs_deduplication_key_idx ON report_runs (deduplication_key);
