# FPL VORTEX design contract

The current website is the visual reference. The owner explicitly requested that the planner improvements preserve the UI, graphics, branding, pitch, portraits, badges, typography and layout.

## Canonical owners

| Capability | Maintained owner |
| --- | --- |
| Palette, spacing, radii, responsive layouts, dark/light themes | src/styles.css |
| Planner pitch and fixture matrix | src/components/PlannerOverview.tsx |
| Advanced transfer/chip/simulation panels | src/components/SquadBuilder.tsx |
| Portraits and club badges | PlayerAvatar.tsx and ClubBadge.tsx |
| Toast feedback | src/components/Toast.tsx |
| Scoring, formation and transfer rules | src/lib/repoModel/scoring.ts and seasonRules.ts |
| Forecast components | src/lib/repoModel/xpts.ts |
| Simulation sampling and automatic substitutions | src/lib/repoModel/monteCarlo.ts |

The runtime CSS is the token source; do not duplicate token values in screen-specific styles. Existing dark tokens include --bg #070914, --text-primary #f3f6ff, --brand-mint #5bf5d6, --brand-violet #7772ff and --brand-pink #ff5bc8. Inter Variable remains the typeface. The planner upgrade introduces no CSS or asset changes.

Extend existing panel, badge, button, table, select and status conventions for new information. Keep the native selects already used by the planner. Do not import Compass visuals or assets. The current dashboard and planner share the established brand primitives.

## Responsive repair — phase 1

The owner has approved fixing mobile overlap while retaining the desktop identity. The earlier no-CSS-change statement describes the simulation upgrade; this phase deliberately repairs responsive CSS in the same canonical stylesheet. No colours, fonts, assets or forecast mathematics are replaced.

At 1180px and below the shared header uses a grid and natural height. At 700px and below its brand/theme, deadline/local information, and search/sync controls occupy separate rows. Do not reinstate the fixed 68px, single-row mobile header or hide overflow to mask content collisions. Review metrics use three columns on phones, or two below 375px, with wrapping values. Keep the pitch artwork and portrait resolvers unchanged. Reserve bottom space for the fixed navigation plus safe-area insets.

The native select popup remains platform-owned; this phase changes trigger geometry only. Shared saved-manager controls must accept touch, click, Enter and Space. See `docs/PLANNER_IMPLEMENTATION_CHECKLIST.md` for phase boundaries and pending data/model requirements.

## Interaction owners

This inventory records existing owners, not a claim that all legacy behaviour is validated. The current phase does not replace the forms or data contracts; gaps remain explicit in the phased checklist.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Native selects; `TeamIdInput.tsx` for saved managers | Existing Planner controls and owner requirements | Platform-owned native popups; saved-manager combobox | `scripts/check-responsive-layout.mjs` keyboard and geometry checks; full advanced search arrives in Phase 2 |
| Form | Existing owner handlers in `CommandCenter.tsx`, `LeagueIntel.tsx`, `App.tsx` | Manager-ID validation and new starting-state policy | Existing manager lookup only in Phase 1 | Existing type/unit checks; legacy native-validation ownership is a Phase 2 gap |
| Scrollbar | `src/styles.css` | Canonical runtime stylesheet | Table/tab internal scroll; natural document scroll | Responsive overflow checks; standards-based theme coverage is an existing audit gap |
| Toast | `src/components/Toast.tsx` and `App.tsx` | Existing shared feedback owner | Success, error, info | Existing component integration; no new feedback variant in Phase 1 |
