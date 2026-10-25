# Prediction and image audit — 24 October 2026

## Correction: complete player-pool image audit

The image-source conclusions below are superseded by this follow-up. The unversioned official FPL photo family is **still serving real player portraits**; treating it as obsolete excluded available images. The shared resolver now tries both published PL website images (`premierleague25/.../{code}.png`) and official FPL images (`premierleague/.../p{code}.png`) for every player. The live `code`, `opta_code` or validated `photo` filename supplies identity; seasonal element IDs are never substituted.

Checked all 669 current bootstrap players against both 110x140 families, then checked all remaining players against the other configured sizes and mirror. 563 had a published-site portrait; the FPL family restored 30 more, including N. Jackson, Grealish and Konsa. 76 returned no headshot from the checked official endpoints. All 20 official club badge endpoints responded successfully. Those players now show their live club-code badge with an explicit photo-unavailable label, followed by the existing silhouette if the badge also fails. Missing headshots are retried after five minutes or on Refresh data. The per-player England override was removed.

`scripts/audit-player-images.mjs` repeats the coverage check from the live bootstrap, validates PNG response signatures, and reports player IDs, codes, attempted sources and unresolved images. It is diagnostic only; no generated player mappings are used by the application. Browser QA checks recovered portraits in the table and detail card as well as the club-badge fallback. This does not establish that every provider portrait uses a player's latest club kit.

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

The official published asset namespace is `premierleague25`; this is a website asset version, not a value to derive from the calendar year. The resolver now uses the verified `110x140` variant for tables, larger variants for pitch cards, and the existing official S3 mirror. The obsolete unversioned player-photo fallbacks were removed entirely from the active website image resolver. Official player `code` takes precedence over a conflicting `photo` field; numeric metadata is validated and no face is guessed by name. A bounded in-memory source cache retains successful URLs for six hours and exhausted failures for five minutes, keyed by player code, club and display size. Manual Refresh data clears failed entries so newly published photos can be retried. If every permitted source fails, an identified silhouette appears with a photo-unavailable tooltip. No unrelated portrait is substituted.

Official FPL club badges use current bootstrap team codes and the same badge family as the reference. Player faces and kits remain provider-controlled assets: a successful URL establishes source/identity, not that a kit has been updated after a transfer. No blanket commercial-reuse licence for Premier League assets was established; retain source attribution and review the provider's terms before a commercial launch.

Rendered QA verified the squad, player tables, fixtures and club badges. Initial QA before the follow-up loaded fourteen of fifteen squad photos from non-legacy endpoints; Konsa initially used the missing-photo state (the follow-up below adds his verified FA portrait). The previously missing De Cuyper and Crooks loaded. Some newly added players have no available official headshot. YouTube cards retain the existing links and use hq/mq thumbnail variants with a branded fallback if the remote thumbnail cannot load.

## Main page and validation

Gameweek Hub is the default branded home. It includes a prominent, saved FPL Team ID input with empty/invalid/loading/request-error states, a pitch/table switch, captioned gameweek points and ranks, bench order and availability markers, fixture status, sortable goal/CS/win estimates, Top Players by the selected GW's points, actual price changes/transfers, injuries pagination, existing YouTube content and Gameweek Analysis placeholder. General live data loads independently of the linked team and requests share a short in-memory cache.

Self-hosted Manrope, shared emerald/gold tokens, readable comparison bars, optional table colour shading and persistent sun/moon controls apply across all existing views. Browser checks cover desktop, 390px mobile and 768px tablet frames, theme persistence, sorts, paging, player inspection and ID form states. Build/artifact/Worker tests, the dashboard regression script, Vercel artifact packaging and the shared token contrast check passed. Full real-device testing, a full accessibility audit and a historical accuracy benchmark were not run.

## Follow-up image-source verification

Verified the rendered official profiles at https://www.premierleague.com/en/players/199798/ and https://www.premierleague.com/en/players/465730/. De Cuyper's actual loaded image was `https://resources.premierleague.com/premierleague25/photos/players/110x140/465730.png`. Konsa's official profile loaded `.../110x140/placeholder.png`, so that missing headshot is also missing on the source site. The resolver previously guessed a `premierleague26` directory from the system date and omitted the profile site's 110x140 size. Both behaviours are corrected, without reintroducing any unversioned legacy photo endpoint.

Alternative providers were checked against primary documentation:

- TheSportsDB: https://www.thesportsdb.com/docs/api has a free V1 API with 30 requests/minute and restricted result counts. A real free lookup for Ezri Konsa returned a cutout, but its date of birth was 1997-06-06, conflicting with 1997-10-23 in official FPL metadata and the official player profile. That record was not promoted into the site's identity mapping. This is a data-verification failure, not proof that the photograph depicts someone else.
- API-Football: https://www.api-football.com/documentation_v3 documents free image delivery at `https://media.api-sports.io/football/players/{player_id}.png`. Profile lookup requires an API key and its own player IDs. An FPL/Opta code cannot be substituted as an API-Football ID. No account was created or subscription enabled, and an unverified ID mapping was not added.

Neither provider establishes complete, current coverage of every new FPL player. Keep official code-based headshots as the default. A reviewed official-profile fallback now covers Konsa: England Football publishes his current portrait at https://www.englandfootball.com/england/mens-senior-team/squad/ezri-konsa and confirms the exact official FPL birth date. The fallback catalogue requires code 199798 and birth date 1997-10-23; the tooltip identifies the national-team kit. It is used only after the permitted PL sources fail. Unverified or unavailable portraits still use a clearly identified silhouette. Tests cover the published namespace, small/large variants, correct code selection, no legacy endpoints, malformed fallback metadata, listener deduplication, negative-cache expiry, club-change invalidation and manual retry. Player cards, pitch, squad and forecast detail all share this resolver. The preceding GW Points fix is preserved.

Follow-up rendered QA after the verified FA backup: all 15 squad portraits loaded, including Konsa. His tooltip identifies the England national-team portrait. Forecast-table De Cuyper was checked against the same 110x140 URL used by his official PL profile. There were no guessed premierleague26 or unversioned legacy requests in the squad. This checks the displayed squad, not a claim that all 668 players have available portraits.
