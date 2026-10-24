# FPL VORTEX — Implementation, test and release gates (Steps 17–61)

## Confirmed 2026/27 official rules

Sources (checked 23 Oct 2026):
- [PL 2026/27 chips](https://www.premierleague.com/en/news/4679879/whats-happening-with-fpl-chips-in-202627) — two sets of four chips, first-half expires by GW19 deadline, one chip per GW, no consecutive Free Hits.
- [PL rule changes](https://www.premierleague.com/en/news/4679873) — up to five rolled FTs; 2026/27 changes to data finalization/bonus.
- [FPL FAQ](https://fantasy.premierleague.com/help/faqs) — conditional restrictions and chip behavior.
- [PL team management](https://www.premierleague.com/en/news/2174899) — formation and 90-minute deadline.

## Implemented source-level features (not equivalent to production readiness)

- `src/lib/seasonRules.ts`: season-specific squad/transfer/chip validation with unique chip caps and FH adjacency checks.
- `src/server/forecastIdentity.ts`: immutable, canonical parameter fingerprint and repeatable run ID.
- `src/lib/forecastScience.ts`: frozen pre-deadline training record filter, opt-in ridge calibration, appearance heuristic, fixture uncertainty and validation metrics. No claim of a live trained model without historical snapshots.
- `src/lib/monteCarlo.ts`: chip-aware score draw (BB, TC) with bounded input validation; existing paired draw engine retained.
- `src/lib/strategyEngine.ts`: side-effect-free swap legality, integer-tenth bank accounting, FH rollback, bounded multigameweek beam search and legal chip timetable.
- `src/lib/marketLeague.ts`: index-only price momentum, normalized injury bulletins, public league comparison, sampled and denominator-labeled EO, risk exposure, budget-constrained must-own candidates and captain rankings.
- `/review`, `/leagues`, `/threats`, `/captaincy`, `/predictions`, `/market`, `/injuries`, and five primary `/planner` subtabs. Buttons, navigation, manager selection, model data and error states work at source level. **Browser builds/QA have not been verified here**.
- `/api/reports/<id>/<gw>` is an observed, non-retrospectively-recalculated report JSON feed; `png` yields an original 4K cover.
- `scripts/reporting/render_report.py` exports three 4K PNG slides, PPTX and PDF from the same report contract; `/reports` supports print-to-PDF.
- Opt-in report archive schedule using `report_schedules` and a worker, using IANA America/New_York 05:30 and 17:20 defaults; no email/social publication.
- Model-health diagnostics clearly label insufficient calibration and absent live validation.

## Hard release blockers (DO NOT claim these are done until independently verified)

1. Clean `npm ci`, typecheck, lint, and `next build` in CI; no successful complete build is available from this environment.
2. PostgreSQL migration 0008 apply/rollback, ownership-isolation integration tests, and queue/cron/worker stress tests using a separate staging DB.
3. Replay representative historical GW data, freeze forecasts before deadlines, evaluate cross-week and cross-season calibration and establish statistical accuracy and drift thresholds. Current site is **a research-grade heuristic**, not certified FPLReview-equivalent.
4. Improve user-specific ownership/rivals EO beyond currently public standings, obtain legally permitted historical snapshots, price targets and Opta commercial licenses where necessary.
5. Multi-period optimizer needs an end-to-end online integration with approved solver run results, chip opportunity-cost modelling, and 2026/27 rules across all GW1–GW38 edge cases.
6. Secure production secrets, Google/Apple auth if desired, email account verification provider, distributed quota abuse testing and a privacy/terms review before public release.
7. Complete keyboard + 390px/1440px browser tests, visual regression and meaningful web performance baselines.
8. Connect durable report output storage/delivery channel before promising emailed/published reports. Current schedule only archives report JSON.
9. Premium subscriptions need Stripe test-mode integration, server-side entitlements, checkout, webhook idempotency, cancellation and billing QA; no payment flow has been activated.
10. Vercel deployment requires selecting the real linked project, staging environment, database credentials and explicit release approval. This ZIP does **not** represent a deployed website.

## QA commands

```
npm ci
npm run db:migrate:dry-run
npm run test:planning
npm run typecheck
npm run lint
npm run build
FPL_STAGING_BASE_URL=https://YOUR-STAGING-ORIGIN npm run test:smoke
```

Treat only freshly observed passes as proof. The `PROGRESS.csv` ledger uses `DONE_WITH_BLOCKER` for fully authored but unverified source work and `IN_PROGRESS` for partial implementation. These statuses are deliberately not synonymous with deployed functionality.
