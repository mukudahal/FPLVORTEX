# FPL VORTEX — V2 outstanding-work register

**Updated:** 2026-10-30
**Baseline:** `main` @ `efe59675175c3ce51ebac9402e1d7731e609edb9`
**Source:** `mukudahal/FPLVORTEX` + confirmed Render `FPLVORTEX` service
**Tracking work branch:** `upgrade/vortex-stage02-contracts-and-provenance`

## Verified completed work

| Deliverable | Evidence | Status |
|---|---|---|
| Stage 00 audit, backup branch, inventory | `backup/pre-v2-upgrade-2026-10-30`; baseline documents | COMPLETE |
| Stage 01 root + Next independent CI | PRs #53 and #54, passing post-merge CI `41108619456` | COMPLETE |
| Premium 4K 16:9 PNG export for pitch/player/tables | PR #55, browser downloaded-image checks, main CI `41109333620` | COMPLETE |
| Current Render production deployment | Render `FPLVORTEX`, commit `efe59675` marked `live` | COMPLETE |
| Stage 02 product/architecture/UX/data contracts | `PRODUCT.md`, `UX-CONTRACT.md`, ADR, data-source contract, tickets, tested helper | IMPLEMENTED IN BRANCH; CI / MERGE PENDING |

**Truth boundary:** The public site is still the existing Vite/Express application. Passing a Next.js build does not mean the complete 10-GW Next/Supabase platform is deployed. PNG export fixes are live, but future manual and auto planner work remains unfinished.

## Outstanding — dependency order

| Priority | Outstanding implementation | Current status / gate |
|---|---|---|
| P0 | Stage 02 source and UX contracts reviewed/CI accepted | IN REVIEW; run unit and cross-app parity on branch |
| P0 | Stage 03 responsive 10-GW homepage and app shell | NEXT; dark/light + mobile/desktop + keyboard |
| P0 | Stage 04 trusted FPL pipeline / source timestamps | OPEN; integrate pure helper into verified server endpoints |
| P0 | Stage 05 authenticated saved plans and Supabase RLS | BLOCKED on staging auth/DB; no live migration |
| P0 | Protected DATA tab and audited admin operations | BLOCKED on server sessions/roles/RLS; no hardcoded password |
| P0 | Stage 06 canonical season FPL rules and cross-app parity | OPEN; 2026/27 chips, selling price, banked FT |
| P0 | Stage 07 licensed/verified market odds and score distributions | OPEN; provider license & quote coverage decision |
| P0 | Stage 08 calibrated separate Attack/Defence FDR 1.0–5.0 | OPEN; frozen historical reference & backtests |
| P0 | Stage 09 player minutes and component xPts calibration | OPEN; chronological no-leak tests |
| P0 | Stage 10 saved/revisioned legal manual ten-GW plans | OPEN; preserve accepted choices, locks, undo |
| P0 | Stage 11 constraint-aware automatic transfers and chips | OPEN; heuristic/optimal clarity |
| P0 | Stage 12 paired simulation comparison with async worker | OPEN; progress, cancel, same sampled outcomes |
| P1 | Stage 13 player/fixture/market/news/methodology parity | OPEN; source badges and functional navigation |
| P1 | Reconciling draft PR #45 mobile-screen changes | OPEN; compare against canonical Stage 03 work |
| P1 | Validate 4K PNG visually with real manager/photos on mobile | OPEN as manual-device visual check; automated PNG regression PASSED |
| P0 | Stage 14 security, model, a11y, perf, browser release QA | OPEN |
| P0 | Stage 15 staged Next/Supabase/Vercel cutover | NOT READY; explicit release approval needed |

## Development update policy

In every future update include **completed changes**, **source-linked CI/tests**, **live production commit/Render status**, and **outstanding items** (blocked versus ready), with no misleading claim of deployment or verified odds. Do not silently merge stale PR #43 or expose the previously shared password; require a new private admin credential/MFA before an admin launch.

Roadmap/ticket details: `docs/VORTEX_V2_STAGE02_TICKETS.md`; original plan `docs/VORTEX_V2_UPGRADE_PLAN.md`.
