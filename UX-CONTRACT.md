# FPL VORTEX — UX Contract (Stage 02)

**Scope:** Production-grade 10-GW planning application. This specifies future behavior; the current Render site is not yet feature-complete.

## Canonical interaction ownership

| Capability | Existing implementation owner | V2 contract / migration rule |
|---|---|---|
| Route navigation | Root `src/hooks/useHashRoute.ts`; Next `1_APP_dashboard/src/app/` candidate | Keep working root links until staged Next parity; primary nav is Planner / Simulation / Players / Fixtures / Market & Transfers / News / Guide / DATA (admin only) |
| Current dark/light theme | `src/styles.css` and root theme provider | Persist preference, expose visible switch, maintain same semantic data colors between themes |
| Player and club imagery | `src/components/PlayerAvatar.tsx`, `ClubBadge.tsx` | Reuse canonical resolvers and explicit fallback states; never distort or misidentify |
| Toast/status feedback | `src/components/Toast.tsx` | One semantic live-region owner; success, info, warning and error with corrective action when needed |
| Filters/tables | Shared table classes and native selects | Native selectors accepted; column sorts announce direction, filters do not silently reset manual plans |
| Saved scenarios | `src/lib/transferPlansStore.ts`, `TransferPlanModal.tsx` | Browser-local until authenticated server persistence is available; do **not** describe local plans as cloud-saved |
| Engine/Monte Carlo progress | `SquadBuilder.tsx`, `src/workers/planner.worker.ts` | Async cancellable run, stale results indicated; never overwrite accepted manual revisions |
| Protected DATA console | No existing secure root owner | New server-authorized admin route and shared admin shell; no client-only password guard |
| Export | `src/lib/{savePng,pitchPng,playerCardPng,tablePng}.ts` | 3840×2160 16:9 PNG from data; responsive app views are *not* constrained to 16:9 |

For V2 features still absent, keep the capability marked **not implemented**; never create a decorative button.

## Core workflows

### Home planner — Manual
- **Entry:** Next eligible GW chosen from authoritative fixture/deadline snapshot, up to ten remaining GWs.
- **Context:** Manager's verified initial 15 players, purchase/sell prices, bank, FTs, available chips, fixture snapshot, forecast version. Missing inputs are shown as explicit blockers for derived actions.
- **Edit:** Select week; change legal transfers/XI/bench order/captain/vice/chip/locks. Show immediate local derived result from precomputed forecasts; invalidate later weeks affected by a transfer.
- **Save:** Existing browser-only plan shows `Saved on this device`; after authenticated server persistence, revisioned save must show `Saved to account`. A loading or rejected save cannot claim success.
- **Review:** Compare a saved revision with new verified source changes; keep original as a restore point. Replanning is opt-in.
- **Undo:** Restore last committed manual revision with legal squad/cost/chip state. Unsaved changes prompt only on navigation that would discard them.
- **Invalid:** Explain the violated squad, budget, position, club-count, FT or chip constraint next to the edited GW without erasing input.

### Automatic planning
- **Start:** User chooses horizon up to 10, risk preference, preserve locks and chip policy.
- **Pending:** Distinct progress state, cancel button, immutable input/version summary, no blocking site navigation.
- **Completed:** Show suggested transfers, XI, captain, vice, bench, transfer hits and chip timing with xPts / uncertainty. Offer `Compare with my plan`; never mutate manual plan automatically.
- **Failure:** Preserve scenario and controls; show reason and retry. A time budget cutoff produces `Best feasible found`, **not** `Global optimum`.

### Simulation and compare
- Plan A and B use the same fixtures, availability snapshot, seed, sampled outcomes, scoring rules, horizon and version. Show mean, median, P10–P90, costs, chip value and model caveat.
- If input changes during a run, mark old result outdated and cancel/replace through a clear user action.
- Save a comparison only as an append-only run tied to two plan revisions. Missing distributions disable comparison with a specific reason.

### Supporting screens
- Player Explorer: search by name or club; keyboard-navigable filters; sortable stats with units and timestamp; player detail opens with restore-focus behavior.
- Fixture matrix: switch Attack/Defence/FDR/Goals/CS only where verified/model coverage exists; blank and DGW shown distinctly; maintain 10-GW horizon and access to 1–5 scale meaning.
- Market: explicit quote time/bookmaker and coverage; never show model fallback under a `market` label. A missing price displays `No verified market quote`.
- News: source URL and checked timestamp; do not transform FPL availability notes into fabricated press quotes.
- Guide: long text, methodology, formulas, FAQ and data definitions live here, search + expandable headings, compact contextual help links elsewhere.
- DATA: authenticated admin only (server + DB role). Sensitive operational mutations require scoped permission, confirmation, audit trail and server-side idempotency. Admin password set through Auth provider, never hardcoded in code or config.

## Canonical mutation / failure map

| Action | Pending indication | Success outcome | Error / retry |
|---|---|---|---|
| Update a week | Local recompute or explicit recalculation | Week marked edited; future affected weeks dirty | Keep invalid draft with exact constraint and revert |
| Save scenario | Disable duplicate submit; stable button size | Commit revision and show where saved | Preserve changes, inline error, Retry |
| Delete plan | Named confirmation with Cancel focused | Remove only the targeted plan; restore focus to plans list | Keep plan, explain server/local failure |
| Run automatic plan | Progress and Cancel | Show immutable suggestion; no silent apply | Retain manual plan, retry |
| Run simulation | Seed and current snapshot visible | Comparison with uncertainty and provenance | Stale/failed state with retry, not misleading 0 points |
| Refresh fixtures/odds | Per-panel loading, last known snapshot marked stale | Update source time and affected calculations | Keep old data visibly stale; do not label it live |
| DATA write | Explicit scope, confirmation + server authorization | Audit receipt and current job status | 403 or error shown without leaking secrets |

## Accessibility, layout and theme
- Phone 320/375/390/414; tablet 768/1024; desktop 1280/1440/1920. Pages adapt to available width; only exported graphics use fixed 16:9.
- Mobile FDR and players tables scroll *within their region* with headers, keyboard focus and a visible sideways-scroll hint; page body does not horizontal-overflow.
- Logical tab order, visible focus, consistent Escape/close behavior, accessible chart summaries, labels for color-dependent FDR signals, keyboard activation and WCAG 2.2 AA contrast objective.
- All dialog actions identify their consequence; focus returns to invoking control. No browser alert/confirm/prompt.
- Dark/light tokens preserve text contrast and legend meaning; persist theme without a flash of wrong theme.
- Reduced-motion respected, charts / tables remain usable without animation.
- Waiting, empty, offline, partial-data, stale-data, invalid, unauthorized and error states exist for every source-backed panel.
- Avoid layout shifts from font loading, images, spinner swaps or delayed odds data.

## Quality gates

Acceptance evidence required: root + Next TS/tests/build; component interaction tests; browser 320–1920 width test; focus and dialog tests; saved-plan server authorization and cross-user RLS tests; manually verified mobile screenshots; usable source-status and failure states. No claim of readiness until each relevant test exists and passes.


## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native select in existing page components | DESIGN.md and this contract | Operating-system-owned popup; existing dense/standard sizes | Browser selectOption and keyboard acceptance |
| Form | Existing page validation and TeamIdInput | Numeric official IDs; existing planner constraints | Read-only lookup, local-plan edit | Unit validation and browser error states |
| Scrollbar | src/styles.css | Existing theme tokens | Native geometry; internal table scrolling | Narrow-screen browser checks |
| Toast | src/components/Toast.tsx | App feedback contract | success/error/info | Existing browser workflow checks |
| Export | src/lib/savePng.ts and playerPredictionExport.ts | DESIGN.md export standard | PNG and formula-safe CSV | Actual downloaded files in CI |
| H2H | PlayerComparisonWorkspace.tsx | Public settled FPL match history | 1–8 selected players, native range controls | ID/reorder/range unit and browser checks |
