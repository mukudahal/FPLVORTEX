# Replica Recon — independent FPL analytics product

Audit date: 2026-10-17; target for functional reconnaissance: https://fplreview.com/ and publicly indexed docs. **Public/documentation audit only.** No authenticated planner session, private endpoints, performance traces, or complete sitemap were accessed. Names/screens below include inferred groupings for the proposed product, not claims about exact competitor routes.

## Functional findings (observed in public sources)

| Domain | Evidence | Rebuild requirement |
|---|---|---|
| Projections | Homepage and Massive Data Model docs describe expected-points projection horizons, frequent refresh, player availability, minutes, team strength and contextual modeling. | Independent model with versioned per-player/per-fixture distributions and measured calibration. |
| Player assumptions | xMins docs describe per-player and fixture-level expected-minutes overrides; availability and penalties are user-editable. | Editable inputs with provenance and immediate recomputation. |
| Squad manager | XI selection docs cover pitch view, auto XI, captaincy, vice, and bench order; autoselection considers autosubs. | Constraint-checked lineup editor with player headshots and conservative autosub expectations. |
| Transfer strategy | Solver docs cover multi-GW transfers, FT opportunity cost, time decay, manual constraints, chips, two algorithm families. | Transparent multiweek search and scenario comparison with rules versioning. |
| Uncertainty | Sensitivity analysis and binary-fixture docs support robustness and uncertain fixture scenarios. | Scenario weights, stochastic minutes/fixtures, decision stability. |
| Fixtures | Fixture-editing docs specify user-controlled probability of a fixture being played in a GW. | Filled FDR fixture matrix with probability overrides. |
| Drafts | Draft management docs describe multiple named draft alternatives and carry-forward analysis. | Persisted, versioned unlimited-by-design scenarios (subject to rate limits/storage). |
| Comparison | Review/elite docs discuss manager decisions, effective ownership, season EV, xG and variance. | User analytics and *independently defined* consent-/licensing-compliant cohorts. |
| Data I/O | Projection upload/export docs describe per-player GW EV/xMin dataset exchange. | Versioned CSV import validation, preview, export and user-created model blend. |
| FPL team sync | User-settings and sync docs describe manager-ID loads; sync notes that private current-team data has changed. | Manager-ID import only for accessible data; never falsely show current private squad. |

## Proposed original navigation (rename intentionally)
1. **Overview** (`/overview`): deadline countdown, team health, data freshness, urgent decisions.
2. **My Squad** (`/squad`): 15 player-headshot pitch, bench, captain, and price/bank/FT accounting.
3. **Player Lab** (`/players`): projected points, minutes, price and selectable evidence sources.
4. **Fixture Radar** (`/fixtures`): 1–5 filled FDR color tiles, blank/double GW probability and home/away.
5. **Transfer Studio** (`/transfers`): multi-GW strategies, sale value, free-transfer rolling and alternative moves.
6. **Captaincy Lab** (`/captains`): captain/vice EV, ownership, risk and differential scenarios.
7. **Strategy Lab** (`/strategies`): draft compare, chips, wildcard/free-hit simulation, stability checks.
8. **Season Insights** (`/season`): actual vs deadline-locked projected points, xG and variance.
9. **Data Studio** (`/data`): assumptions, projections, source freshness, CSV import/export and methodology.
10. **Preferences** (`/settings`): manager ID, notifications, privacy, data source disclosures.

Do **not** reproduce the original site labels, wording, logos, copy, screenshots, CSS, branding or proprietary prediction weights. These are original information architecture proposals.

## Screen map
S01 Landing: differentiating overview, no proprietary branding or pricing copy.
S02 Overview: summary widgets, warnings, explanation of freshness.
S03 Squad: formation, 15 headshots, captain/vice and bench order, edit mode.
S04 Player Lab: all players table, filters, model numbers and per-player detail.
S05 Player Detail: headshot (licensed), fixtures, availability, xMins distribution, role and evidence.
S06 Fixture Radar: fixture table with strong FDR fills and probabilities.
S07 Transfer Studio: add/remove players, FTs, bank, hits, future gameweeks.
S08 Solver Results: candidate decisions, EV lift, robust-score, computation provenance.
S09 Strategy Lab: saved draft carousel/comparison, chip trajectories.
S10 Captaincy Lab: captain/vice, ownership and risk.
S11 Season Insights: backtested/model-frozen retrospective and real outcomes.
S12 Data Studio: source catalog, model freshness, custom CSV, overrides, exports.
S13 Preferences: manager identity, consent, watchlist and alert policy.
S14 Data Admin (private): ingestions, model runs, reconciliation, access/licensing audit.
S15 Responsive mobile equivalents: mobile navigation, bottom drawer, accessible list alternatives to drag/drop.

## Flow map
F01 Open without manager ID -> browse public permitted forecasts -> inspect a player.
F02 Enter manager ID -> verify public availability -> import last accessible squad -> review freshness.
F03 Select XV/bench/captain -> verify formation and current GW rules -> calculate expected team points.
F04 Compare two players -> xPts/expected minutes/FDR/price -> select candidate.
F05 Create scenario -> future transfers -> score constraints -> compare EV/variance/FT bank.
F06 Run solver -> enforce rules/budget/manual locks -> review candidate paths -> save a plan.
F07 Choose chip -> simulate timing alternatives -> compare results.
F08 User enters assumption override -> re-run projection -> explain change and timestamp.
F09 Deadline arrives -> snapshot projections and submitted-state boundary -> season review backtest.
F10 New licensed data -> import -> validate -> regenerate forecasts -> refresh dependent insights -> alert on material changes.
F11 Export forecast CSV -> reimport user projection model -> verify shape -> recompute scenarios.

## UX/design constraints (user-directed)
- White page background; premium airy cards, dense analytical information without visual clutter.
- Headings green + blue accents, body text near-black; no dark-mode-first styling.
- Real identifiable player headshots **only when appropriately licensed**; never jersey-only representations. Fallback is a neutral typographic avatar, not a jersey or scraped photo.
- FDR always color-filled, with a number/text label and accessible contrast; colors alone never convey difficulty.
- No Patreon branding, vendor membership panels, or third-party paywall affordances in proposed app. Monetization not part of initial scope.
- Original tab names and iconography; no cloned visual assets.

## Assumptions and unknowns
- The desired scope is a public web application, not iOS/Android native.
- A long-horizon model is a distinct, independently trained product; competitor's underlying Massive Data weights/dataset are unavailable and must **not** be copied or reverse engineered from private responses.
- The exact current rules for 2026/27 must be loaded from an approved source before the optimizer is certified.
- FPL current, not-yet-deadline team selection may be private. Do not use passwords, copied session cookies or hidden endpoints to access it.
- Authenticated layouts, workflows, price/ownership accuracy, and competitor solve timings remain unverified.

## Public source links
- https://fplreview.com/
- https://docs.fplreview.com/the-model/projections/massive-data-model/
- https://docs.fplreview.com/the-model/projections/xmins/
- https://docs.fplreview.com/the-model/planner-interface/xi-selection/
- https://docs.fplreview.com/the-model/planner-interface/editing-xmins/
- https://docs.fplreview.com/the-model/planner-interface/editing_fixtures/
- https://docs.fplreview.com/the-model/planner-interface/draft-management/
- https://docs.fplreview.com/the-model/planner-interface/sync_team/
- https://docs.fplreview.com/the-model/solvers/settings/
- https://docs.fplreview.com/the-model/solvers/solver-comparison/
- https://docs.fplreview.com/the-model/solvers/sensitivity-analysis/
- https://docs.fplreview.com/the-model/solvers/binary-fixtures/
- https://docs.fplreview.com/team-analysis/season-review/
- https://docs.fplreview.com/team-analysis/elite-1000/
- https://docs.fplreview.com/the-model/planner-interface/upload_projections/
- https://fantasy.premierleague.com/help/terms
- https://www.premierleague.com/en/terms-and-conditions