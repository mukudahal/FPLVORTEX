# Step 13 — Immutable gameweek source snapshots

Status: **SOURCE IMPLEMENTED; live database validation outstanding**.

- `src/lib/snapshotIdentity.ts`: canonical JSON fingerprints, SHA-256 content identity and season inference from first official gameweek deadline, independent of deployment clock and object-key order.
- `src/server/snapshots.ts`: transactional, idempotent capture of bootstrap and fixture inputs on authenticated cron refresh. Uses unique `(season, gameweek, source, content_sha256)`, with stable snapshot ID on duplicate collection. Exposes a replay function that checks content digest before use.
- `migrations/0005_immutable_snapshots.sql`: DB trigger rejects UPDATE/DELETE on `data_snapshots`; no record rewriting even if other components reference it. This is a deployment migration, not yet applied to a live database.
- `src/app/api/cron/refresh/route.ts`: refuses to report success if snapshot persistence fails; includes snapshot IDs and official season in successful refresh metadata. All POST/GET request controls and existing authorization remain unchanged.

**Historical caveat:** Captures begin only once a live database, CRON_SECRET and scheduled refresh are configured; there are no newly collected 2026/27 observations in the ZIP. The current `gameweek` field denotes the FPL reporting GW at collection time, not a promise that the snapshot was recorded before its deadline. Step 18 must attach exact snapshot IDs to every prediction run. SQL update/delete triggers are the integrity boundary; database superusers/physical administrators can override triggers, so archival integrity needs operational controls.
