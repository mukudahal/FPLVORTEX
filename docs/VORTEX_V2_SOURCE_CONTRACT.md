# VORTEX source, forecast and data-status contract — V2

**Status:** Stage 02 typed contract. Stage 04 connects it to actual ingestion, caching, UI and Next.js adapters.
**No API/odds value is asserted live by this document.**

## Classification and required evidence

| Source kind | Required trust/provenance fields | Freshness anchor | Missing handling |
|---|---|---|---|
| `official-fpl` | named FPL endpoint, successful retrieval timestamp, snapshot/version | **retrieval** time (not claimed FPL publication time) | unavailable / stale as determined by actual fetch |
| `market-odds` | licensed provider, bookmaker/market, fixture, **quote timestamp**, retrieval timestamp, license verified | **quote** time, never proxy retrieval | unavailable/unverified; never fabricate implied probabilities |
| `verified-news` | source URL, verified publisher, retrieval timestamp; publication timestamp if available | publication time if supplied; otherwise **retrieval** and label clearly | unverified/unavailable; no fabricated manager quotes |
| `model-forecast` | model version, as-of snapshot ID, computation timestamp, source snapshot contract | computation timestamp; source snapshot quality independently required | unverified or stale model; never label official |
| `statistical-fallback` | versioned model + snapshot + computation time; fallback reason | computation time (not bookmaker quote) | keep a separate fallback name and warning |

Every API should preserve `retrievedAt` distinct from optional `sourceUpdatedAt` and `quotedAt`. Timestamp strings are RFC3339 with an explicit offset (prefer ISO UTC). Never use a local filename/date or cache write time as an official quote/publication time.

## Status semantics

- **fresh**: required evidence exists, time anchors are valid, age is within the explicitly configured TTL. This means *fresh according to the retrieval/quote/computation policy*, not guaranteed true or causally current at source.
- **stale**: valid evidence exists but the relevant anchor is older than policy TTL.
- **unverified**: source identity, license, model version, quote time or provenance is absent/invalid or the anchor is implausibly in the future. Preserve any observation in diagnostics but do not display a verified live claim.
- **unavailable**: required provider/retrieval evidence is missing or the license is restricted.
- For official data with no publication time, display `Retrieved at HH:MM` — not `FPL updated at HH:MM`.
- For market data, a recent successful fetch containing old quotes is **stale**.
- For player expected points and FDR, show `VORTEX model · version`, not `Official FPL xPts`, unless explicitly sourcing an official forecast with documented provenance.
- A multi-source view indicates the status per source, not one optimistic global `Live` badge.
- If revalidation fails, last known values may remain on-screen only with a visible stale label and original timestamps.
- Never include provider credentials, privileged raw feeds or private scenario data in public response JSON.

## Source snapshot shape and rules

Canonical client-safe evidence metadata is defined by `src/lib/dataProvenance.ts`. Existing `SnapshotMeta.generatedAt` and `servedAt` are **not** merged into a fictional upstream `updatedAt`. A future adapter returns both their original meanings and typed `EvidenceMetadata`. The client must not infer a bookmaker quote timestamp from `snapshot.meta.oddsMeta.updatedAt` or a GitHub file date.

A client-safe forecast envelope should carry `snapshotId`, `season`, `gameweek`, `modelVersion`, `generatedAt`, `method`, `sourceEvidenceIds[]`, `pointsEstimate` and `uncertaintyMethod`. Computed forecasts are outputs and cannot silently overwrite official player fields.

## Planning horizon

`createPlanningHorizon(nextGw, lastGw, maxWeeks=10)` is derived from the authoritative schedule. It returns at most ten valid consecutive GWs, shortens at season end and returns an empty list if `nextGw` is unavailable. Callers must not silently replace an unavailable next GW with a hard-coded round.

## Security and licensing

- Admin DATA tab is not a way to hide publicly exposed API responses. Protect source connector keys and admin actions server-side via verified role, session and DB RLS.
- Source contracts must retain licensing terms and provider restrictions, including redisplay/archival permissions. Unknown rights do not imply publishability.
- Odds and player images remain conditional on lawful source access and availability. No invented forecasts to fill holes.

## Stage 04 required integration tests

1. Fresh/stale/failed official FPL fetch; snapshot fallback shows recorded source time.
2. Market quote retained at original time when cache re-serves it; expired quote cannot be `Live`.
3. Verified note with valid publisher but no publication timestamp reports retrieval rather than fabricated press time.
4. Inconsistent GW/season/snapshot IDs rejected before planner calculation.
5. Next GW and deadline change without hardcoded dates; BLANK and DGW correct in 10-GW window.
6. Admin/non-admin API contracts and secrets-exposure tests.
7. Browser freshness labels, source links and explicit `Data unavailable` values under partial outage.

Pure Stage 02 contract checks live in `tests/data-provenance.test.ts`.
