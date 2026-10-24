-- Existing original FPL VORTEX persistence, mirrored without dropping legacy data.
-- For pre-existing deployments, run `db:baseline:adopt` after schema validation.
CREATE TABLE IF NOT EXISTS api_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS managers (
  id INTEGER PRIMARY KEY,
  player_name TEXT NOT NULL DEFAULT '',
  team_name TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  overall_rank INTEGER,
  total_points INTEGER,
  view_count INTEGER NOT NULL DEFAULT 1,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id SERIAL PRIMARY KEY,
  element_id INTEGER NOT NULL,
  now_cost INTEGER NOT NULL,
  transfers_in_event INTEGER NOT NULL,
  transfers_out_event INTEGER NOT NULL,
  selected_by_percent REAL NOT NULL,
  change_percent REAL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_predictions (
  id SERIAL PRIMARY KEY,
  element_id INTEGER NOT NULL,
  web_name TEXT NOT NULL,
  direction TEXT NOT NULL,
  probability REAL NOT NULL,
  price_at INTEGER NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  window_ends TIMESTAMPTZ NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS saved_plans (
  id SERIAL PRIMARY KEY,
  entry_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  projected_points REAL NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fotmob_mappings (
  fpl_player_code INTEGER PRIMARY KEY,
  fotmob_id INTEGER,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_image_resolutions (
  fpl_player_code INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  fotmob_id INTEGER,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
