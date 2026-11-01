# P0-A09 — Joint transfer and WC/FH/BB/TC MILP implementation

**Status:** Research integration branch; production website retains its prior no-chip
HiGHS comparator and independently deployed six-state chip heuristic.
The public no-chip API deliberately rejects all chip inventory.

## Verified FPL 2026/27 constraints

Official rules: one WC, FH, BB and TC per season half (GW1–19; GW20–38); chips
do not roll between halves; one chip per GW. WC/FH are unavailable in GW1,
and FH cannot be used in consecutive GWs, including GW19–20. WC and FH
preserve banked free transfers (do not award an additional one).

Sources: https://www.premierleague.com/en/news/4679879/whats-happening-with-fpl-chips-in-202627
and https://fantasy.premierleague.com/help/faqs.

A **current manager-specific official chip history** is required to populate
`scoring_chip_halves` and `squad_chip_halves`. Both default to empty;
unknown history means no chips are available to this exact MILP, not that all
chips are unused. A forced manager chip requires its corresponding verified
half inventory. GW20 FH is disallowed when the horizon starts at GW20 unless
GW19's FH status has been explicitly verified as *not used*. The FPL app
and independent saved plans are not modified by this solver.

## Joint optimization variables

For each Gameweek t and player i, the existing permanent-ownership `s[i,t]`,
normal buy/sell, original first-sale discount, bank, free transfers `z[t,f,k]`,
legal XI `l[i,t]` and captain `c[i,t]` remain.

New optional binary variables (allocated only when the relevant chip inventory
is supplied):
* `chip_wc[t]`, `chip_fh[t]`, `chip_bb[t]`, `chip_tc[t]`. Each is fixed
  to zero outside its authorized half; their sum <= 1 per GW. Chip use
  per half <= 1; adjacent FH use is prohibited, also across GW19→20.
* `h[i,t]` is the one-week *active* squad: h=s without FH, but may differ
  on a Free Hit. Both h and s separately satisfy 15 players, position quotas,
  max 3 per club, locks and exclusions; the XI is chosen from h.
* `fh_added[i,t]` is the exact linearization of FH AND h AND NOT s.
  An activated FH must change at least one player.
* `fh_discount[i,t]` linearizes a temporary sale of an initially held player
  whose first *permanent* sale has not yet happened, using the correct initial
  verified selling price.
* `chip_ft[t,f]` linearizes a WC/FH activated with f banked FTs.
  It cancels normal no-transfer +1 rollover so FT after chip == FT before.

WC weeks allow an arbitrary number of simultaneous permanent purchases and
sales, make them free of hits and retain existing banked FT. At least two
transfers are required to represent a confirmed rather than pending Wildcard.
FH weeks force **zero permanent moves** and use independent active-squad
variables with legal budget based on the permanent owners' real selling values.
Its temporary bank is constrained >= 0; permanent bank, original first-sale
discount flags and permanent squad are restored automatically next GW.

BB adds the four non-XI points from h, TC one additional copy of the
captain's xPts. The original hit-adjusted XI/captain objective, free-transfer
carry and fixed £0.1m pricing remain. No independent chip EV is added after
optimization. The output reports weekly chip, bonus, FT, hits, active and
permanent squads, temporary budget, lineup/captain and discounted objective.

## Internal fail-closed ledger validation

Each generated joint-chip path is translated to a GW action sequence and
**independently** replayed using `fpl_solver/chip_replay.py`. Every week's
squad, restored holdings, real selling/buy price, bank, FT, chip, hit cost,
bonus and expected points must agree within explicit rounding tolerances.
An inconsistent HiGHS incumbent raises an error instead of yielding a user
recommendation. This remains necessary even when the MILP solver returns
a "feasible" status, because solving a formulation and validating external
FPL rules are distinct guarantees.

The exact MILP is conditioned on its finite candidate shortlist and
fixed future prices. Time-limited / nonzero-gap feasible solutions are
**not** certified global optima. Bench auto-substitutions, uncertainty
calibration, future injuries, postponements and price moves are absent.

## Production integration still required before this draft can ship

1. Authenticate/verify the official manager-specific chip history,
   including pending/active chips, the previous GW19 FH event and squad
   selling prices. Never infer unused chips from season defaults.
2. Build a bounded read-only joint endpoint (separate from existing
   `/api/vortex/solver/exact`) with safe abuse limits and no mutation.
3. Build a TypeScript independent validator for *joint* outputs, consistent
   with the Python replay; show all chip timing, budgets and score provenance.
4. Add an explicit proposal review/save-new workflow; never overwrite
   already saved transfers or send any chip to official FPL.
5. Verify performance on a realistic candidate pool and up-to-10 GW horizon;
   if solver cannot obtain a valid incumbent in the time bound, disclose
   failure and keep the existing chip-aware heuristic unchanged.
6. Pass all GitHub CI gates and separately obtain permission for
   merging to `main` (which automatically deploys to Render).

The PR remains **draft** until these checks and the user-authorized release.

## 2026-11-01 P0-A09 realistic performance and staging follow-up

A new **synthetic, explicitly labeled** deterministic benchmark exercises real
SciPy/HiGHS on the 2026/27-style 10-GW/4-chip formulation, including original
sale-basis discounts and club/formation constraints. It makes no claims about
real player performances. The benchmark is reproducible via
`python -m fpl_solver.examples.benchmark_joint_horizon --candidates 30 --horizon 10`
or `--candidates 40`. CI retains JSON artifacts for both.

Measurements observed in GitHub CI #332:

| Workload | Runtime | HiGHS status | Gap | Full-MILP primal |
| --- | --- | --- | --- | --- |
| 30 players / 10 GWs | 4.753 s | 0 (target gap reached) | 0.8076% | yes |
| 40 players / 10 GWs | 10.034 s | 1 (time limit reached) | 10.7246% | yes |

A previous full 40-player run had **no primal** after 10.077 seconds. This is
an empirical time-budget bottleneck, not proof of mathematical infeasibility.
The production release criterion for the staged **30-player** 8–10 GW
request is a full HiGHS incumbent, status 0 and relative gap at or below
the configured 5%. CI explicitly records the 40-player outcome as a
stress diagnostic: it is NOT a passed long-horizon release criterion.

The stage request bridge now preserves the complete verified original 15
owners, selects positional replacement alternatives, and limits the complete
8–10 GW search to at most **30 total candidates**. Shorter horizons may use
up to 40. Both are **exact-formulation solutions conditional on the shortlist**,
not proofs across the entire Premier League player pool.

If HiGHS returns no primal at all, the research solver may return a
**separately and independently replay-verified fixed-original-squad baseline**
with 0 permanent moves, no WC/FH, legal XI/captain, and small exhaustive
BB/TC placement conditional on the fixed lineups. Output method is
`independent_verified_hold_scoring_fallback` with
`degraded_baseline_only=true` and
`full_milp_incumbent_found=false`, HiGHS status preserved, gap unknown and
optimality **FALSE**. The staging UI labels this as degraded and specifically
disclaims transfer/WC/FH optimization. The baseline cannot override
manager-forced transfers/chips. No fallback is returned if independent replay
rejects it. Never report this as full-joint HiGHS success.

P0-A09 browser/HTTP staging verification uses a **CI-local server only**:
the opt-in Vite client flag and isolated backend flag are enabled during CI;
the default-off production Docker image is checked for HTTP 503 from the
joint endpoint, and the opt-in server rejects invalid inputs with HTTP 422.
No production deployment or paid hosted staging service was created.

**Still unverified:** end-to-end joint proposal selection and saving against
a genuine current official FPL account and confirmed purchase/sale basis,
benchmarks with real-vs-synthetic projection distributions, and any Render
staging/production deployment. The connected Render workspace currently
has only its existing production service and disabled PR previews. This PR
must remain draft and must not be merged into autoDeploy main until these
gates are independently completed and production deployment approved.
