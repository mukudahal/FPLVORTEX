/**
 * Resolves public asset paths against Vite's configured `BASE_URL`
 * (defaults to `'/'` in Express/dev/tests, or e.g. `'/FPLVORTEX/'` for static subpath builds).
 */
export function withBase(relativePath: string): string {
  const cleanRel = relativePath.replace(/^\/+/, '');
  const metaEnv = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const rawBase = metaEnv?.BASE_URL || '/';
  const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return `${normalizedBase}${cleanRel}`;
}

export const BRAND_LION_SRC = withBase('player-images/brand/fpl-vortex-lion.jpg');
