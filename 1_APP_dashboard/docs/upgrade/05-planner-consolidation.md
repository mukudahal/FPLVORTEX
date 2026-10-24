# Step 05 — Eliminate duplicated planners

**Status: CODE IMPLEMENTED; production build/React browser testing remains gated by the Step 02 npm registry issue.** No deploys, database migrations, or third-party service changes were attempted.

## Before

- `/planner` rendered `src/components/planner/TeamPlanner.tsx` with an interactive pitch and a local browser draft.
- `/team/[id]` Planner tab rendered a separate 1,099-line `src/components/team/PlannerView.tsx` with a distinct plan model and remote save/compare workflow.
- `/plan/[id]` used `src/components/plan/PlanDashboard.tsx` (709 lines), storing yet another transfer format (`plan-dashboard` v2), watchlist, ticker, and optimization lab.
- Shared links created within `/team/[id]` could return to its default tab instead of the planner.

## After — ONE canonical entry and draft owner

- `src/components/planner/TeamPlanner.tsx` is the only live planner shell.
- `/planner` continues to support manual Team ID input and shared `?t=&s=` links.
- `/planner/[id]` opens the identical workspace for a validated manager ID.
- `/plan/[id]` redirects to `/planner/[id]` for backward compatibility.
- `/team/[id]` Planner tab mounts the same TeamPlanner in embedded mode; `?tab=planner` selects it on page load.
- Old standalone `PlanDashboard`, separate team `PlannerView`, `PlanPitch`, `PlayerPanel`, and `PlayerModal` implementations were removed from the runtime source tree. Git history preserves their exact earlier code.
- Four distinct features of the former standalone editor are now inside **Strategy Insights**: an optimization lab, fixture ticker, gameweek summary, and a persistent watchlist.
- **Saved Plans** adds API-backed save/load/delete/compare workflow (existing 3-plan backend limit). Planned points are recalculated from the current projection when displaying historical saves, avoiding stale xPts comparisons.
- `src/lib/plannerPersistence.ts` normalizes the two old remote formats and the new canonical `vortex-planner` v3 format, validating imported players, GWs, chips, transfers, captains, vice captains, and lineups.
- The old local `fpl-plan-v2:<id>` draft is imported automatically **only if the canonical local draft does not exist**. Existing canonical local drafts and historical watchlists retain their keys.
- Manual vice captain is supported in the main planner, shared links, and saved-plan migration. Legacy shared links without it still decode.
- Share URLs always open `/planner/[id]` instead of inheriting `/team/[id]` query state.
- `SummaryTab` now reflects the planned chip and uses the correct projected-gameweek label.

## Validation

- `npm run test:planning`: 28/28 passing (20 existing and 8 added).
- `tsc --noEmit --module esnext --target es2022 --moduleResolution bundler --strict --lib es2022,dom --skipLibCheck src/lib/plannerPersistence.ts`: PASS.
- TypeScript syntax/AST parsing: PASS for every changed TS/TSX file; relative and alias imports resolve for those files.
- Whole application typecheck/lint/production build: **NOT VERIFIED**. The dependency registry is unavailable (`EAI_AGAIN`), so global `tsc` cannot resolve Next/React packages; it is not an acceptable substitute for a clean `npm ci && npm run build`.
- React/browser interaction tests and database-backed CRUD integration tests remain gated pending dependencies and a test PostgreSQL instance.

## Explicitly deferred, not hidden

- Step 06: centralize calculated projected points / captain bonus / plan simulation into one shared library to remove the remaining pure-calculation duplication in `SavedPlansView` and `StrategyInsightsView`.
- Step 10–11: authenticate and authorize the existing `/api/plans` reads/writes; public team ID based ownership is not a security boundary. Do not deploy this API to a public multi-user product as-is.
- Step 17: official season-specific FT and chip rules still need verification.
- Step 55–59: browser tests, DB integration tests, CI and production deployment.
- Autosaved local drafts survive; named remote plans currently require an explicit click on Save (safer than overwriting a legacy saved scenario during migration).

## Rollback and verification

- Step 04 Git commit: `7621c2c` (source before runtime consolidation).
- Step 05 Git commit: see `git log` after unpacking.
- Run `npm run test:planning`. When online: `npm ci && npm run typecheck && npm run lint && npm run build`.
- Check `/planner`, `/planner/12345`, `/plan/12345`, `/team/12345?tab=planner`, the saved legacy formats, and shared links after provisioning the application.
