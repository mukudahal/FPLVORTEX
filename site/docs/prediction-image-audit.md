# Prediction and image audit — 24 October 2026

## Reference actually followed

Inspected `mukundacity-glitch/FPL-VORTEX-YOUTUBE-POST` at commit `07775fced6a20277c6a40ae439881cda803b406d`, including `.github/workflows/day-3.yml`, `day3/run_notebook.py`, `day3/evidence_pipeline.py`, `day3/live_evidence.py` and `day2/player_images.py`. The workflow downloads its production notebook from Drive, patches and executes its code cells, restores persistent model inputs/history, then renders and uploads a private video. No publishing workflow was executed during this audit.

Fetched and read that notebook through the owner's connected Drive. Notebook SHA256: `c27458300f74c91051ad384b920135516a2936e9801ab1b8b40c15920788f0d9`. Source cells 7–18 contain the model; conclusions below are based on these cells and the runtime patches, not the YAML alone. This notebook is an external mutable input, so the checksum records the exact version inspected.

## Mathematical comparison

| Area | Day 3 implementation | Current website implementation |
|---|---|---|
| Inputs | Official FPL snapshot plus season-local FPL_CORE match/player history, previous-season priors, red-card context and optional market/ClubElo history | Official bootstrap and fixtures; current season aggregates; optional imported snapshots |
| Team strengths | Opponent-adjusted non-penalty xG priors; venue-specific league baselines; penalty scoring model added separately | Positive FPL API attack/defence ratings scaled by 1100, otherwise roster xG/played matches and an xGC/90 anchor, shrunk to league mean with four prior games |
| Recency | 90-day half-life; current-season weight n/(n+8); completed matches counted per club | Team model has no recency series. Player model has four-90 position shrinkage and a 75% xG / 25% goals blend; the supported recency minutes input is not populated by the browser |
| Home/opponent effects | Venue attack × opposing defensive weakness × context; separate penalty factors | Team baselines 1.55 home / 1.25 away. Player xPts uses FPL difficulty plus fixed home/away modifiers, not the dashboard team's projected-goals values |
| Player minutes/injuries | Match-history role evidence, availability and fixture context; runtime live evidence weights recent six fixture minutes by 0.85 per step | Starts/minute-share heuristic plus explicit next-round availability; no invented recovery from a GW offset |
| Probabilities | Independent Poisson baseline; Dixon–Coles candidate selected only after chronological validation | Independent Poisson score grid; clean sheets exp(−opponent goals); no Dixon–Coles fit |
| Calibration/uncertainty | Frozen forecasts, chronological holdouts and rolling-origin gates; optional market/ClubElo comparisons; heuristic uncertainty ranges explicitly distinguished from calibrated probabilities | Uncalibrated rates/modifiers and confidence index; paired player benchmark utility requires uploaded pre-deadline forecasts; no operational frozen team forecast archive |

The reference contains more detailed methods and stronger validation plumbing. Its inclusion of a validation routine does not prove that it passed or beat this website. No trustworthy paired held-out comparison was possible here: the website has no historical pre-deadline team forecasts, and this audit did not recover a matched frozen archive and actuals for both models. Rebuilding historical forecasts from today's cumulative data would leak future information. No accuracy winner, numerical performance gain or superiority over FPLReview is claimed.

## Changes justified now

Kept the existing prediction interfaces and core model. Fixed two reproducible failure cases in `model/dashboardMath.ts`: one club's missing API strengths no longer causes all clubs' valid ratings to be discarded; missing/non-finite xG or xGC evidence now uses neutral strength instead of producing NaN or an artificially strong missing-data defence. Regression checks cover these failures and probability mass. These are robustness improvements, not demonstrated forecast-accuracy gains.

Rebuilt the embedded model from the canonical TypeScript using Node's built-in type stripper, avoiding an unavailable local TypeScript package. The website's player points model, scoring, simulation and benchmark interfaces remain intact. A fuller model replacement needs the historical data service, frozen forecast storage and leakage-safe evaluation first.

Fixture scores are actual FPL score fields. `Projected xG` means the current model's expected goals, never observed live xG. Started/historical fixtures are explicitly labelled as current estimates, not frozen pre-match forecasts. No observed live xG provider is integrated. Prices show actual `cost_change_event` in £m; no fabricated price-rise probability or percentage is shown.

## Image findings and decision

The reference resolver uses official FPL player codes with versioned `/premierleague25/photos/players/500x500/{code}.png` and `250x250` URLs, followed by obsolete unversioned `/premierleague/photos/players/.../p{code}.png` paths and a club-shirt fallback. It validates downloaded images and keys its disk cache by player, photo and club code. Its club badges use official team **code**, not seasonal team **id**.

Our newer official season-versioned S3 source was retained and given equivalent versioned resource-CDN variants. The obsolete unversioned player-photo fallbacks were removed entirely from the active website image resolver. Official player `code` takes precedence over a conflicting `photo` field; numeric metadata is validated and no face is guessed by name. A bounded in-memory successful-source cache avoids repeated retries. If every permitted source fails, an identified silhouette appears with a photo-unavailable tooltip. No unrelated portrait is substituted.

Official FPL club badges use current bootstrap team codes and the same badge family as the reference. Player faces and kits remain provider-controlled assets: a successful URL establishes source/identity, not that a kit has been updated after a transfer. No blanket commercial-reuse licence for Premier League assets was established; retain source attribution and review the provider's terms before a commercial launch.

Rendered QA verified the squad, player tables, fixtures and club badges. Fourteen of fifteen squad photos loaded from non-legacy endpoints; Konsa's permitted sources were unavailable and correctly displayed the missing-photo state. The previously missing De Cuyper and Crooks loaded. Some newly added players have no available official headshot. YouTube cards retain the existing links and use hq/mq thumbnail variants with a branded fallback if the remote thumbnail cannot load.

## Main page and validation

Gameweek Hub is the default branded home. It includes a prominent, saved FPL Team ID input with empty/invalid/loading/request-error states, a pitch/table switch, captioned gameweek points and ranks, bench order and availability markers, fixture status, sortable goal/CS/win estimates, Top Players by the selected GW's points, actual price changes/transfers, injuries pagination, existing YouTube content and Gameweek Analysis placeholder. General live data loads independently of the linked team and requests share a short in-memory cache.

Self-hosted Manrope, shared emerald/gold tokens, readable comparison bars, optional table colour shading and persistent sun/moon controls apply across all existing views. Browser checks cover desktop, 390px mobile and 768px tablet frames, theme persistence, sorts, paging, player inspection and ID form states. Build/artifact/Worker tests, the dashboard regression script, Vercel artifact packaging and the shared token contrast check passed. Full real-device testing, a full accessibility audit and a historical accuracy benchmark were not run.
