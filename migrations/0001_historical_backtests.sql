-- Independent research store; isolated from the proposed future production schema in replica/schema.sql.
-- Must apply with scripts/migrate.mjs before importing history.
CREATE TABLE IF NOT EXISTS research_history_imports (
  sha256 char(64) PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  season text NOT NULL CHECK (season ~ '^20[0-9]{2}/[0-9]{2}$'),
  model_id text NOT NULL CHECK (length(model_id) BETWEEN 1 AND 100),
  captured_at timestamptz NOT NULL,
  rights jsonb NOT NULL,
  observation_count integer NOT NULL CHECK (observation_count > 0),
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS research_forecast_outcomes (
  import_sha256 char(64) NOT NULL REFERENCES research_history_imports(sha256) ON DELETE RESTRICT,
  season text NOT NULL,
  model_id text NOT NULL,
  player_id integer NOT NULL CHECK (player_id > 0),
  gameweek integer NOT NULL CHECK (gameweek BETWEEN 1 AND 38),
  predicted_at timestamptz NOT NULL,
  kickoff_at timestamptz NOT NULL,
  expected_points numeric(9,4) NOT NULL,
  predicted_start_probability numeric(7,6) NOT NULL CHECK (predicted_start_probability BETWEEN 0 AND 1),
  actual_points integer NOT NULL,
  actual_started boolean NOT NULL,
  CHECK (predicted_at < kickoff_at),
  PRIMARY KEY(import_sha256,player_id,gameweek)
);
CREATE INDEX IF NOT EXISTS research_outcomes_lookup_idx ON research_forecast_outcomes(season,model_id,gameweek,player_id);
-- Separately log provenance and prevent duplicate data from changing evaluation weights.
CREATE UNIQUE INDEX IF NOT EXISTS research_outcomes_unique_forecast_idx ON research_forecast_outcomes(season,model_id,player_id,gameweek);