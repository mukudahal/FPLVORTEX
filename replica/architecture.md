# Architecture — independent FPL forecasting and optimization platform

## Design principles
1. Build comparable *capabilities*, not the competitor's code, design assets, names, model parameters, or dataset. All business logic independently derived from public scoring rules and licensed data.
2. The numerical engine is the core product: preserve uncertainty, reproducibility, causal data lineage, and train/test separation.
3. Design for rights-compliant feeds. Do not start a scheduled pull against Fantasy Premier League's internal API: its terms prohibit automated extraction and commercial reuse without permission. Secure licensing/approval or an alternative authorized provider first.
4. Work with the user's authorized data. Do not automate private team updates or scrape account sessions. Editing FPL's live team is out of scope.

## Proposed stack
- **UI** Next.js App Router, TypeScript, Tailwind CSS variables/design tokens, Radix UI primitives, TanStack Table, React Hook Form/Zod.
- **Backend** Next.js API/BFF and TypeScript domain services for auth, saving drafts, manager linking, data exports.
- **Database** PostgreSQL 16+, Drizzle migrations, RLS or API-owner checks, hourly/daily snapshots and partitioning where warranted.
- **Cache/jobs** Redis-compatible cache and BullMQ (separate worker), cron schedule driven by deadline state. Redis is justified by compute-heavy, deduplicated workloads.
- **Forecast/solver** Python 3.12 worker. pandas/NumPy/scikit-learn for training, OR-Tools CP-SAT or HiGHS-backed MILP for deterministic constraints, custom seeded Monte Carlo simulator for rotation/fixture uncertainties. Python is justified by the numerical ecosystem; isolate it behind a versioned HTTP/queue protocol.
- **Testing** Vitest, React Testing Library, Playwright, Pytest, property-based model/solver constraints.
- **Hosting** Next.js on Vercel, worker on a persistent/container host (e.g. Render/Fly), managed Postgres, managed Redis, storage for licensed headshots and immutable snapshots.
- **Observability** OpenTelemetry/Sentry-equivalent; structured trace IDs linking sources -> features -> forecasts -> solver results -> alerts.

## Data schema domains (planned full production surface)
**Core entities:** users, user_preferences, seasons, scoring_rule_versions, gameweeks, clubs, players, player_club_history, photo_licenses, media_assets.
**Source/provenance:** data_providers, source_snapshots, ingestion_jobs, raw_references, provider_mapping, normalization_errors, sync_cursors.
**Events/statistics:** fixtures, fixture_reschedule_events, player_match_stats, club_match_stats, player_prices, injury_availability_observations, rotation_news, lineup_starts, manager_picks_history.
**Models:** feature_sets, player_features, team_strength_snapshots, forecast_models, model_runs, fixture_forecasts, player_forecasts, calibration_runs, forecast_evaluations, deadline_forecast_freezes.
**Planner:** manager_links, squad_snapshots, squad_picks, scenario_drafts, draft_picks, planned_transfers, chip_decisions, user_overrides, fixture_probability_overrides, solver_jobs, solver_result_sets, solver_steps.
**Product/ops:** alert_rules, notifications, change_events, cohort_definitions, aggregated_cohort_stats, data_exports, audit_events.
This is a >45-table **target domain map**, not a claim that all are created in schema.sql. `schema.sql` is the deployable first migration foundation.

## Independent forecast engine (the central differentiator)
### Licensed inputs
- Stable player identity; season, fixture, team membership; match results; historical xG/xA/shots/key passes per 90; rest days, home/away, team/opponent strength; recorded price, position and FPL scoring history.
- Start probability, minutes if starting/subbing, fitness, suspensions, projected tactical role and set pieces; confirmed fixture likelihood; optional rights-cleared odds.
- User overrides are isolated from global model inputs. Persist who changed a value, timestamp, horizon, and why.

### Model architecture
1. **Team outcome layer:** attack/defence latent strengths and expected fixture goals; shrink sparse histories, add schedule context and uncertainty.
2. **Player involvement layer:** time-decayed xG/xA rates with partial pooling across players/roles; tactical/penalty/set piece adjustment.
3. **Minutes layer:** joint P(start), P(sub), minutes conditional on state, suspension/injury scenario, substitution probability.
4. **Scoring layer:** official-versioned FPL scoring rules convert simulated goals, assists, CS, goals conceded, saves, cards and bonus to player-point distributions. Do not approximate captain/vice autosubs as simple doubled raw EV.
5. **Simulation layer:** correlate teammate/opponent outcomes within each fixture, aggregate GW outcomes, derive mean, P10/P50/P90 and blank/explosion risk. Seed all runs and record model version.
6. **Calibration/backtesting:** time-series walk-forward split, deadline-frozen forecasts, mean absolute point error, log loss/Brier for starts and clean sheets, coverage of prediction intervals, compare against a transparent baseline. Never claim superiority before measuring.

For each player x GW store `xPts`, `xMins`, `pStart`, `pPlay`, `pGoal`, `pAssist`, `pCleanSheet`, `pBonus`, `pBlank`, quantiles, source freshness, and run ID; fixture-level component contributions live in a separate domain table planned for phase 2.

## Solver
- Input: squad state at an explicit as-of time, the scoring_rule_version, 1–14 GW per-user horizon, forecasts, cash, player buy/sell values, FT bank, budget, force/exclude, chips and fixture scenarios.
- Constraint feasibility: 15 unique players; position counts; maximum same-club players; lineup/formation; available budget and correct sale value; exactly one captain and vice; rolling FT limits and hit costs **from versioned season rules**, never guessed constants; valid chip and deadline semantics.
- Objective: expected net points with autosub/captaincy simulation, time discount, hit cost, FT option value and user-selected risk budget. Present alternative Pareto candidates (EV vs downside vs flexibility).
- First implementation: exact single-week and medium-horizon MILP baseline; add multi-period non-linear Monte Carlo rescoring and reproducible stochastic scenario testing. Never call a heuristic plan globally optimal.
- Outputs: top N plans, infeasible-constraint explanations, solver version/seed/input-run ID, projected net gain and confidence/sensitivity.

## API (proposed, versioned)
GET `/api/v1/players`; GET `/api/v1/players/:id/forecasts?fromGw=...&toGw=...`;
GET `/api/v1/fixtures`; GET `/api/v1/model-runs/current`;
GET `/api/v1/squads/current`; POST `/api/v1/manager-link/preview`;
GET/POST `/api/v1/drafts`; PATCH `/api/v1/drafts/:id`;
POST `/api/v1/drafts/:id/score`; POST `/api/v1/solve` (returns queued job),
GET `/api/v1/solve/:jobId`; POST `/api/v1/assumptions`;
GET `/api/v1/exports/:id`; GET/POST `/api/v1/alert-rules`.
All write endpoints: authorization, validation, rate limits, idempotency keys where appropriate and audit trails. `/solve` is async and cancellable.

## Automation and freshness
- All source polling intervals are **conditional on vendor permits**. Separate ingestion, normalization, features, projection, solver, alert and notification queues.
- On licensed source update: validate -> atomic source snapshot -> normalized append -> dependent feature rebuild -> forecast run -> publish only on passing QA -> material-change notifications.
- Routine: every 1–4h if allowed for dynamic licensed stats; nightly deep refresh; after each fixture result; deadlines at T−24h, T−2h and T−15min (configured dynamically from approved gameweek calendar). Review late team news with evidence; do not blindly publish rumors.
- Suppress notifications when stale, low-confidence or no meaningful change; honor user opt-in, quiet hours and de-duplication.
- Failed ingest leaves last-known-good projections with explicit `as_of` and `stale` labels rather than fresh-looking false precision.

## Security, media and compliance gates
- Licenses explicitly cover data caching, derivative calculations, commercial use and image display/storage; assert rights before using official/player photos. Never use unapproved PL assets by hotlink.
- FPL official terms prohibit automation and commercial reuse of Game content without authorization; do not implicitly treat undocumented reachable URLs as permitted for this product.
- No credentials/session cookies for FPL; optional self-entry, user imports, or provider-approved identity access.
- Secrets in hosting secret store; data deletion/export; role-based admin access; RLS for private drafts; tenant-bound signed requests; privacy policy.

## Operational bounds
- Target: p75 LCP < 2.5s / INP < 200ms, 99.9% monthly read endpoint availability (service target), background refresh freshness indicators visible.
- Use job-level retries with idempotency; fixtures/status events may arrive out of order; model runs must be atomic and reproducible.
- Monitor forecast drift, input missingness, job fail %, solver queue latency, database/storage size and alert false-positive rate.