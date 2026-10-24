# Stage 04 — Step-by-step delivery record (steps 17–61)

This is a **source implementation pass**, not a claim that all 61 requirements are production-complete.
Each step has one canonical ledger row; no duplicated tasks. Stages 1–3 and the original ZIP are preserved.

| Step | Status | Evidence and remaining acceptance gates |
|---:|---|---|
| 17 — Build season-specific FPL rules | DONE_WITH_BLOCKER | src/lib/seasonRules.ts; legal squad/chip/free-transfer rules and 3 tests; season-end full solver replay pending |
| 18 — Rebuild prediction reproducibility | DONE_WITH_BLOCKER | src/server/forecastIdentity.ts; canonical fingerprints; persisted end-to-end model run replay unverified |
| 19 — Calibrate the xPts engine | IN_PROGRESS | src/lib/forecastScience.ts; ridge calibration helpers only; missing historical training and calibration evidence |
| 20 — Strengthen expected-minutes predictions | IN_PROGRESS | src/lib/forecastScience.ts; uncertainty-aware heuristic minutes; learned start/substitution model pending |
| 21 — Model fixture uncertainty | DONE_WITH_BLOCKER | src/lib/forecastScience.ts; fixture blank/double/TBD diagnostics; live edge cases unverified |
| 22 — Validate prediction accuracy | IN_PROGRESS | src/lib/forecastScience.ts; no-hindsight sample filter plus accuracy/calibration diagnostics; longitudinal dataset absent |
| 23 — Upgrade Monte Carlo simulation | DONE_WITH_BLOCKER | src/lib/monteCarlo.ts; BB/TC-aware paired draws; distribution recalibration and match replay outstanding |
| 24 — Strengthen the transfer optimizer | IN_PROGRESS | src/lib/strategyEngine.ts; atomic budget/club/position legality; Python solver integration unverified |
| 25 — Implement multi-period optimization | IN_PROGRESS | src/lib/strategyEngine.ts; bounded multiweek beam search; not yet integrated end-to-end with live GW1-38 forecasts |
| 26 — Build scenario comparison | IN_PROGRESS | src/components/planner/PlannerExtras.tsx; manual what-if simulations; full paired scenario MC pending |
| 27 — Implement comprehensive chip strategy | IN_PROGRESS | src/lib/strategyEngine.ts and PlannerExtras.tsx; legal chips and greedy timetable; optimized WC/FH+opportunity-cost model pending |
| 28 — Upgrade price-change intelligence | IN_PROGRESS | src/lib/marketLeague.ts; official transfer demand index; no calibrated price rise/drop probabilities |
| 29 — Build unified injury intelligence | DONE_WITH_BLOCKER | src/lib/marketLeague.ts and /injuries; official availability list; independent reports/licensed data missing |
| 30 — Build mini-league analytics | DONE_WITH_BLOCKER | /leagues and src/lib/marketLeague.ts; public league leaderboard; full league pagination/replay pending |
| 31 — Implement effective-ownership analysis | DONE_WITH_BLOCKER | src/app/api/leagues/[id]/ownership/route.ts; capped authenticated 12-squad post-deadline EO sample; sample not global EO |
| 32 — Develop the Threats Engine | DONE_WITH_BLOCKER | src/lib/marketLeague.ts and /threats; ownership-weighted danger index; requires real cohort validation |
| 33 — Develop Must-Own and Differential analysis | IN_PROGRESS | src/lib/marketLeague.ts; sale-value-aware budget/club/position upgrade filter; transfer-horizon value modelling pending |
| 34 — Upgrade Captaincy Intelligence | DONE_WITH_BLOCKER | src/lib/marketLeague.ts and /captaincy; risk-adjusted ranking; empirical calibration outstanding |
| 35 — Establish the premium design system | DONE_WITH_BLOCKER | src/app/globals.css and original branded premium components; browser/contrast verification pending |
| 36 — Rebuild navigation and routing | DONE_WITH_BLOCKER | src/components/TopBar.tsx and BottomNav.tsx; premium nav and 24 page routes; browser routing verification pending |
| 37 — Build Tab 1: Dashboard | IN_PROGRESS | existing src/components/home/HomeDashboard.tsx preserved with new navigation; full command-centre redesign pending |
| 38 — Build Tab 2: Gameweek Review & Analysis | DONE_WITH_BLOCKER | /review and /review/[id]/[gw]; live historical gameweek review; frozen historical xPts comparison unavailable |
| 39 — Build Tab 3: Team Planner — Planner subtab | DONE_WITH_BLOCKER | TeamPlanner.tsx canonical planner route with original pitch/solver; browser E2E missing |
| 40 — Build Team Planner — Simulation subtab | IN_PROGRESS | PlannerExtras.tsx simulation tab with scenario interaction; fully paired Monte Carlo UI integration pending |
| 41 — Build Team Planner — Chips Strategy subtab | IN_PROGRESS | PlannerExtras.tsx chips strategy tab and chip rule engine; full optimized chip scenario runner pending |
| 42 — Build Team Planner — Price Increases subtab | DONE_WITH_BLOCKER | PlannerExtras.tsx Price Increases tab; demand index is uncalibrated |
| 43 — Build Team Planner — Injury List subtab | DONE_WITH_BLOCKER | PlannerExtras.tsx Injury List tab with official FPL flags; live validation pending |
| 44 — Build Mini-League page | DONE_WITH_BLOCKER | /leagues and owned league EO API; limited public sample and no league-wide historical coverage |
| 45 — Build Threats & Must-Own page | DONE_WITH_BLOCKER | /threats; injury-adjusted xPts risk and feasible alternatives; accuracy unverified |
| 46 — Build Captaincy page | DONE_WITH_BLOCKER | /captaincy; xPts/risk and VC guidance; real-world calibration pending |
| 47 — Upgrade Players & Fixtures pages | IN_PROGRESS | /predictions fixture-aware view and existing /players,/fixtures; full advanced sorting/comparison pending |
| 48 — Upgrade AI Copilot | DONE_WITH_BLOCKER | /api/copilot origin/size/auth AI quota and pre-existing solver-grounded explanation; production test pending |
| 49 — Build the shared reporting API | DONE_WITH_BLOCKER | src/lib/reportPayload.ts and /api/reports/[id]/[gw]; official observed report JSON; snapshot attribution pending |
| 50 — Build the Slides & Reports system | DONE_WITH_BLOCKER | scripts/reporting/render_report.py; tested 3 × 4K PNG, 3-slide PPTX, 3-page PDF from synthetic fixture; batch-only deck |
| 51 — Automate report publishing | IN_PROGRESS | report_schedules + background worker opt-in archival only; outbound publishing, storage and delivered alerts NOT implemented |
| 52 — Build Data & Model Status | DONE_WITH_BLOCKER | /status and /api/model/health; drift and data-status contract; real backtest baseline unavailable |
| 53 — Add production security and usage controls | IN_PROGRESS | auth/origin/quota safeguards and idempotent report archival; penetration, privacy and billing security testing outstanding |
| 54 — Optimize desktop and mobile performance | IN_PROGRESS | responsive premium CSS with 900px/520px rules; browser 390px/1440px and accessibility audits pending |
| 55 — Establish comprehensive testing | IN_PROGRESS | 100 passing Node planning/integration/static tests; real browser/DB/solver/visual E2E pending |
| 56 — Add automated CI/CD | DONE_WITH_BLOCKER | .github/workflows/ci.yml clean install/tests/typecheck/lint/build; CI not yet run on GitHub |
| 57 — Configure staging infrastructure | IN_PROGRESS | docs/upgrade/57-staging-setup.md and scripts/release-gates.cjs; no provisioned staging infra |
| 58 — Run full production-readiness testing | BLOCKED | release-gates.cjs intentionally fails without independent production-quality staging evidence |
| 59 — Deploy the premium website | BLOCKED | deployment not performed; production gates and real Vercel/DB credentials absent |
| 60 — Introduce premium subscriptions | PENDING | Stripe subscriptions/payments/entitlements not implemented; requires test-mode billing project and security review |
| 61 — Establish continuous improvement | IN_PROGRESS | src/lib/modelDrift.ts and /api/model/health; drift checks only; no historical recalibration cycle or long-running job |

## Verification executed in this stage
- `node --test scripts/*.test.cjs`: 100/100 passed (exact log in `04-test-results.txt`).
- `npm run db:migrate:dry-run`: migration 0001–0009 checksummed and enumerated; no DB writes.
- Global TypeScript `transpileModule` diagnostics: 170 TS/TSX parsed with zero syntax errors (not a typecheck).
- Offline synthetic renderer: three 3840×2160 PNG images, one 3-slide PowerPoint, one 3-page PDF; fake test fixture clearly marked.
- `npm ci` was attempted; offline install missing cached packages and online registry timed out. `npm run typecheck` failed due to absent installed `@types` packages (TS2688), so lint and production build **not verified**.
- `npm run check:release`: designed to return non-zero until 12 independently evidenced staging requirements are met.

## Remaining practical release conditions
Real hosted PostgreSQL migrations, deployment and worker credentials, real data snapshots/model calibration, production-quality browser E2E, complete GW1–GW38 multi-period optimizer and WC/FH simulations, genuine price probability model, billing if selected, and provisioned report delivery. These are not marked done.

## Original project and data provenance
Uses only original VORTEX UI elements plus observed public official FPL inputs. FPLCORE/FPLReview code, copyrighted design assets and proprietary prediction datasets were not copied.
