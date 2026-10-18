# FPLVORTEX

**An original premium fantasy football decision platform.** This first commit contains a usable, dependency-light TypeScript application, independently written analytical demo functions, a responsive white/green/blue design, the user's transparent lion logo, and the Replica workflow planning documents.

## Run locally

Requires Node.js 20+ and TypeScript 5.9+ for compilation. Install dev dependencies, then:

```sh
npm install
npm test
npm run dev
```

Open http://localhost:3000.

The demo itself has **zero runtime dependencies**. The `npm run build` script compiles TypeScript to `dist/js` and copies static assets. `npm start` serves `dist/` with sensible security headers and a single-page-app fallback.

## Working prototype features

- **Command Center:** live local controls for gameweek/horizon, KPIs, ranking table, fixture signals.
- **Squad Forge:** 15-player formation pitch with individual headshots (falling back to initials), captain selection and local save.
- **Player Intelligence:** search, sort, filter and export a demonstration CSV.
- **Fixture Matrix:** colored filled FDR cells and team-level comparison.
- **Strategy Engine:** a deterministic, validated *single-transfer* optimizer obeying position, bank, club limit and 4-point-hit rules.
- **Model Lab:** explainable, deterministic demo projections and an independently developed model roadmap.
- **Price Pulse:** exploratory ownership watchlist; no live price-rise predictions yet.
- **Performance Journal:** staged interface for future authenticated historical review.

## Data honesty and photo rights

All player statistics, fixture difficulty sequences and projections bundled in `src/model.ts` are **illustrative demo inputs**, not verified 2026/27 live feeds or the FPLReview Massive Data Model. Live ingestion, trained forecasts, optimization over multiple weeks, background jobs, auth and persistence are **not implemented yet**. Always display this distinction in the product.

The prototype can preview actual player images from an external Premier League image host, with initials fallbacks. **Commercial hosting or production distribution must not depend on unauthorized image hotlinking.** Secure licensed headshots and then change `portrait()` to your authorized provider. The lion brand image is supplied by the project owner.

## Repository layout

- `src/` — typed data model, forecast heuristics, constraint solver, UI interactions.
- `public/` — logo, CSS and HTML shell.
- `scripts/` — build and static server (built-in Node.js modules only).
- `tests/` — deterministic regression tests via Node test runner.
- `replica/` — original source audit, database blueprint, feature matrix and roadmap.
- `docs/` — architecture and next-phase decisions.

## Next production milestones

1. Confirm licensing/terms for player events, fixtures, team IDs and portraits.
2. Add a PostgreSQL-backed API and historical data ingestion jobs with provenance, idempotency and snapshot versioning.
3. Train probability models on historical seasons; evaluate with walk-forward holdouts and calibration charts.
4. Replace the single-transfer demonstrator with a robust multi-GW solver including FTs, chips, captain, subs, team constraints and risk preferences.
5. Add real user authentication, squad import, multiple saved drafts and opt-in alerts.
6. Enable CI and end-to-end tests with licensed-data fixtures, verify responsiveness/accessibility and production release gates.

## References / attribution

Product feature audits: https://fplreview.com/ , https://docs.fplreview.com/ , https://www.fplcore.com/ . This application does not contain their proprietary application code or visual assets. Developed as an original FPLVORTEX project.


## Phase 2: provenance-verified ingestion and probabilistic research

The `feat/premium-vortex-foundation` branch now includes a read-only JSON API, manual **authorized** source ingestion, hash-verified immutable snapshots, freshness reporting in Data Studio, deterministic Monte Carlo research, and extra unit/integration tests. This is **not a live FPL feed** and has no trained forecasting model. The dashboard remains explicitly illustrative even when data snapshots have been imported.

Run `npm test` for unit and HTTP/import integration tests. Read [data ingestion instructions](docs/data-ingestion.md) before using your own licensed source.

## Phase 3: PostgreSQL and historical evaluation (v0.3)

The optional historical research service uses PostgreSQL 16+ via `pg`. Without `DATABASE_URL`, the demo UI runs normally, and history requests explicitly return 503.

```sh
npm install
DATABASE_URL='postgres://app:password@localhost:5432/fplvortex' npm run db:migrate
node scripts/import-history.mjs --input /path/to/authorized-history.json --validate-only
DATABASE_URL='postgres://app:password@localhost:5432/fplvortex' node scripts/import-history.mjs --input /path/to/authorized-history.json --write
```

Then query `GET /api/v1/research/backtest?season=2025%2F26&modelId=vortex-prototype-0.2` to see MAE, RMSE, bias, starting-probability Brier score and calibration. No real history has been connected, and the model remains untrained. Archived predictions need independent provenance to qualify for true out-of-sample validation. See [Historical evaluation](docs/historical-evaluation.md).