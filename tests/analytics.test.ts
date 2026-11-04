import assert from 'node:assert/strict';
import test from 'node:test';
import { captaincyRanking, differentialRanking, valueRanking, riskWatchlist, projectPlayer, searchPlayers } from '../src/lib/analytics.ts';
import { buildProjectionContext } from '../src/lib/fixtures.ts';
import { makeFixture, makeGameweek, makePlayer, makeTeam } from './helpers.ts';

function context() {
  const teams = [makeTeam(1, 'EASY'), makeTeam(2, 'HARD')];
  const fixtures = Array.from({ length: 5 }, (_, index) => makeFixture(index + 1, 9 + index, 1, 2, 2, 5));
  const gameweeks = Array.from({ length: 38 }, (_, index) =>
    makeGameweek(index + 1, {
      finished: index < 8,
      isCurrent: index === 8,
      isNext: index === 9,
      isPrevious: index === 7,
    }),
  );
  return buildProjectionContext(teams, fixtures, gameweeks, 9);
}

test('captain, differential and value recommendations require unflagged official availability', () => {
  const healthy = makePlayer(1, { projection: 5, availability: 0.9, ownership: 8, value: 1, leverage: 1 });
  for (const [status, chance] of [['i', 0], ['d', 75], ['s', null], ['u', 0], ['a', 50]] as const) {
    const flagged = makePlayer(2, { status, chance, projection: 100, availability: 0.99, ownership: 8, value: 99, leverage: 99 });
    for (const rank of [captaincyRanking, differentialRanking, valueRanking]) {
      assert.deepEqual(rank([healthy, flagged]).map(player => player.id), [healthy.id]);
    }
    if (status !== 'a') assert.ok(riskWatchlist([flagged]).some(player => player.id === flagged.id));
  }
});

test('projection rewards kind fixtures and discounts unavailable players', () => {
  const model = context();
  const easy = projectPlayer(
    makePlayer(1, { teamId: 1, epNext: 6, epThis: 6, form: 6, ppg: 6, minutes: 720, status: 'a', chance: null }),
    model,
    'balanced',
  );
  const hard = projectPlayer(
    makePlayer(2, { teamId: 2, epNext: 6, epThis: 6, form: 6, ppg: 6, minutes: 720, status: 'a', chance: null }),
    model,
    'balanced',
  );
  const injured = projectPlayer(
    makePlayer(3, { teamId: 1, epNext: 6, epThis: 6, form: 6, ppg: 6, minutes: 720, status: 'i', chance: 0 }),
    model,
    'balanced',
  );
  assert.ok(easy.projection > hard.projection, 'easy fixture run should outscore a hard run');
  assert.ok(easy.projection > injured.projection, 'injured player should be discounted');
  assert.ok(easy.fixtureScore < hard.fixtureScore);
  assert.ok(easy.confidence > 0 && easy.confidence <= 1);
  assert.ok(easy.reasons.length > 0);
});

test('differential profile lifts low-owned players and search finds by name or club', () => {
  const model = context();
  const template = makePlayer(7, { teamId: 1, ownership: 3, name: 'Vortex', team: makeTeam(1, 'VOR') });
  const balanced = projectPlayer(template, model, 'balanced');
  const differential = projectPlayer(template, model, 'differential');
  assert.ok(differential.projection > balanced.projection);
  const players = [balanced, differential];
  assert.equal(searchPlayers(players, 'vor')[0]?.id, 7);
  assert.equal(searchPlayers(players, 'Vortex', 1)[0]?.name, 'Vortex');
});

