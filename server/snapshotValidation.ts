import type { Snapshot } from '../src/lib/types.ts';

/** Reject an outage fallback before it can replace the committed recovery snapshot. */
export function assertFreshSnapshot(value: unknown, now = Date.now(), maxAgeMs = 15 * 60_000): asserts value is Snapshot {
  const s = value as Partial<Snapshot> | null;
  if (!s?.meta || !Array.isArray(s.players) || s.players.length < 400 ||
    !Array.isArray(s.fixtures) || s.fixtures.length < 300 ||
    !Array.isArray(s.teams) || s.teams.length !== 20 ||
    !Array.isArray(s.gameweeks) || !s.gameweeks.length) throw new Error('Snapshot is incomplete');
  const generated = Date.parse(s.meta.generatedAt ?? '');
  if (!Number.isFinite(generated) || generated > now || now - generated > maxAgeMs) {
    throw new Error('Snapshot generation time is stale, invalid or in the future');
  }
  if (s.meta.stale !== false || s.meta.upstreamOk !== true ||
    s.meta.season !== '2026/27' || !Number.isInteger(s.meta.nextEventId) ||
    s.meta.nextEventId < 1 || s.meta.nextEventId > 38 ||
    !['live', 'cache', 'snapshot'].includes(s.meta.source)) {
    throw new Error('Snapshot is an unverified upstream fallback');
  }
}
