import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPlannerSimulation, type PlannerSimulationInput } from '../src/lib/repoModel/compassPlanner.ts';
import { createSimulationExport, simulationCsv, SIMULATION_EXPORT_VERSION } from '../src/lib/simulationExport.ts';
import { makeFixture, makePlayer, makeTeam } from './helpers.ts';
import { toRepoElement } from '../src/lib/analytics.ts';
import { toRepoFixtures, toRepoTeams } from '../src/lib/fixtures.ts';
import {
  sanitizeStoredPlan, readSelectedTransferPlanId, writeSelectedTransferPlanId,
  selectedTransferPlanStorageKey, type StoredTransferPlan,
} from '../src/lib/transferPlansStore.ts';
import type { Position } from '../src/lib/types.ts';

function inputs(): PlannerSimulationInput {
  const positions: Position[] = ['GKP', 'GKP', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'MID', 'MID'];
  const players = positions.map((position, index) => makePlayer(index + 1, {
    position, teamId: index % 10 + 1, team: makeTeam(index % 10 + 1),
    cost: 50, gwProjections: { 37: index >= 15 ? 12 : 4, 38: index >= 15 ? 12 : 4 },
  }));
  const fixtures = [37, 38].flatMap(gw =>
    Array.from({ length: 5 }, (_, i) => makeFixture(gw * 10 + i, gw, i * 2 + 1, i * 2 + 2)));
  return {
    players, currentSquadIds: players.slice(0, 15).map(p => p.id),
    bankTenths: 0, freeTransfersNow: 0, nextGw: 37, horizon: 2,
    chipsUsed: [], chipHistoryKnown: true, draws: 100,
    repoElements: players.map(toRepoElement),
    repoTeams: toRepoTeams(Array.from({ length: 10 }, (_, i) => makeTeam(i + 1))),
    repoFixtures: toRepoFixtures(fixtures),
  };
}

function savedPlan(): StoredTransferPlan {
  return {
    id: 'saved-37', name: 'Manual Plan A', startGw: 37,
    baseSquad: Array.from({ length: 15 }, (_, i) => i + 1),
    baseBankTenths: 0, baseFreeTransfers: 0,
    sellingPrices: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 1, 50])),
    transfers: { 37: [{ out: 8, in: 16 }], 38: [{ out: 9, in: 17 }] },
    lineups: { 37: [1, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 2, 6, 7, 15] },
    captains: { 37: { captain: 16, vice: 9 } },
    chips: { 37: 'tc' }, lockedPlayerIds: [1],
    createdAt: '2026-10-30T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z',
  };
}

test('simulation export identifies inputs, replays the selected saved plan and escapes CSV labels', async () => {
  const input = { ...inputs(), forecastAsOf: '2026-11-04T00:00:00Z', importedProjectionFileDate: '2026-11-04', manualPlan: savedPlan() };
  const original = JSON.stringify(input);
  const stages: string[] = [];
  const result = runPlannerSimulation(input, stage => stages.push(stage));
  assert.deepEqual(stages, ['Planning paths','Sampling outcomes']);
  const provenance = { completedAt: '2026-11-04T00:01:00Z', snapshotAt: input.forecastAsOf };
  const data = await createSimulationExport(input, result, provenance);
  assert.equal(data.modelVersion, SIMULATION_EXPORT_VERSION);
  assert.match(data.inputVersion, /^sha256:[0-9a-f]{64}$/);
  assert.equal(data.selectedPlan?.id, input.manualPlan.id);
  assert.equal(data.calibration, 'unverified');
  assert.deepEqual(runPlannerSimulation(JSON.parse(JSON.stringify(data.input))).monteCarlo, result.monteCarlo);
  assert.equal((await createSimulationExport(input, result, provenance)).inputVersion, data.inputVersion);
  await assert.rejects(createSimulationExport({ ...input, draws: 300 }, result, provenance), /inputs changed/);
  result.monteCarlo.paths[0].label = '=SUM(1,2)';
  const csv = simulationCsv(data);
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.equal(csv.split('\r\n').length, result.monteCarlo.paths.length + 2);
  assert.equal(JSON.stringify(input), original, 'Exports and replays preserve all saved decisions');
  assert.throws(() => runPlannerSimulation({ ...input, forecastAsOf: 'invalid' }), /as-of/);
});

test('selected plan locks, manual transfers, XI, captain and chip replay in solver and paired Monte Carlo', () => {
  const manualPlan = savedPlan();
  const before = JSON.stringify(manualPlan);
  const result = runPlannerSimulation({ ...inputs(), manualPlan, lockedIds: manualPlan.lockedPlayerIds });
  assert.equal(JSON.stringify(manualPlan), before, 'worker must never mutate saved plan');
  assert.equal(result.sourcePlan?.id, 'saved-37');
  assert.equal(result.strategy.chipTiming, null, 'do not override saved manual chips with timing counterfactuals');
  assert.equal(result.strategy.weeks[0].chip, 'tc');
  assert.deepEqual(result.strategy.weeks[0].moves, [{ outId: 8, inId: 16 }]);
  assert.deepEqual(result.strategy.weeks[1].moves, [{ outId: 9, inId: 17 }]);
  assert.equal(result.strategy.weeks[0].lineup.captainId, 16);
  assert.ok(result.strategy.weeks[0].lineup.starters.includes(16));
  assert.equal(result.strategy.weeks[0].hitCost, 4);
  assert.ok(result.strategy.weeks.every(week => week.squad.includes(1)), 'locked player is retained');
  assert.ok(result.monteCarlo.paths.some(path => path.id === 'saved_manual'));
  assert.ok(result.monteCarlo.paths.every(path => Number.isFinite(path.mean)));
  assert.ok(result.monteCarlo.assumptions.some(value => value.includes('Saved-plan and optimized-path comparisons')));
});

test('stale plans and unsatisfiable manual commitments fail closed', () => {
  const old = savedPlan();
  old.startGw = 36;
  assert.throws(() => runPlannerSimulation({ ...inputs(), manualPlan: old }), /Rebase or create a new plan/);
  const conflict = savedPlan();
  conflict.lockedPlayerIds = [8];
  assert.throws(() => runPlannerSimulation({ ...inputs(), manualPlan: conflict, lockedIds: [8] }), /GW37 manual transfers are not legal/);
});

test('saved selection is entry-scoped; sanitized player locks never include non-squad players', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  writeSelectedTransferPlanId(storage, 12345, 'scenario-A');
  writeSelectedTransferPlanId(storage, 67890, '__live__');
  assert.equal(readSelectedTransferPlanId(storage, 12345), 'scenario-A');
  assert.equal(readSelectedTransferPlanId(storage, 67890), '__live__');
  assert.notEqual(selectedTransferPlanStorageKey(12345), selectedTransferPlanStorageKey(67890));
  const sanitized = sanitizeStoredPlan({ ...savedPlan(), lockedPlayerIds: [1, 1, 999] });
  assert.deepEqual(sanitized?.lockedPlayerIds, [1]);
});

