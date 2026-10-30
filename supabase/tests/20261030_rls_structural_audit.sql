-- VORTEX staging-only structural RLS acceptance. Safe introspection only.
-- Run AFTER applying migration to a dedicated Supabase staging project.
-- This script never creates users, grants admins or changes manager plans.
DO $$
DECLARE
  row record;
  expected_policies integer;
  function_safe boolean;
BEGIN
  FOR row IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('vortex_scenarios','vortex_scenario_revisions','vortex_admin_data_runs')
  LOOP
    IF NOT row.relrowsecurity THEN
      RAISE EXCEPTION 'RLS is disabled for %.%', row.schema_name, row.table_name;
    END IF;
  END LOOP;

  SELECT count(*) INTO expected_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND ((tablename = 'vortex_scenarios'
          AND policyname IN ('vortex_scenario_owner_read','vortex_scenario_owner_create',
            'vortex_scenario_owner_edit','vortex_scenario_owner_delete'))
      OR (tablename = 'vortex_scenario_revisions'
          AND policyname IN ('vortex_revision_owner_read','vortex_revision_owner_create'))
      OR (tablename = 'vortex_admin_data_runs'
          AND policyname = 'vortex_admin_runs_read'));
  IF expected_policies <> 7 THEN
    RAISE EXCEPTION 'Expected 7 owner/admin policies; found %', expected_policies;
  END IF;

  IF has_table_privilege('anon','public.vortex_scenarios','SELECT')
     OR has_table_privilege('anon','public.vortex_scenario_revisions','SELECT')
     OR has_table_privilege('anon','public.vortex_admin_data_runs','SELECT') THEN
    RAISE EXCEPTION 'Anonymous role has data access.';
  END IF;

  IF has_table_privilege('authenticated','public.vortex_scenario_revisions','UPDATE')
     OR has_table_privilege('authenticated','public.vortex_scenario_revisions','DELETE')
     OR has_table_privilege('authenticated','public.vortex_admin_data_runs','INSERT')
     OR has_table_privilege('authenticated','public.vortex_admin_data_runs','UPDATE') THEN
    RAISE EXCEPTION 'Authenticated user may change immutable revisions or admin diagnostics.';
  END IF;

  IF has_schema_privilege('anon','vortex_private','USAGE')
     OR has_table_privilege('authenticated','vortex_private.admin_grants','SELECT')
     OR has_table_privilege('authenticated','vortex_private.admin_grants','INSERT') THEN
    RAISE EXCEPTION 'Private admin grants table or schema is exposed to client roles.';
  END IF;

  SELECT p.prosecdef AND EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig, array[]::text[])) AS config
    WHERE config = 'search_path='
  )
  INTO function_safe
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'vortex_private' AND p.proname = 'is_vortex_admin';
  IF function_safe IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Admin function is not SECURITY DEFINER with sealed search path.';
  END IF;
  RAISE NOTICE 'VORTEX structural RLS audit passed. Run actual two-account authorization tests next.';
END;
$$;
