# Model mathematics audit — v2026.27.2-math

This change corrects the existing mathematical model. It does not establish superiority to FPLReview or constitute a trained production forecasting system.

## Confirmed corrections

- Goalkeeper goals now score 10 points, matching the current official FPL scoring table.
- Short appearances earn expected goals, assists, bonus, saves, defensive contributions and cards. Conceded-goal penalties apply below 60 minutes; clean sheets still require 60+.
- Poisson scoring thresholds use exact expectations rather than dividing saves by three or truncating conceded-goal tails.
- Analytic xPts and integer-event Monte Carlo use the same conditional fixture models. The sampler no longer secretly moves probability from 60+ minutes to short appearances.
- Negative expectations are retained; simulation does not introduce a minimum positive event rate.
- Minutes calculations are centralized; arbitrary recovery increases by gameweek offset are removed. Dated match-level observations can update a recency-weighted Bayesian mixture, excluding future/unrecorded observations.
- Strict wins and ties are reported separately. Cumulative path differences include both paths' transfer-hit costs. Unvalidated logistic probability shrinking is removed by default.
- Lineup formation enumeration maximizes XI plus captain points. The Python implementation is checked against the TypeScript implementation and exhaustive enumeration.
- Additive chip scheduling uses exact dynamic programming rather than a greedy allocation. Squad/chip interaction forecasts still need joint scenario optimization.
- Duplicate conceded-goal expectations, RNG distributions, minutes wrappers and hit calculations use shared implementations.
- Historical reconstructions are labeled as diagnostics because current player/fixture metadata and missing historical injury context prevent a fair point-in-time claim.
- Calibration fitting no longer marks its own in-sample coefficients as independently verified.
- Frozen forecast comparison matches season/player/gameweek/deadline, enforces an information cutoff, and reports MAE/RMSE/Brier and paired gameweek-cluster bootstrap intervals.
- Optimizer caches now include the model version, all player inputs, fixtures and team inputs.

## Verification

112 Node regression tests passed. Thirteen pure-math TypeScript modules passed strict semantic checking. New deterministic tests include 240,000 fixture simulations across four positions and exact lineup comparisons against exhaustive enumeration and Python. The fixture and random-distribution assumptions remain unvalidated empirically.

The dashboard match model also retains the high-scoring Poisson tail and explicitly includes draws.

The full Next.js dependency installation/build was unavailable because registry DNS access is blocked. The separate dependency-free Sites test interface uses compiled copies of these shared math modules. Its Worker artifact is validated independently.

## Remaining limits

The default minutes fallback and fixture multipliers remain heuristics. Recency updates are not a learned injury or rotation model. The Monte Carlo uses component distributions and optional team shocks, not a coherent league-wide match-scoreline simulator. The chip DP optimizes supplied additive gains; multi-period transfer planning remains bounded beam search. No historical training corpus, licensed Opta ingestion, frozen FPLReview comparison, or proven rank-target model is supplied. These constraints are displayed in the test site.

Official scoring reference: https://www.premierleague.com/en/news/2174909/
