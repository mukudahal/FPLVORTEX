# P0-A09 · Joint transfers + scoring chips — mathematics foundation (stage 1)

**Not yet live.** This branch adds optional, explicitly verified Bench Boost / Triple Captain inventory to the **Python SciPy/HiGHS** solver and its tests. It does not modify the production website behavior, and the public Node → Python CLI deliberately refuses chip-enabled requests until the complete WC/FH transition model, source verification and user-facing checks are finished.

## Authoritative 2026/27 rules

The official FPL 2026/27 season grants one of each chip per season half (GW1–19, GW20–38), with no chip rollover between halves and at most one active chip in a Gameweek. Bench Boost scores the four non-XI players; Triple Captain gives one extra captain's xPts above the ordinary doubled captain. The first-half inventory expires at GW19. [Premier League July 2026](https://www.premierleague.com/en/news/4679879/whats-happening-with-fpl-chips-in-202627), [Official FPL FAQ](https://fantasy.premierleague.com/help/faqs).

**Never infer chip ownership from season rules.** The new Pydantic input `settings.scoring_chip_halves` is optional and defaults to `{}`. It may only be populated from a verified explicit entitlement/history source, e.g.
```json
{"bench_boost":[1],"triple_captain":[2]}
```
This means BB remains available for GW1–19 and TC for GW20–38, not that both chips are unused. Unverified history must remain `{}` and the result is exactly the legacy no-chip model.

## Mathematical formulation (small extensions to existing transfer MILP)

For each GW `t`, add at most one binary `chip_bb[t]` and `chip_tc[t]`; fix to zero outside the specifically supplied half-window. Enforce:
- `chip_bb[t] + chip_tc[t] <= 1` per GW.
- `sum(chip_bb[t] for GW in half) <= 1` and the same for TC, **only in the validated half**.
- For player `i`, `bench_bb[i,t] = chip_bb[t] AND (squad[i,t] - starter[i,t])`. Three integer linear inequalities encode the exact product.
- `tc_captain[i,t] = chip_tc[t] AND captain[i,t]` with three inequalities.

The minimization objective adds `-decay^t * xPts[i,t]` for each activated bench or extra captain multiplier, on top of all already active base XI/captain/transfer-hit/terminal-bank terms. BB and TC are therefore **jointly** optimized with the same transfer, budget, FT rollover, position/club and lineup variables; they are not independent heuristic post-processing bonuses.

The weekly points ledger independently reconstructs exact bonus amounts, full discounted model objective, bank, FT and hits. When enumerating up to three alternatives, no-good cuts include **both** transfers and chip schedules, so a different chip schedule is genuinely a different strategy even if transfer purchases match.

## Scope and safeguards

- This increment covers **BB and TC only**. The full P0-A09 milestone requires a mathematically correct Wildcard rebuild and one-week Free Hit squad/bank/cost-basis restoration, exact transfer rollover on WC/FH, chip inventory sourced from official game/account history, the GW19→20 Free Hit consecutive-week prohibition and an independent joint-path verifier and UI.
- Existing Python no-chip behavior remains the default. The public deployed `fpl_solver.cli` refuses nonempty `scoring_chip_halves`. No automatic FPL transfers, chip activations, price speculations or paid private data.
- A six-state VORTEX chip-aware heuristic is already deployed separately; the new Python scoring-chip formulation must **not** be presented as an all-chip exact optimization, and solver MIP-gap/time-limit caveats still apply.
- Tests cover unknown inventory (zero chip activations), BB/TC cap, one chip per GW, half boundary, exact payout accounting, illegal inventory and distinct chip schedules.

## Release gate

On this branch, require Python tests, TypeScript/unit/build, browser/PNG, Next.js parity, and optionally a Python-only HiGHS chip-schedule smoke test. The production Node/Python no-chip endpoint and Render remain unchanged. Do not merge this partial all-chip milestone as if it completed full P0-A09; review its integration and tests, then implement and audit WC/FH in a separate staged revision.
