import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMatchArchive } from '../scripts/archive-fpl-matches.ts';
import type { Snapshot } from '../src/lib/types.ts';

function snapshot(): Snapshot {
  return {
    meta: { season: '2026/27', generatedAt: '2026-08-23T20:00:00Z', upstreamOk: true, stale: false },
    teams: [{ id: 1, code: 3 }, { id: 2, code: 7 }],
    fixtures: [{ id: 1, event: 1, finished: true, kickoffTime: '2026-08-22T15:00:00Z', teamH: 1, teamA: 2, teamHScore: 2, teamAScore: 1 }],
  } as Snapshot;
}

test('archive is idempotent and keeps original observation timestamp', () => {
  const first = snapshot();
  const archive = mergeMatchArchive(first);
  first.meta.generatedAt = '2026-08-24T20:00:00Z';
  assert.deepEqual(mergeMatchArchive(first, archive), archive);
  assert.equal(archive.matches[0].versions[0].observedAt, '2026-08-23T20:00:00Z');
});

test('revisions are timestamped and preserve the original value', () => {
  const s = snapshot();
  const first = mergeMatchArchive(s);
  s.meta.generatedAt = '2026-08-24T20:00:00Z'; s.fixtures[0].teamHScore = 3;
  const next = mergeMatchArchive(s, first);
  assert.deepEqual(next.matches[0].versions.map(v => v.homeGoals), [2, 3]);
  assert.equal(first.matches[0].versions.length, 1);
  assert.throws(() => mergeMatchArchive(snapshot(), next), /Older snapshot/);
});

test('stale snapshots, duplicate matches and invalid results fail closed', () => {
  const s = snapshot(); s.meta.stale = true;
  assert.throws(() => mergeMatchArchive(s), /healthy/);
  s.meta.stale = false;
  s.fixtures.push({ ...s.fixtures[0], id: 2 });
  assert.throws(() => mergeMatchArchive(s), /Duplicate team pairing/);
  s.fixtures.pop(); s.fixtures[0].teamHScore = null;
  assert.throws(() => mergeMatchArchive(s), /Invalid finished fixture/);
});

test('unfinished fixtures are not recorded and existing history is retained', () => {
  const s = snapshot(); const archive = mergeMatchArchive(s);
  s.meta.generatedAt = '2026-08-24T20:00:00Z'; s.fixtures[0].finished = false;
  assert.deepEqual(mergeMatchArchive(s, archive), archive);
});
