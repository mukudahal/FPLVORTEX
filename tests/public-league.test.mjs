import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOpenFootball,leagueCoverage,forecastMatch,fixtureMatrix,retrospectiveTeamBacktest} from '../src/public-league.mjs';
const fixture={name:'English Premier League 2026/27',matches:[
  {round:'Matchday 1',date:'2026-08-21',team1:'Arsenal FC',team2:'Coventry City FC',score:{ft:[3,0]}},
  {round:'Matchday 1',date:'2026-08-21',team1:'Manchester City FC',team2:'Chelsea FC',score:{ft:[2,1]}},
  {round:'Matchday 2',date:'2026-08-28',team1:'Coventry City FC',team2:'Chelsea FC',score:{ft:[0,0]}},
  {round:'Matchday 2',date:'2026-08-28',team1:'Arsenal FC',team2:'Manchester City FC',score:{ft:[1,2]}},
  {round:'Matchday 3',date:'2026-09-05',team1:'Chelsea FC',team2:'Arsenal FC',score:[0,0]},
  {round:'Matchday 3',date:'2026-09-05',team1:'Manchester City FC',team2:'Coventry City FC'}
]};
const season=parseOpenFootball(fixture);
const date=new Date('2026-10-17T22:00:00Z');
test('source validates canonical team identity, season and result conventions',()=>{
  assert.equal(season.matches.length,6);
  assert.deepEqual(season.matches[2].score,[0,0]);
  assert.equal(season.matches[4].score,null,'untyped score array is a placeholder, not a draw');
  assert.throws(()=>parseOpenFootball({...fixture,matches:[fixture.matches[0],fixture.matches[0]]}),/Duplicate fixture/);
  assert.throws(()=>parseOpenFootball({...fixture,matches:[{...fixture.matches[0],team1:'Unknown FC'}]}),/Unknown/);
  assert.throws(()=>parseOpenFootball({...fixture,matches:[{...fixture.matches[0],date:'2026-02-30'}]}),/date/);
  assert.throws(()=>parseOpenFootball({...fixture,matches:[{...fixture.matches[0],score:{ft:[3,-2]}}]}),/score/);
  assert.throws(()=>parseOpenFootball({...fixture,name:'English Premier League 2025/26'}),/2026\/27/);
});
test('future results never leak into same or earlier GW forecasts',()=>{
  const subject=season.matches[3];
  const initial=forecastMatch(season,subject);
  const modified=parseOpenFootball({...fixture,matches:fixture.matches.map(x=>x===fixture.matches[3]?{...x,score:{ft:[20,20]}}:x)});
  assert.deepEqual(forecastMatch(modified,subject),initial);
  assert.equal(initial.priorMatches,2);
  assert.ok(initial.homeGoals>0 && initial.awayGoals>0);
});
test('week-1 uses only declared priors and creates probability ranges',()=>{
  const p=forecastMatch(season,season.matches[0]);
  assert.equal(p.priorMatches,0);
  assert.equal(p.homeGoals,1.48);assert.equal(p.awayGoals,1.12);
  assert.ok(p.homeCsProbability>0&&p.homeCsProbability<1);
});
test('matrix supports GW sorting and independent FDR/CS% estimates',()=>{
  const m=fixtureMatrix(season,1,3,2);
  assert.equal(m.rows.length,4);
  assert.ok(m.rows.every(x=>x.fixtures.every(y=>y.fdr>=1&&y.fdr<=5)));
  assert.ok(m.rows.every(x=>x.fixtures.every(y=>y.csProbability>=0&&y.csProbability<=1)));
  const rank=m.rows.map(x=>x.fixtures.find(y=>y.gameweek===2)?.fdr??6);
  assert.deepEqual(rank,[...rank].sort((a,b)=>a-b));
  assert.throws(()=>fixtureMatrix(season,36,5,36),/span/);
});
test('coverage shows missing results instead of inventing zero-zero',()=>{
  const coverage=leagueCoverage(season,date);
  assert.equal(coverage.reportedResults,4);
  assert.equal(coverage.coverage.find(x=>x.gameweek===3).missing,2);
  assert.equal(coverage.coverage.find(x=>x.gameweek===2).complete,true);
});
test('retrospective team metrics track explicit evidence coverage and no player-accuracy claim',()=>{
  const report=retrospectiveTeamBacktest(season,1,3,date);
  assert.equal(report.byGameweek.length,3);
  assert.equal(report.byGameweek[0].evaluatedTeams,4);
  assert.equal(report.byGameweek[2].evaluatedTeams,0);
  assert.equal(report.byGameweek[2].goalMae,null);
  assert.equal(report.byGameweek[2].missingScores,2);
  assert.ok(report.byGameweek[1].csBrier<=1);
  assert.match(report.mode,/retrospective/);
  assert.throws(()=>retrospectiveTeamBacktest(season,2,1,date),/range/);
});