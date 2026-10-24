# Step 9 — Extended analytics schema

**Implemented as source schema and forward-only SQL migration. Not applied to a database.**

`migrations/0002_analytics_domains.sql` creates 18 new tables, mirrored by typed Drizzle definitions in `src/db/schema.ts`:

1. `app_users`, `manager_links` — identity and FPL manager associations (identity flow begins in Step 10).
2. `fpl_teams`, `fpl_players`, `fpl_fixtures` — season-scoped FPL entities.
3. `data_snapshots`, `model_runs`, `player_projections` — reproducible source provenance and time-specific predictions.
4. `saved_scenarios`, `scenario_actions`, `solver_runs`, `simulation_runs` — immutable simulation inputs and decision work products.
5. `mini_leagues`, `league_memberships` — rival/cohort comparison structures.
6. `price_events`, `availability_events` — observed market and injury trends.
7. `report_runs`, `audit_events` — reports and traceable operations.

Foreign keys, delete rules, compound uniqueness, indexes for user/team/gameweek lookups, constraints on probability ranges, gameweeks and statuses are in SQL. The migration does not alter original 7 tables or migrate saved plans.

**Security gate:** these tables are **not automatically protected by an authentication service or PostgreSQL RLS**. Step 10 implements identity and sessions; Step 11 enforces owner validation on every data access; no private write APIs should go live before those gates pass.

**Data gate:** Steps 12–14 implement validated ingest, historical snapshots and reliable cache; Step 18+ generates actual predictions. Creating tables does not create real forecast data.

**Verification:** static schema-contract tests and migration dry-run pass; live PostgreSQL migration, Drizzle runtime table mapping and constraints require disposable test database in Steps 55–58.
