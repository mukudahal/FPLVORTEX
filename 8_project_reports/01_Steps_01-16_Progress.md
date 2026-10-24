# FPL VORTEX — Steps 01–16 Progress Report

This report is **extracted from the cumulative Stage 4 project's canonical `docs/upgrade/PROGRESS.csv`**. Each of Steps 01–16 occurs exactly once. The corresponding detailed per-step Markdown reports are located in `docs/upgrade/` inside this ZIP. Steps 17–61 are tracked in `docs/upgrade/04-stage04-progress.md` and the same `PROGRESS.csv` ledger.

**Project location in archive:** `FPL_VORTEX_FINAL/1_APP_dashboard/`.

**Important status distinction:** `DONE_WITH_BLOCKER` means source work is recorded but one or more full-stack acceptance gates remain outstanding. It is **not** the same as production-ready.

## Steps 01–16 (from the canonical tracker)

| Step | Task | Ledger status | Evidence / remaining gate |
|---:|---|---|---|
| 01 | Preserve original project | `DONE` | baseline Git commit a90f5b6; SOURCE_ZIP_SHA256.txt |
| 02 | Establish baseline | `DONE_WITH_BLOCKER` | 02-baseline-verification.md; 02-baseline-test-results.txt |
| 03 | Create feature inventory | `DONE` | 03-source-files.csv; 03-feature-inventory.csv; scripts/inventory.py |
| 04 | Define one architecture | `DONE` | 04-architecture.md |
| 05 | Eliminate duplicated planners | `DONE_WITH_BLOCKER` | 05-planner-consolidation.md; 8 migration/route tests; one canonical planner; full build still blocked by registry |
| 06 | Centralize FPL calculations | `DONE_WITH_BLOCKER` | src/lib/scoring.ts is canonical XI/transfer-hit/FT rollover/selling/chip scoring; src/lib/lineup.ts and optimizer.ts share solver; 33 passing tests; build gate outstanding |
| 07 | Correct project configuration | `DONE_WITH_BLOCKER` | drizzle.config.ts uses environment URL; runtimeConfig validates DB/HTTPS/cron/AI; check:env CLI; .env.example expanded; 36 tests pass; deployment credentials not provided |
| 08 | Establish database migrations | `DONE_WITH_BLOCKER` | transactional migration runner with checksum and advisory lock; original-table baseline; legacy adoption; dry run and migration tests pass; live Postgres migration verification pending |
| 09 | Expand database schema | `DONE_WITH_BLOCKER` | 18 analytics tables plus Drizzle mirrors and indexes in migration 0002; static contract tests pass; live PostgreSQL execution unverified |
| 10 | Implement authentication | `DONE_WITH_BLOCKER` | account/session/email reset/verification and manager watchlist implemented; tests pass; production requires email credentials and Postgres integration/security review |
| 11 | Enforce data ownership | `DONE_WITH_BLOCKER` | saved plan GET/POST/DELETE require session and owner matching with cross-user 404 semantics; guest local drafts preserved; cross-user DB tests outstanding |
| 12 | Build the central data pipeline | `DONE_WITH_BLOCKER` | fplNormalize.ts and fplData.ts canonical source adapters; central validation for 9 official FPL resource types; all API planner/optimizer/league/rivals/price/analysis/image consumers use same normalization; 5 new tests; live FPL/API contract/build verification blocked |
| 13 | Implement immutable data snapshots | `DONE_WITH_BLOCKER` | SHA-256-canonical append-only official FPL bootstrap/fixtures snapshots persisted by guarded cron, dedupe idempotency, migration 0005 update/delete trigger, verified snapshot lookup; 5 tests; live PostgreSQL write/replay unverified |
| 14 | Strengthen API reliability | `DONE_WITH_BLOCKER` | bounded timed upstream GET retries and 429 Retry-After, permanent 4xx no retry/stale, relative path validation, 15MB JSON guard, bounded stale cache windows, provenance headers on bootstrap/fixtures; 5 tests; cross-instance quotas and clean production build remain release gates |
| 15 | Introduce background workers | `DONE_WITH_BLOCKER` | Postgres idempotent owned background_jobs queue, atomic SKIP LOCKED claiming/lease/retry/exhaustion, optimizer + refresh workers, authenticated job submit/poll, shared optimizer service, Node22 TS loader, 5 tests; live DB worker and frontend async conversion pending |
| 16 | Upgrade scheduled automation | `DONE_WITH_BLOCKER` | Guarded 10m Vercel schedule endpoint enqueues idempotent UTC-hourly source refresh and 10min in-match live jobs; live append-only snapshots, last refresh/live status, migration 0007, 4 schedule tests; requires suitable Vercel plan + deployed worker + live DB |

## Detailed Markdown files inside the ZIP

Step 01 evidence: `FPL_VORTEX_FINAL/1_APP_dashboard/SOURCE_ZIP_SHA256.txt` and repository `.git` history. The next 15 files are stored under `FPL_VORTEX_FINAL/1_APP_dashboard/docs/upgrade/`:

- **Step 02:** `02-baseline-verification.md`
- **Step 03:** `03-inventory-summary.md`
- **Step 04:** `04-architecture.md`
- **Step 05:** `05-planner-consolidation.md`
- **Step 06:** `06-scoring-consolidation.md`
- **Step 07:** `07-runtime-configuration.md`
- **Step 08:** `08-migrations.md`
- **Step 09:** `09-analytics-schema.md`
- **Step 10:** `10-authentication.md`
- **Step 11:** `11-access-control.md`
- **Step 12:** `12-fpl-data-pipeline.md`
- **Step 13:** `13-immutable-fpl-snapshots.md`
- **Step 14:** `14-fpl-api-reliability.md`
- **Step 15:** `15-background-jobs.md`
- **Step 16:** `16-scheduled-automation.md`

## Important release blockers

- No clean, fully dependency-installed Next.js production build or semantic TypeScript typecheck has been independently verified.
- PostgreSQL migrations and queues have dry-run / source-level checks, but live database execution was not verified in the delivered archive.
- Authentication email, deployed background worker, scheduled jobs, and production AI integrations require credentials and deployed infrastructure.
- Source-level tests passing does not prove the complete production system is running.
- A single consolidated 61-step ledger is in `docs/upgrade/PROGRESS.csv`; avoid treating older `START_HERE_UPGRADE_STATUS.md` staging notes as the final state of Steps 17–61.

## Where Steps 17–61 are documented

- `FPL_VORTEX_FINAL/1_APP_dashboard/docs/upgrade/04-stage04-progress.md`
- `FPL_VORTEX_FINAL/1_APP_dashboard/docs/upgrade/17-61-implementation.md`
- `FPL_VORTEX_FINAL/1_APP_dashboard/docs/upgrade/PROGRESS.csv`

All reported statuses are transcribed from the **same cumulative ZIP**; this report does not claim any new code, deploy, or completed acceptance gate.
