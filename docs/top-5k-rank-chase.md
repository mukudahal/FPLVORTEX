# FPLVORTEX Top-5K GW19 planner — research prototype (v0.6)

## Objective and limits

The manager's declared goal is **overall rank under 5,000 by GW19, 2026/27**. The Rank Chase tab is a *rank-aware planning display*, not a tested rank prediction system. Entry IDs, current rank, current overall points and a **hypothetical** GW19 points benchmark can be entered manually and are stored exclusively in local browser storage. There is **no official FPL entry integration**, and no embedded team ID in repository code. The user has previously shared an entry ID for use once a compliant source of entries, picks and financial records is available.

The rank gap is simply max(0,current overall rank - 5,000), a difference in places, never interpreted as an expected points deficit. The optional hypothetical points benchmark estimates (hypothetical final score - current points)/(remaining inclusive gameweeks); it is explicitly **not** the unknown top-5,000 cutoff.

## Planner

`src/rank-chase.ts` composes the independently developed beam-search planner. It checks all 15 positions and at most three players per club. A rank chase objective is **not** implemented as a statistically validated winning probability; it ranks illustrative expected points. Up to **ten forecasted GWs** are available from the current demo horizon, GW7–GW16. No player projection data is present for GW17–GW19. Show a rolling forecast window and recalculate weekly; don't extrapolate invented fixture values.

Four chip availability checkboxes constrain the planned chip candidates. Risk preference is presently an *action-review filter* (minimum expected demo points advantage) rather than an uncertainty-aware solver objective. The starting lineup, transfer, chip and captain are **simulation outputs** to review, not live advice. FPL chip season deadlines, team selling values, bench autosubs and full WC/FH pool optimization are incomplete; this is not production-ready advice.

## To become genuinely personalized

1. Introduce an authorized FPL entry data source or user-provided export with consent, freshness timestamp, squad, captain, chip history, free transfers, budget, value/selling prices and rank/points.
2. Join player IDs to a licensed player/minutes/injury/availability dataset with transfer and team-lineup statuses.
3. Extend player-level forecasts to at least GW19 with reliable opponents, double/blank gameweek handling and future expected minutes.
4. Optimize expected rank performance under realistic rank-point distributions only after sufficient archived rank/points history is available. Avoid assigning a probability of top-5,000 before calibration.
5. Backtest across multiple seasons with independent, archived, pre-deadline predictions and an untouched test horizon; compare against simple baseline models and quantify uncertainty. Recompute weekly and surface all changes to the manager.
6. Validate official 2026/27 chip expiry rules and update the solver for exact chip handling and full official constraints.

No proprietary FPLReview code or projections are used.