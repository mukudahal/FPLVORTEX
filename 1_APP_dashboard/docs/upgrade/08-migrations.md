# Step 8 — Transactional database migration framework

**Implemented in source. No database connection supplied: migration execution and rollback have NOT been tested against PostgreSQL.**

- `migrations/0001_legacy_baseline.sql` represents all seven original tables, preserved additively.
- `scripts/migrate-db.cjs` discovers numbered migrations, checks SHA-256 drift, serializes concurrent migrations with a session advisory lock, and wraps each migration in an explicit transaction.
- Dry run is the default; `npm run db:migrate:dry-run` is safe without credentials. `npm run db:migrate` explicitly applies SQL.
- `npm run db:migrate:verify` verifies history without schema changes; blocks unexpected history.
- **Important for existing deployments:** If an older deployment has tables but no migration history, back it up and run `npm run db:baseline:adopt` to validate required legacy columns and register only the baseline migration; then run `npm run db:migrate`. Never silently reinterpret existing tables as fresh.
- `scripts/db-schema-contract.cjs` provides the legacy adoption column contract; it checks column existence, not historical column type equivalence. A schema-diff review is still required for any pre-existing database.
- **Rollback/recovery:** migrations are deliberately forward-only and transactionally atomic; recover with a verified PostgreSQL backup (`pg_dump --format=custom --file=...`) and restore into a separate database first (`pg_restore --clean --if-exists --dbname=...`) before production traffic cutover. Do not run destructive rollback SQL on active user data.
- **CI gate:** verify migration sequence and checksums in unit tests; Steps 55–58 must provision disposable PostgreSQL and test fresh installation, baseline adoption, re-run/idempotency, migration locks, and recovery.
- Avoid running `drizzle-kit push` in production: migrations here are the deployment authority; `src/db/schema.ts` mirrors them for typed access.

Command evidence: `NODE_PATH=$(npm root -g) npm run db:migrate:dry-run` and 38/38 tests passed.
