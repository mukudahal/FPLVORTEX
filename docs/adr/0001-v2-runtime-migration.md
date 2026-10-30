# ADR-0001 — Production runtime, source ownership and V2 cutover

**Status:** Adopted for incremental development; staging selection and production cutover require additional approval.
**Decision date:** 2026-10-30
**Context:** Stage 01 repository audit and passing root/Next candidate CI on commit `efe59675`.

## Decision

1. **Root `src/` + `server/` (React/Vite/Express) remains the sole deployed production implementation on Render**, service `srv-dbh0sv2fngtc73bdgko0`. Retain its production data, assets, GitHub auto-deploy and existing rollback branch.
2. **`1_APP_dashboard/` (Next.js App Router, Tailwind, Drizzle/PostgreSQL, custom auth)** remains a migration candidate. CI build parity is a necessary gate but NOT functional or security parity. Do not represent it as a production Next.js deployment.
3. **`site/` remains experimental/model-lab reference**, not a live site or authority over manager data.
4. Root's **canonical present-day code owners** for scoring, planning and FDR are `src/lib/repoModel/`, `src/lib/fixtureForecast.ts`, `src/lib/transferPlansStore.ts`, and `src/workers/planner.worker.ts`. Next's copies are provisional. In Stage 06 extract one framework-neutral versioned domain library and make both runtimes consume it; until then test parity and document divergences rather than silently copying formulas.
5. Stage 04 introduces a typed **evidence/source provenance contract** and server normalization. Stage 02 seeds the pure contract in `src/lib/dataProvenance.ts`; it is not yet wired to all endpoints. The Next candidate will use its own typed adapter only after parity review.
6. **User accounts:** the current root app only has browser-local transfer scenarios. Do not claim cloud save or migrate to Next's custom session schema directly. Stage 05 sets up a separate Supabase staging project and RLS policies, tests ownership and admin role server-side, then creates a reviewed non-destructive migration plan.
7. **DATA admin:** No shared password in client code, localStorage, hardcoded token, environment sent to browser or public API. Admin identity through Supabase Auth (prefer MFA) and verified server session + role + RLS. A password pasted in chat must be rotated before onboarding; neither the password nor its hash belongs in repo.
8. **Heavy compute:** retain the existing root Web Worker until full asynchronous optimization/simulation queue has a verified worker backend, cancellation, timeouts and idempotency; evaluate Render background worker and Supabase or other verified queue infrastructure. Do not add paid resources until requested or authorized.
9. **Hosting:** keep one Render website now. Next.js + Vercel is preferred only as a **future staging destination**; no second production website, service, DNS change or destructive rename without approval.
10. Merge any replacement only after staging route parity, scenario integrity, snapshot provenance, xPts/FDR backtests, security/RLS and rollback rehearsal. Render's existing deployed service remains the immediately reversible production baseline.

## Alternatives weighed

- **Big-bang Next swap**: rejected because the two runtimes have different auth/persistence approaches, duplicated model logic and unverified production parity.
- **Stay indefinitely on root runtime**: rejected as a final decision only; may be revisited based on staged measured performance and TCO. Root remains fully supported during migration.
- **Parallel production Render and Vercel**: rejected until a distinct staging release is justified. Public URL / paid capacity changes require owner authorization.
- **Hardcoded DATA password or client hidden route**: rejected as insecure, regardless of UI visibility.

## Ownership table

| Capability | Canonical now | Destination / gate |
|---|---|---|
| Public UI shell and root routes | `src/App.tsx`, `src/hooks/useHashRoute.ts`, `src/styles.css` | Next App Router after Stage 03 E2E parity |
| Gameweek/fixtures and player ingestion | `server/fpl.ts`, `server/normalize.ts` | Shared types and staging APIs after Stage 04 |
| Player identities, photos, crests | `PlayerAvatar.tsx`, `ClubBadge.tsx`, `src/lib/playerImages.ts` | License and visual parity |
| 2026/27 scoring, FTs, rules, chips | `src/lib/repoModel/{scoring,seasonRules,planEngine}.ts` | Shared rules module, golden fixtures and Stage 06 tests |
| Forecasts and conditional minutes | `src/lib/repoModel/xpts.ts` | Chronological backtesting before calibration claims |
| 10-GW auto search | `src/lib/repoModel/compassPlanner.ts` | Heuristic labelled, solver parity and constraints |
| Monte Carlo | `src/lib/repoModel/monteCarlo.ts` | Same seed/draw and worker output tests |
| Forecast fixture indices | `src/lib/fixtureForecast.ts` | Provisional until Stage 08 frozen-reference calibration |
| Local plan slots | `src/lib/transferPlansStore.ts` | Authenticated revisioned Supabase storage + RLS |
| Authenticated DATA administration | **No owner** | New server + RLS owner in Stage 05, blocked until auth review |
| Image exports | `src/lib/exportFrame.ts` + `savePng.ts` and render modules | Preserve 3840×2160 PNG regression |
| Stage 02 source status helpers | `src/lib/dataProvenance.ts` | Use in Stage 04 server adapters after API source review |

## Impact and rollback

- Stage 02 itself adds documentation and pure tested helpers; it does not configure services, modify the live DB, change route behavior or expose sensitive values.
- Gate: all root + Next CI jobs pass on the branch and after a merge. If any fails, do not promote. Render auto-deploys `main` and should be monitored for a healthy release.
- Future runtime cutover requires a rollback branch, database snapshot/migration rehearsal and owner-signed change checklist; no guarantee of instant rollback of a destructive schema migration.

## Open decisions and blockers

- Staging project credentials/auth architecture and Supabase migration policy.
- Archive snapshots sufficient for unbiased xPts/FDR chronological calibration.
- Licensed market-odds provider and player image/crest rights.
- Agreed transfer-plan version/locking UI and exact FPL scoring rule validations.
- Cloud worker capacity, queue choice and monitoring budget.

**Revisit after Stage 05–06 parity evidence, not by aesthetic preference alone.**
