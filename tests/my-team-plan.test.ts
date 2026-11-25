import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFiveWeekPlan, renderText } from '../scripts/export-my-team-plan';
import { makeFixture, makeGameweek, makePlayer, makeTeam } from './helpers';
import type { EntryData, Snapshot, Position } from '../src/lib/types';

function scenario(next=15) {
  const now=new Date('2026-08-01T12:00:00Z');
  const positions:Position[]=['GKP','GKP','DEF','DEF','DEF','DEF','DEF','MID','MID','MID','MID','MID','FWD','FWD','FWD'];
  const players=positions.map((position,i)=>makePlayer(i+1,{position,teamId:i%10+1,cost:50}));
  const snapshot:Snapshot={
    meta:{source:'live',generatedAt:now.toISOString(),servedAt:now.toISOString(),season:'2026/27',currentEventId:next-1,nextEventId:next,isLive:true,refreshSeconds:120,totalPlayers:15,fixtureCount:0,upstreamOk:true,stale:false,version:1,exampleEntryId:null,exampleLeagueId:1},
    teams:Array.from({length:10},(_,i)=>makeTeam(i+1)),players,
    gameweeks:Array.from({length:38},(_,i)=>makeGameweek(i+1,{finished:i+1<next,deadlineTime:new Date(now.getTime()+(i+2-next)*86400000).toISOString()})),
    fixtures:Array.from({length:39-next},(_,i)=>next+i).flatMap(gw=>Array.from({length:5},(_,i)=>makeFixture(gw*10+i,gw,i*2+1,i*2+2))),
  };
  const entry:EntryData={id:145784,name:'Test manager',teamName:'Test',region:'Test',startedEvent:1,favouriteTeamId:null,overallRank:100,overallPoints:500,freeTransfers:2,currentEvent:next-1,activeChip:null,
    history:{event:next-1,points:50,totalPoints:500,rank:100,overallRank:100,bank:5,value:750,eventTransfers:0,eventTransfersCost:0,pointsOnBench:0},
    picks:players.map((p,i)=>({element:p.id,position:i+1,multiplier:1,isCaptain:i===14,isViceCaptain:i===13,sellingPrice:5})),
    players,projectedPoints:50,squadValue:75,source:'live',generatedAt:now.toISOString(),provenance:{kind:'official',requestedIdVerified:true,sourceCapturedAt:null}};
  return {snapshot,entry,now};
}
test('exports five consecutive legal weeks, ordered bench and points reconciliation',()=>{
  const {snapshot,entry,now}=scenario();
  const report=buildFiveWeekPlan(snapshot,entry,now);
  assert.deepEqual(report.horizon,[15,16,17,18,19]);
  assert.equal(report.chipHistoryKnown,false);
  for(const w of report.weeks){
    assert.equal(w.currentSquad.length,15); assert.equal(w.finalSquad.length,15);
    assert.equal(w.starters.length,11); assert.equal(w.bench.length,4);
    assert.equal(w.bench[0].position,'GKP');
    assert.ok(w.starters.some(p=>p.id===w.captain.id));
    assert.ok(w.starters.some(p=>p.id===w.vice.id));
    assert.notEqual(w.captain.id,w.vice.id);
    assert.ok(w.bankAfter>=0);
    assert.equal(w.chip,null);
    assert.ok(Math.abs(w.xPts-(w.starters.reduce((s,p)=>s+p.xPts,0)+w.captain.xPts-w.hitCost))<0.02);
  }
  const text=renderText(report);
  assert.equal((text.match(/^## GW\d+/gm)??[]).length,5);
  assert.match(text,/Chip timing and long-term strategy/);
});
test('near season end truncates instead of inventing GW39',()=>{
  const {snapshot,entry,now}=scenario(38);
  assert.deepEqual(buildFiveWeekPlan(snapshot,entry,now).horizon,[38]);
});
test('fails closed on stale or unverified inputs and missing selling prices',()=>{
  const {snapshot,entry,now}=scenario();
  assert.throws(()=>buildFiveWeekPlan({...snapshot,meta:{...snapshot.meta,stale:true}},entry,now),/stale/);
  assert.throws(()=>buildFiveWeekPlan(snapshot,{...entry,provenance:undefined},now),/official entry/);
  assert.throws(()=>buildFiveWeekPlan(snapshot,{...entry,picks:entry.picks.map(p=>({...p,sellingPrice:undefined}))},now),/selling prices/);
});
