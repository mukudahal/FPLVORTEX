import assert from 'node:assert/strict';
import test from 'node:test';
import { optimizeSquad } from '../src/lib/optimize.ts';
import { syntheticPlayerPool } from './helpers.ts';

test('optimizer returns a legal fifteen within budget and club limits', () => {
  const players = syntheticPlayerPool();
  const result = optimizeSquad(players, { budget: 1000, beamWidth: 320, poolSize: 18 });
  assert.equal(result.squad.length, 15);
  assert.equal(result.starters.length, 11);
  assert.equal(result.bench.length, 4);
  assert.equal(result.squad.filter((player) => player.position === 'GKP').length, 2);
  assert.equal(result.squad.filter((player) => player.position === 'DEF').length, 5);
  assert.equal(result.squad.filter((player) => player.position === 'MID').length, 5);
  assert.equal(result.squad.filter((player) => player.position === 'FWD').length, 3);
  assert.ok(result.cost <= 100.0001, `squad cost ${result.cost} must stay within budget`);
  const clubTotals = new Map<number, number>();
  for (const player of result.squad) clubTotals.set(player.teamId, (clubTotals.get(player.teamId) ?? 0) + 1);
  assert.ok(Math.max(...clubTotals.values()) <= 3);
  assert.equal(result.starters.filter((player) => player.position === 'GKP').length, 1);
  assert.equal(result.captain.isCaptain, true);
  assert.equal(result.captain.multiplier, 2);
  assert.ok(result.viceCaptain.id !== result.captain.id);
  assert.match(result.formation, /^\d-\d-\d$/);
});

test('locked players are retained in the optimized squad', () => {
  const players = syntheticPlayerPool();
  const locked = players.filter((player) => player.position === 'FWD').at(-1);
  assert.ok(locked);
  const result = optimizeSquad(players, {
    budget: 1000,
    lockedIds: [locked.id],
    beamWidth: 320,
    poolSize: 18,
  });
  assert.ok(result.squad.some((player) => player.id === locked.id));
  assert.equal(result.squad.length, 15);
});
