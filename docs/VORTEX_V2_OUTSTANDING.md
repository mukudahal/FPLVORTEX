# FPL VORTEX authoritative release backlog

Updated 2026-11-03. Runtime/release source of truth: `docs/RELEASE_BASELINE.md`.
Canonical production is main / Vite + React + Express on existing Render. Earlier stage documents are historical; do not duplicate their stale completion lists.

| Order | Task | Status / exact dependency |
|---|---|---|
| 1 | Official FPL freshness/recovery | IMPLEMENTED / TESTED: shared ingestion, atomic recovery, no false TTL failure, explicit failed refresh HTTP 503, one source-age policy and safe diagnostics. DEPLOYED via #73 / f3072e7; refreshed data child fba687b live. Production actual refresh/recovery/history/solver passed. |
| 2 | Reviewed PR #71 public UI | IMPLEMENTED / CI VERIFIED at 3c3eff6: Dashboard/navigation/Players/H2H only. No unfinished joint/private-account endpoints imported. |
| 3 | Model contracts and timestamped forecast archive | IMPLEMENTED / TESTED: docs/MODEL_SPEC.md declares TS production ownership; immutable prospective archives and settled outcome matching added. First genuine GW10 archive collected on Nov 3. Calibration still BLOCKED on sufficient future forecast/outcome pairs. |
| 4 | Bookmaker provenance/display | PARTIAL: real production coverage observed; redisplay rights must be verified by the provider/account owner. Missing/stale/partial quotes must remain disclosed, never described as complete live odds. |
| 5 | Planner/solver acceptance | PARTIAL: merged no-chip HiGHS, price/FT safeguards and alternative-path tests. Genuine manager-entered joint chip acceptance needs authorized roster, purchase/sale values, cash, FT and chip inventory. Keep PR #71 joint/private research flags disabled in minimal release. |
| 6 | Saved-plan Monte Carlo | PARTIAL: deterministic paired sampler and selected-plan integration exist. Arbitrary A/B workflow, cancellation/export and realistic coverage need acceptance; distributions remain provisional. |
| 7 | Cloud saving / DATA admin (#60) | BLOCKED: no connected isolated Supabase staging project/authenticated two-user RLS evidence. No production migration; browser-local saving preserved. |
| 8 | Enabled-route / device / actual export acceptance | CI VERIFIED at 3c3eff6: Chromium Dashboard, Players/H2H, original Planner/saved plans/simulation, real downloaded CSV and 4K PNG files. Screenshot artifact reviewed. Final PR checks passed at 50d6a29; production HTTP smoke passed. Post-deploy browser fingerprint gate exposed CI dependency drift; pinning Playwright in the lockfile. |
| 9 | Final integration checks and rollout | DEPLOYED / VERIFYING: #73 normal merge f3072e7, Render fba687b (validated data-only child), startup logs healthy. HTTP smoke passed at 10:33:45Z; final locked-dependency browser gate and handoff remain. |

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

- Milestone 3 pushed: `fd076860445c6768f9865a9ec09e488acab2993b`. Prospective archive/outcome and shared-age policy implemented; final release verification adds application-entry hash matching plus production HTTP/browser/download checks (unchanged worker bytes alone do not prove a new UI deployment).

- Release #73 merged normally at `f3072e71d98ab8346f3e79f3bc4dc2588497de5c` after all five final CI jobs passed on `50d6a29c7f906f430dc2e2c0c07dfce461fe45bf` (run 41619767687).
- Scheduled official refresh run 41620126310 succeeded and produced `fba687bfb8bc233ca1a738f983b9817511b431b8`, whose only parent is the release merge. Render deployed that generated-data child as live (`dep-dbkrgn6n2jqc7396233g`). Official production refresh at `2026-11-03T10:33:45.678Z`: 670 players / 380 fixtures, recovery saved, eight settled player-history rows, feasible synthetic no-chip HTTP solve. Bookmaker state unverified; redisplay rights false. Production startup logs reviewed; no material application regression observed.
- Reproducibility repair: existing browser job installed Playwright with `--no-save`, silently upgrading lucide-react 1.61.0 to 1.67.0 before building. The improved app-entry hash gate correctly refused to call this a matching production build. Playwright is now an exact locked dev dependency; CI uses npm ci without mutating dependencies. No deployed UI/solver behavior changed by this repair.

- Current-snapshot acceptance found an old 667-player test assumption and a real fallback defect: the dated CSV filtered out newly registered official players on cold/offline responses. Enrichment now preserves every official ID and never fills official identity/price from that dated file. Tests assert exact roster preservation and absent import values for unmatched players; the 667-row benchmark assertion is retained independently.

- #74 merged normally at `3419dba4c5fc101a51d3ba3ad31f2999b1585bd0`; all five pre-merge checks passed (run 41621262979). Render exact SHA live, fresh official production inputs at 2026-11-03T10:45:21.022Z, recovery/history/solver passed, 25 reviewed post-rollout logs contained no errors. 204 local Node tests and 14 Python tests passed; npm audit zero vulnerabilities.
- Production-only export gate found an existing non-root container defect: image proxies tried writing `/app/.cache`, returned HTTP 500 EACCES, and Dashboard PNG could not prepare real photos. Repair uses a writable /tmp cache, serves fetched bytes even when optional disk caching fails, and bounds browser image fetches. Unit transport tests cover writable and failed-cache paths; actual production PNG must pass before handoff. Tests are retained, not disabled.


## 2026-11-03 · All-team planning/FDR research follow-up

- Reverified main and Render exact live commit `ee1896e44c03a74de9b5eb6021f28af23cfc9924`; forced official production refresh `2026-11-03T14:18:21.316Z` (09:18:21 EST), 670 players / 380 fixtures, recovery saved, source health fresh. The historical freshness failure is not reproduced on this baseline. Reviewed latest 15 deployment/application log entries; no application error in those entries.
- Added canonical-model all-team JSON/CSV export and optional 4K graphic renderer; all 20 authentic club badges obtained. Forecast data computed at 09:19:28 EST from the 09:18:21 EST inputs. Model output, not bookmaker odds; no calibration claim. Research and exact FDR coefficients in docs/FDR_PLANNING_RESEARCH.md.
- Focused tests: 5 passed locally under Node24 native type stripping and a scratch-only extension resolver. Full TypeScript/unit/Python/browser/build/security CI pending on the follow-up PR; no full local dependency install or browser execution claimed.
- Existing minimal public features stay unchanged; no new public UI controls, manager plan mutation, data migration, provider spending or automation changes. PR71 remains draft/conflicted and joint/private-account gates are not bypassed. PR60 remains draft, requiring an isolated connected staging database and authenticated cross-user authorization/revision tests. Calibration still requires genuine prospective settled observations; bookmaker display rights remain unverified. Arbitrary saved Plan A/B acceptance and genuine manager-entered joint review/save-new testing remain deferred.

- Follow-up PR #76 initial implementation commit `c8c3fbbd19b5d118479e5b060f92c1a009086994`. CI run 41653173360 has passed TypeScript/unit/build, Python, Docker exact-solver and Next candidate jobs; browser/PNG gate still running at this entry. Existing live-release check passed at official retrieval `2026-11-03T14:23:46.116Z`: 670 players, recovery saved, official player history, portrait/badge bytes and a feasible synthetic no-chip solver response. This is not a genuine-manager end-to-end test.
- Renderer follow-up separates actual graphic generation time from model computation time and uses the selected horizon in labels. Optional Python syntax check passed.


## 2026-11-03 · Manual Plan (owner video 59876.mp4)

- First Planner section renamed Plan, opens inline, manual controls only. Removed exact-solver preview/text and duplicated scenario/lock block from Plan; other analytical sections unchanged. Canonical saved-plan editor gains an embedded presentation rather than new storage/model rules.
- Real portrait resolver on 11 starters + 4 bench. Legal starter/bench Swap; Transfer out opens the existing Players table with constrained, explicit Select actions, preserving budget/position/club/duplicate checks and refusing silent pruning of future saved transfers. Captain/vice, chips, Undo, starting cash/FTs, explicit save and save-as-new retained. Device-save readback and unrelated slots checked; unsaved changes survive analytical subtab switches and get a discard dialog when switching plans.
- Compact Assistant Manager/Director image cards followed by the shared 20-team FDR table. Design/UX contracts record owners. No forecast coefficients, automation schedules, databases or provider spending changed.
- Local: TypeScript check passed; all 211 Node tests passed. Vite build passed; static export passed via node --import tsx (tsx CLI IPC is unavailable in this environment). Strict UI audit: 0 findings. Chromium download returned truncated archives; real rendered/mobile/keyboard/transfer/save/export verification must run in GitHub CI before merge. No browser or deployment success is claimed at this point.

- Follow-up PR #77, implementation `e55a987`, captaincy/horizon `ed3b12f`, pitch/bench layout `b55939d`. Local 211 tests and strict UI audit passed. Browser screenshots reviewed at 1440px: all real portraits, centered formation and full bench names. CI caught and repaired an overlong week selector and clipped flex-column bench cards. A subsequent keyboard-transfer check selected the outgoing player itself (the legacy restore rule); the embedded Players picker now disables that row and uses Back to Plan for cancellation. Full browser/swap/save/mobile acceptance remains required before merge.


### 2026-11-03 — Compact Chip Strategy transfer workspace (release/chip-strategy-10gw-20261103)

Baseline verified: main 61e62622f869698ca5f6c3d1abec66ea492d55e7 and existing Render Vite/React/Express Docker service. Uploaded screenshot/60008.mp4/60011.mp4 reviewed. Existing compassPlanner runtime and canonical portrait/crest sources reused; no social automation, migrations or stack changes.

Implemented: visible next-10-GW buy/sell/roll/hit roadmap even with all chips spent; Best recommendations and explicit Manual check; selectable GW19 when in horizon; separate half-season inventories; selected-week 11+4 portrait pitch; bank/FT/hits and selling/buy values; cancel/retry; protected save-as-new. Saved plans and manual commitments retained. Model details and existing exact no-chip comparison are collapsible. Shortlisted results are not called globally optimal. Simultaneous batch validation prevents legal proposals being pruned by intermediate budget/club counts.

Evidence: initial 21 targeted model tests and 215 full Node tests passed; TypeScript and Vite/static-export passed. Local static export used a labelled fallback after upstream access failed in this environment. Further save-copy, batch and browser regression coverage added; final CI and production verification pending the PR. Tests cover spent chips with transfer hits, manual GW19, illegal/unknown/conflicting chips, FH restoration, GW38 clipping, immutable saved plans, mobile layouts and cancellation. All checks must pass at final head before merge.

Rollback: redeploy prior approved main 61e62622 through existing Render controls; no migration. Remaining release dependency: final CI/browser artifacts and exact live commit verification. Authenticated cloud saving/PR60 stays staging-only; bookmaker rights/access remain unverified. No calibration or accuracy claim added.

