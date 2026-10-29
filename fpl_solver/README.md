# FPL VORTEX transfer solver — first stage

This is a **standalone, no-chip** multi-gameweek MILP service. It is not connected to the current website or its Render deployment. It receives projections; it does not create them. Recommendations are estimates, not guarantees. A better optimizer cannot make poor or stale xPts reliable.

## Run

From the repository root, with Python 3.12 (also tested locally on 3.11):

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r fpl_solver/requirements.txt
python -m pytest -q fpl_solver/tests
python -m fpl_solver.examples.run_example
uvicorn fpl_solver.api.main:app --host 0.0.0.0 --port 8000
```

In another terminal: `curl -X POST http://localhost:8000/solver/solve -H 'Content-Type: application/json' --data-binary @fpl_solver/examples/sample_input.json`. The 30-player, five-GW example is synthetic and not a live forecast. The API is intended for trusted local use until authentication, resource limits, deployment and production integration are designed.

## What it does

HiGHS via SciPy optimizes legal squad transitions over 1–10 GWs, starting from the supplied current team state. It enforces 15 players, 2/5/5/3 position quotas, at most three per club, a valid XI, one captain, bank, transfer cap, hit limit, free-transfer rollover, optional locks, exclusions and forced transfers. It can provide up to three different transfer paths via no-good cuts. Vice-captain and bench order are chosen after optimization by xPts; no autosub or captain-absence value is included in the objective. Blank starters can be disallowed explicitly, but default to allowed so that unusual blank gameweeks remain feasible.

The objective maximizes discounted XI plus captain xPts minus hits, with optional terminal free-transfer and bank values. `raw_expected_points_after_hits` is the undiscounted sum, while `evaluation_score` includes discounting and strategic values. Values are not actual future points. Player xPts must already account for minutes and availability. Official FDR does not enter the solver.

Each result reports HiGHS status, MIP gap and whether optimality was proven. A time limit can return a feasible but unproven plan, or no plan; infeasibility returns an empty plans list with the solver's status, not invented results. Alternatives differ by transfer path and are not guaranteed to be strategically diverse. Total solve time is shared among alternatives.

## Constraints and limitations

- Current prices remain fixed; initial owned players use their supplied selling price (otherwise current price). To avoid incorrect sale-price calculations, **players in the initial squad cannot be re-bought after being sold**. New purchases can be sold/re-bought at fixed current price. No future price projections, purchase-price history, or full FPL sell-price accounting yet.
- Availability and xMins are validated input information but do not independently alter the supplied xPts. Blank GWs require zero xPts and minutes; doubles should already be combined in xPts. Missing inputs are rejected.
- The current team state must correspond to the start GW. No chip functionality, probabilistic autosubs, sensitivity, risk profiles, persisted plans, projected prices, or live FPL ingestion yet. Unsupported request fields are rejected instead of silently ignored. TC, Bench Boost, Wildcard, then Free Hit should be added and tested separately.
- Free transfers roll over with a cap of five: `min(5, max(0, FT - transfers) + 1)`. Transfer hits cost four points each. These values are currently fixed for this first step, not a configurable season rules engine.
- `/solver/solve` and `/health` are the only endpoints. A result's no-chip objective and price limitations mean it should not be represented as an exact reproduction of any third-party solver.
