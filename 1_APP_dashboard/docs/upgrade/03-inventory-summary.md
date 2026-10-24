# Step 03 — Evidence-based project inventory

**Status: FINISHED.** Generated from the original premium upgrade ZIP plus an explicit feature classification. No user functionality was removed.

## Source counts

- **7 pages:** `/`, `/team/[id]`, `/planner`, `/plan/[id]`, `/players`, `/fixtures`, `/status`.
- **23 API Route Handler files** under `src/app/api/`.
- **49 React component files** under `src/components/`.
- **112 tracked TS/TSX/Python/CommonJS/ESM source files** (includes four scripts used by this stage).
- **7 database tables** defined in `src/db/schema.ts` (no migration history in original archive).
- **Three focused planning/test suites** with 20 assertions/tests passing; not a full app QA pass.

Re-run `python3 scripts/inventory.py` after every code stage to regenerate the machine-readable `03-source-files.csv` containing exact paths, routes, bytes, line counts, and SHA-256 hashes. `03-feature-inventory.csv` is the human-reviewed source of truth for implemented, partial, duplicated and missing features, mapped to future master-step owners. **Do not interpret a present component as a fully operational production feature.**

## What must be preserved

- FPL client/cache, bootstrap and fixture routes.
- Current live analysis, price tracking, images, recent managers and rivals APIs.
- Client-side manual plan storage/shared links, formation and transfer validation.
- Existing projection, minutes, Monte Carlo and MILP/heuristic fallback logic.
- Current manager planner's server-side plan-save workflow until an authenticated migration exists.
- Current reports/reference art and notebooks in their original folders.

## Confirmed duplication

| Current file | Responsibility | Future disposition |
| --- | --- | --- |
| `src/components/planner/PlannerView.tsx` | New planner player table/pitch | **Retain as canonical UI basis** |
| `src/components/team/PlannerView.tsx` | Old manager-specific planner and saved plan CRUD | Migrate persistence operations and unique functions before removing |
| `src/components/plan/PlanDashboard.tsx` | Multi-GW project-specific planner | Migrate missing horizon/plan features before redirecting old route |
| `src/lib/planEngine.ts` | Shared planner calculations | **Keep as canonical business-logic basis**, after verifying rule correctness |

**Do not delete the legacy planners immediately.** They own different user workflows; removing either without feature-by-feature migration would lose functionality. Step 05 must finish with one canonical planner, redirect compatibility and regression tests.

## Critical audit defects to address in later numbered steps

- The manager team tab deep-link recognizes only the market alias, even though 12 tabs are defined (`TeamDashboard.tsx`). A future route refactor must fix this.
- `/api/plans` permits CRUD by supplied manager entry ID without authenticated owner enforcement.
- `/api/price` has database mutations on a GET endpoint.
- `src/lib/optimizer.ts` launches heavy Python solving synchronously in the web API request.
- Cached FPL requests are throttled in process memory, not across deployed replicas.
- There are no migrations and DB config uses localhost credentials, which must be removed before deployment.
- The model's hand-tuned priors and stated calibration should not be described as validated without stored reproduction artifacts.

## Source-of-truth rule

A feature has **one canonical owner module**. Website tabs, AI explanations, APIs, and graphics/report exports must consume the same typed analytical outputs. Each upcoming stage will update the feature inventory and confirm no duplicate modules were introduced.
