# FPL VORTEX intelligence audit

## Revisions and release status

Audit date 2026-11-25 UTC. Main was `f229b86cd34e5ab99a97cbfc2cdb1ff33155733d`. The initial PR #90 head was `d1651642ad458373c3435f8c92349b1fb22a3c73`. GitHub returned untruncated trees with 1,017 and 1,021 entries respectively. The original PR changed five text-planning files. The root Vite, React and Express application remains the production application. The Next.js app, model lab and notebooks remain research and development environments.

In [run 45622169511](https://github.com/mukudahal/FPLVORTEX/actions/runs/45622169511), the 11-player, four-bench, 15-portrait and 15-score checks reached the captain armband assertion while the browser still displayed “Syncing official FPL Team #999999”. The identical browser script existed on main. The amended check lets the existing team-identity assertion resolve before checking the manager's XI, bench, captain and vice. The next run reached the same assertion after identity sync. Official GW11 picks showed the recorded captain autosubstituted into bench position 14 and the vice holding the 2× multiplier. The dashboard now retains assigned armbands on autosubstituted players and displays the official 2× or 3× score multiplier for the recorded week. A later browser run passed the Dashboard armband checks and exposed a manual chip test that assumed the horizon ended in GW19. Its fixture now selects and checks a gameweek from the active chip inventory, including horizons crossing the midseason chip reset. Both GitHub artifact creates independently failed with the account artifact-storage quota error. No workflow or artifact requirements were removed. The manual workflow is only on the feature branch, and GitHub requires the workflow definition on the default branch to accept a manual dispatch.

## Data inventory

| Class and source | URL and integration | Coverage and timing | Access and limitations |
|---|---|---|---|
| Official bootstrap | [FPL bootstrap](https://fantasy.premierleague.com/api/bootstrap-static/), `server/officialSnapshot.ts`, `server/normalize.ts` | 2026/27, 674 players, 20 clubs, 38 events at audit. Official observations include prices, ownership, transfers, availability and season statistics. | Public GET, no credentials. Provider update timestamp unavailable. Retrieval time and individual news timestamps are different. Some fields are absent or have unknown values. The ep fields are predictions. |
| Official fixtures and scorelines | [FPL fixtures](https://fantasy.premierleague.com/api/fixtures/), same ingestion modules | 380 fixtures retrieved on 2026-11-25. Includes provisional fixture assignments and upcoming deadlines from bootstrap. | Public GET. Postponements and rescheduled events can change fixture counts by GW. FDR is an official rating and inputs for the forecast, with no direct probability interpretation. |
| Official results and per-player history | [FPL API base](https://fantasy.premierleague.com/api/), `event/{gw}/live/`, `element-summary/{id}/` via `server/index.ts` and `scripts/settle-forecasts.ts` | Official GW10 and GW11 event responses checked on 2026-11-25. The archived outcome schema stores points. The current event endpoint also returned minutes and starts. | Public GET. Only settled outcomes belong in backtests. The fixture-level timeline and raw probabilities were not frozen in these archives. Corrections can occur. |
| Official public manager and leagues | [FPL API base](https://fantasy.premierleague.com/api/), entry, history, transfers, picks and classic standings via `server/fpl.ts` | Official current public entry 145784 and three classic leagues reachable on audit date. Squad ownership, transfers, chips and selling prices only as exposed or reconciled from public records. | Public GET. An authenticated current FPL state may differ. Unpublished transfers, chips and bank are not guaranteed visible. League comparisons depend on the returned page and official rival picks. |
| Official recovery and mirrored snapshots | `public/data/fpl-snapshot.json`, `server/snapshotStore.ts`, `scripts/refresh-snapshot.ts`, `scripts/mirror-upstream.ts` | Render returned recovery inputs generated 08:54 UTC and still marked stale, with upstream false, at 14:07 UTC. Direct official FPL retrieval passed the repository validator. | Derived recovery copies retain original age; serving them again cannot refresh the observations. Render's upstream rejection could not be attributed to a specific payload field from its available diagnostic. |
| Official-derived historical matches | `data/fpl-match-history/2026-27.json`, `scripts/archive-fpl-matches.ts` | 110 observed results in 2026/27 through GW11. | FPL-derived outcomes at match level. These are not frozen forecasts or a historical squad-state feed. |
| Vaastav match history | [Vaastav](https://github.com/vaastav/Fantasy-Premier-League), `data/fpl-match-history/vaastav-2018-2026.csv` and its source manifest | 3,040 matches across eight seasons, 380 per season, 2018/19 to 2025/26. All 3,040 lack both expected-goals columns. The manifest identifies source commit and blobs. | Public upstream repository. Verify upstream and underlying data terms before redistribution. Match outcomes are derived from FPL, with no independent prediction signal. |
| FPL Copilot import | [FPL Copilot](https://fplcopilot.com/), `3_data_third_party/fplcopilot-projections-gw7-2026-10-15-v4.csv`, `server/repoData.ts` | Sole benchmark CSV in both inspected trees. 667 unique players, 20 clubs, GW7–16 columns. Filename date 2026-10-15. Provider publication timestamp and complete historical forecast series unavailable. | Existing repository research import. Live access, subscription entitlements, provenance of underlying model inputs and redisplay rights unverified. Excluded as stale for the personal run. |
| VORTEX prospective forecast and outcome archive | `data/forecast-archive/`, `server/forecastArchive.ts` | 28 forecast files across GW10–12 and 23 companion outcomes. Four older model-version forecasts, 19 matched files for the selected version, five GW12 forecasts awaiting results. Deduplicated evidence covers two settled deadlines. | Repository data. Official-only inputs at forecast creation. Local predictions and official outcomes have separate timestamps and roles. Missing xPts/minutes are kept null. |
| FPL normalized expected points | Frozen `snapshot.players[].epNext` in the prospective archive, `server/normalize.ts` | Identical deadlines and covered players available for the 993 matched GW10–11 rows in this evaluation. | Official published prediction as represented in the archived normalized field. Older raw provenance cannot distinguish ep_next from normalization fallback to ep_this or zero; it is a proxy benchmark. |
| Markets | [The Odds API](https://the-odds-api.com/), [Football-Data](https://www.football-data.co.uk/), [ESPN](https://www.espn.com/soccer/), `server/odds.ts` | Existing order Odds API, Football-Data, ESPN. Optional coverage and quote times vary per fixture. No market rows in the official-only replay; observed fixture coverage for the sampled fallback unavailable. | The Odds API keys are optional and terms can depend on plan. The repository keeps quote age and redisplay permission distinct. No licensed live market archive or complete quote history was verified. |
| News notes | Official bootstrap plus [Premier League](https://www.premierleague.com/), [Manchester City](https://www.mancity.com/), [England Football](https://www.englandfootball.com/), `server/repoData.ts` | Three manually checked repository notes dated 5 October. Official bootstrap at audit had 193 dated news items. | Official dated notes are evidence for the events reported. No current club-wide, multi-season press conference, congestion or lineup feed was verified. |
| League fallback and video/media | `public/data/fpl-league-fallback.json`, `site/ui/videos.json`, `server/repoData.ts`, `server/imageDownloads.ts` | Historical league/demo data, cached video list and permitted asset proxies for existing UI. | Auxiliary display only, excluded from scoring and manager verification. No images are produced by the personal report. |
| Other competitor sources | [FPL Review](https://fplreview.com/), [Fantasy Football Hub](https://www.fantasyfootballhub.co.uk/), [Fantasy Football Scout](https://www.fantasyfootballscout.co.uk/) | Sites identified as future comparisons. No matched, timestamped projection dataset verified in this repository. | No premium feed or subscription used. No scoring comparisons against these providers. |

## Existing model and evidence

- **Player model.** Existing points use position and minutes priors, xG/xA, fixture scaling, probabilistic clean sheets and defensive thresholds, saves, bonus and deductions. Several coefficients, penalty treatment and tail assumptions are provisional. Match-level BPS ranking and fitted finishing adjustments are research candidates.
- **Minutes.** The current model uses season starts/minutes, recency where individual history is supplied, availability and shrinkage. The official-only archives preserve means but do not preserve start or 60-minute probabilities. The matched sample is below. Further validation needs prospective probabilities, position and injury strata, fixture-level minute outcomes and proper temporal features.
- **Fixtures.** Existing model supports goals, clean sheets and result estimates, market modes and historical team inputs. The audited historical outcome series alone cannot establish an out-of-sample xG or market advantage. Test candidate strength models against frozen dated inputs.
- **Decisions.** The planner uses a bounded six-state beam with shortlist pruning and normal 0/1/2-transfer paths, plus chip rebuilds. The Python solver has independent price/FT/legality tests for its existing scope. No unrestricted chip-aware optimum, optimality gap, fitted price predictor or realised transfer/chip performance was established.
- **Simulation.** Existing paired paths already use shared player draws and approximate team-level correlation, automatic substitutions and vice-captain activation. Missing match-level interactions and uncertain tails prevent claims about calibrated probabilities or actual mini-league win chances.
- **Accountability.** Optional private immutable archives record newly generated recommendations with before-deadline provenance. There is no historical personal recommendation series suitable for counterfactual settlement. Automatic settlement, historic captaincy regret, transfer and chip validation, league win probabilities and multi-horizon uncertainty remain open.
- **Ensembles.** VORTEX had one currently usable independent model in the direct official-only run. The date and rights of market and third-party forecasts restrict evidence. No learned production weights, ML dependencies or revised production model coefficients were introduced.

## Measured prospective baseline

Cutoff 60 minutes before target deadline. Latest eligible matched archive per GW for `typescript-mechanistic-061b8b630d45fe3e`. Input hashes, deadlines and forecast and settlement timestamps were checked. GW10 supplies 494 rows and GW11 supplies 499. There are 349 unmatched rows without a usable joint points forecast. Minutes use later official event responses and require point totals identical to the original outcome for the same row. These are archived player-table forecasts. This does not directly benchmark every production planner input mix.

| Measure | VORTEX MAE | Reference MAE | VORTEX RMSE | Reference RMSE |
|---|---:|---:|---:|---:|
| Points vs archived normalized FPL epNext | 1.512 | 1.547 | 2.416 | 2.612 |
| Minutes vs season minutes per completed club match | 19.195 | 17.811 | 27.338 | 27.712 |

The research candidate fits a mean error correction on previously settled rows only. Its one-week test on GW11 scored MAE 1.596 and RMSE 2.549, versus 1.589 and 2.549 for unmodified VORTEX on the same rows. The repository's minimum evidence gate is eight settled gameweeks. Two clustered dates are too few to treat a resampled interval as persuasive. The candidate stays out of production. The JSON evaluation includes bias, correlations, calibration bands, matched minute subsets and the one-week candidate results.

Reproduce the archive evaluation from the repository root:

```sh
node --import tsx scripts/evaluate-forecast-archive.ts data/forecast-archive typescript-mechanistic-061b8b630d45fe3e
```

Supply a third argument with a local directory of audited official event-live responses named `2026-27-gw10.json` and `2026-27-gw11.json` for the optional minutes comparison. Keep historical source observations and their retrieval dates.

## Rollback

The changes are isolated in the feature branch. To roll back the follow-up code, revert that commit on the feature branch. Main, deployment, cron schedules, saved plans and historical archives require no rollback. GitHub Actions artifacts remain dependent on the account storage quota. Do not delete historical runs or artifacts without the owner's explicit approval.

## Walk-forward convex blend experiment (2026-11-26 NPT)

Research-only hybrid, not a replacement for the independent VORTEX model. A constrained least-squares weight w minimizes squared errors of w * VORTEX + (1-w) * archived normalized FPL epNext on previously settled same-season data only. The first deadline has no fitted forecast; no future outcomes are used. The actual repository archive replay uses GW10 (494 rows, computed 2026-11-06 00:26 UTC, settled 2026-11-09) to fit w=0.909759330872167, and GW11 (499 rows, computed 2026-11-21 02:35 UTC, settled 2026-11-24) as a chronological test. On the identical held-out rows, VORTEX MAE/RMSE = 1.588998/2.549117, official proxy = 1.615431/2.755374, hybrid = 1.573258/2.540865. A single held-out GW is insufficient for promotion; the eight-GW evidence gate remains, and FPL Review projections were not available. The existing evaluator now emits the weight and prior training counts per deadline plus paired hybrid comparisons. No forecast coefficients, schedules, optimizer, live renderer, or production deployment changed.

## P0 prospective minutes evidence (26 November 2026)

The archive now freezes a single-fixture minutes distribution from the existing model and a research-only comparator using the official club's played-match count instead of the completed-GW count. It retains official settled minutes and starts when present (unknown is null). The evaluator separately reports matched single-fixture MAE/RMSE and start/P60 Brier losses even when points comparison coverage is unavailable. Multi-fixture weeks are excluded from this probability experiment because GW aggregate minutes cannot identify a particular fixture's start/60-minute outcome. Historical artifacts are untouched; older forecasts do not acquire retrospectively inferred probabilities. No production coefficients or scheduler changes; no measured improvement is asserted until prospective settlements exist. This does not solve recency, injury recovery, rotation or data completeness. The next work package remains dated element-summary observations and walk-forward calibration.

## Follow-up research and release evidence

The independent personal plan uses only the existing VORTEX mechanistic points
model. It reconciles public effective sale basis, FT balance, and chip history,
freezes each week's no-transfer XI and captaincy alternatives, and records the
recommendation before the deadline. The three-move option is a bounded search.
The deterministic same-squad hold projection is distinct from the autosub-aware
Monte Carlo estimate. Neither measure is a promised score.

| Experiment | Out-of-sample evidence | Status |
|---|---|---|
| Goal-only regularised Poisson club attack and defence | 760 matches across 2024/25 and 2025/26. Scoreline log loss 2.938 vs 3.014 for the venue-only baseline. Paired gameweek-resampled difference −0.106 to −0.043. | Research candidate. Compare prospectively with deployed fixture estimates before promotion. |
| Recent minutes | GW11 holdout of 499 players. Three-match MAE 17.423 vs 20.097 for production, RMSE 29.623 vs 28.428. | Mixed evidence from one deadline. |
| Constrained points blend | One 499-player holdout. MAE 1.573 vs 1.589, RMSE 2.541 vs 2.549. | Insufficient independent deadlines. No production weight. |
| Personal policy replay | Two independently reinitialised deadlines. Measures realised recommendation versus fixed hold and captain points against a normalized FPL forecast baseline. | Retrospective diagnostics only. No reliable estimate of season-long gains. |
| Optimisation comparison | On a 43-player no-chip shortlist, six- and twelve-state beams both reached the exact solver's score of 305.32 net xPts on the tested input. | Certified only for that bounded shortlist and objective. |

Reproduce the research from the root with the existing Node and Python solver
dependencies. The official outcome directory contains identified event-live
payloads, downloaded as official outcomes after the events.

```sh
python scripts/backtest-fixture-goals.py
node --import tsx scripts/backtest-recent-minutes.ts data/forecast-archive typescript-mechanistic-061b8b630d45fe3e path/to/official
node --import tsx scripts/backtest-personal-decisions.ts data/forecast-archive typescript-mechanistic-061b8b630d45fe3e path/to/official 145784
node --import tsx scripts/compare-personal-search.ts path/to/plan.json path/to/frozen-input.json.gz
```

The new recommendation settlement path starts with future advice. Older
retrospective experiments cannot verify real chip gains, rank effects or rival
responses. The production bonus model remains a marginal heuristic. In the
current normalizer several rare events default to zero in the model adapter,
so the points engine should not be described as using observed card, own-goal
or penalty-event rates. Prospective fixture outcomes, match-level bonus
competition, price movement labels and verified market quotes are needed for
the next accuracy gates.
