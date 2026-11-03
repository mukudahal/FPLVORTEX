import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Snapshot } from '../src/lib/types.ts';
import { buildTeamPlanningReport } from '../src/lib/teamPlanning.ts';
const now = Date.parse('2026-11-03T14:00:00Z');
function sample(): Snapshot {
  return {
    meta: { nextEventId: 10, generatedAt: new Date(now).toISOString(), season: '2026/27', stale: false, upstreamOk: true, source: 'live', isLive: false },
    teams: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, code: i + 1, name: `Team ${i + 1}`, shortName: `T${i + 1}`, strengthAttackHome: 1100, strengthAttackAway: 1100, strengthDefenceHome: 1100, strengthDefenceAway: 1100 })),
    players: [], gameweeks: [],
    fixtures: [{ id: 1, event: 10, teamH: 1, teamA: 2, teamHDifficulty: 2, teamADifficulty: 4, kickoffTime: '2026-11-06T20:00:00Z', finished: false }],
  } as unknown as Snapshot;
}
test('all 20 clubs are exported with canonical coherent probabilities, without mutating inputs', () => {
  const s = sample(), original = JSON.stringify(s), r = buildTeamPlanningReport(s, 5, now);
  assert.equal(r.rows.length, 20);
  assert.deepEqual(r.events, [10, 11, 12, 13, 14]);
  const home = r.rows[0].gameweeks[0].matches[0], away = r.rows[1].gameweeks[0].matches[0];
  // The score grid omits <= 1e-10 tail mass; its first moment has a larger bound.
  assert.ok(Math.abs(home.cleanSheet - Math.exp(-1.25)) < 1e-10);
  assert.ok(Math.abs(home.cleanSheet - Math.exp(-away.goals)) < 1e-8);
  assert.ok(home.win + away.win < 1);
  assert.equal(home.officialFdr, 2); assert.equal(away.officialFdr, 4);
  assert.equal(JSON.stringify(s), original);
});
test('doubles sum goals and expected clean sheets; blanks never dilute the mean index', () => {
  const s = sample(); s.fixtures.push({ ...s.fixtures[0], id: 2, teamA: 3 });
  const row = buildTeamPlanningReport(s, 5, now).rows[0], matches = row.gameweeks[0].matches;
  assert.equal(matches.length, 2); assert.equal(row.fixtureCount, 2);
  assert.equal(row.projectedGoals, matches.reduce((v, f) => v + f.goals, 0));
  assert.equal(row.expectedCleanSheets, matches.reduce((v, f) => v + f.cleanSheet, 0));
  assert.equal(row.meanAttackIndex, matches[0].attackIndex);
  const blank = buildTeamPlanningReport(s, 5, now).rows[19];
  assert.equal(blank.projectedGoals, 0); assert.equal(blank.meanAttackIndex, null);
  assert.equal(blank.gameweeks[0].blank, true);
});
test('display indices and bookmaker prices never feed back into VORTEX team goal rates', () => {
  const s = sample(), before = buildTeamPlanningReport(s, 1, now).rows[0];
  s.fixtures[0].teamHDifficulty = 5;
  s.fixtures[0].marketOdds = { homeXg: 12, awayXg: 12 } as NonNullable<typeof s.fixtures[0]['marketOdds']>;
  const after = buildTeamPlanningReport(s, 1, now).rows[0];
  assert.equal(after.projectedGoals, before.projectedGoals);
  assert.equal(after.meanAttackIndex, before.meanAttackIndex);
  assert.equal(after.gameweeks[0].matches[0].officialFdr, 5);
});
test('stale, offline-failed and invalid-clock inputs cannot become a new fresh forecast', () => {
  const s = sample();
  assert.throws(() => buildTeamPlanningReport(s, 5, now + 31 * 60000), /Fresh official/);
  s.meta.stale = true; assert.throws(() => buildTeamPlanningReport(s, 5, now), /Fresh official/);
  s.meta.stale = false; s.meta.upstreamOk = false;
  assert.throws(() => buildTeamPlanningReport(s, 5, now), /Fresh official/);
  assert.throws(() => buildTeamPlanningReport(sample(), 5, NaN), /finite clock/);
});
test('season-end clipping, invalid horizons, duplicate fixtures and bad team references', () => {
  const s = sample(); s.meta.nextEventId = 38;
  assert.deepEqual(buildTeamPlanningReport(s, 5, now).events, [38]);
  assert.throws(() => buildTeamPlanningReport(sample(), 0, now), /1–15/);
  const d = sample(); d.fixtures.push({ ...d.fixtures[0] });
  assert.throws(() => buildTeamPlanningReport(d, 5, now), /Duplicate fixture/);
  const b = sample(); b.fixtures[0].teamA = 99;
  assert.throws(() => buildTeamPlanningReport(b, 5, now), /invalid team/);
});
