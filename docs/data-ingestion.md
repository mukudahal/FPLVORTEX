# Authorized data ingestion contract (v0.2)

Data Studio supports **manual import of supplier-licensed or otherwise authorized JSON snapshots**. There is **no built-in scraping, player-image harvesting, hidden API access, or automatic feed scheduling**. A rights checkbox in JSON is an operator attestation, not legal verification; production operators must examine the actual permission terms and obtain appropriate legal review.

## Snapshot shape

Save the following structure to a local JSON file. Player records use FPLVORTEX's `Player` fields, excluding `imageCode`, and `fixtures` must contain **1–14** integer difficulty values between 1 and 5. All players in one snapshot must have the same horizon.

```json
{
  "schemaVersion": 1,
  "season": "2026/27",
  "gameweek": 8,
  "capturedAt": "2026-10-17T18:00:00Z",
  "rights": {
    "sourceName": "YOUR_VERIFIED_PROVIDER",
    "sourceReference": "https://provider.example.com/rights",
    "licenseReference": "YOUR_LICENSE_OR_CONTRACT_REF",
    "verifiedBy": "AUTHORIZED_OPERATOR",
    "verifiedAt": "2026-10-17T18:00:00Z",
    "automatedProcessingPermitted": true,
    "endUserDisplayPermitted": true,
    "modelTrainingPermitted": false
  },
  "players": [
    {
      "id": 900001,
      "name": "Example Player",
      "club": "ABC",
      "position": "MID",
      "price": 7.5,
      "ownership": 15.5,
      "form": 4.5,
      "xg90": 0.35,
      "xa90": 0.20,
      "expectedMinutes": 80,
      "fixtures": [2, 3, 4],
      "status": "available"
    }
  ]
}
```

Replace these placeholders only with real verified source details. **Do not mark third-party data as licensed if it isn't.** `modelTrainingPermitted: false` is allowed and respected. Headshot IDs are always discarded by validation; a data contract never grants image rights.

## Local ingestion

```sh
npm install
npm run build
node scripts/import-snapshot.mjs --input /absolute/path/to/authorized.json --validate-only
node scripts/import-snapshot.mjs --input /absolute/path/to/authorized.json
npm start
```

The importer enforces ranges, positive IDs, unique players, uniform fixture horizon, ISO timestamps, permission attestations, an ingestion lock and chronological replacement. It stores canonical JSON by SHA-256 under `./data/` and atomically moves `current.json` after success. A second import of the same snapshot is idempotent. Imported data **is never checked into Git**; `data/` belongs in `.gitignore`.

Set `FPLVORTEX_DATA_DIR` to a private persistent path when running on a server. The import directory must be writable by the importer and readable by the service, and must never be public. A crashed importer may leave `.import.lock` which requires manual inspection/removal.

## Read-only HTTP API

- `GET /api/v1/health` — service readiness only.
- `GET /api/v1/data/status` — `demo` or `licensed`, snapshot timestamp, age, freshness flag, source and rights reference.
- `GET /api/v1/data/players` — validated player data when imported; 503 if none exists.
- `GET /api/v1/model/distribution?playerId=1&gameweekIndex=0` — **illustrative** deterministic Monte Carlo output only, using the bundled demo model, not imported source data.

`live: false` and `trainedModelAvailable: false` remain false even after import because the model is not calibrated or evaluated, and import alone does not make data real-time. An imported snapshot is not substituted into the demonstration squad until player IDs, season rules, license and model-version integration have been validated.

## Next: production-ready integrations

1. Choose a supplier licensed for extraction, caching, derivative models and public display.
2. Implement their documented adapter, incremental refresh and monitoring with provider credentials stored exclusively server-side.
3. Connect validated snapshots to a PostgreSQL ingestion queue with immutable audit and source version lineage.
4. Add feature engineering, own model training, walk-forward validation and calibration with explicit data cutoff.
5. Bind the user-facing projections and team import to verified season rules, model runs and refresh timestamps.
6. Source distinct licensed player photos and attach usage metadata before production publication.

**Operational caution:** The current JSON snapshot store is single-node and not transactional across multiple workers. Use PostgreSQL/Redis for multi-instance production and a distributed lock/scheduler with backpressure and dead-letter queues.