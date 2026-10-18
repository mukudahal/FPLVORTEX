import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPublicLeague } from '../scripts/public-league-store.mjs';
import { retrospectiveTeamBacktest, fixtureMatrix } from '../src/public-league.mjs';
import {syncPublicLeague} from '../scripts/sync-public-league.mjs';
const fixture={name:'English Premier League 2026/27',matches:[
  {round:'Matchday 1',date:'2026-08-21',team1:'Arsenal FC',team2:'Coventry City FC',score:{ft:[2,0]}},
  {round:'Matchday 2',date:'2026-08-28',team1:'Chelsea FC',team2:'Arsenal FC'}
]};
function mockResponse(body){return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});}
test('public feed sync is controlled, atomic, validated and supports dry-run',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vortex-public-'));
 const targetPath=join(dir,'current.json');
 try{
  let received='';
  const fetcher=async url=>{received=url;return mockResponse(fixture)};
  const result=await syncPublicLeague({fetcher,targetPath});
  assert.match(received,/openfootball/);assert.equal(result.fixtureCount,2);
  const preserved=await readFile(targetPath,'utf8');
  assert.ok(preserved.includes('Arsenal FC'));
  await assert.rejects(syncPublicLeague({fetcher:async()=>mockResponse({...fixture,matches:[{...fixture.matches[0],team1:'Nobody FC'}]}),targetPath}),/Unknown/);
  assert.equal(await readFile(targetPath,'utf8'),preserved,'failed sync cannot replace the last known-good file');
  const dry=await syncPublicLeague({fetcher, dryRun:true,targetPath});assert.equal(dry.dryRun,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('a tracked OpenFootball snapshot yields real coverage and no artificial completed GW6 outcomes',async t=>{
 const league=await readPublicLeague();
 if(!league){t.skip('Source snapshot is intentionally not mounted in local dev; CI repo snapshot enables this check');return;}
 assert.ok(league.matches.length>=300);
 assert.ok(fixtureMatrix(league,7,10,7).rows.length>=18);
 const report=retrospectiveTeamBacktest(league,1,6,new Date('2026-10-17T23:59:59Z'));
 assert.equal(report.byGameweek.length,6);
 assert.ok(report.byGameweek.every(row=>row.withReportedScores<=row.scheduled));
 assert.equal(report.mode,'retrospective-replay-not-archived-predictions');
});