# FPL VORTEX authoritative release backlog

Updated 2026-11-03. Runtime/release source of truth: `docs/RELEASE_BASELINE.md`.
Canonical production is main / Vite + React + Express on existing Render. Earlier stage documents are historical; do not duplicate their stale completion lists.

| Order | Task | Status / exact dependency |
|---|---|---|
| 1 | Official FPL freshness/recovery | IMPLEMENTED locally: shared ingestion, atomic runtime/scheduled writes, no false failure on TTL expiry, safe health diagnostics; targeted tests passed. Live deploy verification pending. |
| 2 | Reviewed PR #71 public UI | NEXT: select Dashboard/navigation/Players/H2H changes. Do not import unfinished joint/private-account endpoints wholesale. |
| 3 | Model contracts and timestamped forecast archive | OPEN: declare TS production versus notebook research ownership; freeze/version future inputs and outputs. Existing parity/rules tests retained. Historical calibration blocked on genuine pre-deadline observations and settled targets. |
| 4 | Bookmaker provenance/display | PARTIAL: real production coverage observed; redisplay rights must be verified by the provider/account owner. Missing/stale/partial quotes must remain disclosed, never described as complete live odds. |
| 5 | Planner/solver acceptance | PARTIAL: merged no-chip HiGHS, price/FT safeguards and alternative-path tests. Genuine manager-entered joint chip acceptance needs authorized roster, purchase/sale values, cash, FT and chip inventory. Keep PR #71 joint/private research flags disabled in minimal release. |
| 6 | Saved-plan Monte Carlo | PARTIAL: deterministic paired sampler and selected-plan integration exist. Arbitrary A/B workflow, cancellation/export and realistic coverage need acceptance; distributions remain provisional. |
| 7 | Cloud saving / DATA admin (#60) | BLOCKED: no connected isolated Supabase staging project/authenticated two-user RLS evidence. No production migration; browser-local saving preserved. |
| 8 | Enabled-route / device / actual export acceptance | OPEN: targeted browser checks plus 4K PNG/CSV files, missing assets, keyboard and narrow screens. |
| 9 | Final integration checks and rollout | OPEN: normal PR checks/reviews, exact Render commit, refresh timestamps, solver/plan/export smoke and logs. Render logs require the account workspace to be selected by its owner; service/deploy metadata reads work. |

## Completed before this release (preserve)

PRs #55, #56–59, #61–70 are merged: 4K export; source/UX contracts; 10-GW defaults; homepage/data health; rules/market-source safeguards; local plan locks and integration; forecast freshness; FT valuation; chip continuations; bounded no-chip MILP; alternative paths; first-sale/rebuy accounting. PR #71 and #60 are still draft, not released.

## Evidence log

- Reverified main and Render live: `a42c04ef7e1d196450364026e1f989fed56be089`; deployment `dep-dbkqq9oae00c73fs4ib0`.
- Direct production refresh returned official inputs generated `2026-11-03T10:08:16.813Z` (05:08 Eastern), `upstreamOk=true`, `stale=false`, 670 players / 380 fixtures. Initial fast-cache stale status was not proof of permanent upstream denial.
- New ingestion retrieved and atomically persisted actual official inputs locally at `2026-11-03T10:12:18.243Z`; 670 players / 380 fixtures. This does not yet prove the new code is deployed.
- Targeted recovery/freshness/loading tests: 13 passed, 0 failed. Full checks and release commit are recorded after completion.
- PR #60 reviewed: SQL/security groundwork only; not an integrated cloud save system. Preserve it as isolated staging work.
- Old overlapping PRs #1/#2/#43/#45 must not be merged wholesale. #55 already covers the PNG repair. Dependency PRs require individual checks, not blind bulk merge.
