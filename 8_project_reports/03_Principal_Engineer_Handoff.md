# FPL VORTEX — Lead Engineer Handoff and Production Completion Mandate

**Project:** Premium, commercial-ready Fantasy Premier League analytics and probabilistic decision platform  
**Starting artifact:** `FPL_VORTEX_FINAL_CUMULATIVE_STEPS_01_61.zip`  
**Accompanying reports:** `FPL_VORTEX_Steps_01_16_Progress.md`, `FPL_VORTEX_Stage04_Progress.md`  
**Canonical working directory inside ZIP:** `FPL_VORTEX_FINAL/1_APP_dashboard/`  
**Priority:** Evidence-based model quality, solver correctness, legal data rights, and an end-to-end working service—not another visual prototype.

## 1. Your mandate

You are the principal engineer responsible for converting an unfinished Next.js/TypeScript and Python FPL project into an operable, secure, commercially viable product. Assume you are free to improve the architecture where justified, but **preserve functional work**, maintain one canonical implementation per capability, and prove all performance/accuracy claims. Treat the existing 61-item ledger as a record of work, *not* a declaration of completeness. Do not claim superiority to FPLReview or Solio without independent, reproducible out-of-sample testing. Use an original FPL VORTEX interface; references to FPLCORE/FPLReview describe functional expectations, not permission to copy their proprietary assets, code, models or branding.

Success has four separately auditable dimensions: (1) production-grade data and model pipeline; (2) legal, deterministic FPL rules and useful stochastic decision-making; (3) intuitive premium multi-page website and accurate reporting; and (4) reliable deployment, security and viable business operations. A source file or passing mock test is not equivalent to a deployed, verified feature.

## 2. Baseline confirmed from supplied artifact

- `package.json` identifies Next.js 16.2.6, React 19.2.6, TypeScript 5.9.3, Drizzle, `pg`, Tailwind 4. `requirements.txt` uses optional PuLP (2.9–<4); there is a Python MILP/heuristic solver in `src/lib/solver.py`.
- Existing pages include `/`, `/planner`, `/review`, `/review/[id]/[gw]`, `/players`, `/predictions`, `/fixtures`, `/captaincy`, `/injuries`, `/market`, `/leagues`, `/threats`, `/reports`, `/status`, account/auth pages and legacy planner/team links. Many interfaces still need real-world validation.
- Relevant code: `src/lib/xpts.ts`, `forecastScience.ts`, `monteCarlo.ts`, `strategyEngine.ts`, `seasonRules.ts`, `scoring.ts`, `marketLeague.ts`, `reportPayload.ts`; `src/lib/solver.py`; `src/components/planner/{TeamPlanner,PlannerExtras}.tsx`; `src/server/forecastIdentity.ts`; SQL migrations `0001`–`0009`; background jobs and report scripts.
- The project's Stage 4 tracker reports: 3 fully complete, 36 source-implemented but blocked, 19 in progress, 2 blocked and 1 pending. Source tests: 100/100; this **does not** validate a full Next.js build, live PostgreSQL, Python solver, browser E2E, historical model performance or deployment.
- Known concrete gaps: `vercel.json` schedules `*/10 * * * *`; this is incompatible with Vercel Hobby's once-per-day cron limit. `src/lib/seasonRules.ts` hardcodes `2026/27`; `src/lib/xpts.ts` contains GW6 2026/27 position priors and fixed heuristic coefficients; `forecastScience.ts` has calibration helpers but no evidenced historical fitted production model. `strategyEngine.ts` explicitly calls its bounded beam search non-global-optimal and its chip schedule greedy. The report renderer has a **three-slide synthetic-data smoke test**, not a complete production report catalog.
- The release gate script `scripts/release-gates.cjs` blocks launch until independent evidence for clean install, typecheck, lint, build, real migrations, cross-user authorization, queue/cron replay, model backtest, desktop/mobile E2E, staging smoke, backup restore and data-rights review. **Do not fabricate passing evidence.**

## 3. Non-negotiable data rights: address before commercial launch

Public visibility does not imply commercial reuse permission. The official 2026/27 Fantasy Premier League terms prohibit automated extraction from the Game and commercial exploitation of Game data/material absent applicable authorization. Player images, Premier League logos, club crests, fixtures and protected brand assets require separate rights analysis where applicable. **Obtain written permissions/licensed data or an explicitly permitted feed** before depending on automated FPL data ingestion or selling derived products. Keep a provenance/rights register for every source and asset. Respect provider rate limits, user privacy and attribution. User-supplied manager IDs do not solve these rights questions. Do not scrape FPLReview's paid projections or Solio's proprietary methods/data; an expressly licensed/public Solio endpoint may be used only according to its terms and attribution conditions. Until rights are resolved, develop with permissioned/historical datasets and synthetic fixtures; do not launch an unauthorized commercial scraper.

## 4. Engineering architecture to finish (reuse before adding services)

- **Web:** Keep Next.js App Router, React, TypeScript, Tailwind and a single shared, accessible component library. Server handles accounts, read APIs, authorization and lightweight aggregation.
- **Database:** PostgreSQL/Drizzle as system of record. Use migrations, row ownership, indexing, partition/retention strategy for historical events, encrypted backup and verified restore. Maintain season-scoped identities.
- **Data layer:** Adapter → schema validation → raw immutable snapshot → normalized records → feature snapshots → predictions. Every fact carries `source`, `source_timestamp`, `ingested_at`, `as_of`, `fixture/GW`, `season`, `license_status` and quality flags. Do not silently replace missing data with believable values.
- **Python ML/optimizer:** Create a versioned Python package within this repository for model training, evaluation and optimization, with pinned/locked environments, type hints, deterministic seeds and contract tests. Keep the existing solver until an alternative demonstrably beats it. Execute heavy jobs in a worker process consuming the existing durable Postgres job queue; don't run Python training, big Monte Carlo or MILP inside short-lived Next.js requests. FastAPI is optional, not a prerequisite.
- **Jobs:** Dedicated schedules for licensed data intake, fixture change detection, live match events, press/injury updates, price signals, forecast snapshots, post-deadline lineup/EO, gameweek review and report delivery. Idempotent job keys, leases, retries, poison-job handling, observability, cost ceilings and stale-data fallback. Choose scheduler compatible with actual hosting plan; do not ship unsupported ten-minute Hobby cron.
- **Versioned contracts:** Define JSON schema and integration tests for `PlayerProjection`, `Scenario`, `TransferPlan`, `ChipPlan`, `LeagueThreat`, `GWReview`, `ReportPayload`, and `ModelRun`. All pages, APIs, exported slides and AI explanations must consume the same dated model run.

## 5. Forecasting science — replace the heuristic core with a proven pipeline

**A. Create a historical training corpus.** Use multiple complete past seasons from authorized sources, with distinct train/validation/held-out test periods. Capture player/club membership, fixtures and reschedules, historical player prices, roster/starting XI, substitutions, minutes, injuries, availability and suspension, set pieces, team strength, xG/xA/xGC (only where licensed), clean sheets, goals, assists, cards, goalkeeper saves, bonus and defensive-contribution categories. Track scoring-rule changes per season. Preserve genuine **pre-deadline** inputs; never fit on final statistics that were unknown when a forecast would have been issued.

**B. Minutes model (first priority).** Model separately: P(available), P(starts | available), P(substitute appearance), conditional minutes played, and P(60+), using historical starts/minutes, position, manager rotation, short rest, fixture congestion, international duty, late injury news, tactical role, suspensions and transfers. Use hierarchical or gradient-boosted models only where they outperform a transparent baseline. Calibrate probabilities and expose fresh-news/manual overrides with an audit trail. Never present a deterministic return-from-injury date as fact.

**C. Match outcomes and player events.** Build time-decayed home/away attack and defense strength; model match xG and goal counts using appropriately calibrated distributions; derive clean-sheet, goals-conceded, cards and goalkeeper-save expectations. Allocate team attacking output to players using estimated role, xG/xA shares, starting minutes, set-piece/penalty hierarchy and opponent matchup. Model attacking events, bonus/BPS and defensive-contribution thresholds according to the season's rules. Explicitly check whether a clean sheet requires 60+ minutes, captain/vice fallback, autosubs, substitution order and match-level eligibility. Model blanks/doubles as zero/two fixture events, not FDR multipliers.

**D. Correlated Monte Carlo.** Sample team goals and match conditions once per fixture, then condition player outcomes on them. Avoid independent player totals that create impossible game scores. Simulate correlated lineups/minutes, CS, goals, assists, bonus, defensive contributions, penalties/cards, goalkeeper events, autosubs, captain/vice and chip effects. Generate distributions and publish mean xPts, p10/p50/p90, probabilities of 0/2+/5+/10+ points, haul and blank risks. Persist simulation seed, sample count, model version and data-as-of time; support paired seeds when comparing strategies.

**E. Calibration, backtests and benchmarking.** Implement rolling-origin walk-forward evaluation, grouped by season/GW and team to avoid leakage. Report xPts MAE/RMSE/bias by horizon/position/minutes-band/season; Brier/log loss/reliability plots for starts, 60+, CS and player scoring; interval coverage and tail calibration for simulator output. Compare against naive historical means, existing `xpts.ts`, simple FPL-based expectations where legally available, and any licensed competitor forecasts. Use bootstrap confidence intervals and deployment gates. Promote a model only if it provides stable, material held-out improvement and no unacceptable regression in critical subgroups; otherwise retain the baseline. No “better than FPLReview/Solio” badge without equivalent-date authorized independent comparisons.

**F. Reproducibility.** Require a frozen `model_run_id` composed from dataset snapshot hash, feature generation version, source licenses, hyperparameters, trained artifact digest, seed, creation timestamp and forecast horizon. Gameweek reviews must evaluate exactly the locked pre-deadline forecast, never a forecast recalculated afterward.

## 6. Decision mathematics — make it a reliable strategy engine

- Implement an exact and exhaustively tested **rules/state-transition** kernel: 15-man squad (2 GK / 5 DEF / 5 MID / 3 FWD), max 3 per club, 11 starters and legal formation, buyer price versus seller value, bank, free-transfer carryover (up to 5), hit points, locked transfers, gameweek deadlines, chip eligibility/half-season limits, Free Hit temporary team restoration, chip-specific scoring, captain/vice and substitution behavior. Rules are season-versioned; verify against official 2026/27 FPL policies and update from approved source, not by editing arbitrary UI constants.
- Use the single scenario state `S(gw) = squad, purchase prices, current market prices, bank, FTs, chips remaining, lineup, captain/vice, planned transfers, source/model version`. A branch must never silently lose or duplicate free transfers/chips, or benefit from foresight.
- First guarantee single-GW optimal lineups with a verified MILP/enumeration solution; then multi-week transfer search (1/3/5/10 GWs plus rolling season continuation). Optimize expected points **net of hits** and flexible future transfers; optional downside-aware utility. No `roll, roll, roll` default where free transfers would hit the cap. Honor locked players, excluded targets, squad-price constraints, preferred cheap bench/backup GK, and manager preferences as validated optimization constraints.
- Introduce stochastic tree search or scenario-based stochastic MILP with pruning/rolling horizon for Wildcard, Free Hit, Bench Boost, Triple Captain and GW19/GW20 chip resets. Compare chip now with **value of retaining it** for future likely DGW/BGW opportunities. Verify Free Hit's squad restoration and bank/free-transfer semantics with test fixtures; no greedily stacked chip gains from unrelated simulated worlds.
- Produce Hold/Manual/Solver/Risk-adjusted alternatives on exactly the same forecast snapshot and paired scenario seeds. Show delta in mean points, p10/p90, hits, probability of loss, bank, exposure, captaincy, future option value, solver time, bound/gap and whether the plan is provably optimal or approximate.
- Rank-target planning: overall top-5,000 and mini-league win probabilities require an independently calibrated model of rank distributions, rival squads and ownership. Never equate `expected points` with `probability of rank target`; report uncertainty and limitations.

## 7. Market, injury, league and threat intelligence

- **Price moves:** Historical licensed price and transfer snapshots; forecast `P(rise by next deadline)` / `P(fall)` with calibrated classification, not a guaranteed predicted tick. Since price formulas aren't public, label the signal probabilistic and show its historical Brier/log-loss, coverage and freshness. Track affordability and expected cost of waiting.
- **Injuries/rotation:** Store injury/suspension/news events and provenance, expected minutes effect, time of update, source reliability and suggested alternatives. Prevent stale “fit” indicators from overriding a later official absence.
- **Mini-leagues:** Leaderboard, rivals, points behind, confirmed public squads after deadlines, captaincy/bench/FT-chip known state, projected gap trajectories, head-to-head simulations and true unknowns. Never expose another manager's pre-deadline private transfer decisions. Effective ownership is derived from an explicitly identified sample; display sample size and confidence, not unsupported claims of global EO.
- **Threats/must-own:** Threat score should reflect projected value, captaincy exposure, credible effective ownership, haul tail, the user's exposure and opportunity cost. A “must-own” label is only justified by feasible counterfactual transfers and a measurable expected-loss/rank-risk threshold; offer differentials and alternatives, not popularity alone.

## 8. Final website information architecture (real working tabs)

1. **Dashboard:** Squad pitch, upcoming GW, current rank/live points, team value/bank/FT, xPts, captain, risks/alerts, fixtures, next best action, data/model freshness.
2. **Gameweek Review & Analysis:** Live view; frozen forecast-vs-actual; captain/vice and bench decision audit; transfers/chips impact; rank and EO swings; post-GW learning and opponent/rival analysis.
3. **Team Planner:** `Squad & XI` / `Transfers` / `Simulation` / `Chip Strategy` / `Season Calendar` / `Price Increases` / `Injuries` / `Saved Plans`. One canonical state and saved-plan API. Simulation supports GW window, alternative pathways, risk appetite, manual player locks, scenario comparisons and distribution charts.
4. **Player Analytics & Predictions:** All-player sortable projections, estimated minutes, positions, stats breakdown, uncertainty bands, 1/3/5/10-GW horizons, fixtures, player-versus-player comparison and transparent modelling inputs.
5. **Captaincy & Fixtures:** Captain/vice rankings with probability ranges, blank/double fixture analysis, club matchup and swing charts.
6. **Mini-League Intelligence:** League overview / rivals / threats / effective ownership / must-own and differential / catch-up scenarios. Clearly label sampled observations.
7. **Market & Injuries:** Price alerts, news timeline, injury and rotation risk, affordability sensitivity, watchlist.
8. **Reports & Slides:** GW preview/review, Transfer Plan, Chip Calendar, Players, Captaincy, Mini-League/Threats; selectable 16:9 slides, 3840×2160 PNG, PDF and PPTX; mobile summary cards. All visuals must use the same versioned forecast and rights-cleared assets.
9. **Model Lab & Automation:** Accuracy and calibration dashboard, model versions, source health, cron/worker health, scenario audit trails, refresh dates, alert/report scheduling and failure visibility.
10. **Account/Admin/Billing:** Secure sessions, linked manager, saved preferences, consent/privacy, subscriptions/entitlements, cancellation and self-service data deletion.

All pages must support: loading, no-data, stale-data, upstream failure, unauthorized, overflow, keyboard navigation, desktop 1440px and mobile 390px. Premium graphics should be **original** and cohesive; do not ship borrowed FPLCORE/FPLReview screenshots or licensed photographs/crests without rights.

## 9. AI Copilot: reasoning only over factual, versioned outputs

Use an available, verified reasoning model for natural-language explanations, counterfactual questions and concise reports; never delegate arithmetic/legal squad validation to an LLM. Tool responses to the model must be typed, bounded, source-tagged and use the same `model_run_id` as the UI. Enforce authorization, rate/token budgets, prompt-injection isolation, citation-to-data/run, safe degraded mode and version control for generated recommendations. Display deterministic model results beside AI narration so users can audit claims. Do not assume any specific model identifier exists until its API support is verified.

## 10. Slides and publishing: finish beyond the smoke test

Define a versioned `ReportPayload` with season, GW, timezone, snapshot IDs, forecast/run IDs, metric definitions, model confidence, freshness, alerts, chart specifications, licenses and source attributions. Create a template registry for GW preview, GW live/review, full XV, transfer strategy, chip horizon, player watchlist, price/injury alerts, mini-league threats and model-performance report. Render with one content source into 16:9 4K PNG, PowerPoint and PDF, verifying fonts/layout at multiple content lengths. Schedule 5:30 AM and 5:20 PM **America/New_York** only after the user enables delivery and the chosen delivery channel/plan supports it. Store durable report artifacts, deduplicate by schedule+GW+model run+recipient, log delivery results, allow retries and provide a real unsubscribe/disable option. No synthetic data in published results.

## 11. Security, observability, cost and commercial viability

Implement least-privilege DB roles and data ownership, credential rotation, CSRF/XSS defenses, secure cookies, auth and reset abuse throttling, limits on solver/AI jobs, input validation, audit logs, PII/data retention/deletion, backups/restore, incident alerts and privacy/terms/license documentation. Track ingestion age, worker queue/failed jobs, model drift, user-visible errors, endpoint latency, inference cost and report delivery. Set hard per-user inference and simulation budgets. First prove a permitted and sustainable data supply; then add one simple paid tier via Stripe test mode, webhook signature verification, idempotent entitlements and self-service cancellation. Keep marketing claims conservative and measurable. Free staging may use limited free tiers, but continuous compute, frequent crons, AI, paid licensing and commercial hosting are not inherently free.

## 12. Delivery order — execute one milestone at a time with evidence

**M0 — Repository and risk audit (P0).** Import the *latest cumulative* ZIP only; attach both MD reports; review `docs/upgrade/PROGRESS.csv`; verify archive hash, all file paths, Git history, code health and source licenses. Deliver a fresh defect list with **CERTAIN / INFERRED / SPECULATIVE** labels and a nonduplicative backlog. Do not silently overwrite or delete existing work.

**M1 — Reproducible green build (P0).** Lock Node/Python versions, resolve dependency issues, perform `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:planning`, `npm run build` and Python test suite. Fix actual defects (not by suppressing diagnostics). Put the same commands in GitHub Actions. Deliver full command transcripts, lockfiles and green CI.

**M2 — Compliance and live data contracts (P0).** Resolve commercial data/photo/branding rights and use approved APIs/feeds. Test all source adapters for schema changes, staleness, rate limits and retry behavior. Deliver source licensing and provenance matrix.

**M3 — Real infrastructure (P0).** Provision staging Postgres, run real migrations, seed permitted test data, test account verification, cross-user access, worker claims/retries, scheduled job compatibility and backup restore. Deliver migration logs and smoke URLs.

**M4 — Historical science baseline (P0).** Ingest legitimate multi-season data; create pre-deadline time-travel snapshots; implement benchmark evaluation notebooks and fixed holdout splits. Deliver baseline model scorecard (by GW/horizon/position) before introducing complex ML.

**M5 — Predictive model v1 (P0).** Train and calibrate minutes/availability, team and player-event models; generate full score distributions; validate 2026/27 points rules and simulation correlations. Deliver reproducible artifacts, out-of-sample scorecards and model cards. Do not deploy a worse model just because it is more sophisticated.

**M6 — Optimizer and chip strategy (P0).** Prove legal state transitions; build transfer/chip solver with proper future costs; verify against exhaustive toy cases, then larger randomized fuzz cases and historical replay. Deliver no illegal outputs, paired scenario distributions and solver quality/time metrics.

**M7 — Website integration (P1).** Wire every tab/subtab to real authorized model outputs; eliminate duplicate logic and hardcoded season/prior placeholders. Deliver full desktop/mobile navigation and user-flows for manager import, save plan, simulate, compare, export and alert.

**M8 — Leagues/market/AI (P1).** Calibrate price and ownership forecasts, label cohort sizes, build injury provenance and grounded AI explanations. Deliver reliability dashboards and ownership-risk test coverage.

**M9 — Slides and alert delivery (P1).** Complete all report templates with real versioned datasets, artifact archival, schedules, retries, timezone/DST checks and all file formats. Validate every image/slide via rendered visual comparison.

**M10 — Commercial/security QA (P1).** Load/security/browser/accessibility tests; Stripe only after licensed data and production readiness; pricing and infrastructure budget, cancellation/privacy workflow.

**M11 — Staging proof → gradual production launch (P0).** Make all 12 checks in `scripts/release-gates.cjs` pass based on **independently captured evidence**; test disaster recovery, uptime monitoring, rollbacks and scheduled operations; then release gradually. Maintain owner-approved go/no-go signoff and weekly error/model-quality review. Record blockers as blockers rather than 'done'.

## 13. Quantitative acceptance standards

1. **Build:** fresh clone/install succeeds, compiler/lint/test/build pass, no high/critical unresolved dependency exposures. Python lock + solver tests pass in CI.
2. **Rules:** zero illegal squads, budgets, transfers, XI, chip schedules or free-transfer state transitions across exhaustive toy cases plus randomized property tests (pay special attention to GW19/20, DGW/BGW, FH squad restoration and selling prices).
3. **Forecasts:** at least two temporally separated holdout periods; report MAE/RMSE/calibration with confidence intervals; demonstrate no look-ahead and compare to the existing baseline. Prediction quality must be measured, not asserted. The rank target is separately calibrated.
4. **Simulation:** identical seed and run reproduce identical output; paired scenario deltas are stable; coverage/tail behavior validated historically; score-event rules and correlations tested.
5. **Data:** all live figures have an as-of timestamp and provenance; stale source visible to user; adapter never invents missing player/news data; rights approval documented.
6. **Product:** all major tab/subtab flows work at 390px and 1440px with empty/error/loading states, keyboard accessibility and real staging dataset.
7. **Reports:** every configured template renders correct labels, player data, 3840×2160 PNG, PPTX and PDF; compare snapshots visually and ensure published output is never synthetic.
8. **Operations:** cron and worker survive duplicate delivery, process crashes and source outages; backup restore is actually exercised; reports cannot leak between accounts.
9. **Business:** user subscriptions never unlock unauthorized data, Stripe webhook retries are idempotent, cancellation works, operational costs have quotas, and marketing claims have evidence.

## 14. Collaboration and handoff protocol

After each milestone, supply: (a) exact Git commit/PR; (b) files changed; (c) before/after behavior; (d) tests executed with outputs; (e) reproducible metrics and screenshots where relevant; (f) unresolved dependencies and costs; (g) the next numbered milestone. Update **the existing** `docs/upgrade/PROGRESS.csv` and detailed progress reports; do **not** create competing completion trackers. Never mark a task production-complete from TypeScript syntax parsing, mocked Node tests or a synthetic report render alone. Preserve working APIs/URLs and saved plan compatibility with explicit migration tests. Build incrementally behind flags; keep a known-good release deployable at each stage.

**My release condition:** a licensed, stable, observable FPL VORTEX that supplies evidence-based, probabilistic recommendations and explainable strategy comparisons, with no false promise of top-5,000 rank or superiority to a competitor. Aim to make predictions better **by evidence**, and earn subscription revenue **by trust and retention**, not unsupported precision or premium-looking graphics alone.

## 15. Sources and current official facts for engineering review

- 2026/27 Fantasy Premier League Terms & Conditions: automated extraction/commercial exploitation limits and intellectual-property restrictions (`fantasy.premierleague.com/help/terms`).
- Premier League official 2026/27 changes and chips rules: two sets of Wildcard, Free Hit, Bench Boost and Triple Captain; first-half chips expire at GW19; up to five saved free transfers; official chip operation restrictions (`premierleague.com/en/news/4679873`, `/en/news/4679879`, `/en/news/2174900/fpl-basics-chips`). Verify live deadlines/rules rather than trusting hardcoded constants.
- Vercel Cron usage & pricing: Hobby once per day; a ten-minute cron requires a supporting plan/worker/scheduler (`vercel.com/docs/cron-jobs/usage-and-pricing`).
- FPLReview model documentation (`docs.fplreview.com/the-model/projections/massive-data-model/`) and Solio Analytics public methodology (`solioanalytics.com`, `fpl.solioanalytics.com`) for public benchmarking and feature reference only, subject to rights and terms.
