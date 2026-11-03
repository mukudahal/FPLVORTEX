import type { Snapshot } from '../src/lib/types.ts';

/** Reject an outage fallback before it can replace the committed recovery snapshot. */
export function assertFreshSnapshot(value: unknown, now = Date.now(), maxAgeMs = 15 * 60_000): asserts value is Snapshot {
  const s = value as Partial<Snapshot> | null;
  if (!s?.meta || !Array.isArray(s.players) || s.players.length < 400 ||
    !Array.isArray(s.fixtures) || s.fixtures.length < 300 ||
    !Array.isArray(s.teams) || s.teams.length !== 20 ||
    !Array.isArray(s.gameweeks) || !s.gameweeks.length) throw new Error('Snapshot is incomplete');
  const teamIds = new Set(s.teams.map(t => t.id));
  const playerIds = new Set(s.players.map(p => p.id));
  const fixtureIds = new Set(s.fixtures.map(f => f.id));
  if (teamIds.size !== 20 || playerIds.size !== s.players.length || fixtureIds.size !== s.fixtures.length ||
      s.teams.some(t => !Number.isSafeInteger(t.id) || t.id <= 0) ||
      s.players.some(p => !Number.isSafeInteger(p.id) || p.id <= 0 || !teamIds.has(p.teamId) ||
        !Number.isSafeInteger(p.cost) || p.cost < 35 || p.cost > 300 ||
        !['GKP','DEF','MID','FWD'].includes(p.position)) ||
      s.fixtures.some(f => !Number.isSafeInteger(f.id) || f.id <= 0 || !teamIds.has(f.teamH) ||
        !teamIds.has(f.teamA) || f.teamH === f.teamA)) throw new Error('Snapshot identity, club references or prices are invalid');
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

