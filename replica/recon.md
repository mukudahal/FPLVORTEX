# Planner reference map

Scope: improve the third planner/simulation tab and chip strategy in the root FPL VORTEX web app. Preserve its existing visual design and assets.

| Public source | Evidence |
| --- | --- |
| https://fplcompass.com/ | Team ID, horizon, xPts/simulations, transfer paths, decay settings, chip solver, individual chip choices |
| https://fantasy.premierleague.com/help/faqs | Two chip sets, expiry, one chip per GW, FH adjacency and transfer preservation |
| https://fantasy.premierleague.com/help/new | Current 2026/27 scoring update context |

S01: existing /#/optimizer pitch and fixture matrix; S02: existing advanced planner, chip and simulation tabs. States covered: unopened, pending worker, computed, unavailable history, invalid budget, worker failure, narrow screen.

F01: load a team or use an Auto-Build scenario; choose horizon/decay/FTs and locks.
F02: open advanced simulation; compare unchanged squad, sequential transfers and joint chips using paired draws.
F03: inspect chip diagnostics, the conflict-free schedule, captain/lineup and weekly bank/FT/hit ledger.

Data: manager picks and chip uses, player means/minutes and selling basis, fixtures by GW, permanent and Free Hit temporary squads, strategy ledgers and paired outcome summaries.

Publicly observed workflow patterns are rebuilt independently. Compass private code, APIs, prediction data, exact formulas and assets are outside scope. No claim of identical results, global optimality or guaranteed rank gains. See docs/PLANNER_SIMULATION.md for the implemented model and limits.
