-- PostgreSQL 16+ INITIAL FOUNDATION MIGRATION; NOT THE COMPLETE PRODUCTION SCHEMA.
-- Names, rules and results are original to the proposed product.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE app_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE seasons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 season_label text NOT NULL UNIQUE,
 starts_on date NOT NULL,
 ends_on date NOT NULL,
 CHECK (ends_on > starts_on)
);
CREATE TABLE scoring_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
 revision integer NOT NULL CHECK(revision >= 1),
 rules jsonb NOT NULL,
 source_label text NOT NULL,
 checked_at timestamptz NOT NULL,
 UNIQUE(season_id,revision)
);
CREATE TABLE gameweeks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
 gw_number integer NOT NULL CHECK(gw_number BETWEEN 1 AND 50),
 deadline_at timestamptz NOT NULL,
 UNIQUE(season_id,gw_number)
);
CREATE TABLE clubs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 external_ref text,
 UNIQUE(external_ref)
);
CREATE TABLE players (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 display_name text NOT NULL,
 canonical_slug text NOT NULL UNIQUE,
 current_club_id uuid REFERENCES clubs(id) ON DELETE SET NULL,
 position text NOT NULL CHECK(position IN('GK','DEF','MID','FWD')),
 active boolean NOT NULL DEFAULT true
);
CREATE INDEX players_club_idx ON players(current_club_id);
CREATE TABLE player_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
 valid_from date NOT NULL,
 valid_to date,
 CHECK(valid_to IS NULL OR valid_to >= valid_from),
 UNIQUE(player_id,club_id,valid_from)
);
CREATE INDEX player_memberships_player_idx ON player_memberships(player_id,valid_from DESC);
CREATE TABLE media_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 storage_key text NOT NULL UNIQUE,
 license_source text NOT NULL,
 license_reference text NOT NULL,
 distribution_allowed boolean NOT NULL DEFAULT false,
 license_expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_assets_player_idx ON media_assets(player_id);
CREATE TABLE data_providers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 label text NOT NULL UNIQUE,
 license_reference text NOT NULL,
 automated_access_allowed boolean NOT NULL DEFAULT false,
 derivative_use_allowed boolean NOT NULL DEFAULT false,
 public_display_allowed boolean NOT NULL DEFAULT false,
 verified_at timestamptz
);
CREATE TABLE source_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider_id uuid NOT NULL REFERENCES data_providers(id) ON DELETE RESTRICT,
 dataset text NOT NULL,
 content_sha256 text NOT NULL CHECK(length(content_sha256) = 64),
 captured_at timestamptz NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL CHECK(status IN('validated','quarantined','rejected')),
 UNIQUE(provider_id,dataset,content_sha256)
);
CREATE INDEX source_snapshots_latest_idx ON source_snapshots(provider_id,dataset,captured_at DESC);
CREATE TABLE fixtures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
 home_club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
 away_club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
 gameweek_id uuid REFERENCES gameweeks(id) ON DELETE SET NULL,
 kickoff_at timestamptz,
 status text NOT NULL CHECK(status IN('scheduled','in_progress','final','postponed','cancelled')),
 source_snapshot_id uuid REFERENCES source_snapshots(id) ON DELETE SET NULL,
 CHECK(home_club_id <> away_club_id)
);
CREATE INDEX fixtures_gw_idx ON fixtures(gameweek_id,kickoff_at);
CREATE TABLE player_match_stats (
 fixture_id uuid NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 source_snapshot_id uuid NOT NULL REFERENCES source_snapshots(id) ON DELETE RESTRICT,
 minutes integer NOT NULL CHECK(minutes BETWEEN 0 AND 130),
 goals integer NOT NULL DEFAULT 0 CHECK(goals >= 0),
 assists integer NOT NULL DEFAULT 0 CHECK(assists >= 0),
 xg numeric(9,5) CHECK(xg >= 0),
 xa numeric(9,5) CHECK(xa >= 0),
 fantasy_points integer,
 PRIMARY KEY(fixture_id,player_id)
);
CREATE INDEX player_match_stats_player_idx ON player_match_stats(player_id,fixture_id);
CREATE TABLE player_price_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 source_snapshot_id uuid NOT NULL REFERENCES source_snapshots(id) ON DELETE RESTRICT,
 recorded_at timestamptz NOT NULL,
 price_tenths integer NOT NULL CHECK(price_tenths > 0),
 UNIQUE(player_id,recorded_at)
);
CREATE INDEX player_price_history_latest_idx ON player_price_history(player_id,recorded_at DESC);
CREATE TABLE availability_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 source_snapshot_id uuid NOT NULL REFERENCES source_snapshots(id) ON DELETE RESTRICT,
 observed_at timestamptz NOT NULL,
 label text NOT NULL,
 available_probability numeric(6,5) CHECK(available_probability BETWEEN 0 AND 1),
 notes text
);
CREATE INDEX availability_observations_latest_idx ON availability_observations(player_id,observed_at DESC);
CREATE TABLE model_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 version_label text NOT NULL UNIQUE,
 code_sha text NOT NULL,
 config jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE model_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 model_version_id uuid NOT NULL REFERENCES model_versions(id) ON DELETE RESTRICT,
 source_snapshot_id uuid NOT NULL REFERENCES source_snapshots(id) ON DELETE RESTRICT,
 rules_id uuid NOT NULL REFERENCES scoring_rules(id) ON DELETE RESTRICT,
 seed bigint NOT NULL,
 status text NOT NULL CHECK(status IN('pending','running','validated','failed')),
 started_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 metrics jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX model_runs_published_idx ON model_runs(published_at DESC) WHERE status='validated';
CREATE TABLE player_gameweek_forecasts (
 model_run_id uuid NOT NULL REFERENCES model_runs(id) ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 gameweek_id uuid NOT NULL REFERENCES gameweeks(id) ON DELETE CASCADE,
 xpts numeric(9,4) NOT NULL,
 expected_minutes numeric(7,3) NOT NULL CHECK(expected_minutes BETWEEN 0 AND 200),
 p_start numeric(6,5) NOT NULL CHECK(p_start BETWEEN 0 AND 1),
 p_play numeric(6,5) NOT NULL CHECK(p_play BETWEEN 0 AND 1),
 p_goal numeric(6,5) CHECK(p_goal BETWEEN 0 AND 1),
 p_assist numeric(6,5) CHECK(p_assist BETWEEN 0 AND 1),
 p_clean_sheet numeric(6,5) CHECK(p_clean_sheet BETWEEN 0 AND 1),
 p_blank numeric(6,5) CHECK(p_blank BETWEEN 0 AND 1),
 p10 numeric(9,4),
 p50 numeric(9,4),
 p90 numeric(9,4),
 CHECK(p_play >= p_start),
 CHECK(p10 IS NULL OR p50 IS NULL OR p10 <= p50),
 CHECK(p50 IS NULL OR p90 IS NULL OR p50 <= p90),
 PRIMARY KEY(model_run_id,player_id,gameweek_id)
);
CREATE INDEX player_forecasts_gw_idx ON player_gameweek_forecasts(gameweek_id,model_run_id);
CREATE TABLE manager_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 external_manager_ref text NOT NULL,
 visibility text NOT NULL CHECK(visibility IN('public','user_import','authorized_provider')),
 linked_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,external_manager_ref)
);
CREATE INDEX manager_links_user_idx ON manager_links(user_id);
CREATE TABLE squad_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 manager_link_id uuid NOT NULL REFERENCES manager_links(id) ON DELETE CASCADE,
 gameweek_id uuid NOT NULL REFERENCES gameweeks(id) ON DELETE CASCADE,
 observed_at timestamptz NOT NULL,
 is_predeadline_private boolean NOT NULL DEFAULT false,
 bank_tenths integer CHECK(bank_tenths >= 0),
 free_transfers integer CHECK(free_transfers >= 0),
 source_snapshot_id uuid REFERENCES source_snapshots(id) ON DELETE SET NULL,
 UNIQUE(manager_link_id,gameweek_id,observed_at)
);
CREATE TABLE squad_picks (
 squad_snapshot_id uuid NOT NULL REFERENCES squad_snapshots(id) ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
 lineup_position integer NOT NULL CHECK(lineup_position BETWEEN 1 AND 15),
 captain boolean NOT NULL DEFAULT false,
 vice_captain boolean NOT NULL DEFAULT false,
 purchase_price_tenths integer CHECK(purchase_price_tenths > 0),
 sell_price_tenths integer CHECK(sell_price_tenths > 0),
 PRIMARY KEY(squad_snapshot_id,player_id),
 UNIQUE(squad_snapshot_id,lineup_position),
 CHECK(NOT (captain AND vice_captain))
);
CREATE UNIQUE INDEX squad_one_captain_idx ON squad_picks(squad_snapshot_id) WHERE captain;
CREATE UNIQUE INDEX squad_one_vice_idx ON squad_picks(squad_snapshot_id) WHERE vice_captain;
CREATE TABLE scenario_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 base_squad_id uuid REFERENCES squad_snapshots(id) ON DELETE SET NULL,
 label text NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scenario_drafts_user_idx ON scenario_drafts(user_id,updated_at DESC);
CREATE TABLE planned_transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 draft_id uuid NOT NULL REFERENCES scenario_drafts(id) ON DELETE CASCADE,
 gameweek_id uuid NOT NULL REFERENCES gameweeks(id) ON DELETE CASCADE,
 out_player_id uuid REFERENCES players(id) ON DELETE RESTRICT,
 in_player_id uuid REFERENCES players(id) ON DELETE RESTRICT,
 sequence_no integer NOT NULL CHECK(sequence_no >= 0),
 CHECK(out_player_id IS DISTINCT FROM in_player_id),
 CHECK(out_player_id IS NOT NULL OR in_player_id IS NOT NULL),
 UNIQUE(draft_id,gameweek_id,sequence_no)
);
CREATE INDEX planned_transfers_draft_idx ON planned_transfers(draft_id,gameweek_id);
CREATE TABLE forecast_overrides (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 draft_id uuid NOT NULL REFERENCES scenario_drafts(id) ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 gameweek_id uuid NOT NULL REFERENCES gameweeks(id) ON DELETE CASCADE,
 field_name text NOT NULL CHECK(field_name IN('expected_minutes','availability','penalty_share','xpts')),
 new_value numeric(12,6) NOT NULL,
 reason text,
 changed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(draft_id,player_id,gameweek_id,field_name)
);
CREATE TABLE solver_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 draft_id uuid NOT NULL REFERENCES scenario_drafts(id) ON DELETE CASCADE,
 model_run_id uuid NOT NULL REFERENCES model_runs(id) ON DELETE RESTRICT,
 input_hash text NOT NULL CHECK(length(input_hash)=64),
 status text NOT NULL CHECK(status IN('pending','running','complete','failed','cancelled')),
 settings jsonb NOT NULL,
 result jsonb,
 error_message text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX solver_jobs_user_idx ON solver_jobs(user_id,created_at DESC);
CREATE TABLE audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
 event_type text NOT NULL,
 entity_ref text,
 event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_idx ON audit_events(created_at DESC);
COMMIT;
-- Follow-up migrations: player-feature vectors, team strengths, per-fixture forecasts,
-- signed image delivery, user authorization policy, model calibration, cohort analytics,
-- alert rules and notification deduplication. Service-level validation must enforce
-- multi-row formation/15-player/club limits and season scoring config.