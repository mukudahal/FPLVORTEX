-- FPL VORTEX V2, STAGING-FIRST migration (2026-10-30).
-- NOT APPLIED TO PRODUCTION. Run only after Supabase is connected and
-- authenticated role/RLS tests pass against an isolated staging project.
-- All passwords and provider API keys stay in the auth provider / secret vault.
BEGIN;

CREATE SCHEMA IF NOT EXISTS vortex_private;
REVOKE ALL ON SCHEMA vortex_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA vortex_private TO service_role, authenticated;
-- Schema USAGE allows policy function resolution but does NOT grant access to
-- admin_grants or any other private table; those grants remain revoked.

-- Admin membership is a private, server-managed capability; clients cannot
-- INSERT a row to grant themselves access. No client direct table grants.
CREATE TABLE IF NOT EXISTS vortex_private.admin_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid NULL REFERENCES auth.users(id),
  reason text NOT NULL DEFAULT ''
);
REVOKE ALL ON vortex_private.admin_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON vortex_private.admin_grants TO service_role;

-- SECURITY DEFINER deliberately queries one fixed private table. Fully
-- qualify every name and disable user-controlled search_path resolution.
CREATE OR REPLACE FUNCTION vortex_private.is_vortex_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM vortex_private.admin_grants g
    WHERE g.user_id = (SELECT auth.uid()) AND g.enabled = true
  );
$fn$;
REVOKE ALL ON FUNCTION vortex_private.is_vortex_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION vortex_private.is_vortex_admin() TO authenticated, service_role;

-- A scenario is owned by ONE authenticated user. A manager can have several
-- independent manual/auto plans; source snapshots and models are versioned.
CREATE TABLE IF NOT EXISTS public.vortex_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  season text NOT NULL CHECK (season ~ '^[0-9]{4}/[0-9]{2}$'),
  start_gameweek integer NOT NULL CHECK (start_gameweek BETWEEN 1 AND 38),
  horizon integer NOT NULL CHECK (horizon BETWEEN 1 AND 10),
  base_source_snapshot_id text,
  base_model_version text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vortex_scenarios_endgw_chk CHECK (start_gameweek + horizon - 1 <= 38),
  CONSTRAINT vortex_scenarios_id_owner_uq UNIQUE (id, owner_id)
);
CREATE INDEX IF NOT EXISTS vortex_scenarios_owner_updated_idx
  ON public.vortex_scenarios (owner_id, updated_at DESC);

-- Scenario revisions are append-only; no UPDATE/DELETE permission is granted
-- to authenticated users. The composite FK prevents cross-account revision
-- association even when a malicious client supplies another person's ID.
CREATE TABLE IF NOT EXISTS public.vortex_scenario_revisions (
  scenario_id uuid NOT NULL,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  revision integer NOT NULL CHECK (revision >= 1),
  scenario_payload jsonb NOT NULL CHECK (jsonb_typeof(scenario_payload) = 'object'),
  source_snapshot_id text,
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scenario_id, revision),
  CONSTRAINT vortex_revision_owner_fk
    FOREIGN KEY (scenario_id, owner_id)
    REFERENCES public.vortex_scenarios (id, owner_id)
    ON DELETE CASCADE,
  CONSTRAINT vortex_revision_payload_limit
    CHECK (octet_length(scenario_payload::text) <= 1048576)
);
CREATE INDEX IF NOT EXISTS vortex_revisions_owner_created_idx
  ON public.vortex_scenario_revisions (owner_id, created_at DESC);

-- A safe, normalized source/job-health audit table. Raw bookmaker payloads,
-- private keys, refresh tokens and private FPL manager picks do not belong here.
CREATE TABLE IF NOT EXISTS public.vortex_admin_data_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN
    ('official_fpl_refresh','market_odds_refresh','projection_run','backtest','health_check')),
  job_status text NOT NULL CHECK (job_status IN
    ('queued','running','succeeded','failed','cancelled')),
  source_reference text,
  model_version text,
  records_processed integer CHECK (records_processed >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  -- Public-safe structured metrics ONLY; do not store secrets or source bodies.
  safe_metrics jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(safe_metrics) = 'object')
);
CREATE INDEX IF NOT EXISTS vortex_admin_runs_created_idx
  ON public.vortex_admin_data_runs (created_at DESC);

CREATE OR REPLACE FUNCTION public.vortex_scenario_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.vortex_scenario_touch_updated_at() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS vortex_scenario_touch ON public.vortex_scenarios;
CREATE TRIGGER vortex_scenario_touch
  BEFORE UPDATE ON public.vortex_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.vortex_scenario_touch_updated_at();

ALTER TABLE public.vortex_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vortex_scenario_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vortex_admin_data_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.vortex_scenarios FROM PUBLIC, anon;
REVOKE ALL ON public.vortex_scenario_revisions FROM PUBLIC, anon;
REVOKE ALL ON public.vortex_admin_data_runs FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vortex_scenarios TO authenticated;
GRANT SELECT, INSERT ON public.vortex_scenario_revisions TO authenticated;
GRANT SELECT ON public.vortex_admin_data_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vortex_scenarios TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vortex_scenario_revisions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vortex_admin_data_runs TO service_role;

DROP POLICY IF EXISTS vortex_scenario_owner_read ON public.vortex_scenarios;
CREATE POLICY vortex_scenario_owner_read ON public.vortex_scenarios
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS vortex_scenario_owner_create ON public.vortex_scenarios;
CREATE POLICY vortex_scenario_owner_create ON public.vortex_scenarios
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS vortex_scenario_owner_edit ON public.vortex_scenarios;
CREATE POLICY vortex_scenario_owner_edit ON public.vortex_scenarios
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS vortex_scenario_owner_delete ON public.vortex_scenarios;
CREATE POLICY vortex_scenario_owner_delete ON public.vortex_scenarios
  FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS vortex_revision_owner_read ON public.vortex_scenario_revisions;
CREATE POLICY vortex_revision_owner_read ON public.vortex_scenario_revisions
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS vortex_revision_owner_create ON public.vortex_scenario_revisions;
CREATE POLICY vortex_revision_owner_create ON public.vortex_scenario_revisions
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));
-- No UPDATE or DELETE policy or grant for revisions, by design.

DROP POLICY IF EXISTS vortex_admin_runs_read ON public.vortex_admin_data_runs;
CREATE POLICY vortex_admin_runs_read ON public.vortex_admin_data_runs
  FOR SELECT TO authenticated
  USING ((SELECT vortex_private.is_vortex_admin()));
-- No client INSERT / UPDATE / DELETE policies for admin jobs, by design.

COMMENT ON TABLE public.vortex_scenarios IS
  'Private owner-specific 10-GW plans. RLS required; never expose via unauthenticated Express route.';
COMMENT ON TABLE public.vortex_scenario_revisions IS
  'Append-only immutable plan revision history; validate real FPL squad/transfer/chip legality in server domain layer.';
COMMENT ON TABLE public.vortex_admin_data_runs IS
  'RLS-admin-only diagnostics; safe structured metrics only, no provider secrets.';

COMMIT;
