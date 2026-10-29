import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { enrichWithMatchHistory, historicalStrengths } from '../server/matchHistory.ts';
import { buildFixtureMatrix } from '../src/lib/fixtures.ts';
import type { Snapshot } from '../src/lib/types.ts';

function snapshot(): Snapshot {
  return {
    meta: { season: '2026/27', generatedAt: '2026-10-10T00:00:00Z' },
    teams: [{ id: 1, code: 3 }, { id: 2, code: 7 }],
    fixtures: [{ id: 1, event: 1, kickoffTime: '2026-10-08T15:00:00Z', finished: true, teamH: 1, teamA: 2, teamHScore: 3, teamAScore: 0 }],
  } as Snapshot;
}
const previous = { season: '2025-26', kickoff: '2026-05-01T15:00:00Z', home: 3, away: 7, homeGoals: 4, awayGoals: 0 };

test('history affects strengths and current fixtures are counted once', () => {
  const s = snapshot();
  const model = historicalStrengths(s, [previous, { ...previous, season: '2026-27' }])!;
  assert.equal(model.matches, 2);
  assert.ok(model.strengths['1'].atkH > 1);
  assert.ok(model.strengths['2'].defWeakA > 1);
  assert.ok(model.strengths['2'].atkA < 1);
});

test('future results, unplayed games and duplicated historical rows are guarded', () => {
  const s = snapshot();
  const model = historicalStrengths(s, [{ ...previous, kickoff: '2027-01-01T00:00:00Z' }])!;
  assert.equal(model.matches, 1);
  assert.throws(() => historicalStrengths(s, [previous, previous]), /Duplicate/);
  s.fixtures[0].finished = false;
  assert.equal(historicalStrengths(s, []), null);
});

test('real match archive enriches snapshot and projected fixture matrix', async () => {
  const s = JSON.parse(await readFile('public/data/fpl-snapshot.json', 'utf8')) as Snapshot;
  const enriched = await enrichWithMatchHistory(s);
  const model = enriched.historicalTeamModel;
  assert.equal(model?.method, 'historical-goals-v1');
  assert.ok((model?.matches ?? 0) >= 3040);
  assert.ok(Object.keys(model?.strengths ?? {}).length > 15);
  const before = buildFixtureMatrix(s.teams, s.fixtures, s.meta.nextEventId, 1);
  const after = buildFixtureMatrix(s.teams, s.fixtures, s.meta.nextEventId, 1, [], model?.strengths);
  assert.ok(after.some((row, index) => row.cells[0].lambdaFor !== before[index].cells[0].lambdaFor));
});
