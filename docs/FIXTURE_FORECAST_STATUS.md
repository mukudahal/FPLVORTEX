# Fixture forecast: implementation status

## First step: coherent score probabilities

`src/lib/repoModel/scoreDistribution.ts` supplies an independent-Poisson score grid with a bounded omitted tail and derives projected goals, win/draw/loss, clean sheets and scoring at least twice from the same distribution. It also supports a linear mixture of two score distributions for research; **no blend weight has been calibrated or enabled in production**. A mixture's clean sheet probability is a weighted mixture of probabilities, not `exp(-blended rate)`.

For an existing matched market quote, the dashboard and fixture matrix now derive win/draw/loss and clean sheets from the already estimated market-implied goal rates. These model-derived probabilities can differ from the de-vigged 1X2 market probabilities stored in the raw `marketOdds` object, because the existing fit is approximate and rates are rounded. The raw odds remain untouched. When no quote is matched, existing team-strength Poisson predictions are used. A matched quote is not proof that the price is fresh; data feed and timestamp still require verification. No validated market consensus, freshness policy or player-forecast integration is added by this step.

## Not yet implemented or validated

- A trained opponent-adjusted, time-weighted hierarchical team model and independently sourced team match xG/xGA.
- Chronological, pre-deadline archived data, calibration and comparison against honest baselines; current season-wide stats cannot be treated as historical pre-deadline inputs.
- The report's separately calibrated attack and defence FDR scales and frozen reference distribution. The existing planner's win-probability-derived difficulty remains a **provisional index**, not a calibrated attack/defence FDR.
- Historical backtests and verified market quote freshness. The new fixture matrix displays up to 15 selected gameweeks, separates double-gameweek fixtures and excludes blanks from its per-fixture averages; market prices remain freshness-unverified.
- Player lineup/role/minutes scenarios, event-level scoring and market-informed xPts. Existing player projections do not use the new score distribution.
- Dixon–Coles, team-news adjustment, fitting a market blend, and scenario mixtures in production.

Numerical correctness of a probability calculation does not establish predictive accuracy. Fit scale mappings and blend weights only on leakage-free training data, evaluate them on held-out forecasts, and do not claim an improvement without evidence. Confirm any data provider's reuse and display permissions.

## Source and scale safety work

The optional `ODDS_API_KEY_BACKUP` is tried only when The Odds API explicitly reports exhausted credits or reports zero credits remaining. Exhausted-key state is process-local and the key is retried after six hours; restarts clear this memory. A rate-limit response or network failure does not switch keys. This has been tested with mocked HTTP responses, not live credentials. Check the provider's terms for multiple accounts and monitor credit usage: the existing default cache is five minutes, and regions and markets can increase request costs.

The odds health metadata now includes next-GW matched count separately from all matched fixtures. A next-GW status of `fallback` means there were no matches for that GW; it does not prove no prices are present for other GWs. A feed retrieval timestamp is not proof of the underlying price freshness.

The `fdrReference.ts` module provides a frozen, timestamp-filtered percentile scale for separate attack and defence inputs. It is **not connected to the visible fixture table**: no reliable historical pre-deadline reference dataset has been collected or validated. The 20-example minimum is only a software safety floor, not evidence of adequate calibration. Duplicates, historical source revisions and independent validation still require a real data pipeline.

## Historical match data preparation

An offline, deduplicated research history has been prepared using one chosen provider per season; see `docs/MATCH_HISTORY_DATA.md`. A provisional historical-goals team-strength fallback is wired into fixture projections on this branch; it does not include historical pre-deadline odds and has not been calibrated or backtested. The 2026/27 source rows were excluded because their kickoff timestamps lack timezone offsets.

## Fixture matrix (branch preview)

The fourth tab has separate VORTEX-only and market-only modes, fixture detail cards, sorting and a selectable 1–15-GW window (default 10). The market view covers only the next three GWs and never fills absent quotes with model data. For illustrative display the VORTEX Attack index uses `1 + 4 × clamp((2.8 − goals)/2.2, 0, 1)` and Defence uses `1 + 4 × clamp((0.65 − clean-sheet probability)/0.55, 0, 1)`. These fixed mappings are **not calibrated FDR**, not the separate historical reference scales requested in the report, and require out-of-sample validation. The cards' goals, CS, win and 2+ scoring values are derived from a single independent-Poisson score distribution. Market-derived win/CS may differ from de-vigged raw 1X2 prices. Fixture averages count each match once and exclude blanks and unavailable market prices; they are not the probability of multiple clean sheets in a double GW. The VORTEX-only mode deliberately excludes odds; no market blend is enabled. The market feed's fetch timestamp is not proof of quote freshness.
