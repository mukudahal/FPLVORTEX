# Planner simulation and chip strategy

The advanced planner uses an independent FPL VORTEX implementation informed by the public workflows at https://fplcompass.com/ (team loading, planning horizon, decay, transfer paths, simulations and chip solver). Compass does not publish its private mathematical implementation. This is not an exact copy of its predictions, algorithms or data.

Sources checked on 2026-10-30:
- https://fplcompass.com/
- https://fantasy.premierleague.com/help/faqs
- https://fantasy.premierleague.com/help/new

## Scope and visual preservation

The repository's root Vite/React app powers /#/optimizer. The separate 1_APP_dashboard tree is not modified. The existing planner pitch, graphics and three advanced tabs remain. No stylesheet, font, brand asset, player image or club badge changes are included.

## Forecasts and search

Each player/GW uses a finite imported GW-specific mean, including a legitimate zero, **only when an identified import has a filename date no more than seven UTC days old**. Stale imports and imports with an unverifiable date are excluded from Solver, Chip Strategy and Monte Carlo inputs; the independent local computePlayerXPts model provides the fixture-based forecast instead. The filename is not a verified publication timestamp, and the local model is not historically calibrated. Undated caller-created scenarios without an identified external import retain their explicit means. The planner emits a provenance warning when it excludes an import. A scheduled blank always scores zero. The sampler receives the same mean used for planning. Fixture-component sampling is retained when means agree; imported overrides use the existing aggregate sampler. Historical calibration is not claimed.

A bounded beam retains six states per week. Each state carries the permanent squad, selling-price basis, bank, free transfers, played chips and the complete weekly ledger. It compares shortlisted 0/1/2-transfer actions and full WC/FH rebuilds. Funding downgrades are included in coupled candidate pairs. Full rebuilds are greedy with local XI/captain refinement, not MILP or an exact global optimum. Locked players remain held.

The search scores sum(decay^offset * (XI + captain bonus + chip bonus - hits)). Displayed expected totals and Monte Carlo outcomes are undiscounted. Remaining chip option values help preserve future BB/TC windows during pruning. A one-step marginal FT option term now also compares the same legally shortlisted future transfers with the actual banked FT count and one fewer FT, measuring only the hit cost the additional FT could save (0–4 points). This term affects beam pruning only; it is not extra forecast xPts, a terminal FT bonus, or an additive Monte Carlo outcome. It is zero if the next week has no feasible beneficial transfer, when a committed WC/FH removes hits, or after the season. The displayed marginal FT figure applies one week of decay and is a diagnostic rather than calibrated expected value. Chip choices are compared jointly so WC ownership changes affect later BB decisions and one-chip-per-week conflicts are resolved. Search covers the remaining half-season plus any selected horizon crossing the half boundary. Uncertain future fixtures, prices and injuries are not invented.

No-chip alternatives constrain the first week to roll/one/two moves and then replan sequentially. When chip history is verified and the joint plan nominates a chip for the active half, P0-A05 explicitly compares two complete bounded-search continuations: **play that chip in the current GW** versus **forbid only that chip this GW and allow it later**. Other chips and legal transfers remain available in both; each path carries its own FT rollover, hits, bank, squad ownership and one-chip-per-week constraints. Compare the full discounted planning scores (chip-now minus defer) while separately showing undiscounted model xPts. A play-now path may replace the original beam winner if its evaluated score is higher. The comparison is omitted when no chip is nominated, official history is unknown, or a saved manual plan is active (manual commitments remain authoritative). The counterfactual is not a globally exact optimum, and its score gain must not be added to Monte Carlo totals.  The joint chip result is compared with the best no-chip state, which remains a candidate. Search heuristics can miss better solutions; outputs require re-evaluation before the deadline.

## P0-A06: opt-in independent no-chip MILP comparison

The live Team Planner links to an additional explicit "Exact-formulation transfer comparison" inside Chip Strategy. It submits the same verified per-GW VORTEX xPts from the planner worker, along with the current 15-player squad, bank, price basis, locks, and chosen 1–10-GW horizon, to a bounded Node-to-Python subprocess invoking the existing SciPy/HiGHS MILP. It does **not** automatically replace the saved manual scenario, chip strategy, or Monte Carlo pathways. The exact solver is unavailable while a saved plan or unsaved transfers are active, or if the normalized snapshot is marked stale.

"Exact formulation" does not mean a globally certified optimum: the MILP covers an explicitly shortlisted candidate pool (up to 60 players) and is limited to ten seconds and two normal transfers per gameweek. Displayed solver status, MIP gap and "optimality proven" flag distinguish certified solutions from feasible but unproven plans. The root app's chip-aware model remains a six-state heuristic; MILP has **no chip logic** and cannot support selling and later rebuying an original player. Future transfer prices, xMins, future availability and autosub outcomes are not invented. Unknown minutes and future availability are passed as `null` and are not used by the no-chip objective. The model uses the same freshness-gated VORTEX xPts; improved optimization does not validate those forecasts.

Production safeguards: max 60 submitted candidates, 120 KB bounded JSON, strict Python schema, maximum one simultaneous job, three HTTP requests per minute per IP, ten-second model time limit plus subprocess kill timeout, and read-only no-cache responses. Docker includes a local SciPy environment; there is no paid provider dependency. Server errors must return an unavailable status rather than substituting heuristic outputs as if MILP had run.

## P0-A07: validated alternative transfer paths and user-controlled acceptance

The opt-in no-chip HiGHS service now requests **up to three distinct legal full-horizon transfer sequences** within the **same ten-second** bound. No-good cuts exclude a previously returned purchase sequence. This is not a guarantee of three paths, nor proof that any later feasible alternative is the global second or third best solution. Each path has an individual solver status, MIP gap and explicit optimality indicator. The active root Planner ranks returned candidates by the full discounted objective and separately displays cumulative undiscounted xPts after hits, the change from the highest objective, total hit points, transfers, remaining bank, and free transfers. Per-week disclosures include incoming/outgoing player names, captain, XI, bench, prices implicitly through the verified bank ledger, and GW xPts.

**Independent client replay must pass before showing or accepting proposals:** 15 unique squad owners, position quotas, max-three-per-club, exact squad transition, valid eleven and captain/vice, locked/excluded players, no initially owned player re-buy, real FT rollover, hit cost, tenths bank accounting, model xPts matching, aggregated discounted and undiscounted points, unique transfer sequences, and solver certificate format. Invalid/incomplete paths fail closed rather than being silently trusted.

To save a candidate, the user must first inspect it, choose **Review and prepare NEW Transfer Lab plan**, then press **Confirm: save as NEW plan**. The new plan stores transfers, lineup, captaincy, base squad/FT, bank, verified player selling price basis, and locks. It never overwrites existing saved plans or acts on the official FPL site. The proposal is cancelled when live data, manual commitments, locks, squads, budgets, or planning assumptions change. Existing ten-slot storage limit applies; a full store rejects creation.

The exact-transfer engine remains **no chips**, with fixed future prices, a shortlist, and no guarantee of a certified optimum within the time bound. Additional paths may all be close variations; diversity/risk-profile optimization and exact chip scheduling remain future work. The mathematical gains are model projections rather than guaranteed returns.

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

