# FPL VORTEX — V2 Outstanding Work Register

Updated: 2026-10-30
Source: GitHub repository `mukudahal/FPLVORTEX`
Branch: `upgrade/vortex-10gw-v2`
Purpose: concise evidence-based status and unresolved dependencies for each stage.

## Current release context

- Stage 00 audit and backup branch: COMPLETE.
- Stage 01 source/architecture comparison and new Next.js CI job: IMPLEMENTED; validation PENDING.
- Root baseline `main` CI `41086671032`: PASSED.
- New branch Next.js parity CI run `41100517347`: QUEUED at last read (do **not** claim pass).
- The candidate Next.js app has not been demonstrated to have production parity or working Supabase Auth.
- Production source is the existing root Vite/Express application as described in README.
- This PR adds documentation and GitHub CI only: **it does not deploy Next.js or implement the finished 10-GW V2 application.**

## Outstanding — priority order

| Priority | Item | Needed evidence / decision | Status |
|---|---|---|---|
| P0 | New Next.js CI candidate test | GitHub Actions job completes: install, DB dry-run, tests, typecheck, lint, build | PENDING |
| P0 | Identify the actual production host/project | Confirm correct Render workspace/service and auto-deploy status; verify commit deployed and HTTP health | BLOCKED: workspace confirmation |
| P0 | Architecture decision | Resolve root Vite vs `1_APP_dashboard` Next source ownership, code-sharing, migration and rollback | OPEN |
| P0 | Stage 02 product/UX/API contracts | Canonical `PRODUCT.md`, `DESIGN.md`, `UX-CONTRACT.md`, source contracts; approve route ownership | OPEN |
| P0 | Supabase staging integration | Set up staging DB, Auth/RLS and admin role; migrate plans safely | OPEN |
| P0 | DATA tab security | Server-enforced admin login/role, RLS and strict secret boundaries; rotate chat-shared password | OPEN |
| P0 | FPL scoring/math parity | Official rules and tests across root/Next, 10 GWs, chips, free transfers, blanks/doubles | OPEN |
| P0 | VORTEX FDR calibration | Historical frozen pre-deadline references; separate attack/defence 1.0–5.0 scale | OPEN |
| P0 | xPts forecast validation | Minutes states, position events, no leakage, chronological backtests | OPEN |
| P0 | Full 10-GW planner | Manual changes, cloud save, undo/revision, lineup, captaincy, chip state | OPEN |
| P0 | Optimizer/Monte Carlo production parity | Valid legal multi-GW actions, chips, benchmark comparisons, async jobs | OPEN |
| P0 | Odds/data provenance | Quote freshness, licensing, current market match coverage, source-specific fallbacks | OPEN |
| P1 | Responsive dark/light UX | Compact layouts, contrast, performance; reconcile PR #45 mobile changes | OPEN |
| P1 | PNG export bug | Review existing PR #43, run real-browser 4K PNG test | OPEN |
| P1 | Player/fixture/market/news pages | Functional integration, searchable and clear source labels | OPEN |
| P1 | Performance and security QA | Playwright, DB RLS tests, Core Web Vitals, error/worker recovery, stage gates | OPEN |
| P1 | Production Next/Vercel cutover | Verified Next build, stage migration, live URL and rollback; explicit release approval | NOT READY |

## Update protocol

After each development action, report:
1. Completed and linked GitHub changes / checks.
2. Current production deployment state: verified / unverified, commit and URL.
3. Top unfinished tasks by priority and blockers.
4. Whether release gates remain open.

Do not claim a merge, deployment or test result until GitHub or the hosting provider confirms it. Do not silently drop outstanding items after a stage transition.
