# FPLVORTEX v0.6

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


## v0.4 Premium Analytics & 10-GW Research Solver

The interactive app now has larger accessible navigation/type, the top-left transparent lion brand, sortable ten-column filled-FDR fixture grid (`TOT [H] - 2`), separate attacking xG/xA and CS% screens, and a bounded 10-GW transfer + chip strategy planner. Player Intelligence offers columns for recorded starts / GWs, substitute-on counts, substituted-off starts, actual average minutes and ninety-equivalents, with truthful blanks until an approved appearance source exists.

The standalone **independent research formula** is in `src/vortex-analytics.ts`, the **beam-search solver** in `src/deep-solver.ts`. All demo predictions remain illustrative and untrained. There are no claims of matching or outperforming Opta, FPLReview, or any other commercially trained model. See `docs/v0.4-validation-plan.md` for a source-rights and temporal holdout evaluation plan; `/api/v1/research/gw-validation` exposes GW1–GW6 archival status.

Real credited player images (Haaland and Saka) use Wikimedia Commons with author and CC BY-SA attribution in `docs/photo-credits.md`. Every remaining player falls back to initials rather than using unlicensed third-party shirt/jersey images. Production photo expansion requires a rights-cleared catalog.

The official [2026/27 chip rules](https://www.premierleague.com/en/news/4679879/whats-happening-with-fpl-chips-in-202627) allow one of each chip in both halves of the season, with one chip per gameweek, and WC/FH retaining banked free transfers. The research solver currently supports the first-half GW7–GW16 demo horizon and is not a complete official-rules solver.

**No real historical backtest metrics are available until an authorized source and pre-deadline forecast archives are imported.** The user can open the GW1–GW6 audit in Data Studio to see coverage and real MAE/RMSE only after those prerequisites.

## v0.5 — Public-domain league data and retrospective team research

This release integrates **actual public-domain OpenFootball fixtures and community-reported results**, independent from the licensed-player pipeline. OpenFootball is **not** an official FPL data partner and can be stale. See [public league model and source rights](docs/public-league-research.md).

```sh
npm run league:check # checks source availability, season, scores and teams
npm run league:sync  # fetches an explicitly permitted public-domain dataset; never fetches FPL private data
npm test
npm run dev
```

With the tracked public-domain snapshot present, the Fixture Matrix shows all 20 league teams, `OPP [H/A] - FDR`, model-estimated team goals and CS%. Selecting a GW sorts by the independent 1–5 difficulty rank. Data Studio displays GW1–GW6 retrospective **team** errors, missing-score coverage and uncertainty, not player-level FPL accuracy. Placeholder [0,0] values are excluded. `/api/v1/public/league/{status,matrix,backtest}` expose data over the read-only API.

**Accuracy caveat:** There are still no validated archived pre-kickoff player forecasts, licensed lineup/minutes/injury feeds or real-world FPL outcomes in this project. It is inaccurate to interpret team-goal replay as player points accuracy or declare our model better than any other supplier.


## v0.6 — GW19 Top-5K Rank Chase Adviser

A new **Top 5K · GW19** navigation tab provides a draft weekly review plan, constrained by your locally saved chip availability and updated squad snapshot. It keeps overall rank and points fields separate from *illustrative* player projections, and it never invents the points required for top 5,000. The manager can input their team ID and verified rank/points locally; these are **not synchronized automatically** with the official FPL entry. An optional user-supplied hypothetical GW19 points benchmark shows a required points-per-week pace, but **not** a rank probability.

The adviser plans **up to ten gameweeks from GW7 through GW16**, marks GW17–GW19 as uncovered, and asks for reevaluation as fresh, authorized data arrives. The existing beam-search optimizer now accepts an explicit list of still-available chips. The Squad Forge adds a working same-position demonstration roster swap tool. The historical player/price data is still illustrative; in particular this is **not yet a verified live, personalized automated adviser** and the model has **not** demonstrated outperforming FPLReview or Opta. See [Top-5K planning and production gaps](docs/top-5k-rank-chase.md).

## On-demand personal FPL entry sync (v0.7)

In **Top 5K · GW19**, enter an FPL manager entry ID and choose **Sync live FPL rank**. The site server requests just that entry's public manager profile, history and current-week picks (when publicly disclosed), using the FPL website JSON endpoint. Results include rank, overall points, current GW, declared past chips, any 15 public FPL pick IDs and the exact retrieval timestamp. The user-initiated request is cached for 60 seconds on the server to avoid repeated hits; it does not use credentials, fetch private account settings or create automated polling. If the FPL website denies access, the site gives an explicit error instead of guessing.

**Important:** The Premier League does not officially document these endpoints or grant blanket commercial data-redistribution rights. Review terms and obtain permission before production or large-scale use. FPL entry IDs are **not** model player IDs. This sync updates only user profile rank and points; it never passes FPL picks into the illustrative transfer solver, or pretends to know the real squad's projected points. The user-entered data is stored in that browser's local storage; GitHub contains neither personal profile snapshots nor FPL credentials.

Current development sandbox cannot reach `/api/entry/145784/` (or `/history/`) even though general bootstrap data is reachable via separate web search. Thus no actual rank is claimed until the sync runs successfully on an accessible network.