# Production model specification

This is the authoritative ownership/behavior description for the existing root application. It does not claim fitted accuracy.

| Capability | Canonical implementation | Evidence / limit |
|---|---|---|
| Official snapshot contract | src/lib/types.ts; server/normalize.ts; server/officialSnapshot.ts | Timestamped official bootstrap/fixtures; live scoring optional; recovery validation rejects invalid IDs/references/prices |
| Source-age policy | src/lib/freshnessPolicy.ts | Official 10 min during a live GW / 30 min otherwise; bookmaker quote 20 min; serving time never resets source age |
| Minutes and scoring | src/lib/repoModel/minutes.ts, scoring.ts, seasonRules.ts | Executable season rules and deterministic regressions; provisional minutes assumptions |
| Player mechanistic xPts | src/lib/repoModel/xpts.ts and playerModel.ts | Position-prior shrinkage, minutes states and expected fixture scoring; component reconciliation tests |
| Player table per-fixture display | src/lib/playerTableForecast.ts | Uses the same TS model with identical inputs; doubtful remains distinct, future injury recovery is not assumed; blank/unavailable UI is an em dash |
| Planner / chips / simulation | src/lib/repoModel/planEngine.ts, compassPlanner.ts, monteCarlo.ts | Existing dated-import freshness guards; same-input deterministic paired draws; bounded search is not a certified unrestricted optimum |
| Team goals and clean sheets | fixtureForecast.ts; repoModel/scoreDistribution.ts | VORTEX and bookmaker modes remain distinct. Probability sums/CS coherence tested; independent-Poisson assumptions and FDR remain uncalibrated |
| Python optimization | fpl_solver/ | Integer price/FT/hit/squad constraints and independent TS financial replay; existing no-chip formulation released; joint chip development deferred |

The notebooks use a different research pipeline. They are not the production calculator and numerical notebook↔TS parity is not claimed. Existing `tests/repo-math-parity.test.ts` guards the explicitly shared TS/root/model-lab behavior. New `tests/player-table-forecast.test.ts` freezes identical synthetic inputs and compares the display adapter against the production TS function. Neither test is a historical forecast backtest.

Imported projections retain their original file-name date (not a verified provider timestamp); refreshing FPL facts does not refresh that file. Bookmaker access, quote recency, coverage and redistribution rights are separate checks. No stale or missing quote may be relabelled as current market evidence.

## Prospective evidence collection

On successful official scheduled ingestion, `scripts/archive-forecasts.ts` writes at most one compressed immutable observation per UTC day / next GW / model-code version under `data/forecast-archive/`. Each record includes actual retrieval/computation times, future deadline, SHA-256 input identity, hashed model sources, full official inputs and per-player future-GW xPts/minutes (missing values remain null). Mixed imported/market snapshots are rejected. Past deadlines cannot be reconstructed into forecasts.

`scripts/settle-forecasts.ts` creates separate immutable outcome observations only after official `finished` and `dataChecked`, matching season, GW and archived player IDs to the official event-live response. A settlement records its observation time and may precede a later official correction; it never overwrites the forecast. No calibration or superiority result is asserted. Collect enough genuine pre-deadline/settled pairs before evaluating holdout errors, FDR, minutes, goal/CS and Monte Carlo coverage.


## Shared forecast input and mean selection

`src/lib/forecastPolicy.ts` owns dated-import admission and numeric mean selection for balanced Players projections, manual Plan caches and Solver inputs. The snapshot retrieval time is the forecast as-of reference; refreshing a cache never changes the imported file date. Explicitly identified imports older than seven UTC calendar days, invalid/unknown/future dates, flagged official status/chance and fixture blanks cannot supply a replacement mean. Only a finite, matched per-GW value can replace the mechanistic mean; zero remains a valid imported value. Legacy generic benchmark and imported minutes fields are retained as raw metadata, not substituted into an unmatched GW or described as the model's actual minutes distribution.

The canonical model uses official minutes/starts and completed-event count, aggregating expected minutes over the actual fixtures. Solver inputs now carry `completedEvents`; a future GW number does not prove earlier games finished. Missing values retain the legacy scenario fallback for old exported/test inputs. Future availability does not recover solely from a GW offset. Balanced base mean parity is intended across these adapters; risk-profile weighting, display rounding, per-fixture table breakdowns and probabilistic sampling are separate documented views. Per-fixture table components remain mechanistic when an admitted external aggregate mean is present. Neither that import nor FDR is claimed fitted/calibrated.

`tests/forecast-policy.test.ts` freezes the same players, fixtures, team strengths, completed events, date and imports for all three consumers. It tests stale/recent/unknown data, doubles, blanks, missing-GW legacy values, injured zero chance, explicit zero and end-of-season clipping. `tests/repo-math-parity.test.ts` retains exact raw production/research TS scoring/component parity and separately verifies adapter admission rules. Notebook numerical parity and forecast calibration remain unestablished; immutable pre-deadline archives must accumulate genuine outcomes first.
