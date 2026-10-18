# Licensed appearance tracking for FPLVORTEX

Set `VORTEX_APPEARANCES_PATH` to a local JSON file supplied by an authorized provider/operator. The server does not automatically scrape FPL endpoints. A JSON document is permitted only if the operator **actually verified** its source and rights and the assertions are true.

```json
{
  "schemaVersion": 1,
  "season": "2026/27",
  "capturedAt": "2026-10-17T21:00:00Z",
  "rights": {
    "sourceName": "Example licensed provider",
    "licenseReference": "https://provider.example/terms-or-signed-license",
    "automatedProcessingPermitted": true,
    "endUserDisplayPermitted": true
  },
  "appearances": [
    {
      "playerId": 1,
      "gameweek": 1,
      "minutes": 84,
      "started": true,
      "substitutedOn": false,
      "substitutedOff": true,
      "available": true,
      "expectedGoals": 0.7,
      "expectedAssists": 0.3
    }
  ]
}
```

The JSON above is **a schema example, not actual data**. Displayed starts use `starts / gameweeks observed`; an on-bench sub appearance increments `SUB ON` but not `STARTS`, a player who starts and comes off increments `SUB OFF`. `AVG MIN` is total minutes divided by matches played; `90s` is total minutes / 90. Empty cells mean no verified appearances, not zero.

For GW1–GW6 backtesting, source data must contain independently archived pre-deadline forecasts and post-match finalized outcomes. Historic match stats alone cannot prove a forward-only model was accurate at the time. Run `npm run history:import` after `npm run db:migrate` only on a rights-verified data bundle following `docs/historical-evaluation.md`.