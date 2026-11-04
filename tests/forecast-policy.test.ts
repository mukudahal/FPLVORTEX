import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { enrichPlayers, toRepoElement } from '../src/lib/analytics.ts';
import { forecastMean, importedForecastDate } from '../src/lib/forecastPolicy.ts';
import { toRepoFixtures, toRepoTeams } from '../src/lib/fixtures.ts';
import { buildVortexPlannerCache } from '../src/lib/transferPlansStore.ts';
import { runPlannerSimulation } from '../src/lib/repoModel/compassPlanner.ts';
import { estimateMinutesDistribution } from '../src/lib/repoModel/minutes.ts';
import type { Position, Snapshot } from '../src/lib/types.ts';
import { makeFixture, makeGameweek, makePlayer, makeTeam } from './helpers.ts';

test('frozen Players, Plan and Solver inputs agree across imports, blanks, doubles and unfinished GWs', async () => {
  const template = JSON.parse(await readFile('public/data/fpl-snapshot.json','utf8')) as Snapshot;
  const positions: Position[] = ['GKP','GKP','DEF','DEF','DEF','DEF','DEF','MID','MID','MID','MID','MID','FWD','FWD','FWD'];
  const rawPlayers = positions.map((position,index) => makePlayer(index+1, {position,teamId:index%10+1,
    minutes:720,starts:8,status:index===1?'i':'a',chance:index===1?0:100,
    gwProjections:{10:99,11:99},repoExpectedMinutes:77}));
  delete rawPlayers[2].gwProjections?.[10];
  rawPlayers[2].repoBenchmarkXpts=999; // Undated-to-GW legacy benchmark is not a GW10 forecast.
  const fixtures = Array.from({length:5},(_,index)=>makeFixture(index+1,10,index*2+1,index*2+2));
  fixtures.push(makeFixture(6,10,1,3)); // A genuine double in the frozen input.
  fixtures.push(makeFixture(7,11,3,4)); // Teams 1 and 2 blank in GW11.
  for (const fileDate of ['2026-11-04','2026-10-01',null]) {
    const snapshot: Snapshot = {...template, players:rawPlayers, fixtures,
      teams:Array.from({length:10},(_,index)=>makeTeam(index+1)),
      gameweeks:Array.from({length:38},(_,index)=>makeGameweek(index+1,{finished:index<8})),
      meta:{...template.meta,nextEventId:10,currentEventId:9,generatedAt:'2026-11-04T12:00:00Z',
        repoData:{...template.meta.repoData!,benchmarkPlayers:rawPlayers.length,projectionFileDate:fileDate}}};
    const players = enrichPlayers(snapshot,'balanced');
    const cache = buildVortexPlannerCache(snapshot,players);
    const input = {players,currentSquadIds:players.map(p=>p.id),bankTenths:0,freeTransfersNow:1,nextGw:10,
      horizon:2,horizonOnly:true,draws:100,chipPolicy:'manual' as const,chipsUsed:[],chipHistoryKnown:true,
      importedProjectionFileDate:importedForecastDate(snapshot.meta.repoData),forecastAsOf:snapshot.meta.generatedAt,
      completedEvents:8,repoElements:rawPlayers.map(toRepoElement),repoFixtures:toRepoFixtures(fixtures),repoTeams:toRepoTeams(snapshot.teams)};
    const solver = runPlannerSimulation(input);
    for (const player of players) {
      const planValues = cache.xpByPlayerGw.get(player.id)!;
      assert.ok(Math.abs(player.projection-planValues[0])<=0.0051, `${fileDate}: next-GW player ${player.id}`);
      for (const [index,gw] of [10,11].entries()) assert.equal(planValues[index],solver.forecastByGw[gw][player.id]);
      assert.equal(player.horizon5Projection, Math.round(planValues.slice(0,5).reduce((a,b)=>a+b,0)*100)/100);
      assert.deepEqual(player.sparkline.slice(0,2),planValues.slice(0,2).map(value=>Math.round(value*100)/100));
    }
    assert.equal(cache.xpByPlayerGw.get(1)![1],0,'Blank beats a positive imported mean');
    assert.equal(cache.xpByPlayerGw.get(2)![0],0,'Official zero availability beats imports');
    assert.notEqual(players[2].projection,999,'Missing GW means cannot fall back to a generic benchmark');
    assert.equal(players[1].modelBreakdown.expectedMinutes,0);
    const minutes=estimateMinutesDistribution(toRepoElement(rawPlayers[0]),8).expectedMinutes*2;
    assert.equal(players[0].modelBreakdown.expectedMinutes,Math.round(minutes*10)/10,'Displayed minutes describe the actual model distribution');
    if(fileDate==='2026-11-04') assert.equal(players[0].projection,99);
    else {
      assert.notEqual(players[0].projection,99,'Old or undated identified imports are excluded');
      const legacy = runPlannerSimulation({...input,completedEvents:undefined});
      assert.notEqual(legacy.forecastByGw[10][1],solver.forecastByGw[10][1],'An unfinished earlier GW cannot count as a completed match');
    }
  }
});

test('end-of-season sparklines and Plan forecasts stop at GW38', async () => {
  const snapshot = JSON.parse(await readFile('public/data/fpl-snapshot.json','utf8')) as Snapshot;
  snapshot.meta.nextEventId=38;
  const players=enrichPlayers(snapshot);
  const cache=buildVortexPlannerCache(snapshot,players);
  assert.deepEqual(cache.gws,[38]);
  assert.ok(players.every(player=>player.sparkline.length===1));
});

test('forecast mean preserves explicit zero and rejects invalid model values', () => {
  const player={status:'a',chance:100};
  assert.equal(forecastMean(player,{xPts:5,fixtureCount:1},0,true),0);
  assert.equal(forecastMean(player,{xPts:5,fixtureCount:1},NaN,true),5);
  assert.equal(forecastMean(player,{xPts:5,fixtureCount:0},99,true),0);
  assert.throws(()=>forecastMean(player,{xPts:NaN,fixtureCount:1},99,true),/Invalid fixture/);
});
