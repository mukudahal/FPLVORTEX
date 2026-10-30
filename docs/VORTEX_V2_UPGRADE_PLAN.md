# FPL VORTEX — V2 Repository Audit & Upgrade Execution Plan

Audit date: 2026-10-30
Baseline main SHA: 93b1c1d785a8b4c73534ca19b1eb91c1db68d4e5
Backup branch: backup/pre-v2-upgrade-2026-10-30
Upgrade branch: upgrade/vortex-10gw-v2
Scope: documentation only — no deployment, deletion, database migration, or secret modification.

## Required final product

A responsive, dark/light, data-first FPL VORTEX 10-Gameweek decision workspace: manual planning, automatic constraint-aware transfers/captaincy/chips, paired Monte Carlo simulations, authenticated saved scenarios, all-player stats, separate VORTEX Attack/Defence FDR, source-attributed market odds, live availability, concise Guide/Methodology and a protected administrator DATA area. The interface must be compact and visually clean. Do not fabricate observations, odds, EO, forecast confidence or calibration results.

## Audited repository baseline and architectural findings

1. Three application trees coexist: root Vite/React + Express (src/, server/, tests/); Next.js 16.2.6 + Drizzle/PostgreSQL (1_APP_dashboard/); and lighter model-lab preview (site/). START_HERE.md calls Next.js canonical, but root README and the active root CI describe a separate deployed Vite app. Resolve authority before migrating or deleting files.
2. On main SHA 93b1c1d, GitHub Actions CI run 41086671032 passed TypeScript checks, unit/model tests, production build, Python solver and browser planner checks. This does not validate the separate Next.js app or forecast accuracy.
3. Root apps already include CommandCenter, PlayerLab, FixtureMatrix, SquadBuilder and TransferPlanModal; model modules compassPlanner, planEngine, monteCarlo, xpts, scoring, seasonRules, scoreDistribution; an Express server; a Python solver; test coverage; assets, backups and historic research data. Preserve and test rather than discard.
4. Existing compassPlanner supports up to a 10-GW horizon, while primary SquadBuilder defaults to 5 GWs. Beam search is a bounded heuristic, not a guaranteed global optimum. The Python fpl_solver/solver.py explicitly handles no-chip MILP; it is not the complete chip optimizer.
5. The current displayed Attack/Defence indices in src/lib/fixtureForecast.ts are fixed provisional mappings with four fill bands, not calibrated historical reference FDR. A frozen reference helper exists in src/lib/repoModel/fdrReference.ts, but is not connected to the visible matrix.
6. Player expected points in src/lib/repoModel/xpts.ts use fallback priors and fixed heuristic blends. An auditable component-based model exists but requires chronological historical as-of validation and better conditional minutes, team-event and penalty modeling.
7. Odds adapters and de-vigging exist in server/odds.ts and src/lib/oddsMath.ts. A coherent score distribution exists in scoreDistribution.ts. Betting quote age, current coverage, rights, uncertainty and trained market blend weights remain to verify. No market quotes for far-future weeks may be invented.
8. Transfer plan slots in src/lib/transferPlansStore.ts are browser-local. Root server/index.ts saved-team endpoints return empty arrays; there is no verified protected admin DATA route or fully authenticated per-user scenario persistence in the root app.
9. Public static snapshot and /api/vortex/snapshot reveal presented analytics. A protected admin tab alone does not secure data accessible through public APIs. Protect secrets, control operations, private scenarios and raw restricted feeds server-side.
10. Root src/styles.css is roughly 366 KB and CommandCenter.tsx and TransferPlanModal.tsx exceed 2,000 lines each. Split gradually behind tests; preserve the current visual identity.
11. README describes an existing Render public site. The Next.js upgrade documents explicitly list staging/database/production blockers. The active root CI cannot be represented as a verified Next.js release.
12. Main branch protection was not enabled at audit time. Open PR #45 (mobile), #43 (4K PNG) and alternative design PRs #1/#2 must be reconciled before changes to those same surfaces. No PR was merged in this audit.

## Recommended architecture decision

- Keep the proven Vite/Express app deployed and functioning while migration is prepared; do not delete or interrupt it.
- Preferred destination for the user-requested architecture is Next.js App Router + TypeScript + Tailwind + shadcn/ui hosted on Vercel. The existing 1_APP_dashboard implementation is a candidate, not proven as the production replacement.
- Investigate the existing Drizzle custom-auth PostgreSQL schema before choosing a Supabase migration plan. Supabase Auth and Row Level Security should protect saved scenarios and administrator DATA functions.
- Centralize framework-agnostic FPL rules, xPts, FDR, transfers and simulation in one canonical versioned domain library, with root/Next parity tests.
- Move expensive simulations and optimization jobs to an asynchronous isolated worker with progress, retry, cancellation and audited results.
- Use side-by-side deployment and acceptance parity. Only cut over after staging is proven and the owner explicitly authorizes production release.

## Ordered implementation stages and acceptance gates

| Stage | Work | Depends on | Completion gate |
|---|---|---|---|
| 00 | Baseline and restore checkpoints, audit and architecture decision | None | Known SHA and rollback; no production edits |
| 01 | Compare root and Next builds/tests, CI workflows and open PRs | 00 | Candidate builds run, failing checks documented |
| 02 | PRODUCT.md, DESIGN.md, UX-CONTRACT.md, architecture ADR, typed source contracts | 00 | Single canonical owner per business/data/UI capability |
| 03 | Dark/light responsive shell and compact 10-GW home workspace | 01–02 | Keyboard, contrast, mobile 320–1920 px and no overflow |
| 04 | Verified FPL adapters, historical as-of snapshots, freshness/provenance APIs | 01–02 | Failures cannot fabricate data; stale state shown |
| 05 | User identity, Supabase migration, saved plans, role-based DATA access | 02,04 | Server auth, cross-user isolation and RLS pass |
| 06 | Canonical FPL scoring, rules, banked transfers, selling price and chips | 01–02 | Season rule regression and root/Next math parity |
| 07 | Team match-goal model, coherent score distributions and licensed market feeds | 04,06 | Valid W/D/L, CS, goals sums, quote provenance and fallback |
| 08 | Frozen 1.0–5.0 Attack/Defence FDR mapping + five-anchor color scale | 07 | Out-of-sample reference, GW+10 and blank/DGW correctness |
| 09 | Conditional player minutes, event-based xPts, trained shrinkage + diagnostics | 04,06–08 | Component reconciliation, no double-counting, backtest |
| 10 | Manual 10-GW planner, saved scenarios, revisions, locks and weekly review | 03,05–06,09 | Legal transfers/XI/chips, save/reload/undo and permissions |
| 11 | Auto transfer, captaincy and chip planning; explainable alternatives | 06,09–10 | Legal plans; same benchmark and forecast inputs |
| 12 | Paired Monte Carlo simulation; async worker, cancellation, Plan A/B compare | 06,09–11 | Reproducible draws, legal scoring and responsive UX |
| 13 | Players, Fixtures, Market, News, compact Guide and protected DATA console | 03–12 | Valid navigation, sources, accessible tables and security |
| 14 | Full QA: model calibration, CI, E2E, accessibility, performance and security | 04–13 | No blocker bugs, calibrated claims only, tested rollback |
| 15 | Vercel staging, DB rehearsals, production checklist and release approval | 14 | Staging feature parity then owner-approved promotion |

## Release-sized pull requests

PR-A architecture and CI; PR-B UI shell; PR-C ingestion and provenance; PR-D authentication/data isolation; PR-E scoring/team/FDR/xPts (split into small model PRs); PR-F manual planner and scenarios; PR-G optimizer; PR-H Monte Carlo; PR-I supporting pages and DATA admin; PR-J staging and hardening.

No pull request should merge with failed CI. Avoid large blind rewrites, unreviewed deletion, live DB migrations, public visibility changes and production deployment until approved.

## Critical acceptance scenarios

- Dynamic active/planning GW and deadline, blanks, doubles, postponements, daylight saving.
- Valid 15-player formation, clubs, budget, current selling price, 0–5 FTs, chip availability and half-season expiry, Free Hit reversion, correct points hits.
- Player score components reconcile and reflect minute thresholds, position scoring, goalkeeper saves, defensive thresholds, bonus, card conventions.
- Fixture distribution nonnegative and near unit mass; wins/draws/losses sum to one; full-score events agree with displayed projected goals/clean-sheet.
- VORTEX FDR uses versioned historical reference, remains stable against unrelated fixture changes and does not conflate home/away, Attack/Defence, blanks or DGWs.
- All 10 weeks use consistent archived snapshots; historical tests exclude information available only after each deadline.
- Odds missing or stale are clearly unavailable, not replaced with a falsely named market value.
- Saved plans and DATA operations are denied for guests, other users and nonadmins at the API and database levels.
- 320/375/390/414/768/1024/1440/1920 px, keyboard/focus, dark/light themes, reduced-motion and no horizontal text clipping.
- Production-like DB, scheduled-worker and browser tests plus deployment rollback rehearsal.

## External blockers / decisions to validate

- Verify data and media licensing (club crests, player photos, market odds); provider availability and quota.
- Select and configure appropriate Render workspace and Vercel project before touching deployments.
- Prepare a separate Supabase staging database and migration rehearsal; do not treat custom legacy auth as already integrated.
- A password proposed in chat is not suitable for production. Rotate it and configure private admin authentication with a fresh secret and preferably MFA.
- Backtest historical pre-deadline forecasts before claiming validated superiority, precise effective ownership or accurate 10-GW prediction distributions.

**First executable engineering milestone:** complete cross-app CI and a written architecture decision, then establish a Next.js staging vertical slice before transferring live traffic.
