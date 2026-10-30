import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlannerSimulation, type PlannerSimulationInput } from '../src/lib/repoModel/compassPlanner.ts';
import { solveLineupTS } from '../src/lib/repoModel/fplReviewSimulator.ts';
import { runMonteCarlo } from '../src/lib/repoModel/monteCarlo.ts';
import { validateSeasonChipPlan, validateSquad } from '../src/lib/repoModel/seasonRules.ts';
import { normalizeChipHistory } from '../src/lib/freeTransfers.ts';
import { readFile } from 'node:fs/promises';
import { optimizeSquad } from '../src/lib/optimize.ts';
import { enrichPlayers, toRepoElement } from '../src/lib/analytics.ts';
import { toRepoFixtures, toRepoTeams } from '../src/lib/fixtures.ts';
import { makeFixture, makePlayer, makeTeam } from './helpers.ts';
import type { Position, Snapshot } from '../src/lib/types.ts';

function scenario(nextGw = 18, extra = true): PlannerSimulationInput {
  const positions: Position[] = ['GKP', 'GKP', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'];
  const gws = Array.from({ length: 39 - nextGw }, (_, i) => nextGw + i);
  const players = positions.map((position, i) => makePlayer(i + 1, {
    position, teamId: (i % 10) + 1, team: makeTeam((i % 10) + 1), cost: 50,
    gwProjections: Object.fromEntries(gws.map(gw => [gw, position === 'GKP' ? 3 : 4])),
  }));
  if (extra) players.push(makePlayer(16, { position: 'MID', teamId: 6, team: makeTeam(6), cost: 55, gwProjections: Object.fromEntries(gws.map(gw => [gw, 12])) }));
  const teams = Array.from({ length: 10 }, (_, i) => makeTeam(i + 1));
  const fixtures = gws.flatMap(gw => Array.from({ length: 5 }, (_, i) => makeFixture(gw * 10 + i, gw, i * 2 + 1, i * 2 + 2)));
  return { players, currentSquadIds: players.slice(0, 15).map(p => p.id), bankTenths: 5, freeTransfersNow: 0,
    nextGw, horizon: 2, chipsUsed: [], chipHistoryKnown: true, draws: 300,
    repoFixtures: toRepoFixtures(fixtures), repoTeams: toRepoTeams(teams), repoElements: players.map(toRepoElement) };
}

test('zero FT charges a real hit; selling values, locks and budget constrain every path', () => {
  const input = scenario();
  const result = runPlannerSimulation({ ...input, chipsUsed: ['wildcard', 'freehit', 'bboost', '3xc'].map((name, index) => ({ name, event: 12 + index })) });
  const transfer = result.options.find(o => o.id === 'transfer1')!;
  assert.equal(result.freeTransfersNow, 0);
  assert.equal(transfer.hitCost, 4);
  assert.equal(result.freeTransfersAfterRoll, 1);
  for (const week of result.strategy.weeks) {
    assert.ok(week.bankAfter >= 0);
    assert.equal(week.hitCost, Math.max(0, week.moves.length - week.ftBefore) * 4);
    assert.equal(week.ftAfter, Math.min(5, Math.max(0, week.ftBefore - week.moves.length) + 1));
    const squad = week.squad.map(id => input.players.find(p => p.id === id)!);
    assert.ok(validateSquad(squad.map(p => ({ id: p.id, team: p.teamId, position: ({ GKP: 1, DEF: 2, MID: 3, FWD: 4 })[p.position], priceTenths: p.cost })), 1000).legal);
  }
  const locked = runPlannerSimulation({ ...input, lockedIds: input.currentSquadIds, chipsUsed: undefined, chipHistoryKnown: false });
  assert.deepEqual(locked.strategy.weeks[0].squad, input.currentSquadIds);
  assert.equal(locked.options[1].transfers.length, 0);
  const poorSale = runPlannerSimulation({ ...input, bankTenths: 0, sellingPrices: Object.fromEntries(input.currentSquadIds.map(id => [id, 40])), chipsUsed: undefined, chipHistoryKnown: false });
  assert.equal(poorSale.options[1].transfers.length, 0);
});

test('joint chip plan has one chip per week, respects used chips and exposes reproducible paired gains', () => {
  const input = scenario();
  const result = runPlannerSimulation({ ...input, chipsUsed: [{ name: 'wildcard', event: 12 }] });
  assert.equal(result.chipSimulations.find(c => c.chip === 'wildcard')!.available, false);
  assert.ok(!result.strategy.schedule.some(c => c.chip === 'wc'));
  assert.deepEqual(validateSeasonChipPlan([{ chip: 'wc', gw: 12 }, ...result.strategy.schedule]), []);
  assert.equal(new Set(result.strategy.schedule.map(c => c.gw)).size, result.strategy.schedule.length);
  assert.equal(result.strategy.weeks.length, 2);
  assert.ok(result.monteCarlo.paths.some(p => p.id === 'chip_strategy'));
  assert.deepEqual(result.monteCarlo, runPlannerSimulation({ ...input, chipsUsed: [{ name: 'wildcard', event: 12 }] }).monteCarlo);
  assert.ok(result.monteCarlo.assumptions.some(s => s.includes('not a probability of a green arrow')));
});

test('Free Hit restores permanent holdings and bank after a profitable one-week squad', () => {
  const input = scenario(37, false);
  const extra = makePlayer(16, { position: 'MID', teamId: 6, team: makeTeam(6), cost: 50, gwProjections: { 37: 70, 38: 0 } });
  input.players.push(extra); input.repoElements.push(toRepoElement(extra));
  input.lockedIds = input.currentSquadIds.filter(id => id !== 8);
  input.chipsUsed = [{ name: 'wildcard', event: 32 }, { name: 'bboost', event: 33 }, { name: '3xc', event: 34 }];
  const result = runPlannerSimulation(input);
  assert.ok(result.strategy.schedule.some(c => c.chip === 'fh' && c.gw === 37), 'Expected the only available chip to exploit a one-week opportunity');
  assert.ok(result.strategy.weeks[0].squad.includes(16));
  assert.deepEqual([...result.strategy.weeks[1].squad].sort((a, b) => a - b), input.currentSquadIds);
  assert.equal(result.strategy.weeks[1].bankAfter, input.bankTenths);
});

test('Free Hit cannot follow the previous half Free Hit across GW19/20', () => {
  const input = scenario(20, false);
  const result = runPlannerSimulation({ ...input, lockedIds: input.currentSquadIds, chipsUsed: [{ name: 'freehit', event: 19 }] });
  assert.ok(!result.strategy.schedule.some(c => c.chip === 'fh' && c.gw === 20));
});

test('blank fixtures override imported values; explicit zero stays zero; missing future means are recomputed', () => {
  const input = scenario(38, false);
  input.players[7].gwProjections = { 38: 0 };
  input.players[8].gwProjections = undefined;
  input.players[8].projection = 999;
  const team = input.players[9].teamId;
  input.repoFixtures = input.repoFixtures.filter(f => f.team_h !== team && f.team_a !== team);
  const result = runPlannerSimulation(input);
  assert.deepEqual(result.gws, [38]);
  assert.equal(result.forecastByGw[38][8], 0);
  assert.ok(result.forecastByGw[38][9] < 999);
  assert.equal(result.forecastByGw[38][10], 0);
  assert.ok(result.strategy.schedule.every(s => s.gw <= 38));
});

test('unknown chip history disables recommendations; first-half uses reset in second half', () => {
  assert.equal(normalizeChipHistory(null), undefined);
  assert.deepEqual(normalizeChipHistory({ chips: [] }), []);
  assert.deepEqual(normalizeChipHistory({ chips: [{ name: '3xc', event: 18 }] }), [{ name: '3xc', event: 18 }]);
  const unknown = runPlannerSimulation({ ...scenario(38, false), chipsUsed: undefined, chipHistoryKnown: false });
  assert.deepEqual(unknown.strategy.schedule, []);
  assert.ok(unknown.chipSimulations.every(c => !c.available));
  const reset = runPlannerSimulation({ ...scenario(38, false), chipsUsed: ['wildcard', 'freehit', 'bboost', '3xc'].map((name, index) => ({ name, event: 12 + index })) });
  assert.ok(reset.chipSimulations.every(c => c.available));
});

test('weekly hits reduce their own GW, cumulative delta and total exactly once', () => {
  const lu = { starters: [1], bench: [], captainId: 1, viceId: 1 };
  const result = runMonteCarlo({ gws: [18, 19], draws: 300, seed: 123, holdId: 'hold', recommendedId: 'hit',
    playerAt: () => ({ mean: 2, p60: 1, pSub: 0, fixtures: 1, csProb: 0, cardLoss: 0, team: 1, position: 4 }),
    paths: [{ id: 'hold', label: 'Hold', hitCost: 0, lineupAt: () => lu }, { id: 'hit', label: 'Hit in GW19', hitCost: 0, hitAt: gw => gw === 19 ? 4 : 0, lineupAt: () => lu }] });
  const path = result.paths.find(p => p.id === 'hit')!;
  assert.equal(path.deltaMean, -4);
  assert.equal(path.cumDelta![0].mean, 0);
  assert.equal(path.cumDelta![1].mean, -4);
  assert.equal(path.probBeatsHold, 0);
  assert.equal(path.perGw[1].mean, result.paths[0].perGw[1].mean - 4);
});

test('lineup solver maximizes the XI plus captain and keeps a legal formation', () => {
  const input = scenario(38, false);
  const nodes = new Map(input.players.map(p => [p.id, { id: p.id, type: ({ GKP: 1, DEF: 2, MID: 3, FWD: 4 } as const)[p.position], team: p.teamId, cost: p.cost, name: p.name }]));
  const points = Object.fromEntries(input.players.map(p => [p.id, p.id]));
  const lineup = solveLineupTS(input.currentSquadIds, nodes, points);
  assert.equal(lineup.starters.length, 11); assert.equal(lineup.bench.length, 4);
  assert.equal(new Set([...lineup.starters, ...lineup.bench]).size, 15);
  assert.equal(lineup.totalXPts, lineup.starters.reduce((s, id) => s + points[id], 0) + points[lineup.captainId]);
});

test('archived production forecasts and detailed component means safely share the sampler', async () => {
  const snapshot = JSON.parse(await readFile('public/data/fpl-snapshot.json', 'utf8')) as Snapshot;
  const allPlayers = enrichPlayers(snapshot, 'balanced');
  const squad = optimizeSquad(allPlayers, { budget: 1000, profile: 'balanced' }).squad;
  const result = runPlannerSimulation({
    players: squad, currentSquadIds: squad.map(p => p.id),
    bankTenths: Math.max(0, 1000 - squad.reduce((sum, p) => sum + p.cost, 0)),
    freeTransfersNow: 0, nextGw: snapshot.meta.nextEventId, horizon: 2, draws: 300,
    chipHistoryKnown: false, repoFixtures: toRepoFixtures(snapshot.fixtures),
    repoTeams: toRepoTeams(snapshot.teams), repoElements: snapshot.players.map(toRepoElement),
  });
  assert.ok(result.monteCarlo.paths.every(path => Number.isFinite(path.mean)));
  assert.equal(result.monteCarlo.paths.find(path => path.id === 'transfer_plan')!.deltaMean, 0);
});

test('Wildcard clears committed scenario hits and preserves the original FT allowance', () => {
  const input = scenario(38, false);
  const result = runPlannerSimulation({ ...input, initialHitCost: 4, initialFreeTransfersBeforeScenario: 3,
    lockedIds: input.currentSquadIds,
    chipsUsed: [{ name: 'bboost', event: 32 }, { name: '3xc', event: 33 }, { name: 'freehit', event: 34 }] });
  const first = result.strategy.weeks[0];
  assert.equal(first.chip, 'wc');
  assert.equal(first.hitCost, 0);
  assert.equal(first.ftBefore, 3);
  assert.equal(first.ftAfter, 3);
});
