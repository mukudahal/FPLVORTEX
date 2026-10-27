/**
 * Official FPL Player Portrait & Club Crest Resolver
 * Ported directly from:
 * - `site/ui/player-images.js`
 * - `2_notebooks/FPL_VORTEX_Wildcard_Slides1_to_4_Premium_Captaincy.ipynb` (Cell 5 `vortex_player_images.py`, `official-fpl-code-four-endpoints-v4`)
 * - `1_APP_dashboard/src/lib/playerPhotoPaths.ts`
 * - `1_APP_dashboard/src/lib/helpers.ts`
 *
 * Identity rule: FPL player ID -> official FPL code -> Premier League photo chain -> official club shirt -> clean club jersey monogram fallback.
 */

import { withBase } from './baseUrl';

export const PHOTO_RESOLVER_VERSION = 'official-fpl-code-four-endpoints-v4';
export const PL_PHOTO_BASE_CURRENT = 'https://resources.premierleague.com/premierleague25/photos/players';
export const PL_PHOTO_BASE_LEGACY = 'https://resources.premierleague.com/premierleague/photos/players';
export const PL_PHOTO_BASE_S3 = 'https://premierleague-static-files.s3.amazonaws.com/premierleague25/photos/players';
export const PL_BADGE_BASE = 'https://resources.premierleague.com/premierleague/badges';

export const CLUB_COLORS: Record<string, { primary: string; secondary: string; text: string }> = {
  ARS: { primary: '#EF0107', secondary: '#FFFFFF', text: '#FFFFFF' },
  AVL: { primary: '#670E36', secondary: '#95BFE5', text: '#FFFFFF' },
  BOU: { primary: '#DA291C', secondary: '#111111', text: '#FFFFFF' },
  BRE: { primary: '#E30613', secondary: '#FFFFFF', text: '#FFFFFF' },
  BHA: { primary: '#0057B8', secondary: '#FFCD00', text: '#FFFFFF' },
  CHE: { primary: '#034694', secondary: '#DBA111', text: '#FFFFFF' },
  COV: { primary: '#0593D0', secondary: '#FFFFFF', text: '#FFFFFF' },
  CRY: { primary: '#1B458F', secondary: '#C4122E', text: '#FFFFFF' },
  EVE: { primary: '#003399', secondary: '#FFFFFF', text: '#FFFFFF' },
  FUL: { primary: '#1F2437', secondary: '#CC0000', text: '#FFFFFF' },
  HUL: { primary: '#F5A12D', secondary: '#111111', text: '#111111' },
  IPS: { primary: '#3A64A3', secondary: '#FFFFFF', text: '#FFFFFF' },
  LEE: { primary: '#1D428A', secondary: '#FFCD00', text: '#FFFFFF' },
  LIV: { primary: '#C8102E', secondary: '#00B2A9', text: '#FFFFFF' },
  MCI: { primary: '#6CABDD', secondary: '#1C2C5B', text: '#0B162C' },
  MUN: { primary: '#DA291C', secondary: '#FBE122', text: '#FFFFFF' },
  NEW: { primary: '#241F20', secondary: '#FFFFFF', text: '#FFFFFF' },
  NFO: { primary: '#DD0000', secondary: '#FFFFFF', text: '#FFFFFF' },
  SUN: { primary: '#EB172B', secondary: '#FFFFFF', text: '#FFFFFF' },
  TOT: { primary: '#132257', secondary: '#FFFFFF', text: '#FFFFFF' },
};

export function normalizeNumericCode(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const cleaned = String(raw).trim().replace(/^p/i, '').replace(/\.(png|jpg|jpeg|webp)$/i, '');
  const code = Number.parseInt(cleaned, 10);
  return Number.isFinite(code) && code > 0 ? code : null;
}

/**
 * Exact candidate chain from `vortex_player_images.py` + `site/ui/player-images.js`:
 * 1. Official PL current season 250x250 / 110x140 (`{code}.png`)
 * 2. Official PL legacy `p{code}.png` (250x250 / 110x140)
 * 3. Premier League S3 `500x500/{code}.png`
 * 4. Official FPL club shirt (`shirt_{teamCode}-220.png`)
 * 5. Server cache/proxy `/api/img/player/{code}` (serves local `public/player-images/players/{code}.png` or cached upstream)
 */
export function getPlayerPhotoCandidates(
  codeRaw: unknown,
  teamCodeRaw?: unknown,
  size: 'sm' | 'md' | 'lg' = 'md',
): string[] {
  const code = normalizeNumericCode(codeRaw);
  const teamCode = normalizeNumericCode(teamCodeRaw);
  const urls: string[] = [];

  if (code) {
    urls.push(
      `${PL_PHOTO_BASE_CURRENT}/250x250/${code}.png`,
      ...(size === 'lg' ? [`${PL_PHOTO_BASE_CURRENT}/500x500/${code}.png`] : []),
      `${PL_PHOTO_BASE_CURRENT}/110x140/${code}.png`,
      `${PL_PHOTO_BASE_LEGACY}/250x250/p${code}.png`,
      `${PL_PHOTO_BASE_LEGACY}/110x140/p${code}.png`,
      `${PL_PHOTO_BASE_S3}/500x500/${code}.png`,
    );
  }

  if (teamCode) {
    urls.push(
      `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-220.png`,
      `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-110.png`,
    );
  }

  if (code) {
    urls.push(
      withBase(`player-images/players/${code}.png`),
      `/api/img/player/${code}${teamCode ? `?teamCode=${teamCode}` : ''}`,
    );
  }

  return [...new Set(urls)];
}

export function getClubBadgeCandidates(teamCodeRaw: unknown): string[] {
  const teamCode = normalizeNumericCode(teamCodeRaw);
  if (!teamCode) return [];
  return [
    `${PL_BADGE_BASE}/100/t${teamCode}.png`,
    `${PL_BADGE_BASE}/70/t${teamCode}.png`,
    `${PL_BADGE_BASE}/t${teamCode}.png`,
    withBase(`player-images/badges/t${teamCode}.png`),
    `/api/img/badge/${teamCode}`,
  ];
}

export function playerInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/[\s.-]+/)
    .filter(Boolean);
  if (parts.length === 0) return 'FV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export function buildJerseyFallbackSvgDataUri(name: string, teamShort = 'FPL', isGk = false): string {
  const palette = isGk
    ? { primary: '#117A65', secondary: '#5BF5D6', text: '#FFFFFF' }
    : CLUB_COLORS[teamShort.toUpperCase()] ?? { primary: '#3A3F7A', secondary: '#5BF5D6', text: '#FFFFFF' };
  const initials = playerInitials(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 100" role="img" aria-label="${initials}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.primary}"/>
        <stop offset="100%" stop-color="#0f1328"/>
      </linearGradient>
    </defs>
    <rect width="88" height="100" rx="18" fill="#10142a"/>
    <path d="M24 22 L34 16 Q44 23 54 16 L64 22 L75 36 L66 44 L61 38 L61 84 L27 84 L27 38 L22 44 L13 36 Z" fill="url(#g)" stroke="${palette.secondary}" stroke-width="2.2"/>
    <text x="44" y="61" text-anchor="middle" fill="${palette.text}" font-family="Inter,system-ui,sans-serif" font-weight="800" font-size="20">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
