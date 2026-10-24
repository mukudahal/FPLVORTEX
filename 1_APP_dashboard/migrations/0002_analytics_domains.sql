-- Step 9: additive, indexed analytics domain tables. Ownership enforcement in Steps 10–11.
CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX app_users_email_ci_unique ON app_users (LOWER(email));

CREATE TABLE manager_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  entry_id INTEGER NOT NULL CHECK (entry_id > 0),
  nickname TEXT NOT NULL DEFAULT '',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, entry_id)
);
CREATE INDEX manager_links_entry_idx ON manager_links (entry_id);

CREATE TABLE fpl_teams (
  id BIGSERIAL PRIMARY KEY,
  season TEXT NOT NULL,
  fpl_team_id INTEGER NOT NULL CHECK (fpl_team_id > 0),
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  code INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season, fpl_team_id)
);

CREATE TABLE fpl_players (
  id BIGSERIAL PRIMARY KEY,
  season TEXT NOT NULL,
  fpl_element_id INTEGER NOT NULL CHECK (fpl_element_id > 0),
  team_id BIGINT REFERENCES fpl_teams(id) ON DELETE SET NULL,
  web_name TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 4),
  now_cost INTEGER NOT NULL CHECK (now_cost >= 0),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season, fpl_element_id)
);
CREATE INDEX fpl_players_team_idx ON fpl_players(team_id);
CREATE INDEX fpl_players_season_position_idx ON fpl_players(season, position);

CREATE TABLE fpl_fixtures (
  id BIGSERIAL PRIMARY KEY,
  season TEXT NOT NULL,
  fpl_fixture_id INTEGER NOT NULL CHECK (fpl_fixture_id > 0),
  gameweek INTEGER CHECK (gameweek BETWEEN 1 AND 38),
  home_team_id BIGINT NOT NULL REFERENCES fpl_teams(id) ON DELETE RESTRICT,
  away_team_id BIGINT NOT NULL REFERENCES fpl_teams(id) ON DELETE RESTRICT,
  kickoff_at TIMESTAMPTZ,
  finished BOOLEAN NOT NULL DEFAULT FALSE,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season, fpl_fixture_id),
  CHECK (home_team_id <> away_team_id)
);
CREATE INDEX fpl_fixtures_season_gw_idx ON fpl_fixtures(season, gameweek);
CREATE INDEX fpl_fixtures_home_idx ON fpl_fixtures(home_team_id);
CREATE INDEX fpl_fixtures_away_idx ON fpl_fixtures(away_team_id);

CREATE TABLE data_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season TEXT NOT NULL,
  gameweek INTEGER NOT NULL CHECK (gameweek BETWEEN 1 AND 38),
  source TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (LENGTH(content_sha256) = 64),
  payload JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season, gameweek, source, content_sha256)
);
CREATE INDEX data_snapshots_latest_idx ON data_snapshots(season, gameweek, source, captured_at DESC);

CREATE TABLE model_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES data_snapshots(id) ON DELETE RESTRICT,
  model_version TEXT NOT NULL,
  parameters_sha256 TEXT NOT NULL CHECK (LENGTH(parameters_sha256) = 64),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX model_runs_snapshot_idx ON model_runs(snapshot_id, created_at DESC);

CREATE TABLE player_projections (
  model_run_id UUID NOT NULL REFERENCES model_runs(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES fpl_players(id) ON DELETE RESTRICT,
  gameweek INTEGER NOT NULL CHECK (gameweek BETWEEN 1 AND 38),
  expected_points DOUBLE PRECISION NOT NULL,
  expected_minutes DOUBLE PRECISION NOT NULL CHECK (expected_minutes >= 0),
  p_start DOUBLE PRECISION CHECK (p_start BETWEEN 0 AND 1),
  p_appear DOUBLE PRECISION CHECK (p_appear BETWEEN 0 AND 1),
  p_60 DOUBLE PRECISION CHECK (p_60 BETWEEN 0 AND 1),
  p10 DOUBLE PRECISION,
  p90 DOUBLE PRECISION,
  components JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (model_run_id, player_id, gameweek)
);
CREATE INDEX player_projections_player_gw_idx ON player_projections(player_id, gameweek);

CREATE TABLE saved_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  entry_id INTEGER NOT NULL CHECK (entry_id > 0),
  snapshot_id UUID REFERENCES data_snapshots(id) ON DELETE SET NULL,
  model_run_id UUID REFERENCES model_runs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  draft JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX saved_scenarios_user_updated_idx ON saved_scenarios(user_id, updated_at DESC);
CREATE INDEX saved_scenarios_entry_idx ON saved_scenarios(entry_id);
CREATE INDEX saved_scenarios_snapshot_idx ON saved_scenarios(snapshot_id);
CREATE INDEX saved_scenarios_model_idx ON saved_scenarios(model_run_id);

CREATE TABLE scenario_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES saved_scenarios(id) ON DELETE CASCADE,
  gameweek INTEGER NOT NULL CHECK (gameweek BETWEEN 1 AND 38),
  ordering INTEGER NOT NULL DEFAULT 0 CHECK (ordering >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('transfer','chip','lineup','captain','notes')),
  payload JSONB NOT NULL,
  UNIQUE (scenario_id, gameweek, ordering)
);
CREATE INDEX scenario_actions_scenario_idx ON scenario_actions(scenario_id, gameweek);

CREATE TABLE solver_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES saved_scenarios(id) ON DELETE CASCADE,
  model_run_id UUID REFERENCES model_runs(id) ON DELETE SET NULL,
  seed INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX solver_runs_user_recent_idx ON solver_runs(user_id, created_at DESC);
CREATE INDEX solver_runs_scenario_idx ON solver_runs(scenario_id, created_at DESC);
CREATE INDEX solver_runs_model_idx ON solver_runs(model_run_id);

CREATE TABLE simulation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES saved_scenarios(id) ON DELETE CASCADE,
  model_run_id UUID REFERENCES model_runs(id) ON DELETE SET NULL,
  seed INTEGER NOT NULL,
  draws INTEGER NOT NULL CHECK (draws BETWEEN 1 AND 200000),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  metrics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX simulation_runs_user_recent_idx ON simulation_runs(user_id, created_at DESC);
CREATE INDEX simulation_runs_scenario_idx ON simulation_runs(scenario_id, created_at DESC);
CREATE INDEX simulation_runs_model_idx ON simulation_runs(model_run_id);

CREATE TABLE mini_leagues (
  id BIGSERIAL PRIMARY KEY,
  fpl_league_id INTEGER NOT NULL UNIQUE CHECK (fpl_league_id > 0),
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE league_memberships (
  league_id BIGINT NOT NULL REFERENCES mini_leagues(id) ON DELETE CASCADE,
  entry_id INTEGER NOT NULL CHECK (entry_id > 0),
  last_rank INTEGER,
  last_points INTEGER,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (league_id, entry_id)
);
CREATE INDEX league_memberships_entry_idx ON league_memberships(entry_id);

CREATE TABLE price_events (
  id BIGSERIAL PRIMARY KEY,
  season TEXT NOT NULL,
  player_id BIGINT NOT NULL REFERENCES fpl_players(id) ON DELETE CASCADE,
  price_tenths INTEGER NOT NULL CHECK (price_tenths >= 0),
  transfers_in INTEGER NOT NULL DEFAULT 0,
  transfers_out INTEGER NOT NULL DEFAULT 0,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_snapshot_id UUID REFERENCES data_snapshots(id) ON DELETE SET NULL
);
CREATE INDEX price_events_player_date_idx ON price_events(player_id, observed_at DESC);
CREATE INDEX price_events_snapshot_idx ON price_events(source_snapshot_id);

CREATE TABLE availability_events (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES fpl_players(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  availability_probability DOUBLE PRECISION CHECK (availability_probability BETWEEN 0 AND 1),
  source TEXT NOT NULL,
  evidence TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_snapshot_id UUID REFERENCES data_snapshots(id) ON DELETE SET NULL
);
CREATE INDEX availability_events_player_date_idx ON availability_events(player_id, observed_at DESC);
CREATE INDEX availability_events_snapshot_idx ON availability_events(source_snapshot_id);

CREATE TABLE report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES saved_scenarios(id) ON DELETE SET NULL,
  snapshot_id UUID REFERENCES data_snapshots(id) ON DELETE SET NULL,
  model_run_id UUID REFERENCES model_runs(id) ON DELETE SET NULL,
  gameweek INTEGER NOT NULL CHECK (gameweek BETWEEN 1 AND 38),
  format TEXT NOT NULL CHECK (format IN ('html','pdf','pptx','png')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX report_runs_user_recent_idx ON report_runs(user_id, created_at DESC);
CREATE INDEX report_runs_scenario_idx ON report_runs(scenario_id);
CREATE INDEX report_runs_snapshot_idx ON report_runs(snapshot_id);
CREATE INDEX report_runs_model_idx ON report_runs(model_run_id);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_events_actor_recent_idx ON audit_events(actor_user_id, occurred_at DESC);
