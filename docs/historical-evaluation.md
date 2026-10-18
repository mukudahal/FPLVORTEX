# FPLVORTEX — Historical Backtesting Contract (v0.3)

This infrastructure stores results from an **independently supplied, authorized historical archive** and calculates descriptive evaluation metrics. It does not scrape FPLReview, FPLCore, or Premier League private endpoints. The database starts empty and no metrics are preloaded.

## Run locally

Node 20+, PostgreSQL 16+ and `pg` are required for the database research service. Set `DATABASE_URL` only on the server. Never put database credentials in public JavaScript.

```sh
npm install
DATABASE_URL='postgres://user:password@localhost:5432/fplvortex' npm run db:migrate
node scripts/import-history.mjs --input ./my-history.json --validate-only
DATABASE_URL='postgres://user:password@localhost:5432/fplvortex' node scripts/import-history.mjs --input ./my-history.json --write
npm test
```

`--validate-only` computes exploratory metrics locally without accessing or changing Postgres. `--write` requires explicit opt-in and stores the entire bundle transactionally. The importer computes a SHA-256 digest over the canonical validated JSON and deduplicates a repeated bundle. Conflicting data for the same `season + modelId + playerId + gameweek` is rejected, not silently replaced. Databases used for production should have backups and dedicated least-privilege credentials.

## Expected input

```json
{
  "schemaVersion": 1,
  "season": "2025/26",
  "modelId": "vortex-prototype-0.2",
  "capturedAt": "2026-05-28T12:00:00Z",
  "rights": {
    "sourceName": "Your licensed historical provider",
    "sourceReference": "https://your-provider.example/terms",
    "licenseReference": "your-license-reference",
    "verifiedBy": "Authorized data manager",
    "verifiedAt": "2026-05-28T11:00:00Z",
    "automatedProcessingPermitted": true,
    "endUserDisplayPermitted": true,
    "modelTrainingPermitted": false
  },
  "observations": [
    {
      "playerId": 101,
      "gameweek": 31,
      "predictedAt": "2026-03-19T12:00:00Z",
      "kickoffAt": "2026-03-20T16:00:00Z",
      "expectedPoints": 4.5,
      "predictedStartProbability": 0.8,
      "actualPoints": 6,
      "actualStarted": true
    }
  ]
}
```

All dates are timezone-bearing ISO timestamps. Each record requires `predictedAt < kickoffAt <= capturedAt` and a unique `(playerId, gameweek)` within the bundle. `actualStarted` refers to starting XI, not appearance off the bench. The input rights fields are an explicit assertion by the operator, **not an independently verified legal clearance**. Model training is disallowed when `modelTrainingPermitted` is false.

## Methodology

The report returns counts, MAE, RMSE, signed bias (forecast minus actual), mean forecast and result, Brier score for probability of starting, per-GW point errors and ten starting-probability calibration bands. Reports for fewer than 100 player-gameweeks warn that the sample is small. The API caps queries at 50,000 observations per season/model to avoid unbounded responses.

### Critical limitation — temporal leakage

A date field saying the forecast preceded kickoff is not proof it actually existed at the time. The data might have been backfilled later. **The API intentionally sets `verifiedForecastArchive:false` for every report**, even when the time checks pass. For valid prospective evidence, first build a separate immutable model-run archive with signed or provider-retained timestamped runs and independent gameweek results. Prefer walk-forward validation on held-out seasons and stratified reliability analyses before claiming any predictive accuracy. Avoid mixing retrospective demo forecasts with true archived predictions.

## Database and API

Migration: `migrations/0001_historical_backtests.sql`; execution: `npm run db:migrate`. API routes:

- `GET /api/v1/research/status` — reports database configuration only, not availability or model training.
- `GET /api/v1/research/backtest?season=2025%2F26&modelId=vortex-prototype-0.2` — summary metrics only, not private raw rows; returns `metrics:null` if no matching records, or 503 if the database is not configured.

Production rollout blockers: authorized historical outcomes, independently timestamped model predictions, approved photo distribution, schema migration review, PostgreSQL deployment/backups, actual CI verification and browser accessibility QA.