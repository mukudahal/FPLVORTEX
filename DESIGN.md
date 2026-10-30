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

## V2 planning workspace direction (Stage 02 decision)

**Product register:** a live football analysis workstation, not a promotional landing page. The memorable interaction is the **10-GW timeline tied to the manager's persistent, editable squad**, with a compact comparison of Manual / Auto / Simulate. It is not a decorative hero, giant badge or fixed aspect-ratio website.

- The existing root app's CSS theme variables, typography, spacing and icon components remain canonical until the Stage 03 theme/shell implementation. Do not make new shadow palettes in page-specific style blocks.
- **Existing UI tokens:** root `src/styles.css` defines the dark/light runtime; Inter Variable is the current product type family; `lucide-react` icons already power the interface. Export-specific dark 4K colors in `src/lib/exportFrame.ts` are for downloaded graphics only, **not** an instruction to replace all live theme tokens.
- The planner’s primary content order is: next-GW/deadline/source status → 10-week strip → working XI / bench and legal actions → projected gain, costs and uncertainty → paired comparison. Data explanation lives behind a small contextual detail/help link.
- Pitch and fixtures share width on spacious desktops; smaller layouts use stacked panels or controlled inner scrolling, **not** scaled-down illegible screenshots. Keep consistent 44px touch targets, strong numerical alignment and visible status labels.
- Provisional FDR retains the established four-band fixture fill semantics and text contrast; do not silently rename it calibrated VORTEX FDR until the Stage 08 historical reference tests pass.
- Keyboard and dark/light themes must preserve the exact same operations. Use subdued panel separators, small labels, and one purple action accent; reserve cyan for focus/selection/secondary analytical emphasis.
- A player headshot and team crest is shown where permitted by the existing resolver. Source/broken-image states must be explicit. Never invent realistic photographs or use an unverified player identity.
- Source states `Fresh / Stale / Unverified / Unavailable` remain visible in data-first panels; model xPts are forecasts and always identified as such.
- Changes to the canonical shell and tokens require direct edits to runtime owners **and** narrow/wide browser evidence; Stage 02 only records the decision and does not redesign deployed components.

**Anti-patterns:** forced 16:9 live pages, rainbow dashboard gradients, informational walls of text, fake-live odds, oversized KPI cards, duplicate scrollbars, color-only FDR legends, and nonfunctional button mockups.

See `PRODUCT.md`, `UX-CONTRACT.md`, `docs/adr/0001-v2-runtime-migration.md` and `docs/VORTEX_V2_SOURCE_CONTRACT.md` for authority and implementation gates.
