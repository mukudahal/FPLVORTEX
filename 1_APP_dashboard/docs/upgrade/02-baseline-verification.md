# Step 02 — Baseline verification

Status: **COMPLETED AS AN AUDIT; production verification remains BLOCKED**.
Date: 2026-10-23 (America/New_York). Source: premium automated upgrade ZIP, exact hash in `SOURCE_ZIP_SHA256.txt`.

## Commands and results

| Command | Outcome | Evidence |
| --- | --- | --- |
| `node --version`, `npm --version`, `python3 --version`, `git --version` | Available | `02-toolchain.txt` |
| `npm run test:planning` | **PASS: 20/20 tests** | `02-baseline-test-results.txt` |
| `npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=10000` | **BLOCKED**: npm registry DNS resolution `EAI_AGAIN`, followed by npm `Exit handler never called` | installation diagnostic below |
| `npm run typecheck` | NOT VERIFIED: a clean dependency install is required | See unblock criteria |
| `npm run lint` | NOT VERIFIED: a clean dependency install is required | See unblock criteria |
| `npm run build` | NOT VERIFIED: a clean dependency install is required | See unblock criteria |
| Python solver under PuLP | NOT VERIFIED: required system dependencies not provisioned | See unblock criteria |
| PostgreSQL migration integration test | NOT VERIFIED: no configured test database | See unblock criteria |

This report does **not** claim the application can build or deploy. Test coverage is limited to the repository's three existing planning/intelligence test files.

## Baseline warnings

1. No checked-in SQL migrations or migrations directory in the original ZIP.
2. `drizzle.config.json` uses a hard-coded localhost Postgres URL; runtime uses `DATABASE_URL`.
3. Planner has multiple UI implementations; the latest modern planner appears under `/planner`.
4. `/api/price` GET performs writes; move refresh into a job later.
5. Saved plans have no authenticated owner constraint.
6. Cron schedule refreshes once daily; production jobs and API key configuration are not part of this ZIP.
7. OpenAI spend endpoint requires authentication and quotas before public use.
8. No e2e, integration, or CI build gate present.

## Production build release gate

When a package-registry connection and test DB are available, execute in a clean checkout:

```bash
npm ci
npm run lint
npm run typecheck
npm run test:planning
npm run build
python3 -m pip install -r requirements.txt
```

Only clear the gate after all commands pass; record Node/npm versions and artifact hash. Do **not** silently mark this gate passed or proceed to production deployment without it.
