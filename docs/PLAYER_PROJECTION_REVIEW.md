# Player projection review — status, not an accuracy claim

## Existing inputs and limitations

- `server/repoData.ts` attaches gameweek player projections from `3_data_third_party/fplcopilot-projections-gw7-2026-10-15-v4.csv` to matching player IDs, including when the FPL player snapshot is live. The file is dated 15 October 2026; no automatic freshness verification or live replacement has been demonstrated. The older implementation clamped missing target weeks to a boundary week; the isolated data-boundary fix now returns null for missing imported GWs, and a five-GW imported total remains unavailable unless all five GWs exist. The independent local model may still provide its own forecast beyond this import range. These forecasts can therefore be outdated and are not evidence of current availability. Player Lab now warns about the file. Do not delete it: it may be useful for research if its true capture time is established.
- `src/lib/analytics.ts` prioritizes that file's next-GW projection over the local model when present. The five-week total can mix file values with local model values. The local scoring model covers minutes, attacking events, clean sheets, defensive actions, saves and cards; its accuracy has not been established here. Market match distributions are not directly integrated into player xPts.
- The field historically called `optaXP5Gw` is calculated locally by `src/lib/repoModel/optaXp.ts` from the available player statistics and official difficulty factors. No direct live Opta feed has been established. Player Lab calls it **Legacy xP**, not a live Opta forecast.
- Official FPL status, chance and news are used for the shared availability indicator. They refresh with the snapshot and may themselves be delayed. The underlying player card is the same component used by the Command Center.

## Notebooks and outside sources

All four files in `2_notebooks/` are present. A source-level survey found that the V4.6 notebook describes a frozen pre-deadline replay and settlement workflow; the DEFCON notebook contains an Understat name-matching and blending routine; the two wildcard notebooks describe recent/season FPL xG/xA and smoothed DEFCON. This survey is not an execution or validation of every cell. Notebook code, source licenses and pre-deadline data availability need independent review before integration.

The provided FPL Review projections URL returned a “Back Soon” page when checked; it did not expose current methodology or an accessible historical forecast archive. FPL Joe and Elevenify have public projections but we do not have verified historical pre-deadline player forecasts or permission to reproduce data. No licensed direct Opta feed or validated, permitted Understat data pipeline is configured. No unverified data was copied or claimed as integrated.

## What is still needed before changing model selection

Collect timestamped, pre-deadline features and forecasts for each candidate (current VORTEX, archive, FPL Review, FPL Joe and Elevenify where permitted), plus later official outcomes. Match player IDs and fixtures, account for blanks/doubles and availability, use rolling or chronological holdouts, and report sample sizes, MAE/RMSE and calibration with uncertainty. Check historical snapshots for leakage and revisions. Select an alternative only if the comparison is valid and supports it. No comparative player backtest or winner is claimed in this change.
