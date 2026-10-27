# FPL VORTEX Brand Kit

This folder contains the exact visual language used by the FPL VORTEX website. Give this folder to any developer or AI coding agent that needs to reproduce the design in another repository.

## 1. Files

| File | Purpose |
| --- | --- |
| `BRAND-KIT.md` | Human-readable design rules and integration instructions. |
| `design-tokens.css` | Ready-to-import CSS variables and `@font-face`. |
| `design-tokens.json` | Machine-readable colors, fonts, spacing, radii and motion tokens. |
| `brand-preview.html` | Self-contained visual style guide with embedded font and SVGs. |
| `fonts/InterVariable.woff2` | Self-hosted Inter Variable font. |
| `fonts/OFL.txt` | SIL Open Font License for Inter. |
| `assets/logo-lockup.svg` | Full horizontal logo. |
| `assets/logo-mark.svg` | Standalone vortex symbol. |
| `assets/app-icon.svg` | PWA/app icon. |
| `assets/favicon.svg` | Browser favicon. |
| `assets/social-card.svg` | Open Graph social card. |
| `assets/icon-sprite.svg` | Reusable SVG icon symbols. |
| `assets/pattern.svg` | Dot-grid and orbit pattern. |
| `assets/website-preview.html` | Static six-page visual snapshot of the full website. |

## 2. Font

**Primary typeface:** Inter Variable, weights 100–900.

The font is self-hosted so it works without a CDN or internet connection.

```css
@font-face {
  font-family: 'Inter Variable';
  src: url('./fonts/InterVariable.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

:root {
  --font: 'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif;
}
```

### Type scale

| Role | Size | Weight | Letter spacing |
| --- | --- | --- | --- |
| Hero | clamp(35px, 4.2vw, 62px) | 850 | -0.055em |
| Page title | 28px | 800 | -0.04em |
| Panel title | 18px | 750 | -0.02em |
| Body | 12–14px | 400–500 | normal |
| Label | 9–10px | 800–850 | 0.08–0.16em uppercase |
| Metric | 27px | 750 | -0.045em |

Use tabular numerals for countdowns and scores: `font-variant-numeric: tabular-nums`.

## 3. Colors

### Brand accents

| Token | Hex | Use |
| --- | --- | --- |
| Mint | `#5BF5D6` | Primary success accent, live status, positive values, links. |
| Violet | `#7772FF` | Main brand gradient, model/data accents. |
| Pink | `#FF5BC8` | Captaincy, differentials, secondary gradient. |
| Amber | `#FFC66D` | Warnings, goalkeeper tags, budget. |
| Blue | `#65B8FF` | Defender tags and informational metrics. |

### Dark theme surfaces

| Token | Value |
| --- | --- |
| Page background | `#070914` |
| Elevated background | `#0B0E1E` |
| Solid panel | `#121528` |
| Primary text | `#F3F6FF` |
| Secondary text | `#A8B1D6` |
| Muted text | `#727CA7` |
| Border | `rgba(151,162,221,.14)` |
| Strong border | `rgba(151,162,221,.25)` |

The light theme is defined in `design-tokens.css` under `:root[data-theme='light']`.

### Gradients

```css
--gradient-brand: linear-gradient(120deg, #7772FF, #9F66FF 55%, #FF5BC8);
--gradient-mint-violet: linear-gradient(90deg, #5BF5D6, #7772FF);
--gradient-hero: linear-gradient(125deg, rgba(20,23,52,.98), rgba(14,17,37,.9) 52%, rgba(45,22,76,.82));
--gradient-panel: linear-gradient(155deg, rgba(18,21,42,.82), rgba(13,16,34,.58));
```

## 4. Logo and graphics

- Use `logo-lockup.svg` in headers and documentation.
- Use `logo-mark.svg` for small square avatars, loading states and app icons.
- Never stretch, recolor, add shadows to, or rotate the vortex mark.
- Keep clear space around the mark equal to at least 25% of its width.
- The concentric vortex rings may animate with slow rotation, but the core must remain centered.
- Backgrounds use subtle radial glows and a 22px dot grid with a left-to-right mask.
- All graphics are SVG or CSS. Do not replace them with raster images.

## 5. Icons and symbols

The app uses **Lucide** icons via `lucide-react`.

```bash
npm install lucide-react
```

Common icons: `Activity`, `ArrowRight`, `BrainCircuit`, `CalendarDays`, `CircleDollarSign`, `Clock`, `Crown`, `Gauge`, `Info`, `Layers`, `RefreshCw`, `Search`, `ShieldCheck`, `Sparkles`, `Target`, `TrendingUp`, `Trophy`, `Users`, `WandSparkles`, `Zap`.

Rules:

- Default icon size: 18px. Small inline icon: 14px.
- Use `currentColor`; never hardcode icon colors inside the SVG.
- Captain symbol: crown + `C` badge in pink.
- Vice-captain symbol: `V` badge in amber.
- Live status symbol: 8px mint pulse dot with glow.
- Position symbols: `GKP`, `DEF`, `MID`, `FWD` pills using amber, blue, mint and pink.
- Data trend symbol: 9-point SVG sparkline, 2px mint/violet stroke with gradient area fill.
- Blank gameweek symbol: `BLK` in a muted cell.
- Double gameweek symbol: small `2×` pink tag.

`assets/icon-sprite.svg` contains standalone SVG symbols for projects that cannot use `lucide-react`.

## 6. Core components

### Panel

```css
.panel {
  background: var(--gradient-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(18px);
  padding: 22px;
}
```

### Primary button

```css
.button--primary {
  background: var(--gradient-brand);
  color: #fff;
  border-radius: 12px;
  padding: 10px 15px;
  font-weight: 750;
  box-shadow: 0 12px 28px rgba(119,114,255,.28);
}
```

### Status colors

- Easy FDR / positive / live: mint or success green.
- Medium FDR / warning: amber.
- Hard FDR / negative / danger: pink-red.
- Blank / disabled: muted gray.

### Cards

- Radius: 18–24px.
- Border: 1px `--border`.
- Background: translucent panel with blur.
- Hover: `translateY(-1px)` and stronger border.
- Never use pure white cards in dark mode.

## 7. Motion

- Standard transition: `160–240ms cubic-bezier(.2,.8,.2,1)`.
- Vortex rings rotate continuously at 7–14s durations.
- Pulse dots breathe every 2s.
- Floating hero cards move 8px over 5s.
- Always include `@media (prefers-reduced-motion: reduce)` and disable looping animations.

## 8. Integration checklist

1. Copy `brand-kit/` into the target repository.
2. Import `brand-kit/design-tokens.css` before component styles.
3. Set `<html lang="en" data-theme="dark">` for the default dark theme.
4. Use `assets/logo-lockup.svg` in the header.
5. Install and use `lucide-react` for icons.
6. Replace hardcoded colors with CSS variables from `design-tokens.css`.
7. Use `brand-preview.html` as the visual acceptance test.
8. Compare the result against `assets/website-preview.html` page by page.
9. Verify both dark and light themes, mobile layout, keyboard focus, and reduced motion.

## 9. Do not

- Do not use Comic Sans, Papyrus, serif fonts, or mixed random display fonts.
- Do not use pure black `#000000` as the page background.
- Do not use neon green as the only accent.
- Do not use emoji as interface icons.
- Do not add drop shadows to the logo.
- Do not remove the dark navy panel treatment.
- Do not substitute external CDN fonts; keep Inter self-hosted.

## 10. Prompt for an AI coding agent

> Use `brand-kit/BRAND-KIT.md`, `brand-kit/design-tokens.css`, `brand-kit/design-tokens.json`, all files in `brand-kit/assets/`, and `brand-kit/brand-preview.html` as the single source of truth for the visual design. Preserve the exact Inter Variable font, mint/violet/pink palette, vortex logo, Lucide-style symbols, panel styles, gradients, spacing, and motion. Do not invent a new visual style. Verify the result against `brand-kit/assets/website-preview.html`.
