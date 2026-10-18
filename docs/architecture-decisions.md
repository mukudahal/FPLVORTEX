# ADR-001 — Demo-first vertical slice

**Status:** Accepted for Phase 1 only.

The existing GitHub repository was empty. Start with an original, responsive, TypeScript static shell and deterministic client-only projections to establish a testable product surface without fabricating current FPL data or requiring third-party credentials. The long-term proposed system is Node.js API + Postgres + background jobs + independently trained Python forecast services.

## Feature audit

**FPLCore public pages:** dashboard with projected goals, top players, prices and injury notices; fixtures FDR with FPL/custom difficulty; importable team planner; player statistics filter/search/CSV; historical and team statistics.

**FPLReview public docs:** probabilistic expected points from xMins and scoring outcomes; up to 14 gameweeks; FT value/time decay; multi-GW and linear solvers; captaincy/chips; self-analysis and performance backtesting.

**FPLVORTEX:** independently named navigation, premium white UI with green/blue highlights, black body text, filled green/yellow/red FDR, direct headshots, no Patreon, no borrowed page copy or source code.

## Constraints

- The present demo is a *working UI prototype*, not a production projection system.
- Official FPL scoring and chip mechanics are season-dependent; verify the 2026/27 rules before coding the full optimizer.
- The source image provider is illustrative and will need a license for production use.
- All near-term automated refreshes are deferred until data licensing is decided.
- The product will not bypass protected services or copy either reference platform's proprietary algorithms.

## Phase 2 candidate API

- `GET /v1/seasons/current`
- `GET /v1/players?position=&team=&sort=`
- `GET /v1/fixtures?fromGw=&toGw=`
- `GET /v1/projections?modelVersion=&startGw=&horizon=`
- `POST /v1/squads/import` (authorized data only)
- `POST /v1/plans/{id}/optimize`
- `GET /v1/models/{id}/validation`

All endpoints require versioned source snapshots; model build IDs and UTC timestamps. Mutations require auth, user ownership and rate limits. A multi-week optimization request should create a durable job; worker processing must be idempotent.

## Non-goals in Phase 1

Payments, proprietary FPLReview parity, perfect-copy UI, deep scraper, live transfers, automated external writes, trained model, claim of live statistics, premature deployment.