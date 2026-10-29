import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFixtureMatrix, buildProjectionContext } from '../src/lib/fixtures.ts';
import { makeFixture, makeGameweek, makeTeam } from './helpers.ts';

test('fixture matrix detects doubles, blanks and ranks the easiest run first', () => {
  const teams = [makeTeam(1, 'DBL'), makeTeam(2, 'STD'), makeTeam(3, 'THR')];
  const fixtures = [
    makeFixture(1, 9, 1, 2, 2, 4),
    makeFixture(2, 9, 1, 3, 2, 4),
    makeFixture(3, 10, 2, 3, 3, 3),
  ];
  const rows = buildFixtureMatrix(teams, fixtures, 9, 2);
  const doubleTeam = rows.find((row) => row.team.id === 1);
  assert.ok(doubleTeam);
  assert.equal(doubleTeam.cells[0].isDouble, true);
  assert.equal(doubleTeam.cells[0].difficulty, 2);
  assert.equal(doubleTeam.cells[1].isBlank, true);
  assert.equal(doubleTeam.cells[1].difficulty, 6);
  assert.equal(rows[0].team.id, 2);
  assert.equal(rows[0].rank, 1);
});

test('projection context counts completed events and starts at the selected horizon', () => {
  const gameweeks = Array.from({ length: 38 }, (_, index) =>
    makeGameweek(index + 1, {
      finished: index < 8,
      isCurrent: index === 8,
      isNext: index === 9,
      isPrevious: index === 7,
    }),
  );
  const context = buildProjectionContext([makeTeam(1)], [makeFixture(1, 9, 1, 2, 2, 4)], gameweeks, 9);
  assert.equal(context.projectionStartEventId, 9);
  assert.equal(context.completedEvents, 8);
  assert.equal(context.maxEventId, 38);
  assert.equal(context.fixtureIndex.get(9)?.length, 1);
});

test('market fixture outcomes are derived from the same implied goal distribution', async () => {
  const { forecastFromGoalRates } = await import('../src/lib/repoModel/scoreDistribution.ts');
  const fixture = makeFixture(1, 9, 1, 2);
  fixture.marketOdds = {
    provider: 'football-data', bookmaker: 'Example', updatedAt: '2026-10-28T12:00:00Z',
    oddsHome: 2, oddsDraw: 3, oddsAway: 4, homeWin: .6, draw: .25, awayWin: .15,
    homeXg: 1.85, awayXg: .95, homeCs: .123, awayCs: .456, overround1x2: 1.08,
  };
  const home = buildFixtureMatrix([makeTeam(1), makeTeam(2)], [fixture], 9, 1).find(row => row.team.id === 1)!;
  const expected = forecastFromGoalRates(1.85, .95);
  assert.equal(home.cells[0].winProb, Math.round(expected.homeWin * 1000) / 1000);
  assert.equal(home.cells[0].csProb, Math.round(expected.homeCs * 1000) / 1000);
  assert.notEqual(home.cells[0].winProb, fixture.marketOdds.homeWin);
});
