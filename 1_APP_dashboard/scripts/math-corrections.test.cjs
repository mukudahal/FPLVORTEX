'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { expectedPoissonFloor, seededRandom } = require('../src/lib/probability.ts');
const { expectedFixturePoints, sampleFixturePoints } = require('../src/lib/playerModel.ts');
const { estimateMinutesDistribution } = require('../src/lib/minutes.ts');
const { forecastMinutes, fitPointsCalibration } = require('../src/lib/forecastScience.ts');
const { estimateMinutesProb, computePlayerXPts } = require('../src/lib/xpts.ts');
const { startConfidence } = require('../src/lib/lineup.ts');
const { GOAL_POINTS, selectOptimalXI } = require('../src/lib/scoring.ts');
const { runMonteCarlo, calibrateProbability } = require('../src/lib/monteCarlo.ts');
const { compareFrozenForecasts } = require('../src/lib/forecastBenchmark.ts');

const player = { id:1, team:1, element_type:3, status:'a', chance_of_playing_next_round:null, starts:5, minutes:400, ep_next:'0', expected_goals:'1', expected_assists:'1', expected_goals_conceded:'5', goals_scored:1, assists:1, clean_sheets:1, bonus:1, bps:90, saves:0, defensive_contribution:30, yellow_cards:1, red_cards:0 };
const minutes = { p60:0.6,pSub:0.25,pStart:0.7,minutes60:85,minutesShort:24,expectedMinutes:57,confidence:70,source:'fpl_appearance_heuristic' };
const model = { fixtureId:1,position:2,minutes,goals90:0.1,assists90:0.12,conceded90:1.4,saves90:0,bonus90:0.4,defensiveActions90:11,defensiveDispersion:20,yellow90:0.2,red90:0.01,ownGoals90:0.01,penaltyMisses90:0.01,penaltySaves90:0 };

test('Poisson scoring thresholds agree with a high-precision reference sum', () => {
  for (const mean of [0,0.01,0.5,1,3,10,35]) for (const divisor of [2,3]) {
    let mass = Math.exp(-mean), expected = 0;
    for (let count=0;count<300;count++) { expected += Math.floor(count/divisor)*mass; mass *= mean/(count+1); }
    assert.ok(Math.abs(expectedPoissonFloor(mean,divisor)-expected)<1e-10);
  }
  assert.ok(expectedPoissonFloor(3,3)<1);
  assert.throws(()=>expectedPoissonFloor(NaN,2),RangeError);
});

test('one minutes distribution is used by xPts, forecast diagnostics and lineup confidence', () => {
  const canonical=estimateMinutesDistribution(player,5);
  assert.equal(estimateMinutesProb(player,5).p60,canonical.p60);
  assert.equal(forecastMinutes(player,5).expectedMinutes,canonical.expectedMinutes);
  assert.equal(startConfidence(player,5),Math.round(canonical.pStart*100));
  assert.equal(estimateMinutesDistribution({...player,status:'i',chance_of_playing_next_round:0},5,5).expectedMinutes,0);
});

test('historical minutes learning excludes future and not-yet-recorded observations', () => {
  const evidence={asOf:'2026-10-01T00:00:00Z',observations:[{kickoffAt:'2026-09-10T14:00:00Z',recordedAt:'2026-09-10T17:00:00Z',minutes:20,started:false,available:true}]};
  const first=estimateMinutesDistribution(player,5,0,evidence);
  const second=estimateMinutesDistribution(player,5,0,{...evidence,observations:[...evidence.observations,{kickoffAt:'2026-10-02T14:00:00Z',recordedAt:'2026-10-02T17:00:00Z',minutes:90,started:true,available:true}]});
  assert.deepEqual(first,second);
  assert.equal(first.source,'recency_weighted_minutes');
  assert.ok(first.p60<estimateMinutesDistribution(player,5).p60);
});

test('short appearances earn attacking points and can lose conceded points without earning a clean sheet', () => {
  const forecast=expectedFixturePoints({...model,minutes:{...minutes,p60:0,pSub:1}});
  assert.ok(forecast.goalPts>0);
  assert.ok(forecast.assistPts>0);
  assert.ok(forecast.cleanSheetPts<0);
  assert.equal(GOAL_POINTS[1],10);
});

test('integer-event simulation reproduces analytic means and appearance probabilities', () => {
  for (const position of [1,2,3,4]) {
    const fixture={...model,position,saves90:3.1,penaltySaves90:0.015};
    const expected=Object.values(expectedFixturePoints(fixture)).reduce((total,points)=>total+points,0);
    const random=seededRandom(800+position);
    let sum=0,appeared=0;
    for(let draw=0;draw<60000;draw++) { const result=sampleFixturePoints(fixture,random,random()); assert.ok(Number.isInteger(result.points)); sum+=result.points; appeared+=Number(result.appeared); }
    assert.ok(Math.abs(sum/60000-expected)<0.055,`${position}: simulated ${sum/60000} vs ${expected}`);
    assert.ok(Math.abs(appeared/60000-0.85)<0.008);
  }
});

test('blank forecasts are zero and double gameweeks are sums of fixture expectations', () => {
  const fixtures=[{id:1,event:8,team_h:1,team_a:2,team_h_difficulty:3,team_a_difficulty:3},{id:2,event:8,team_h:1,team_a:3,team_h_difficulty:3,team_a_difficulty:3}];
  const single=computePlayerXPts(player,8,[fixtures[0]],new Map(),5);
  const double=computePlayerXPts(player,8,fixtures,new Map(),5);
  assert.ok(Math.abs(double.xPts-2*single.xPts)<=0.011);
  assert.equal(computePlayerXPts(player,9,fixtures,new Map(),5).xPts,0);
  assert.equal(double.fixtureModels.length,2);
});

test('ties are separate from strict wins and cumulative differences include both paths hit costs', () => {
  const lineup={starters:[],bench:[],captainId:1,viceId:2};
  const paths=[{id:'hold',label:'Hold',hitCost:4,lineupAt:()=>lineup},{id:'same',label:'Same',hitCost:4,lineupAt:()=>lineup},{id:'free',label:'Free',hitCost:0,lineupAt:()=>lineup}];
  const result=runMonteCarlo({gws:[8],paths,holdId:'hold',recommendedId:'same',playerAt:()=>null,seed:1,draws:100});
  assert.equal(result.paths[1].probBeatsHold,0);
  assert.equal(result.paths[1].probDrawsHold,1);
  assert.equal(result.paths[2].deltaMean,4);
  assert.equal(result.paths[2].cumDelta[0].mean,4);
  assert.equal(calibrateProbability(0),0);
  assert.equal(calibrateProbability(1),1);
});

test('TypeScript and Python choose the same captain-aware maximum against exhaustive enumeration', () => {
  const positions=[1,1,2,2,2,2,2,3,3,3,3,3,4,4,4];
  const random=seededRandom(771);
  const cases=Array.from({length:20},()=>({squad:positions.map((_,index)=>index+1),players:Object.fromEntries(positions.map((position,index)=>[index+1,{type:position}])),points:Object.fromEntries(positions.map((_,index)=>[index+1,Math.round((random()*18-3)*10)/10]))}));
  const python=spawnSync('python3',['-c','import importlib.util,json,sys; spec=importlib.util.spec_from_file_location("solver","src/lib/solver.py"); solver=importlib.util.module_from_spec(spec); spec.loader.exec_module(solver); print(json.dumps([solver.solve_lineup_from_squad(case["squad"],{int(key):value for key,value in case["players"].items()},case["points"])["totalXPts"] for case in json.load(sys.stdin)]))'],{cwd:require('node:path').resolve(__dirname,'..'),input:JSON.stringify(cases),encoding:'utf8'});
  assert.equal(python.status,0,python.stderr);
  const pythonTotals=JSON.parse(python.stdout);
  cases.forEach((scenario,index)=>{
    const selected=selectOptimalXI(scenario.squad,id=>scenario.players[id].type,id=>scenario.points[id]);
    let exhaustive=-Infinity;
    for(let mask=0;mask<(1<<15);mask++) {
      const chosen=scenario.squad.filter((_,bit)=>mask&(1<<bit));
      if(chosen.length!==11)continue;
      const counts=[0,0,0,0,0];chosen.forEach(id=>counts[scenario.players[id].type]++);
      if(counts[1]!==1||counts[2]<3||counts[2]>5||counts[3]<2||counts[3]>5||counts[4]<1||counts[4]>3)continue;
      exhaustive=Math.max(exhaustive,chosen.reduce((sum,id)=>sum+scenario.points[id],0)+Math.max(...chosen.map(id=>scenario.points[id])));
    }
    assert.ok(Math.abs(selected.total-exhaustive)<1e-9);
    assert.ok(Math.abs(selected.total-pythonTotals[index])<0.011);
  });
});

test('fitting coefficients alone never certifies a calibration as verified',()=>{
  const rows=Array.from({length:120},(_,index)=>({gw:1+index%10,position:3,predicted:5,actual:6,predictedAt:'2026-01-01T00:00:00Z',deadlineAt:'2026-01-02T00:00:00Z'}));
  assert.equal(fitPointsCalibration(rows,12)[2].verified,false);
  assert.equal(fitPointsCalibration(rows,12)[2].fitted,true);
});

test('frozen benchmark rejects late forecasts, matches samples and bootstraps gameweek clusters',()=>{
  const forecasts=Array.from({length:8},(_,index)=>({season:'2026/27',gw:index+1,playerId:1,issuedAt:'2026-01-01T09:00:00Z',deadlineAt:'2026-01-01T12:00:00Z',modelVersion:'test',xPts:4,p60:0.8}));
  const outcomes=forecasts.map(row=>({...row,points:4,played60:true}));
  const reference=forecasts.map(row=>({...row,xPts:7,p60:0.5}));
  const result=compareFrozenForecasts([...forecasts,{...forecasts[0],issuedAt:'2026-01-01T13:00:00Z',xPts:100}],reference,outcomes);
  assert.equal(result.sampleSize,8);
  assert.equal(result.rejectedCandidate,1);
  assert.equal(result.candidate.rmse,0);
  assert.equal(result.reference.rmse,3);
  assert.equal(result.verdict,'candidate_lower_error');
  assert.deepEqual(result.rmseDifference95,[-3,-3]);
  assert.equal(compareFrozenForecasts(forecasts.slice(0,1),reference,outcomes).verdict,'insufficient_data');
});


test('chip scheduling beats the greedy collision trap',()=>{
  const {planChipOpportunities}=require('../src/lib/strategyEngine.ts');
  const plan=planChipOpportunities([{gw:8,chip:'tc',estimatedIncrementalPoints:10},{gw:8,chip:'bb',estimatedIncrementalPoints:9},{gw:9,chip:'tc',estimatedIncrementalPoints:9}]);
  assert.equal(plan.reduce((sum,option)=>sum+option.netExpectedGain,0),18);
  assert.deepEqual(plan.map(option=>[option.gw,option.chip]),[[8,'bb'],[9,'tc']]);
});


test('match win, draw and loss probabilities retain the high-scoring tail',()=>{
  const {projectMatch}=require('../src/lib/dashboardMath.ts');
  const projection=projectMatch({atkH:4,atkA:4,defWeakH:1,defWeakA:1},{atkH:4,atkA:4,defWeakH:4,defWeakA:4});
  assert.ok(Math.abs(projection.homeWin+projection.awayWin+projection.draw-1)<1e-10);
  assert.throws(()=>projectMatch({atkH:NaN,atkA:1,defWeakH:1,defWeakA:1},{atkH:1,atkA:1,defWeakH:1,defWeakA:1}),RangeError);
});
