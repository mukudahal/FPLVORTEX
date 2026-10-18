import test from 'node:test';
import assert from 'node:assert/strict';
import { demoPlayers, initialSquad } from '../dist/js/model.js';
import { buildRankChaseAdvice, parseRankChaseProfile, blankRankChaseProfile, TARGET_GW, TARGET_RANK } from '../dist/js/rank-chase.js';

const squad={...initialSquad,selectedIds:[...initialSquad.selectedIds]};
test('rank chase always targets top 5,000 by GW19 and never claims a probability',()=>{
  const result=buildRankChaseAdvice(demoPlayers,squad,7,blankRankChaseProfile);
  assert.equal(TARGET_RANK,5000); assert.equal(TARGET_GW,19);
  assert.equal(result.remainingToTarget,13);
  assert.equal(result.planningUntilGW,16);
  assert.equal(result.plan.stages.length,10);
  assert.equal(result.rankGap,null);
  assert.equal(result.hypotheticalPointsPerWeek,null);
  assert.ok(result.warnings.some(w=>/GW17|GW16/.test(w)));
  assert.ok(result.warnings.some(w=>/No statistical probability/.test(w)));
});
test('user supplied rank gap is an ordinal difference, not an estimated points cutoff',()=>{
  const profile=parseRankChaseProfile({entryId:145784,overallRank:28500,overallPoints:500,risk:'balanced',availableChips:[]});
  const result=buildRankChaseAdvice(demoPlayers,squad,9,profile);
  assert.equal(profile.entryId,145784);
  assert.equal(result.rankGap,23500);
  assert.equal(result.hypotheticalPointsPerWeek,null);
  assert.equal(result.planningUntilGW,16);
  assert.ok(result.plan.stages.every(s=>s.chip==='none'));
});
test('hypothetical user points benchmark is never inferred from rank',()=>{
  const profile=parseRankChaseProfile({overallRank:90000,overallPoints:470,hypotheticalGw19Points:1190,risk:'conservative',availableChips:['wildcard']});
  const result=buildRankChaseAdvice(demoPlayers,squad,7,profile);
  assert.equal(result.hypotheticalPointsPerWeek,720/13);
  assert.ok(result.plan.stages.every(s=>s.chip==='none'||s.chip==='wildcard'));
  assert.equal(result.riskThreshold,4);
});
test('profile parser rejects malformed and impossible input without overtrusting strings',()=>{
  const p=parseRankChaseProfile({entryId:'145784',overallRank:-2,overallPoints:Infinity,hypotheticalGw19Points:NaN,risk:'omniscient',availableChips:['wildcard','wildcard','unauthorized','freehit']});
  assert.equal(p.entryId,null);assert.equal(p.overallRank,null);assert.equal(p.overallPoints,null);
  assert.equal(p.hypotheticalGw19Points,null);assert.equal(p.risk,'balanced');
  assert.deepEqual(p.availableChips,['wildcard','freehit']);
});
test('future gameweeks unsupported by player forecasts are never invented',()=>{
  assert.throws(()=>buildRankChaseAdvice(demoPlayers,squad,17,blankRankChaseProfile),RangeError);
});
test('rank chase will not generate advice for malformed squad',()=>{
  assert.throws(()=>buildRankChaseAdvice(demoPlayers,{...squad,selectedIds:[1,2]},7,blankRankChaseProfile),/valid 15-player squad/);
});