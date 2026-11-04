# Canonical FPL VORTEX release baseline

Updated 2026-11-04. Canonical released source is `main` in `mukudahal/FPLVORTEX`.
Verified release baseline: PR #82 / `4753de942968a0a829516e03d795df56d2329876`, confirmed live on Render deployment `dep-dblai849v7es73cthh1g` before this increment.
Current integration branch: `release/compact-dashboard-safe-advice-20261104` (PR #83), based on that baseline. It preserves PR82's Solver safeguards, applies the same official availability rule to Plan advice and recommendation rankings, and removes redundant Dashboard/planning copy. This increment must pass final-head CI and production verification before it is considered released. The approved merge commit and final evidence belong to PR #83 and the existing Render deployment record; never infer deployment from branch state.
The authoritative outstanding-work register is `docs/VORTEX_V2_OUTSTANDING.md`; older roadmaps are historical design context, not completion records.

## Runtime and ownership

- Keep the existing Vite/React/Express Docker application on Render (`https://fplvortex.onrender.com`). No Next.js/Vercel migration is included.
- Application contracts: `src/lib/types.ts`. Rules/scoring/forecast/simulation: `src/lib/repoModel/`. Python `fpl_solver` owns the bounded HiGHS formulation; independent TypeScript financial/path validation remains intentional.
- `server/officialSnapshot.ts` owns runtime and scheduled FPL ingestion. `server/normalize.ts` normalizes official fields; `server/snapshotValidation.ts` guards recovery promotion.
- `1_APP_dashboard`, `site/model` and notebooks remain retained candidate/research sources. They do not serve production. Existing parity tests document supported shared behavior; notebook numerical parity is not established. Never replace the production model silently with notebook or dated imported forecasts.
- Browser plans remain in their existing storage keys and schema. This release makes no database migrations or plan deletion.

## Data health and recovery

`/api/health` is application readiness, not proof of fresh data. It reports original `generatedAt`, snapshot age, last official attempt/success/failure, in-flight refresh and recovery-write status separately. Errors are public-safe categories; no credentials or raw upstream bodies.

Cache expiry schedules refresh; it does not itself prove an upstream failure. A failed official refresh remains explicitly stale. Optional odds/history enrichment cannot invalidate a successfully fetched official snapshot. Original generation time is never reset on a fallback.

Successful validated official inputs are atomically written to `VORTEX_RECOVERY_PATH` (default `/tmp/fpl-vortex/official-snapshot.json`) before optional enrichment. This supports process restarts; Render redeploys discard ephemeral files. The scheduled GitHub refresh commits the separately validated public fallback for cross-deployment recovery. The original file is retained on failed validation/write. No new persistent disk or paid service is required.

`/api/vortex/data-status` distinguishes official retrieval, provisional model claims and bookmaker rights/quote coverage. Imported forecast file date is separate from official retrieval and is not a verified provider publication time. Calibration is unverified. Real provider access does not prove redistribution permission.

## Release process and rollback

1. Review the integration diff against current main; reconcile newer commits without overwriting them.
2. Pass all required GitHub checks and reviews. Do not override protections. Validate actual downloads and enabled routes.
3. Merge the integration PR through GitHub's normal merge process. Existing Render main autoDeploy performs rollout; no duplicate deployment trigger.
4. Confirm Render's live commit equals the merge SHA. Check health, a real official refresh, data timestamps, enabled routes, exact solver and local plan/export preservation.
5. On a material regression, revert the release merge through a normal reviewed PR to restore the previous tested application code. Do not reset/delete plans, databases or current official recovery data. Verify the resulting Render deployment and routes. The pre-release main SHA above is the original code reference; subsequent data-only commits should be retained when feasible.

Commit, CI, exact Render deployment and live verification evidence are maintained in the authoritative work register. Browser tests use the exact locked Playwright development dependency; do not run an unpinned npm install before the build, because that can change production dependencies and invalidate artifact matching.

## PR #83 reproducible acceptance

- `npm run typecheck`, `npm test` (225 tests), `npm run build`.
- All five existing CI jobs at the final PR head, including actual browser worker, manual saves, mobile widths and 4K PNG downloads.
- Review CI screenshots for Dashboard, Manual Plan and Solver. Keep real portraits/crests and stale/unavailable states.
- After approved merge, confirm Render serves its exact merge commit; run `node scripts/check-planner-deployment.mjs` against that build and `node scripts/check-release-live.mjs` for current official retrieval/persistence, routes, assets and solver response.
- Check production errors. If materially regressed, use existing Render redeploy controls to restore `4753de942968a0a829516e03d795df56d2329876`. No database/schema rollback required. Preserve local plans.
