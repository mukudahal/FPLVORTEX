import test from 'node:test';
import assert from 'node:assert/strict';
import {demoPlayers,initialSquad,validateSquad} from '../dist/js/model.js';
import {summarizeAppearances,forecastVortex,estimatePriceMovement} from '../dist/js/vortex-analytics.js';
import {solveDeepPlan,selectProjectedEleven} from '../dist/js/deep-solver.js';

const appearances = [
 {playerId:1,gameweek:1,minutes:90,started:true,substitutedOn:false,substitutedOff:false,available:true,expectedGoals:0.75,expectedAssists:0.2},
 {playerId:1,gameweek:2,minutes:65,started:true,substitutedOn:false,substitutedOff:true,available:true,expectedGoals:0.55,expectedAssists:0.1},
 {playerId:1,gameweek:3,minutes:27,started:false,substitutedOn:true,substitutedOff:false,available:true,expectedGoals:0.14,expectedAssists:0},
 {playerId:1,gameweek:4,minutes:0,started:false,substitutedOn:false,substitutedOff:false,available:false}
];
test('starts are distinct from substitute appearances and substituted-off starts',()=>{
 const summary=summarizeAppearances(1,appearances);
 assert.equal(summary.startsDisplay,'2/4');assert.equal(summary.substituteAppearances,1);assert.equal(summary.substitutedOff,1);
 assert.equal(summary.unavailable,1);assert.equal(summary.minutesTotal,182);assert.equal(summary.ninetyEquivalents,2.02);
 assert.equal(summary.minutesPerAppearance,60.7);
});
test('invalid starts, substitutions, duplicate games rejected',()=>{
 assert.throws(()=>summarizeAppearances(1,[appearances[0],appearances[0]]),/duplicate/i);
 assert.throws(()=>summarizeAppearances(1,[{...appearances[0],substitutedOn:true}]),/Starter/i);
 assert.throws(()=>summarizeAppearances(1,[{...appearances[2],substitutedOn:false}]),/Substitute/i);
});
test('strict temporal boundary prevents GW5 forecast from using GW5 and beyond',()=>{
 assert.throws(()=>forecastVortex(demoPlayers[0],5,[...appearances,{...appearances[0],gameweek:11}]),/cannot use outcomes/);
 const result=forecastVortex(demoPlayers[0],5,appearances);
 assert.ok(result.expectedGoals>0&&result.cleanSheetProbability>0&&result.cleanSheetProbability<1);
 assert.ok(result.startProbability<1&&result.startProbability>=0);
 assert.equal(result.mode,'illustrative');
});
test('unavailable injuries remove all expected playing time',()=>{
 const forecast=forecastVortex({...demoPlayers[0],status:'out'},1);
 assert.equal(forecast.expectedMinutes,0);assert.equal(forecast.expectedGoals,0);assert.equal(forecast.expectedPoints,0);
});
test('price ETA is not fabricated without calibrated threshold',()=>{
 assert.equal(estimatePriceMovement([]).estimateHours,null);
 const observations=Array.from({length:6},(_,index)=>({capturedAt:new Date(Date.UTC(2026,9,1+index)).toISOString(),transfersNet:index*2000,price:7.5}));
 assert.equal(estimatePriceMovement(observations).estimateHours,null);
 assert.equal(estimatePriceMovement(observations).direction,'rise');
});
test('projected 11 selects legal 1GK / 3+DEF / 2+MID / 1+FWD',()=>{
 const squad=initialSquad.selectedIds.map(id=>demoPlayers.find(player=>player.id===id));
 const scores=new Map(squad.map(player=>[player.id,forecastVortex(player,1).expectedPoints]));
 const normal=selectProjectedEleven(squad,scores);
 const captain=selectProjectedEleven(squad,scores,'triplecaptain');
 const bench=selectProjectedEleven(squad,scores,'benchboost');
 assert.equal(normal.benchIds.length,4);assert.ok(captain.points>normal.points);assert.ok(bench.points>=normal.points);
});
test('ten gameweek beam search respects budget, squad constraints, single chip per GW',()=>{
 const plan=solveDeepPlan(demoPlayers,initialSquad,7,10,6);
 assert.equal(plan.stages.length,10);assert.equal(plan.stages[0].gameweek,7);assert.equal(plan.stages.at(-1).gameweek,16);
 assert.ok(plan.explored>10);assert.equal(plan.approximate,true);
 const usedChips=plan.stages.map(step=>step.chip).filter(chip=>chip!=='none');
 assert.equal(new Set(usedChips).size,usedChips.length);
 for(const step of plan.stages){
  assert.deepEqual(validateSquad(demoPlayers,step.squadIds),[]);
  assert.ok(step.bank>=0);assert.ok(step.freeTransfersNext<=5);
 }
});
test('solver rejects ranges that lack illustrative fixtures',()=>{
 assert.throws(()=>solveDeepPlan(demoPlayers,initialSquad,8,10),RangeError);
 assert.throws(()=>solveDeepPlan(demoPlayers,initialSquad,7,11),RangeError);
});