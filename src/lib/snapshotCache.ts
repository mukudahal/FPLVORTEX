import type { Snapshot } from './types';

const KEY = 'vortex:publicSnapshot:v1';
const MAX_AGE_MS = 24 * 60 * 60_000;
type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Public player/fixture data only. Manager and league responses never enter this cache. */
export function readSnapshotCache(storage: Store, now = Date.now()): Snapshot | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw || raw.length > 3_000_000) return null;
    const value = JSON.parse(raw) as Snapshot;
    const generated = Date.parse(value.meta?.generatedAt ?? '');
    if (!Number.isFinite(generated) || generated > now || now - generated > MAX_AGE_MS ||
      value.meta?.season !== '2026/27' || !Array.isArray(value.players) || value.players.length < 400 ||
      !Array.isArray(value.fixtures) || value.fixtures.length < 300 ||
      !Array.isArray(value.teams) || value.teams.length !== 20 || !Array.isArray(value.gameweeks)) return null;
    return { ...value, meta: { ...value.meta, source: 'offline', stale: true,
      upstreamOk: false, servedAt: new Date(now).toISOString() } };
  } catch { return null; }
}

export function writeSnapshotCache(storage: Store, snapshot: Snapshot): void {
  try { storage.setItem(KEY, JSON.stringify(snapshot)); }
  catch { /* Disabled storage or quota exhaustion must not break the dashboard. */ }
}
