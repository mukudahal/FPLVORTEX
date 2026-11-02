import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeFixture, makeGameweek, makePlayer, makeTeam } from './helpers.ts';
import { buildPlayerForecastContext, forecastAvailability, playerFixtureForecast, playerGameweekPoints, playerHorizonPoints, playerGameweekExpectedMinutes } from '../src/lib/playerTableForecast.ts';
import { computePlayerXPts } from '../src/lib/repoModel/xpts.ts';
import { toRepoElement } from '../src/lib/analytics.ts';
import { toRepoFixtures } from '../src/lib/fixtures.ts';
import type { Snapshot, EnrichedPlayer } from '../src/lib/types.ts';

const player = makePlayer(41,{teamId:1,status:'a',chance:null,minutes:680,starts:8,gwProjections:{10:999}}) as EnrichedPlayer;
const make=(fixtures=[makeFixture(1,10,1,2,2,4)],p=player,fresh=true)=>({
  meta:{nextEventId:10,generatedAt:new Date().toISOString(),upstreamOk:fresh,stale:!fresh},
  teams:[makeTeam(1,'ARS'),makeTeam(2,'HUL')],
  gameweeks:Array.from({length:38},(_,i)=>makeGameweek(i+1,{finished:i<9})),
  fixtures,players:[p],
}) as unknown as Snapshot;

test('confirmed injury only applies to next GW; future return must be verified',()=>{
 assert.equal(forecastAvailability({status:'i',chance:0},10,10),'out-next');
 assert.equal(forecastAvailability({status:'i',chance:0},11,10),'recovery-unverified');
 assert.equal(forecastAvailability({status:'s',chance:0},10,10),'out-next');
 assert.equal(forecastAvailability({status:'d',chance:75},10,10),'doubtful');
 assert.equal(forecastAvailability({status:'d',chance:75},11,10),'recovery-unverified');
 assert.equal(forecastAvailability({status:'a',chance:null},11,10),'available');
});
test('per fixture adapter uses exact existing model with exact inputs, not imported CSV GW xPts',()=>{
 const snap=make(),ctx=buildPlayerForecastContext(snap);
 const reported=playerFixtureForecast(ctx,player,snap.fixtures[0],10);
 const direct=computePlayerXPts(toRepoElement(player),10,toRepoFixtures(snap.fixtures),ctx.teamsMap,ctx.completedEvents,0,ctx.priors);
 assert.equal(reported.points,direct.xPts);
 assert.notEqual(reported.points,999);
});
test('injury, doubtful, stale data, blank and doubles',()=>{
 const injured=makePlayer(41,{...player,status:'i',chance:0}) as EnrichedPlayer;
 const c=buildPlayerForecastContext(make(undefined,injured));
 assert.equal(playerGameweekPoints(c,injured,10),null);
 assert.equal(playerGameweekPoints(c,injured,11),null);
 const doubt=makePlayer(41,{...player,status:'d',chance:75}) as EnrichedPlayer;
 const d=buildPlayerForecastContext(make(undefined,doubt));
 assert.equal(playerFixtureForecast(d,doubt,d.snapshot.fixtures[0],10).availability,'doubtful');
 assert.equal(playerGameweekPoints(buildPlayerForecastContext(make([],player)),player,10),null);
 assert.equal(playerGameweekPoints(buildPlayerForecastContext(make(undefined,player,false)),player,10),null);
 const fixtures=[makeFixture(1,10,1,2,2,4),makeFixture(2,10,2,1,4,2)];
 const dbl=buildPlayerForecastContext(make(fixtures,player));
 const a=playerFixtureForecast(dbl,player,fixtures[0],10).points,b=playerFixtureForecast(dbl,player,fixtures[1],10).points;
 assert.ok(a!==null && b!==null);
 assert.equal(playerGameweekPoints(dbl,player,10),Math.round((a+b)*100)/100);
 assert.equal(playerHorizonPoints(dbl,player,10),playerGameweekPoints(dbl,player,10));
});

test('same expected-minutes engine scales with distinct double-GW fixtures and suppresses injured',()=>{
 const single=buildPlayerForecastContext(make());
 const both=buildPlayerForecastContext(make([makeFixture(1,10,1,2,2,4),makeFixture(2,10,2,1,4,2)]));
 const singleMins=playerGameweekExpectedMinutes(single,player,10);
 const doubleMins=playerGameweekExpectedMinutes(both,player,10);
 assert.ok(singleMins!==null && doubleMins!==null);
 assert.ok(Math.abs(doubleMins-2*singleMins)<=0.2);
 const injured=makePlayer(41,{...player,status:'i',chance:0}) as EnrichedPlayer;
 assert.equal(playerGameweekExpectedMinutes(buildPlayerForecastContext(make(undefined,injured)),injured,10),null);
});
