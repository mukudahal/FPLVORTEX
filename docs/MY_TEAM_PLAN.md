# Manual five-gameweek My Team plan

The canonical root app already contains a multi-week, chip-aware beam search in
`src/lib/repoModel/compassPlanner.ts`. This export reuses it instead of creating
another forecasting engine or changing the running website. It emits Markdown
and JSON only. No image modules, posting, FPL account writes, or deployment.

## Run manually
From the root with Node 22:

```sh
npm ci
node --import tsx scripts/export-my-team-plan.ts 145784 reports/my-team
```

Or, after merging to the default branch, Actions → **My Team - five gameweek
plan** → **Run workflow**, enter the entry ID. Download the two text files from
the workflow artifact. This workflow has only workflow_dispatch. The existing
snapshot refresh, tests and other workflows are intentionally untouched.

The CLI GETs the existing deployment's normalized snapshot and official-backed
entry, rejecting stale snapshots, passed/inconsistent deadlines and non-official
entries. For a local trusted server set VORTEX_UPSTREAM_BASE to its URL.
The default is https://fplvortex.onrender.com. It does not request FPL credentials.

Public entry data cannot reliably expose unpublished transfers. Verify the
current squad, bank, effective selling prices, free transfers and chips in the
official game before acting. If there are discrepancies, optionally provide
a third CLI argument with your own confirmed JSON state (keep it private):

```json
{"squad":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],"bankTenths":6,"freeTransfers":2,"sellingPrices":{"1":45,"2":45},"chipsUsed":[]}
```

The example is schematic: supply all 15 actual player IDs and selling prices,
not just two. Prices and bank are integers in tenths of £m. Omit chipsUsed
if unknown; an empty list explicitly confirms no chips used this season.
A confirmed state is treated as the current pre-deadline state; committed hit
costs are not included, so the report compares only prospective decisions.

## Output and assumptions

- Five consecutive unpassed GWs, truncated only at GW38; the underlying
  chip search may examine later weeks in the current half before expiry.
- Before/after XV, permanent holdings after Free Hit, legal XI, captain,
  vice-captain, ordered bench, transfers, effective sale/buy price, budget,
  FT rollover, hit cost, projected weekly points and fixed-squad baseline.
- Transfer rationale shows individual projected differences across the
  remaining displayed horizon, fixture/FDR, season xGI, current form, local
  expected minutes, availability/news, net transfers and observed price movement.
  These differences are not causal estimates of a transfer's XI benefit.
- Chip candidates, expiry and selected timing (BB, TC, FH and WC). Unknown chip
  history disables chip advice. Free Hit squad/bank restore after its week.
- Future prices are fixed. No proprietary Opta or FPL Review feed is assumed.
  No invented future price predictions, blanks/doubles, rank predictions, or
  press conference confirmation. The current published schedule and model
  estimates are conditional; rerun when injuries or fixtures change.
- Existing model uses bounded beam search and may recommend a hit when its
  objective prefers it. This is not an optimality certificate or guarantee.
  Compare the no-transfer baseline, inspect the hit, and reject uncertain moves.
- Recompute every deadline rather than committing five weeks' transfers in
  advance. First fix availability, then optimize starting XI, maintain banked
  FTs, preserve chip flexibility for fixture swings, and check price changes.
