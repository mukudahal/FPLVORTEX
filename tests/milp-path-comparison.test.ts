import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMilpPaths, createReviewedMilpPlan, type ExactMilpRequest } from '../src/lib/milpPathComparison.ts';
import type { ExactMilpResponse, ExactMilpWeek } from '../src/lib/exactMilpBridge.ts';

function fixture() {
  const position = (id: number): 'GK' | 'DEF' | 'MID' | 'FWD' =>
    id <= 2 ? 'GK' : id <= 7 ? 'DEF' : id <= 12 || id === 16 ? 'MID' : 'FWD';
  const players = Array.from({ length: 16 }, (_, i) => {
    const id = i + 1;
    return {
      player_id: id, name: 'Synthetic ' + id,
      team_id: id % 10 + 1, position: position(id),
      current_price: id === 16 ? 5.5 : 5,
      selling_price: id <= 15 ? 5 : null,
      xpts_by_gw: { 37: id === 16 ? 6 : position(id) === 'GK' ? 3 : 4,
                    38: id === 16 ? 6 : position(id) === 'GK' ? 3 : 4 },
      xmin_by_gw: { 37: null, 38: null },
      availability_by_gw: { 37: null, 38: null },
      has_fixture_by_gw: { 37: true, 38: true },
    };
  });
  const current = Array.from({ length: 15 }, (_, i) => i + 1);
  const request = {
    players,
    current_team: { squad_player_ids: current, bank: 1, free_transfers: 1, current_gameweek: 37 },
    settings: {
      start_gw: 37, end_gw: 38, transfer_depth: 2,
      max_transfers_per_gw: 2, max_total_hits: 24,
      time_decay: .85, free_transfer_value: 0, bank_value_per_million: 0,
      solutions_requested: 3, time_limit_seconds: 10, mip_gap: .02,
      locked_players: [1], excluded_players: [], forced_transfers: [], allow_blank_starters: true,
    },
  } as ExactMilpRequest;
  const week = (gw: number, swapped: boolean): ExactMilpWeek => {
    const squad = swapped ? [...current.filter(id => id !== 8), 16] : current;
    const starters = swapped ? [1, 3, 4, 5, 16, 9, 10, 11, 13, 14, 15] : [1, 3, 4, 5, 8, 9, 10, 11, 13, 14, 15];
    const bench = squad.filter(id => !starters.includes(id));
    const transfers_out = swapped && gw === 37 ? [8] : [];
    const transfers_in = swapped && gw === 37 ? [16] : [];
    const ft = swapped ? gw === 37 ? 1 : 1 : gw === 37 ? 1 : 2;
    const forecast = (id: number) => request.players.find(p => p.player_id === id)!.xpts_by_gw[gw as 37 | 38];
    return {
      gw, squad, starters, bench, captain: 13, vice_captain: 14,
      transfers_out, transfers_in,
      free_transfers_before: ft, free_transfers_after: Math.min(5, Math.max(0, ft - transfers_in.length) + 1),
      hit_cost: 0, bank: swapped ? .5 : 1,
      expected_points_after_hits: starters.reduce((total, id) => total + forecast(id), 0) + forecast(13),
    };
  };
  const makePlan = (swapped: boolean): ExactMilpResponse['plans'][number] => {
    const gameweeks = [week(37, swapped), week(38, swapped)];
    const raw = gameweeks.reduce((acc, w) => acc + w.expected_points_after_hits, 0);
    const discounted = gameweeks[0].expected_points_after_hits + .85 * gameweeks[1].expected_points_after_hits;
    return {
      gameweeks, raw_expected_points_after_hits: raw,
      discounted_points_after_hits: discounted, evaluation_score: discounted,
      solver: { status: 0, message: 'Synthetic feasible', mip_gap: 0, optimality_proven: true },
    };
  };
  const response: ExactMilpResponse = {
    plans: [makePlan(false), makePlan(true)], solver_attempts: [
      { status: 0, message: 'Synthetic successful solve', mip_gap: 0, optimality_proven: true },
      { status: 0, message: 'Synthetic successful solve', mip_gap: 0, optimality_proven: true },
    ],
    runtime_seconds: .2, assumptions: { chip_mode: 'off' }, warnings: [],
  };
  return { request, response };
}

test('ranks distinct full-horizon transfer paths by discounted objective with transparent deltas', () => {
  const { request, response } = fixture();
  const compared = compareMilpPaths(request, response);
  assert.equal(compared.length, 2);
  assert.deepEqual(compared.map(p => p.rank), [1, 2]);
  assert.equal(compared[0].plan.gameweeks[0].transfers_in[0], 16);
  assert.equal(compared[0].totalTransfers, 1);
  assert.equal(compared[0].totalHits, 0);
  assert.equal(compared[0].lastBank, .5);
  assert.equal(compared[0].lastFreeTransfers, 2);
  assert.equal(compared[1].lastBank, 1);
  assert.equal(compared[1].lastFreeTransfers, 3);
  assert.ok(compared[1].deltaRawPoints < 0 && compared[1].deltaObjective < 0);
  assert.equal(compared[0].deltaObjective, 0);
  assert.equal(compared[0].deltaRawPoints, 0);
});

test('explicitly accepted proposal creates a new, legal, independent Transfer Lab plan', () => {
  const { request, response } = fixture();
  const compared = compareMilpPaths(request, response);
  const originalJson = JSON.stringify(response);
  const accepted = createReviewedMilpPlan({
    request, path: compared[0], name: 'MILP Path A', id: 'milp-review-123',
    createdAt: '2026-11-01T00:00:00.000Z',
  });
  assert.equal(accepted.startGw, 37);
  assert.equal(accepted.baseBankTenths, 10);
  assert.equal(accepted.baseFreeTransfers, 1);
  assert.deepEqual(accepted.baseSquad, request.current_team.squad_player_ids);
  assert.deepEqual(accepted.lockedPlayerIds, [1]);
  assert.deepEqual(accepted.transfers[37], [{ out: 8, in: 16 }]);
  assert.deepEqual(accepted.chips, {});
  assert.equal(accepted.lineups[37].length, 15);
  assert.deepEqual(accepted.captains[38], { captain: 13, vice: 14 });
  assert.equal(JSON.stringify(response), originalJson, 'proposal conversion must not mutate the original solver output');
});

test('never trust malformed transfers, price ledger, FT rollover, objective or duplicate paths', () => {
  const mutate = (edit: (r: ExactMilpResponse) => void) => {
    const { request, response } = fixture();
    edit(response);
    assert.throws(() => compareMilpPaths(request, response), RangeError);
  };
  mutate(r => { r.plans[0].gameweeks[0].free_transfers_after = 5; });
  mutate(r => { r.plans[0].gameweeks[0].bank = -5; });
  mutate(r => { r.plans[0].gameweeks[0].hit_cost = 4; });
  mutate(r => { r.plans[0].gameweeks[0].transfers_out = [9]; });
  mutate(r => { r.plans[0].gameweeks[0].squad = [1, 2]; });
  mutate(r => { r.plans[0].gameweeks[0].expected_points_after_hits += 10; });
  mutate(r => { r.plans[0].evaluation_score += 30; });
  mutate(r => { r.plans[1] = structuredClone(r.plans[0]); });
  mutate(r => { r.plans.push(structuredClone(r.plans[0]), structuredClone(r.plans[1])); });
});

test('one feasible or zero feasible paths remain honest, not synthesized', () => {
  const { request, response } = fixture();
  response.plans = response.plans.slice(0, 1);
  assert.equal(compareMilpPaths(request, response).length, 1);
  response.plans = [];
  assert.deepEqual(compareMilpPaths(request, response), []);
});
