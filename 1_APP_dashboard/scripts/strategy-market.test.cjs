'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyTransfers, searchPlanningHorizon, planChipOpportunities } = require('../src/lib/strategyEngine.ts');
const { effectiveOwnershipSample, rankLeagueThreats, priceMovementSignals } = require('../src/lib/marketLeague.ts');
const positions = [1,1,2,2,2,2,2,3,3,3,3,3,4,4,4];
const players = positions.map((position, i) => ({ id:i+1, position, team: i%5+1, priceTenths: 50, boughtAtTenths:50 }));
const state = { squad: players, gw: 8, bankTenths: 20, freeTransfers: 2, chipsUsed: [], totalHits: 0 };

test('atomic transfers reject invalid budget and keep original state unchanged', () => {
  const swap = applyTransfers(state, [{ out:3, in: {id:20,position:2,team:3,priceTenths:60} }]);
  assert.equal(swap.valid, true);
  assert.equal(swap.next.bankTenths, 10);
  assert.equal(state.squad[2].id, 3);
  assert.equal(applyTransfers(state, [{ out:3, in: {id:20,position:2,team:3,priceTenths:900} }]).valid, false);
  assert.equal(applyTransfers(state, [{ out:99, in: {id:20,position:2,team:3,priceTenths:60} }]).valid, false);
});

test('beam planner uses one legal transition per gameweek; chips constrained', () => {
  const result = searchPlanningHorizon(state, () => [{ label:'hold',moves:[], expectedGwPoints:45, modelRunId:'run123' }], 3, 4);
  assert.equal(result[0].score, 135);
  assert.equal(result[0].ledger.gw, 11);
  const chips = planChipOpportunities([{gw: 19, chip:'fh', estimatedIncrementalPoints:9},{gw:20,chip:'fh',estimatedIncrementalPoints:10},{gw:17,chip:'wc',estimatedIncrementalPoints:11}]);
  assert.equal(chips.filter((c) => c.chip==='fh').length, 1);
});

test('EO samples count captains twice, no exact population claims', () => {
  const cohort = effectiveOwnershipSample([[{ element:5, multiplier:2 },{ element:2,multiplier:0 }], [{element:5,multiplier:1}], null]);
  assert.equal(cohort.sampleSize, 2);
  assert.equal(cohort.ownership[5], 1);
  assert.equal(cohort.effectiveOwnership[5], 1.5);
  assert.equal(cohort.exactGlobal, false);
});

test('mini-league ranks and price momentum remain transparent', () => {
  const league = rankLeagueThreats([{entry:1,entry_name:'A',total:550,rank:1},{entry:2,entry_name:'B',total:510,rank:2}],2);
  assert.equal(league[0].gapToMe, 40);
  const market = priceMovementSignals([{id:1,element_type:3,transfers_in_event:500,transfers_out_event:100,selected_by_percent:'15.0'}]);
  assert.equal(market[0].calibratedProbability, null);
  assert.ok(market[0].momentumIndex > 0);
});
