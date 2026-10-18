# FPLVORTEX public-domain team data — v0.5

## Verified permitted source

OpenFootball provides an independently maintained **public-domain/CC0** English Premier League 2026/27 fixtures/scores dataset:

- Source: https://github.com/openfootball/football.json/blob/master/2026-27/en.1.json
- Public-domain declaration: https://github.com/openfootball/football.json/blob/master/LICENSE.md
- Upstream editable record: https://github.com/openfootball/england

This is **community-maintained**. It is not the official EPL live feed. Never infer freshness merely because the file is present or the daily transformation ran. All scores and fixture lists can be incomplete. The app labels them accordingly. `score: [0,0]` is an unspecified placeholder, **not** a verified 0–0 final score. Only `score: {ft: [home, away]}` is accepted as a completed match.

The tracked source snapshot is `datasets/openfootball-2026-27.json`, copied without modifications from upstream for reproducibility. We only update it using:

```sh
npm run league:check # validate source without writing
npm run league:sync  # validate and atomically replace local snapshot
```

Network access to `raw.githubusercontent.com` is required. The CLI makes a single explicit GET to the hardcoded OpenFootball source, verifies content/season/teams/score bounds, enforces a 1MB cap, and never scrapes FPL or Opta.

## Independent model

For any fixture in GW \(w\), training includes only completed scored matches from rounds **strictly earlier than \(w\)** and played before that fixture's date. No future outcomes are admitted, even if the latest source includes the full season.

We use a fixed, editable, independent Poisson shrinkage baseline. With team home goals scored \(G^H\) across \(n_H\) previous home games, prior home goals \(\mu_H=1.48\), and prior strength \(k=6\), the home attack rate is

\[a_H=(G^H+k\mu_H)/(n_H+k).\]

Away defence and the expected home goals are constructed in the same way:

\[\lambda_H = \operatorname{clip}_{[0.15,4.5]}\left(a_H \cdot d_A/\mu_H\right).\]

Away expected goals use away attack / home defence with \(\mu_A=1.12\). Clean-sheet probability is \(P(CS_H)=e^{-\lambda_A}\); away CS probability uses \(e^{-\lambda_H}\). The assumptions are fixed theoretical baselines, **not calibrated historical parameters**.

FDR 1–5 is **FPLVORTEX's own relative within-gameweek ranking** of \(\lambda_{opponent}-\lambda_{team}\). It is NOT official FPL FDR. Player xG, starts, minutes, injuries and projected FPL points are **not derivable from this team-level dataset** and remain pending authorized player sources.

## Historical GW1–GW6 evaluation

`GET /api/v1/public/league/backtest?endGw=6` evaluates team projected goals and CS probability against completed community-reported full-time scores. It outputs gameweek-by-gameweek goal MAE, RMSE, CS Brier, Poisson negative log likelihood, baseline MAE, and score coverage. GW rows missing FT results have **null** metrics instead of imaginary results. The algorithm is replayed today but uses only the prior matchweeks' score features. Without independently timestamped pre-match forecast archives, this is **retrospective walk-forward replay**, not prospective forecast accuracy.

`GET /api/v1/public/league/matrix?startGw=7&weeks=10&sortGw=7` produces the sourced 10-column fixture grid, sorting easiest first. `GET /api/v1/public/league/status` reveals per-GW scores coverage and any missing results.

**Do not claim superiority to Opta, official xG, commercial algorithms or supercomputers** until validated on real held-out data with comparable licensed baselines. Build a separate, authorized player-level ETL and model for actual FPL points, projected minutes, starts, injury/rotation status and reliable price-change ETA.