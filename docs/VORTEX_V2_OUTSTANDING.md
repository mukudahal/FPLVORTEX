# FPL VORTEX authoritative release backlog

Updated 2026-11-03. Runtime/release source of truth: `docs/RELEASE_BASELINE.md`.
Canonical production is main / Vite + React + Express on existing Render. Earlier stage documents are historical; do not duplicate their stale completion lists.

| Order | Task | Status / exact dependency |
|---|---|---|
| 1 | Official FPL freshness/recovery | IMPLEMENTED / TESTED: shared ingestion, atomic recovery, no false TTL failure, explicit failed refresh HTTP 503, one source-age policy and safe diagnostics. PR #73 deployment verification pending. |
| 2 | Reviewed PR #71 public UI | IMPLEMENTED / CI VERIFIED at 3c3eff6: Dashboard/navigation/Players/H2H only. No unfinished joint/private-account endpoints imported. |
| 3 | Model contracts and timestamped forecast archive | IMPLEMENTED / TESTED: docs/MODEL_SPEC.md declares TS production ownership; immutable prospective archives and settled outcome matching added. First genuine GW10 archive collected on Nov 3. Calibration still BLOCKED on sufficient future forecast/outcome pairs. |
| 4 | Bookmaker provenance/display | PARTIAL: real production coverage observed; redisplay rights must be verified by the provider/account owner. Missing/stale/partial quotes must remain disclosed, never described as complete live odds. |
| 5 | Planner/solver acceptance | PARTIAL: merged no-chip HiGHS, price/FT safeguards and alternative-path tests. Genuine manager-entered joint chip acceptance needs authorized roster, purchase/sale values, cash, FT and chip inventory. Keep PR #71 joint/private research flags disabled in minimal release. |
| 6 | Saved-plan Monte Carlo | PARTIAL: deterministic paired sampler and selected-plan integration exist. Arbitrary A/B workflow, cancellation/export and realistic coverage need acceptance; distributions remain provisional. |
| 7 | Cloud saving / DATA admin (#60) | BLOCKED: no connected isolated Supabase staging project/authenticated two-user RLS evidence. No production migration; browser-local saving preserved. |
| 8 | Enabled-route / device / actual export acceptance | CI VERIFIED at 3c3eff6: Chromium Dashboard, Players/H2H, original Planner/saved plans/simulation, real downloaded CSV and 4K PNG files. Screenshot artifact reviewed. Final integrated run pending. |
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

- Milestone 1 pushed: `47aaab312f6149aa6fede1b684db525aab2f73f9`, PR #73. All four applicable CI jobs passed; existing conditional container gate was skipped. Final release branch now explicitly includes that gate.
- Milestone 2 integrates only public Dashboard/navigation/Players/H2H code from #71; unchanged Planner/Python solver and no joint/auth routes. Negative recorded scores, empty metrics, cancelled requests/retry and backwards-compatible shared fixture tiles were corrected during review.

- Milestone 2 pushed: `3c3eff60e89e13675a1e6b1e91b88e2238672205`, [CI run 41618362572](https://github.com/mukudahal/FPLVORTEX/actions/runs/41618362572): all FIVE jobs passed, including release Docker/Express HiGHS, existing Next candidate, Chromium/worker and real PNG/CSV downloads. Desktop/mobile evidence artifact 13222491529 reviewed.
- Local model/API/archive tests: full suite 203 passed, Python 14 passed (one dependency deprecation warning), TypeScript/build/static export passed. UI static audit: zero findings. Local Chromium download was unavailable; actual Chromium acceptance ran successfully in GitHub Actions.
- Genuine future GW10 inputs retrieved 2026-11-03T10:22:59.001Z, first forecast computed 2026-11-03T10:22:59.205Z, 670 players. Archive input SHA-256 c998c4d3dc05ad589b74a082b7735706df8ca0faedc12d71209c875c65a7978e. Subsequent model-code versions create separate observations; no back-dated forecasts.
- Minimal release excludes: joint chip/manual-attestation/private-account research from #71; cloud/admin from #60; unrestricted-optimum and calibration claims; arbitrary saved Plan A/B workflow not yet accepted; framework migration. Existing released chip heuristics and paired simulations retain explicit assumption labels.
