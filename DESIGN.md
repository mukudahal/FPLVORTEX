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

## Social image export standard (V2)

This is an **additional image-output contract**, not a replacement for existing responsive page layouts or player/fixture domain rules.

- Canvas outputs for player cards, squad pitch and data exports use one fixed 3840 × 2160 16:9 frame. Live screens use responsive CSS and must never be forced into 16:9.
- Export identity is an intentionally restrained version of VORTEX: background #0B0D16, panels #171A2B, purple #8B5CF6, cyan #22D3EE, foreground #F8FAFC and muted copy #A9B1C5. Maintain the existing green/orange/red fixture indicators according to the versioned FDR mapping.
- Canonical export colors/dimensions/contain geometry live in `src/lib/exportFrame.ts`; HTML save dialog lives in `src/lib/savePng.ts` and responsive light/dark dialog styles in `src/styles.css`.
- Player pictures and club crests are retained from the actual on-screen player identity and may be re-fetched through same-origin proxies; never stretch or invent a missing photograph.
- A failed image source must produce an actionable error or clearly marked fallback, not a blank PNG represented as success.
- Save buttons expose a direct user-initiated Download PNG action; Share/Choose location/Open image remain device-specific alternatives. Optional temporary storage must not block showing the download.
- Dynamic source/model timestamps are displayed in the interactive site, not fabricated inside rendered graphics; exports state that they reflect the on-screen dataset.
- Browser acceptance requires correct PNG signature, real downloaded file, exact 3840 × 2160 dimensions, visible pitch/bench content, readable colored tables, and player identity/stat surfaces.
