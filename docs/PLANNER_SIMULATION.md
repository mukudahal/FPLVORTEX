# Planner simulation and chip strategy

The advanced planner uses an independent FPL VORTEX implementation informed by the public workflows at https://fplcompass.com/ (team loading, planning horizon, decay, transfer paths, simulations and chip solver). Compass does not publish its private mathematical implementation. This is not an exact copy of its predictions, algorithms or data.

Sources checked on 2026-10-30:
- https://fplcompass.com/
- https://fantasy.premierleague.com/help/faqs
- https://fantasy.premierleague.com/help/new

## Scope and visual preservation

The repository's root Vite/React app powers /#/optimizer. The separate 1_APP_dashboard tree is not modified. The existing planner pitch, graphics and three advanced tabs remain. No stylesheet, font, brand asset, player image or club badge changes are included.

## Forecasts and search

Each player/GW uses a finite imported GW-specific mean when available, including a legitimate zero. Otherwise computePlayerXPts recomputes that week's fixture-based forecast. A scheduled blank always scores zero. The sampler receives the same mean used for planning. Fixture-component sampling is retained when means agree; imported overrides use the existing aggregate sampler. Historical calibration is not claimed.

A bounded beam retains six states per week. Each state carries the permanent squad, selling-price basis, bank, free transfers, played chips and the complete weekly ledger. It compares shortlisted 0/1/2-transfer actions and full WC/FH rebuilds. Funding downgrades are included in coupled candidate pairs. Full rebuilds are greedy with local XI/captain refinement, not MILP or an exact global optimum. Locked players remain held.

The search scores sum(decay^offset * (XI + captain bonus + chip bonus - hits)). Displayed expected totals and Monte Carlo outcomes are undiscounted. Remaining chip option values help preserve future BB/TC windows during pruning. Chip choices are compared jointly so WC ownership changes affect later BB decisions and one-chip-per-week conflicts are resolved. Search covers the remaining half-season plus any selected horizon crossing the half boundary. Uncertain future fixtures, prices and injuries are not invented.

No-chip alternatives constrain the first week to roll/one/two moves and then replan sequentially. The joint chip result is compared with the best no-chip state, which remains a candidate. Search heuristics can miss better solutions; outputs require re-evaluation before the deadline.

## Rules and history

- Zero FT is supported; each additional normal transfer costs four points.
- FTs bank to five. Canonical WC/FH FT-preservation rules are reused.
- One chip per GW, one of each per half; first chips expire after GW19.
- FH cannot be played in consecutive GWs, including across GW19/20.
- FH restores permanent squad, bank and ownership basis after its scoring week.
- Selling prices use available manager pick data; a sold/re-bought player uses the new basis. Prices stay fixed within a scenario.
- WC/FH rebuilding prices retained holdings at their selling values within the liquidation budget. This preserves owned price gains without making those gains spendable. The existing legal squad seeds local refinement if greedy construction fails.
- The server and static fallback expose normalized played-chip history. Missing upstream history remains unknown and disables personal chip recommendations.
- Manual scenario transfers consume FTs and committed hits are charged once, unless WC/FH removes them.

## Simulation and interpretation

A cancellable module Web Worker runs 3,000 or 10,000 paired draws, leaving the existing planner responsive. Changing inputs terminates the previous worker; results and errors cannot race across workers. Work starts only when advanced tools are opened.

Paths share player draws, team shocks, legal autosubstitution and captain/vice fallback. Weekly transfer hits are deducted in their actual GW, including cumulative gain bands. Distributions cover the selected horizon; the chip plan can extend further. The unchanged-squad path, sequential no-chip transfer path, alternatives and joint chip path are compared.

P(beat unchanged squad) means strictly greater points under this model. Ties are reported separately. It is not green-arrow probability, effective ownership, a league finish probability or a predicted overall rank. No field/rival-score distribution exists, so rank gains are not guaranteed.

Each alternative also has a paired comparison against the best no-chip transfer plan. The third tab reports its net gain, 10th–90th percentile gain range, strict win/tie/loss shares and a Wilson 95% interval for the win share. These reuse the same outcomes, including the transfer plan's weekly hits, rather than subtracting unrelated marginal quantiles. The interval describes finite-draw sampling uncertainty only; it does not measure forecast or model accuracy. The expected-points search determines the recommended badge; a larger sampled mean alone does not change that recommendation.

Individual chip-matrix peaks are diagnostics, not an additive schedule. The WC column explicitly compares three weeks against keeping the pre-WC squad; other columns compare with the no-chip transfer path. The displayed joint schedule is the executable recommendation.

## Verification

Regression coverage includes zero-FT hits, selling-price constraints, locks, weekly bank/FT legality, used chips, half resets, FH adjacency/restoration, blank/zero/missing forecasts, season end, deterministic paired draws, canonical lineups and per-GW hit accounting. A production-build Playwright smoke test exercises the existing tabs, worker result, narrow viewport and unavailable-state recovery. CI runs TypeScript, all repository tests, production build and the Python solver.

