# Manual five-gameweek My Team plan

The canonical root app already contains a multi-week, chip-aware beam search in
`src/lib/repoModel/compassPlanner.ts`. This export reuses it instead of creating
another forecasting engine or changing the running website. It emits Markdown and JSON. The optional manual graphics renderer consumes the same report and does not recompute forecasts. No posting, FPL account writes, or deployment.

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
- The personal report tests shortlisted batches of up to three normal transfers.
  Its bounded beam may recommend a hit when the discounted objective prefers it. This is not an optimality certificate or guarantee.
  Compare the no-transfer baseline, inspect the hit, and reject uncertain moves.
- Recompute every deadline rather than committing five weeks' transfers in
  advance. First fix availability, then optimize starting XI, maintain banked
  FTs, preserve chip flexibility for fixture swings, and check price changes.

A manual export requests a refreshed deployment snapshot. When that response
is unavailable or fails the existing source-age checks, the exporter attempts
official bootstrap and fixtures directly through the repository's normal
validator. The source URL and SHA-256 of the normalized snapshot are recorded.
The manager entry must still be current and officially verified. A temporary
public Free Hit squad requires a confirmed restored state. Unsupported seasons
require a verified season rules update before planning.

Public finances are cross-checked against official deadline picks, acquisition
history and the permanent transfer ledger. A Free Hit transfer is excluded
from the permanent purchase basis. When the opening holdings cannot be
reconciled, provide a current manager-confirmed state. All official information
still reflects published deadlines.

The report writes the recommendation and input snapshot to an immutable local
archive under `reports/my-team/accountability/`. Set
`VORTEX_RECOMMENDATION_ARCHIVE` for a durable private location. The default
Actions download includes recommendation records and the text reports. Keep
the private output out of the application’s public directory.

After finalisation, settle an archived recommendation against official points,
participation, substitutions and manager decisions:

```sh
node --import tsx scripts/settle-my-team-plan.ts path/to/recommendation.json.gz path/to/private-settlements
```

Weekly settlement and 1/3/5-week cumulative results are written separately
from the original recommendation. Run the command again as subsequent weeks
finish. The default workflow remains manual and text-only. Enable
`render_graphics` explicitly to run the separate renderer.

## Reference-style graphical outputs

After generating plan.json, install Chromium and run:

```sh
npx playwright install --with-deps chromium
node --import tsx scripts/render-my-team-boards.ts reports/my-team/plan.json reports/my-team/graphics
```

For every available GW, separate 1920×1080 pitch and 15-player analysis PNG/HTML files are named FPL_VORTEX_GWxx_pitch and FPL_VORTEX_GWxx_analysis. The official FPL player code and club code are persisted in the same frozen plan. The renderer requests only official Premier League PNG endpoints; no shirt is represented as a player portrait. Missing images are visibly labeled and fail the publication-ready gate. image-provenance.json records actual image sources. The graphic design follows the user's angular cyan/blue reference, with original lion asset and social footer; no schedules, dashboard renderer or existing publication workflows are changed. No automatic publication.

## Goalkeeper transfers

Normal personal-plan transfers preserve both goalkeeper slots by default. An
injury flag with some chance of playing calls for a team-news check. The plan
considers replacing the primary when official availability rules him out and
the reserve does not have a regular available starting role. Candidates must
have started at least 80% of at least five completed matches for their club
and clear the existing availability eligibility checks. Five matches and
80% are conservative decision rules. They are not estimates of future start
probability. Club exposure uses completed fixtures. Review a new signing or
a recent first-choice change with a shorter history before acting.

The rule keeps a replacement through the remaining transfer forecast.
The reserve remains available for lineup selection. This policy applies
to normal personal-plan transfers. Existing chip rebuilds retain their own
rules. The planner reports the underlying points forecasts separately from
the constraint. Injured-player recovery is not imputed from club news.

## Opponent difficulty and expected points

The personal report flags Arsenal, Liverpool and Manchester City as hard
opponents at either venue. It lists the top three alternative team matchups
for scoring goals and for clean sheets separately each week. The lists use
the existing team's goal-rate forecasts and account for venue. The separate
goalkeeper table exposes five-week projections before accounting for sales,
budget or transfers.

| Score archive | Arsenal GF / GA | Manchester City GF / GA | Liverpool GF / GA |
|---|---:|---:|---:|
| 2024/25, 38 matches per club | 69 / 34 | 72 / 44 | 86 / 41 |
| 2025/26, 38 matches per club | 71 / 27 | 77 / 35 | 63 / 53 |
| 2026/27 through GW11, 11 matches per club | 17 / 7 | 22 / 14 | 18 / 10 |

Source: `data/fpl-match-history/`. Manchester City ranked second for goals
scored in the current sample and ninth for fewest goals conceded. Arsenal
ranked first for fewest conceded and seventh for goals scored. Liverpool
ranked fifth and fourth respectively. These observations justify a caution
label and role-specific comparison. A uniform points penalty still needs
out-of-sample evidence. Official FDR and forecast equations remain intact.

A projected improvement versus holding measures the manager's alternatives.
It does not estimate the cutline for top 10,000 or whether the next arrow is
green. Ranking probabilities need contemporaneous field ownership,
captaincy, scores and calibrated outcome distributions.

## Rank context, team news and horizons

Optional `VORTEX_PLAN_CONTEXT=/private/context.json` supplies evidence while
keeping normal public-manager reconciliation. The default horizon is five
weeks. Set `horizon` from one to eight to optimise a different window. The
report includes one-, two- and full-window totals from the chosen sequence.

```json
{
  "horizon": 8,
  "cohort": {
    "season": "2026/27", "gameweek": 11, "observedAt": "2026-11-25T12:00:00Z",
    "source": "https://example.com/gw11", "sampleSize": 1000,
    "cutoffPoints": 800,
    "players": [{ "id": 123, "ownership": 90, "effectiveOwnership": 170 }]
  },
  "teamNews": [{
    "playerId": 456, "throughGw": 13, "chance": 0, "status": "u",
    "observedAt": "2026-11-26T08:00:00Z", "source": "https://example.com/club-news"
  }]
}
```

All values above are examples. Supply independently acquired cohort data from
the latest completed GW using official player IDs. A partial cohort gives
partial starter coverage. Supply `cutoffPoints` only if you verified the
actual rank-10,000 points cutoff. Reported gaps align to the manager's
settled score for the same GW. The report never substitutes global ownership
for cohort ownership. Historical effective ownership is used to describe
exposure and identify differential candidates. It does not forecast rival
lineups, future cohorts, points prices or overall ranks.

Team-news records are time-limited, sourced manager inputs. The planner
reverts to official inputs after the last specified GW. Forecasts and
transfer availability both use the override while it applies. An automatic
goalkeeper replacement requires supported evidence that the primary misses
at least the next two gameweeks, plus the regular-start and coverage checks.

The personal planner rolls if a proposed opening move gains under 1.5 net
expected points over rolling and reoptimising. An opening hit requires a
4.5-point net edge on the same comparison, after the hit is already deducted.
These are manager decision thresholds. Chip plays and manual commitments
retain their own rules. Recommendations reflect the current fixture dates
and chip eligibility. Rerun after team news and each deadline.

The report compares the opening move and opening roll with common Monte Carlo draws.
The win, tie, loss and downside are points comparisons conditional on the model.
