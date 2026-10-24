# Step 14 — FPL API reliability and freshness

Status: **SOURCE IMPLEMENTED; deployment-scale validation pending**.

- One `fplFetchDetailed` path for cached/source data, with `fplFetch` value-only compatibility. All fetch calls use bounded 12s timeout, 3 attempts, 250ms minimum serialized gap per process, `Retry-After` honoring capped at 10s, and a 15MB JSON payload ceiling.
- Permanent upstream 4xx do not retry and do not fall back to an unrelated stale response. 429, 408 and upstream 5xx may retry; fallback uses existing cached data only within `max(120s, 2 * TTL)` and marks `status = stale-cache`. Fresh cached responses mark `fresh-cache`; network responses mark `upstream`.
- Source adapters return optional freshness metadata. `/api/fpl/bootstrap` and `/api/fpl/fixtures` expose `x-fpl-data-status` and `x-fpl-fetched-at` with `Cache-Control: no-store`.
- Relative-resource validation avoids path traversal and accidental arbitrary URLs.
- Deterministic unit tests for route validation, retry policy, backoff, stale expiration and freshness-header contracts.

**Limitations**: The scheduler and throttle are still process-local. Distributed rate limiting, real external provider load tests, CDN behavior, connection-pool sizing, circuit breaker and Next.js production build need operational verification before traffic at scale (Step 53). Source-derived models must incorporate `stale-cache` warnings in later UI work (Steps 35–52).
