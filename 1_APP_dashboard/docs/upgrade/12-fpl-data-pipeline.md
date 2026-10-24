# Step 12 — Central official-FPL data pipeline

Status: **SOURCE IMPLEMENTED; release validation blocked**.

- `src/lib/fpl.ts`: single upstream FPL gateway, Postgres response cache and request throttle remain the only network implementation.
- `src/server/fplData.ts`: typed adapters for bootstrap, fixtures, manager profile/history/picks/transfers, live gameweek, player history and paginated league standings. Per-source TTL is configurable for analysis flows. Numeric parameters are range checked before constructing URLs.
- `src/lib/fplNormalize.ts`: one `parseBootstrap` gate and normalization for player features, teams, events, chips and fixtures; rejects structurally invalid upstream payloads before projecting them into optimizer/forecast consumers.
- All backend consumers (FPL routes, `/api/plan`, `/api/optimizer`, rivals, analysis, Copilot, prices, image resolver and cron refresh) now obtain the official dataset through the canonical adapters. Pages read the stable REST routes, not a separate FPL gateway.
- Tests cover bootstrap shapes, non-finite model inputs, blank fixtures, upstream invalid data, and source adapter adoption.

**Not claimed:** data-provider contractual permission for commercial use; live FPL integration tests; Postgres-backed cache tests; source freshness/snapshot history (Step 13); cross-instance rate limits/timeout and stale response metadata (Step 14).
