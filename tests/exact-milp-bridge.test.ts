import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExactMilpRequest } from '../src/lib/exactMilpBridge.ts';
import { makePlayer, makeTeam } from './helpers.ts';
import type { PlannerSimulationOutput } from '../src/lib/repoModel/compassPlanner.ts';
import type { Snapshot, EnrichedPlayer, Position } from '../src/lib/types.ts';

const positions: Position[] = [
  'GKP', 'GKP', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF',
  'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD',
];
function sample() {
  const players = positions.map((position, i) => makePlayer(i + 1, {
    position, teamId: i % 10 + 1, team: makeTeam(i % 10 + 1), cost: 50,
  })) as EnrichedPlayer[];
  players.push(makePlayer(16, { position: 'MID', teamId: 8, team: makeTeam(8), cost: 55 }) as EnrichedPlayer);
  const gws = [37, 38];
  const forecastByGw = Object.fromEntries(gws.map(gw => [
    gw, Object.fromEntries(players.map(p => [p.id, p.position === 'GKP' ? 3 : p.id === 16 ? 9 : 4])),
  ]));
  const snapshot = {
    meta: { nextEventId: 37, stale: false },
    fixtures: gws.flatMap(gw => Array.from({ length: 5 }, (_, i) => ({
      event: gw, teamH: i * 2 + 1, teamA: i * 2 + 2,
    }))),
  } as unknown as Snapshot;
  const planner = { gws, forecastByGw } as PlannerSimulationOutput;
  const squadIds = players.slice(0, 15).map(p => p.id);
  return { players, snapshot, planner, squadIds, bankTenths: 5, freeTransfers: 0,
    sellingPrices: Object.fromEntries(squadIds.map(id => [id, 50])),
    lockedIds: [1, 2], decay: .85 };
}

test('exact no-chip MILP adapter uses real Planner GW forecasts with no invented xMins', () => {
  const input = sample();
  const payload = buildExactMilpRequest(input);
  assert.equal(payload.current_team.free_transfers, 0, 'zero-FT is valid and must incur hits');
  assert.deepEqual(payload.settings.locked_players, [1, 2]);
  assert.deepEqual([payload.settings.start_gw, payload.settings.end_gw], [37, 38]);
  assert.equal(payload.settings.time_limit_seconds, 10);
  assert.equal(payload.settings.solutions_requested, 3, 'up to three paths share the same bounded solve budget');
  const p16 = payload.players.find(p => p.player_id === 16)!;
  assert.ok(p16);
  assert.equal(p16.xpts_by_gw[37], 9);
  assert.equal(p16.xmin_by_gw[37], null, 'unknown minutes are null, not assumed 90');
  assert.equal(p16.availability_by_gw[38], null, 'next-round chance must not be forecast for later GWs');
  assert.ok(input.squadIds.every(id => payload.players.some(p => p.player_id === id)));
  assert.equal(input.squadIds.length, 15);
  assert.equal(payload.current_team.bank, .5);
});

test('exact no-chip MILP fail-closes on stale, missing or unsafe scenario provenance', () => {
  const sampleInput = sample();
  assert.throws(() => buildExactMilpRequest({ ...sampleInput, snapshot: {
    ...sampleInput.snapshot, meta: { ...sampleInput.snapshot.meta, stale: true },
  } }), /current FPL snapshot/);
  assert.throws(() => buildExactMilpRequest({ ...sampleInput, planner: {
    ...sampleInput.planner, sourcePlan: { id: 'manual', name: 'My Plan', committedGameweeks: 1, lockedPlayers: 0 },
  } }), /manual plan/);
  assert.throws(() => buildExactMilpRequest({ ...sampleInput, sellingPrices: {} }), /selling price/);
  assert.throws(() => buildExactMilpRequest({ ...sampleInput, planner: {
    ...sampleInput.planner, forecastByGw: { ...sampleInput.planner.forecastByGw,
      37: { ...sampleInput.planner.forecastByGw[37], 1: Number.NaN } },
  } }), /missing or invalid xPts/);
  assert.throws(() => buildExactMilpRequest({ ...sampleInput, squadIds: sampleInput.squadIds.slice(0, 14) }), /starting squad/);
});

test('exact shortlist preserves whole-horizon and cheap options and covers both fixture windows', () => {
  const input = sample();
  for (let id = 17; id <= 30; id++) {
    const cost = id <= 18 ? 40 : 60;
    input.players.push(makePlayer(id, { position: 'MID', teamId: 8, cost }));
    const scores = id <= 18 ? [1, 1] : id === 29 ? [11, 0] : id === 30 ? [0, 12] : [8, 8];
    for (const [i, gw] of input.planner.gws.entries()) input.planner.forecastByGw[gw][id] = scores[i];
  }
  const standard = buildExactMilpRequest(input).players.map(player => player.player_id);
  assert.ok(!standard.includes(29) && !standard.includes(30), 'standard ranking uses the existing shortlist');
  const wider = { ...input, includeFixtureWindows: true };
  const shortlist = buildExactMilpRequest(wider).players.map(player => player.player_id);
  assert.ok(standard.every(id => shortlist.includes(id)));
  for (const id of [...input.squadIds, 17, 18, 19, 29, 30]) assert.ok(shortlist.includes(id), String(id));
  assert.ok(shortlist.length <= 60);
  const shuffled = buildExactMilpRequest({ ...wider, players: [...input.players].reverse() });
  assert.deepEqual(shuffled.players.map(player => player.player_id), shortlist);
});
