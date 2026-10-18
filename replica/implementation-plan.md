# Phase plan and release gates

**Phase 1 status (this package):** public audit and initial architecture completed. No screens, workers, model weights, source-license contract, production datasets, tests or deployment have been implemented.

## Dependency-critical start
- Decide whether the deployment is a private demo or a public/commercial service.
- Approve a data supplier whose contract permits automated ingestion, persistent caching, trained model derivatives, end-user display, and commercial use if applicable. The Fantasy Premier League terms otherwise prohibit automated information extraction and commercial exploitation.
- Obtain player-photo rights from a suitable provider (or rights-cleared uploaded photos), including thumbnails and CDN storage. Until then use neutral initials avatars; never substitute jersey drawings.
- Confirm a GitHub repository location, working brand, infrastructure ownership and notification channel.

## P0 — Data rights + skeleton (1–2 weeks; dependent on vendors)
Deliveries: infrastructure IaC, schema migrations, auth, 2026/27 rules config, source registry, mock fixtures and players, API contracts and CI. No unauthorized live polling.
Acceptance: migrations applied on clean PostgreSQL; validations reject corrupt IDs and missing consent; sample licensed/mock source round trip with provenance; smoke CI green.

## P1 — Original premium design and planning UX (1–2 weeks)
Deliveries: white/green/blue tokenized responsive dashboard; 15-headshot squad board; player lab; colored FDR matrix; scenario CRUD; reliable gameweek switching.
Acceptance: all flows keyboard accessible, aria-labeled, snapshots at 390 and 1440; FDR includes text+color; no copied logos/labels; image license checks exercised.

## P2 — Own projection engine v1 (2–4 weeks; data-dependent)
Deliveries: baseline expected-goals/team strength model, player expected-minute distribution, event-based scoring per configured FPL rules, versioned projections, P10/P50/P90 and deadline snapshots; fixture and player overrides.
Acceptance: complete reproducibility for fixed seed/input snapshot; calibration graphs over historical data; no leakage beyond forecast deadline; independent accuracy vs baseline disclosed. Historical source coverage must be sufficient; do not fabricate predictions.

## P3 — Transfer strategy and simulation (2–4 weeks)
Deliveries: single GW squad optimizer, multiweek transfer plans, captain/vice and autosub simulation, chip/price/FT rollover rules, infeasibility explanations, candidate trade-offs.
Acceptance: property tests verify squad sizes/formation/budget/team quota/captain/chips; no hit double count, no illegal transfer or negative cash; solver deterministic for fixed inputs; stale jobs canceled.

## P4 — Insights, user model and automation (1–3 weeks)
Deliveries: deadline-frozen season reports, model comparison and CSV import/export, manual watchlists, opt-in alerts, licensed feed refresh and source citations, model version monitor.
Acceptance: live-input updates idempotent; only validated sources propagate; out-of-date data labels; consistent metadata across downloads, UI and job logs; notifications de-duplicated.

## P5 — Release + production hardening (1–2 weeks)
Deliveries: Sentry/OTel metrics, backups/restore drills, documentation, security scan, E2E coverage, staging/pilot, Vercel/worker/Postgres/Redis config, runbooks.
Acceptance: all S1 and S2 bugs closed; production build/tests pass; load and failover exercises passed; secrets stay server side; user approves deployment; smoke test live once deployed.

**Estimated work:** 8–17 engineer-weeks plus licensing/data procurement; estimates are planning ranges, not commitments. Fast demo with mocked/rights-cleared seed data can precede production model certification.

## Prioritized release gates
G0 source and photo licenses confirmed; G1 reproducible data ingestion; G2 published calibrated model; G3 legally valid FPL squad/transfer constraints; G4 original responsive UX; G5 rights, privacy, accessibility and security; G6 production preflight + explicit go-ahead.

## E2E critical test inventory
T01 no manager ID: public browsing works without private team assertions.
T02 valid/invalid manager ID: sanitize and show data as-of and public visibility limits.
T03 squad: enforce position caps, formation, per-club cap and distinct IDs.
T04 prices: purchase price vs sale price and bank update with versioned rule checks.
T05 captaincy: captain absent, vice substitution, triple-captain and autosubs.
T06 chips: legal use, state transitions, invalid double-chip prevention.
T07 transfer rollover: 0/1/multiple and maximum FT per season rules; charge hits exactly once.
T08 fixture reschedule: same fixture cannot be counted twice, uncertain GW placement recomputes.
T09 stale data: display old as-of timestamp; no unearned freshness claim.
T10 model: no label leakage; same seed + snapshot = same result; probability in [0,1].
T11 solver: no duplicate players, negative budget, infeasible forced locks or open-ended job.
T12 isolation: one user's drafts/overrides never appear to another.
T13 image permission: no display or hotlink of unlicensed headshot.
T14 responsive 390px/1440px, keyboard and screen-reader critical paths.
T15 notification: opt-in, quiet hours, low-change suppression, one alert per material event.
T16 deployment: preview/release rollback and backup restore.

## Next implementation order
1. Set up GitHub mono-repo and CI + db core migration, mock data and permissions gates.
2. Build design primitives and Squad/Player Lab/Fixture Radar screens against mocks.
3. Build versioned licensed-data ingestion adapters and reproducible forecast baseline.
4. Add stochastic EV engine, solver, sensitivity, outcomes and production operations.

## Blocks requiring user decisions
Project/product name, where code should be created, whether launch is public/commercial, and approval/licensed sources for FPL stats and real player imagery. Do not silently purchase or provision production services.

## Implemented on `feat/premium-vortex-foundation` (v0.2 development update)

- Read-only HTTP API with explicit demo/licensed status, data-service health and player-data endpoint.
- Manual licensed-source importer with input validation, usage-rights metadata, canonical SHA-256 storage and atomic pointer writes.
- Data Studio interface with freshness/provenance status; no false live-source claim.
- Monte Carlo uncertainty research endpoints and UI for seeded demonstration P10/P50/P90 output.
- Automated tests for malformed sources, integrity/idempotency, expired and future timestamps, illegal rights, HTTP methods and simulated distributions.
- GitHub Actions test workflow prepared; remote CI execution must be confirmed independently.

**Not implemented:** licensed provider connector, historical backtesting, PostgreSQL persistence, automatically scheduled refresh, real ML training, multigameweek solver, authenticated user account, commercial headshot distribution and production launch. The earlier milestone durations remain planning estimates only.

## Phase 3 — Historical validation and PostgreSQL research (implemented as a draft)

- Research migration `migrations/0001_historical_backtests.sql` defines append-only imports and per-player-gameweek outcomes.
- `scripts/import-history.mjs` validates operator-attested rights, strict as-of dates, player/week uniqueness and probabilistic bounds. Preview with `--validate-only`; PostgreSQL writes require `--write` and `DATABASE_URL`.
- Model evaluation reports MAE, RMSE, bias, starting XI Brier, per-GW error and reliability bands. All results remain labelled unverified archival evidence.
- `Data Studio` provides an optional historical report lookup. No source history is loaded by default.
- Unit/API tests pass locally. A real PostgreSQL integration test is configured for GitHub Actions and skipped when `TEST_DATABASE_URL` is unavailable.

**Not yet complete:** independently time-stamped forecast archives, provider licensing review, training pipelines, real FPL player/headshot datasets, model calibration, live refresh automation, browser E2E tests and deployment. Do not merge or deploy as a production prediction service yet.