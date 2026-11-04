import assert from 'node:assert/strict';
import test from 'node:test';
import { optimizeSquad, recommendTransfers } from '../src/lib/optimize.ts';
import { isEligibleNewTransferTarget } from '../src/lib/transferEligibility.ts';
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

test('officially injured, doubtful and suspended players are never new automatic transfers', () => {
  const players = syntheticPlayerPool();
  const flagged = players.filter(p => p.position === 'MID')[12];
  Object.assign(flagged, {
    status: 'i', chance: 0, availability: 0.2,
    projection: 100, horizon5Projection: 500,
  });
  assert.equal(isEligibleNewTransferTarget(flagged), false);
  assert.equal(isEligibleNewTransferTarget({ ...flagged, status: 'd', chance: 75 }), false);
  assert.equal(isEligibleNewTransferTarget({ ...flagged, status: 's', chance: null }), false);
  assert.equal(isEligibleNewTransferTarget({ ...flagged, status: 'a', chance: null }), true);

  const built = optimizeSquad(players, { budget: 1000 });
  assert.ok(!built.squad.some(p => p.id === flagged.id), 'Unflagged alternatives must beat a flagged 100-point target');

  const from = (position: 'GKP' | 'DEF' | 'MID' | 'FWD', start: number, count: number) =>
    players.filter(p => p.position === position).slice(start, start + count);
  const current = [
    ...from('GKP', 0, 2), ...from('DEF', 2, 5),
    ...from('MID', 7, 5), ...from('FWD', 0, 3),
  ];
  const transfers = recommendTransfers(current, players);
  assert.ok(transfers.every(t => t.incoming.id !== flagged.id), 'Even the independent one-transfer solver must exclude flagged purchases');
});

test('no optimizer fallback may silently overspend or buy flagged players', () => {
  const players = syntheticPlayerPool();
  const goalkeeper = players.filter(p => p.position === 'GKP');
  for (const player of goalkeeper.slice(1)) Object.assign(player, { status: 'u', chance: 0, availability: 0 });
  assert.throws(() => optimizeSquad(players, { budget: 1000 }),
    /No legal squad fits the budget/);
});
