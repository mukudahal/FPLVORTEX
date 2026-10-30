# FPL VORTEX V2 — Stage 01: Application Parity and Baseline

**Date:** 2026-10-30  
**Baseline:** `main` @ `93b1c1d785a8b4c73534ca19b1eb91c1db68d4e5`  
**Work branch:** `upgrade/vortex-10gw-v2`  
**State:** Validation in progress. Documented facts below are source-review observations; they do not establish production feature parity.

## Goal and non-negotiable scope

Preserve the working FPL VORTEX website while assessing whether the separate Next.js application can be a safe future replacement. Do not migrate live traffic, alter the production database, overwrite stored manager plans, merge older PRs, expose the repository, rotate secrets automatically or delete files during Stage 01.

## Application inventory

| Path | Runtime | Existing capabilities | Stage 01 assessment |
|---|---|---|---|
| Root `src/`, `server/` | Vite 8, React 19, Express 5, Node 22, Python solver | Deployed public UI described by README; home, review, players, 10-GW planner, fixtures, league, methodology, odds API, source caching | **Baseline to preserve**; GitHub CI run `41086671032` passed TypeScript, tests, production build, Python solver and browser worker checks |
| `1_APP_dashboard/` | Next.js 16.2.6, React 19.2, Tailwind 4, Drizzle + PostgreSQL; custom session authentication | Rich route collection, scenario/optimizer/reporting code, authored DB migrations and background-job logic | **Migration candidate**, not verified replacement; independently execute clean dependency install, migration dry-run, unit tests, TypeScript, lint, build |
| `site/` | Standalone worker and model-lab preview | Research, browser-local simulations, sample/offline UI | Preserve as lab/reference; not a production-auth or database replacement |

The historic `START_HERE.md` says Next.js is canonical; the root README and root CI correspond to a different application. Resolve this in an approved ADR, not by interpreting one document as permission to delete the other application.

## Current code-owner map (observed)

| Domain | Root source owner now | Candidate Next.js source | Action before moving |
|---|---|---|---|
| Root navigation and themes | `src/App.tsx`, `src/styles.css`, `src/hooks/useHashRoute.ts` | `1_APP_dashboard/src/app/`, `src/components/TopBar.tsx`, `ThemeToggle.tsx` | Compare routes, colors, mobile, keyboard, dark/light and deep-link behavior |
| Live data | `server/fpl.ts`, `server/normalize.ts`, `src/hooks/useVortexData.ts` | `1_APP_dashboard/src/server/fplData.ts`, `src/lib/fplNormalize.ts` | One typed provider contract, freshness/provenance, full error parity |
| Odds and distributions | `server/odds.ts`, `src/lib/oddsMath.ts`, `src/lib/repoModel/scoreDistribution.ts` | `1_APP_dashboard/src/lib/forecastScience.ts`, `probability.ts` | Source coverage, exact 1X2 normalisation, quote timestamps, licensing |
| Gameweek team rules | `src/lib/repoModel/{seasonRules,scoring,planEngine}.ts` | `1_APP_dashboard/src/lib/{seasonRules,scoring,planEngine}.ts` | Cross-app mathematical parity tests; no divergent chip rules |
| xPts / minutes | `src/lib/repoModel/{xpts,minutes,playerModel}.ts` | `1_APP_dashboard/src/lib/{xpts,minutes,playerModel}.ts` | Freeze model inputs and compare per-fixture components |
| 10-GW transfer + chips | `src/lib/repoModel/compassPlanner.ts`, `src/components/SquadBuilder.tsx`, `TransferPlanModal.tsx` | `1_APP_dashboard/src/lib/optimizer.ts`, `src/components/planner/TeamPlanner.tsx` | Validate 0–5 FT, budgets/selling price, future chip plan, no-chip baseline, saved manual overrides |
| Monte Carlo | `src/lib/repoModel/monteCarlo.ts`, `src/workers/planner.worker.ts` | `1_APP_dashboard/src/lib/monteCarlo.ts` | Same-seed outputs; abort/cancel and async job UX |
| FDR | `src/lib/fixtureForecast.ts` and `repoModel/fdrReference.ts` | `1_APP_dashboard/src/lib/dashboardMath.ts` and model/fixture screens | Both currently require scientifically verified separate Attack/Defence reference mapping |
| User plans | `src/lib/transferPlansStore.ts` browser localStorage | Next.js `savedPlans`/accounts DB tables and custom sessions | Define Supabase migration and RLS before any user import |
| Admin DATA | No secured root route found | `/status` and admin-adjacent status pages, not equivalent to RBAC | New strictly authenticated, server-authorized admin surface needed |

## Proposed target architecture (needs stage 02 ADR)

- Keep the tested root Vite/Express application as current production until staging parity and authorization approval.
- Treat the user-requested Next.js + Tailwind + shadcn/ui + Supabase + Vercel combination as the desired target, but do not assume existing Next.js Drizzle/custom sessions are already Supabase.
- Move deterministic FPL rules, fixtures, xPts, FDR, probabilities and planning logic to **one canonical framework-independent domain package**, retaining current tests as golden baselines where accurate.
- Keep licensed/raw odds and administrative credentials server-only; publicly displayed summaries are inherently visible to browser consumers.
- Use a temporary dual-run architecture and an explicit production cutover/rollback checklist.

## GitHub pull-request conflict map

| PR | Affected surface | Stage 01 action |
|---|---|---|
| #45 (draft) | Root mobile header and Review panel; `src/styles.css`, `CommandCenter.tsx`, `TeamIdInput.tsx`, `DESIGN.md`, browser QA | Do not silently overwrite; compare against V2 shell requirements, cherry-pick only tested non-conflicting fixes with attribution |
| #43 | `src/lib/pitchPng.ts`, 4K pitch export browser fixture | Preserve export regression and review separately; do not combine with Next migration without parity test |
| #1/#2 (draft) | Alternative Home navigation and dashboard, based on older branch | Do not merge directly; evaluate only useful visual/interaction ideas after canonical route decision |
| Dependency updates #10–13 | GitHub Actions and npm dependencies | Evaluate separately using passing CI; do not mix with architecture migration |

## Repeatable Stage 01 CI

The **root workflow** `.github/workflows/ci.yml` already runs root typecheck/tests/build, Python solver, and a browser planner/worker test. It now also includes an independent **Next.js candidate — build and test parity** job with:

1. `cd 1_APP_dashboard && npm ci`
2. `npm run db:migrate:dry-run` (must not connect or alter production)
3. `npm run test:planning`
4. `npm run typecheck`
5. `npm run lint`
6. `npm run build` using explicitly inert example config, without production secrets.

The Next.js workflow previously nested at `1_APP_dashboard/.github/workflows/ci.yml` was **not** a root GitHub Actions workflow. Making the test a root CI job resolves this blind spot.

## Stage 01 acceptance and exit

- [x] Baseline SHA recorded and recovery branch present.
- [x] Root application CI historical passing result recorded (`41086671032`).
- [x] Candidate Next.js job authored on V2 development branch.
- [x] Active code owners and open PR overlap mapped.
- [ ] New branch CI verifies the Next.js install, migration dry-run, tests, typecheck, lint and production build.
- [ ] Any failing job is diagnosed using exact log line and reproducible code-level fix or documented blocker.
- [ ] Architecture decision accepted for Stage 02 (root production remains untouched until staged parity).

### Stop condition

Do not merge this PR or claim the Next.js app has production feature parity until **all** the above gates pass. Current working application, backups and live databases remain unchanged.

## Verification links

- Root baseline CI: https://github.com/mukudahal/FPLVORTEX/actions/runs/41086671032
- V2 planning PR: https://github.com/mukudahal/FPLVORTEX/pull/53
- V2 plan: docs/VORTEX_V2_UPGRADE_PLAN.md
