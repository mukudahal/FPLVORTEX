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
