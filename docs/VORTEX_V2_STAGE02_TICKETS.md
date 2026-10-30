# FPL VORTEX V2 — Implementation tickets and repository order

**Status:** Stage 02 execution backlog. These tickets are not claims of completed production features.
**Production baseline:** Vite/Express on Render `fplvortex.onrender.com` commit `efe59675`. CI run `41109333620` passed.
**Delivery discipline:** One stage/vertical slice per reviewable PR, no silent changes to live DB or unrequested hosting services.

## Development tickets

| Ticket | Priority | Owner / repository path | Depends on | Exact acceptance test |
|---|---|---|---|---|
| V2-020 | P0 | `PRODUCT.md`, `UX-CONTRACT.md`, `DESIGN.md`, `docs/adr/0001-v2-runtime-migration.md` | Stage 01 | One canonical owner per runtime, rule, source and interaction; all business constraints documented, no production secrets |
| V2-021 | P0 | `src/lib/dataProvenance.ts`, `tests/data-provenance.test.ts` | V2-020 | Market quote age ≠ retrieval age; missing license never called live; news/source/model timestamps distinguish facts; valid dynamic 10-GW at season end |
| V2-030 | P0 | `src/App.tsx`, `src/hooks/useHashRoute.ts`, `src/styles.css`; Next mirror `1_APP_dashboard/src/app/` | V2-020–021 | Responsive 320,375,390,414,768,1024,1280,1440,1920; keyboard flow, theme persistence, no page overflow; no existing route regression |
| V2-031 | P0 | `src/components/{PlannerOverview,TransferPlanModal,SquadBuilder}.tsx` | V2-030 | Home opens next GW + ten-week strip, manual mode preserved, no xPts claims without source/version |
| V2-040 | P0 | `server/{fpl,normalize}.ts`, `src/hooks/useVortexData.ts`, `src/lib/dataProvenance.ts` | V2-021 | Official bootstrap/fixtures/player-summary snapshots valid; no timestamp interpolation; 429/timeout/stale/partial states covered |
| V2-041 | P0 | source snapshots DB/staging archives; server provenance endpoints | V2-040 | Historical as-of snapshots never use post-deadline knowledge; server returns source IDs and timestamps |
| V2-050 | P0 | Next auth/DB + new Supabase staging project/RLS | V2-020, V2-040 | Authenticated owner-only plan CRUD, cross-user 403/RLS denial; guest never lists private plans; migration rehearsal reversible |
| V2-051 | P0 | Protected admin DATA routes + server policies | V2-050 | Guest and nonadmin denied even by direct API calls; explicit scoped write privileges; no shared hardcoded password |
| V2-060 | P0 | `src/lib/repoModel/{scoring,seasonRules,planEngine}.ts` and shared domain module | V2-020 | Legal squad/formation, FT banking 0–5, hit costs, price basis, WC/FH/BB/TC half-season rules and root/Next parity tests |
| V2-070 | P0 | `server/odds.ts`, `src/lib/{oddsMath,repoModel/scoreDistribution}.ts` | V2-040, V2-060 | W/D/L sum to 1; CS/goals reflect same score distribution; bookmaker, quote time and permission recorded; statistical fallbacks separately labeled |
| V2-080 | P0 | `src/lib/{fixtureForecast,repoModel/fdrReference}.ts` | V2-041, V2-070 | Frozen historical reference 1.0–5.0, separate Attack/Defence, GW+10, H/A, blank/DGW tests, no provisional label removal without calibration |
| V2-090 | P0 | `src/lib/repoModel/{xpts,minutes,playerModel}.ts` | V2-041, V2-060–080 | Event components reconcile, minutes uncertainty, 60+ threshold and position scoring; chronological backtest; no leakage |
| V2-100 | P0 | `src/lib/transferPlansStore.ts`, `src/components/TransferPlanModal.tsx`, authenticated plan API | V2-030, V2-050, V2-060, V2-090 | Save/reopen/copy/revise/delete A/B plans, locks, undo, 10-week legal replay; never overwrite manual work |
| V2-110 | P0 | `src/lib/repoModel/compassPlanner.ts`, `fpl_solver/` | V2-060, V2-090, V2-100 | Feasible multiweek transfers and chips, selling prices and hold benchmark; distinguish bounded beam/heuristic from optimum |
| V2-120 | P0 | `src/lib/repoModel/monteCarlo.ts`, `src/workers/planner.worker.ts`, async infrastructure | V2-090–110 | Paired same-seed scenarios, P10/P90, gains/costs, progress/cancel/retry/stale-run resolution without freezing UI |
| V2-130 | P1 | Players / Fixtures / Market / News / Guide screens, source status | V2-030–120 | Search/sort, current player stats, data timestamps, verified availability, odds coverage, accessible legend and no nonfunctional controls |
| V2-140 | P0 | CI, browser, DB RLS and historical model QA | V2-030–130 | Mobile screenshots, a11y, perf p75, auth bypass, modeling and export regression PASS; no blocker defects |
| V2-150 | P0 | Staging deployment, release runbook and approved cutover | V2-140 | Stage/prod parity with rollback, DB migration rehearsal, explicit owner release authorization; leave Render functional until then |

## Dependency-critical implementation order

```
01 audit/backup  →  02 product, UX, architecture, source contracts
                        ↓
03 responsive app shell + 10-GW home → 04 ingestion/provenance
                        ↓                     ↓
05 Supabase staging/Auth/RLS/DATA ← 04 source contracts
                        ↓
06 scoring / FT / chips parity → 07 market / score distribution
                                      ↓
08 frozen Attack+Defence FDR → 09 minutes and player xPts
                                      ↓
10 manual 10-GW plans + saved revisions / weekly review
                        ↓
11 auto optimizer / legal alternatives
                        ↓
12 paired simulation worker / progress / cancel
                        ↓
13 Players / Fixtures / Market / News / Guide / DATA integration
                        ↓
14 QA / security / calibration / performance
                        ↓
15 staged parity / authorized production promotion
```

The tickets can overlap where interfaces are stable, but no upstream failure may be hidden by downstream mock values.

## Stage 02 completion gate

- [x] Product contract and up to ten real upcoming gameweeks defined.
- [x] Current production vs Next candidate runtime decision recorded; no duplicate website is created.
- [x] UX workflow, support-route hierarchy and secured DATA behavior specified.
- [x] Source classes, quote-vs-retrieval time and absent-value policy specified.
- [x] Initial pure typed helper + unit tests added for source status and dynamic gameweek horizon.
- [ ] New branch CI verifies root TS, tests, build, worker browser, Next candidate and Python solver.
- [ ] PR review and merge; Render auto-deploy checked by exact SHA and health.
- [ ] Stage 03 implementation changes start only after this gate closes.

## Source-of-truth policy

Business choices: `PRODUCT.md`; backend/runtime ownership: `docs/adr/0001-v2-runtime-migration.md`; UX behaviors: `UX-CONTRACT.md`; live theme/tokens: `src/styles.css` described in `DESIGN.md`; source semantics: `docs/VORTEX_V2_SOURCE_CONTRACT.md`; public-safe evidence type helpers: `src/lib/dataProvenance.ts`. Security/data license invariants cannot be overridden by screen copy.

## Risks requiring explicit evidence

- Old PR #43's pitch fix is already represented by merged PR #55; do not blindly merge stale duplicate PNG work.
- Draft PR #45 touches mobile shell and must be diffed before Stage 03.
- Existing Next Drizzle/custom sessions are **not** Supabase Auth or RLS; migration requires review and tests.
- Source odds/availability may be partially available, delayed, stale or unlicensed; feature must work with honest gaps.
- Previously pasted password must not be used as the deployed admin password. Configure a fresh private secret in the auth provider and preferably MFA.
