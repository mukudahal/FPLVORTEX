# v0.8: live-squad source reconciliation and preliminary model

## User-initiated flow

1. Manager supplies the FPL entry ID and clicks **Sync live FPL rank**.
2. Server fetches profile, public gameweek history, the latest publicly available 15 picks, player catalogue, and one fixtures collection. No credentials and no background polling. Cache TTL one minute.
3. Source ID alignment uses **actual FPL player IDs**, never numerical IDs from the sample demonstration squad. Manager historical rank and points are separate from forecast data. If the fixture source is unavailable, no automatic signal is calculated.
4. A deterministic independent heuristic calculates preliminary expected minutes, xG, xA, CS%, expected points, captain candidates and a capped 10-GW **unchanged-squad** roadmap. It does not copy FPL's own `ep_next` projections.
5. Candidate transfer comparisons are **watchlist signals only**. Actual selling prices, FT carry, transfers, future pressers, verified expected minutes, chips, real football season data license and backtested calibration are missing. Never present as executable orders.

## Model formula (research only)

- `minutes = clamp((0.73 * observedMinutes / completedTeamFixtures + 0.27 * 68) * availability, 0, 90)` with a 70-minute placeholder when team fixture counts are unavailable. Injury/suspension/unavailable statuses set availability to zero; doubtful status has a provisional 0.5 multiplier and official chance factor when provided.
- `goalRate90 = (observed cumulative xG + 7 * positionGoalPrior) / (90sObserved + 7)`, analogous for xA. If cumulative xG is absent, use position prior rather than inventing a statistic.
- `opponentFactor = clamp(exp(0.13*(3-FDR)), 0.63, 1.52)`. This treats FPL fixture difficulty as a descriptive input; this is not Opta.
- `xG = goalRate90 * (expectedMinutes/90) * opponentFactor`, similarly xA.
- `CS probability = clamp(0.33 * exp(0.20*(3-FDR)), 0.11, 0.70)`.
- `xPts = appearance proxy + position goal points * xG + 3*xA + position CS points * CS probability * expectedMinutes/90`. Bonuses, saves, penalties, cards, double gameweeks and autosubs are not fully modeled. This is untrained, uncalibrated and not a validated FPL forecast.

## Decision and presentation safeguards

- Starts means **season starts** if provided by FPL. Show `starts/completed team fixtures` where coverage exists, alongside total minutes and 90-minute equivalents. **Minutes/team match is not minutes per appearance**. Substituted-on/off split remains unavailable without per-GW lineup observations.
- `liveResearch.mode = live-inputs-uncalibrated` and the UI labels this explicitly. Display a no-forecast state if the source fails.
- No fixture means no captain candidate or projected score; no future fixture is fabricated. Future fixtures are constrained to source events, not synthetic ones.
- The planner covers at most 10 gameweeks. GW19 is the destination, not a claimed predicted finishing rank. It does not simulate committed transfers/chips across real seasons.
- FPL's JSON website interface is unsupported and requires terms/rights review before product commercialization. Production must use authorized data agreements or imported licensed files.

## Quality gate

Deterministic fixtures cover next-gameweek boundaries, injury/suspension flags, independent model math, duplicate IDs, source gaps and future data exclusion. Needs separately archived pre-deadline features with strict chronological holdouts and calibration before publishable recommendations.