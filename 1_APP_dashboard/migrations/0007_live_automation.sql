-- Expand durable automation job types without rewriting the earlier migration.
ALTER TABLE background_jobs DROP CONSTRAINT background_jobs_kind_check;
ALTER TABLE background_jobs ADD CONSTRAINT background_jobs_kind_check
  CHECK (kind IN ('optimizer','refresh','live'));
