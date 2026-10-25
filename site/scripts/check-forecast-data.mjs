import assert from 'node:assert/strict';
import {upcomingGameweeks,completedClubGames,seasonStatistics,projectedOutcomes,sortForecastRows,pageRows} from '../ui/forecast-data.js';

const events=Array.from({length:38},(_,index)=>({id:index+1,finished:index<7,is_current:index===7,is_next:index===8}));
assert.deepEqual(upcomingGameweeks(events).map(event=>event.id),[9,10,11,12,13,14,15,16]);
assert.deepEqual(upcomingGameweeks(events.slice(0,12)).map(event=>event.id),[9,10,11,12]);
assert.deepEqual(upcomingGameweeks([{id:38,is_current:true,finished:false,deadline_time:'2026-01-01T00:00:00Z'}],8,Date.parse('2026-02-01T00:00:00Z')),[]);
const statistics=seasonStatistics({minutes:180,total_points:12,expected_goals:'1.2',expected_assists:'0.4',defensive_contribution:20,now_cost:55},3);
assert.equal(statistics.points90,6);
assert.equal(statistics.minutes,60);
assert.equal(statistics.xgi,1.6);
assert.equal(statistics.defensive90,10);
assert.equal(seasonStatistics({minutes:0,expected_goals:'0'},0).xg90,null,'No played minutes means an undefined per-90 rate, not a fabricated zero');
const completed=completedClubGames([{id:1,team_h:1,team_a:2,finished:true},{id:2,team_h:1,team_a:3,finished:false,finished_provisional:true},{id:3,team_h:1,team_a:4,started:true,minutes:60}]);
assert.equal(completed.get(1),2,'Provisional full-time matches count; ongoing matches do not');
assert.equal(seasonStatistics({minutes:178},completed.get(1)).minutes,89);

const model={fixtureId:1,goals90:1,assists90:1,minutes:{p60:.5,pSub:0,pStart:.5,minutes60:90,minutesShort:20}};
const forecast={xPts:5,fixtureModels:[model]};
const result=projectedOutcomes(forecast,{status:'a'});
assert.equal(result.xg,.5);
assert.equal(result.xa,.5);
assert.ok(Math.abs(result.goal-.5*(1-Math.exp(-1)))<1e-12);
assert.ok(Math.abs(result.returnChance-.5*(1-Math.exp(-2)))<1e-12,'Goal and assist probabilities must share the player appearance state');
assert.ok(Math.abs(result.returnChance-(1-(1-result.goal)*(1-result.assist)))>.05,'Do not treat correlated appearance outcomes as independent');
const double=projectedOutcomes({xPts:10,fixtureModels:[model,{...model,fixtureId:2}]},{status:'a'});
assert.equal(double.xg,1);
assert.ok(double.returnChance>=Math.max(double.goal,double.assist)&&double.returnChance<=Math.min(1,double.goal+double.assist));
const blocked=projectedOutcomes(forecast,{status:'i',chance_of_playing_next_round:0},{assumeStarts:true,scoreFixture:fixture=>({appearancePts:2*fixture.minutes.p60})});
assert.equal(blocked.points,0);assert.equal(blocked.returnChance,0);assert.equal(blocked.minutes,0,'The starting scenario never clears an injury or suspension');
assert.deepEqual(projectedOutcomes({xPts:0,fixtureModels:[]},{status:'a'}),{xg:0,xa:0,goal:0,assist:0,returnChance:0,minutes:0,start:0,points:0});

const rows=Array.from({length:25},(_,index)=>({id:index+1,name:`Player ${index+1}`,values:{points:index===24?null:25-index}}));
for(const direction of [-1,1])assert.equal(sortForecastRows(rows,'points',direction).at(-1).id,25,'Unknown metrics sort last in either direction');
const pages=[0,1,2,3].map(page=>pageRows(rows,page,8));
assert.equal(new Set(pages.flatMap(page=>page.rows.map(row=>row.id))).size,25,'Pagination reaches every player exactly once');
assert.equal(pageRows(rows.slice(0,1),9,8).page,0,'Filters cannot leave the paginator on an empty later page');
assert.equal(pageRows([],9,8).pages,1);
console.log('Eight-GW windows, season rates, joint attacking probabilities, injury constraints and pagination checks passed.');
