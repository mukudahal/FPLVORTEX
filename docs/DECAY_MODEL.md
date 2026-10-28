# Decay model: foundation (v1)

The historical and future multipliers both start at 0.85 (15% per GW); this is an assumption, not a backtested optimum. Historical statistics use a 12-GW window, a 450-minute prior and a low-sample flag below 180 weighted minutes. The caller must supply a defensible prior and verified, finished, match-level observations for one player and one season. Missing data are excluded, not treated as zero; each fixture in a double GW is counted separately. Do not include the target GW when evaluating a pre-deadline prediction.

`src/lib/repoModel/decay.ts` provides the calculation primitives. `planEngine.ts` supports an optional future multiplier in auto-planning, including candidate shortlisting. Its default is 1 (no decay) to avoid silently changing existing behaviour. The future score is a decision score, not the sum of predicted points. Odds, official FDR and recorded statistics are never modified.

## Not yet connected

The current public dashboard does not call this planner engine, and the historical functions do not yet fetch FPL match history or feed the live projections. No interface, live prediction, automatic chip recommendation, or backtest is added by this foundation. Before enabling historical decay, connect verified fixture and player history and an independently chosen prior; retain missing-data and stale-data fallbacks. Future discounting needs to be exposed as a separate planner control and its score clearly distinguished from undiscounted xPts.

Backtest 1.00, 0.95, 0.90, 0.85, 0.80 and 0.70 using rolling pre-deadline data and held-out gameweeks, reporting RMSE and MAE and probability calibration where applicable. Evaluate future discounting independently through simulated transfer decisions and hits. Never claim a winner without reliable out-of-sample results.
