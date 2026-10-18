# Independent uncertainty model — research baseline v0.2

FPLVORTEX's current `forecastDistribution()` is an independently written seeded simulation that produces illustrative P10/P50/P90 FPL points ranges for the six-week sample dataset. **It is not the proprietary FPLReview Massive Data Model and is not validated for transfer decisions.**

## Current model

- Per-player projected minutes and availability become probability of taking part.
- Poisson counts approximate goals and assists using xG/90 and xA/90 with fixture-difficulty scaling.
- A Bernoulli clean-sheet estimate contributes position-dependent fantasy points.
- Appearance points and a simple role-specific bonus approximation form the simulated points.
- Fixed player/gameweek/model seed produces reproducible numerical output; calculated mean, P10/P50/P90, chance of <=2 points, chance of goal/assist.

## Known limitations

No team-strength fit, no opponent-based xG features, no lineup/bench probabilities, no keeper saves/penalty/conceded goals, no yellows/reds, no bonus-point system calibration, no fixture doubles/blanks, no independent player correlations, no repeated-season walk-forward validation. No live data.

## Production roadmap

1. Secure independently licensed event-level historical data and season-specific rules, with model-training rights.
2. Train minutes, attacking event and team defensive probability models only with features observed before each matchweek deadline.
3. Use calibrated outcome distributions, incorporating fixture reschedules, postponed matches and opponent strength.
4. Backtest the raw expected points and intervals via walk-forward seasons and calibration diagnostics; report Brier/MAE plus coverage.
5. Version source hash, code commit, model configuration, seed, gameweek cutoff and data rights with every published run.
6. Only then replace the illustrative model outputs in the main dashboard and transfer optimizer.

Simulation endpoint: `/api/v1/model/distribution?playerId=1&gameweekIndex=0`. Response always indicates `mode: "illustrative"` and `trained: false`.