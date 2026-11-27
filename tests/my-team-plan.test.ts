import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBoard, renderRoadmap } from '../scripts/render-my-team-boards';
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
    assert.ok(w.expectedBenchPoints>0);
    assert.ok(Math.abs(w.xPts-(w.expectedStarterPoints+w.expectedCaptainBonus+w.expectedBenchPoints-w.hitCost))<0.02);
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
test('refuses a temporary public Free Hit squad unless the restored state is provided',()=>{
  const {snapshot,entry,now}=scenario();
  const freeHitEntry={...entry,activeChip:'freehit'};
  assert.throws(()=>buildFiveWeekPlan(snapshot,freeHitEntry,now),/temporary Free Hit/);
  const confirmed={squad:entry.picks.map(p=>p.element),bankTenths:5,freeTransfers:2,
    sellingPrices:Object.fromEntries(entry.picks.map(p=>[p.element,50]))};
  const report=buildFiveWeekPlan(snapshot,freeHitEntry,now,confirmed);
  assert.equal(report.stateBasis,'manager-confirmed state');
  assert.equal(report.chipHistoryKnown,false);
});

test('rejects impossible effective sale prices, stale entry state and unsupported seasons',()=>{
  const {snapshot,entry,now}=scenario();
  const invalidPrices=entry.picks.map((p,i)=>i===0?{...p,sellingPrice:5.1}:p);
  assert.throws(()=>buildFiveWeekPlan(snapshot,{...entry,picks:invalidPrices},now),/exceeds current market price/);
  assert.throws(()=>buildFiveWeekPlan(snapshot,{...entry,generatedAt:'2026-07-31T00:00:00Z'},now),/Verified entry is stale/);
  assert.throws(()=>buildFiveWeekPlan({...snapshot,meta:{...snapshot.meta,season:'2027/28'}},entry,now),/No verified scoring/);
});

test('report uses the forecast clock for minutes and freezes the hold XI for every future week',()=>{
  const {snapshot,entry,now}=scenario();
  snapshot.teams.forEach(t=>{t.played=0;});
  snapshot.players[0].minutes=125; snapshot.players[0].starts=1;
  const report=buildFiveWeekPlan(snapshot,entry,now);
  const keeper=report.weeks[0].currentSquad.find(p=>p.id===snapshot.players[0].id)!;
  assert.ok(keeper.localExpectedMinutes<20);
  assert.ok(keeper.perFixtureStartProbability<.1);
  assert.ok(Math.abs(report.weeks.reduce((s,w)=>s+w.gainVsFixedHold,0)-report.gainVsHold)<.03);
  for (const w of report.weeks) {
    assert.equal(w.fixedHoldLineup.starters.length,11);
    assert.ok(w.fixedHoldLineup.starters.every(id=>report.openingState.squad.includes(id)));
    assert.equal(w.captaincy.candidates.length,11);
    assert.equal(w.captaincy.balanced,w.captain.id);
  }
  for (const path of report.simulation.paths.filter(p=>p.probLosesHold!=null)) {
    assert.ok(Math.abs(path.probBeatsHoldRaw!+path.probDrawsHold!+path.probLosesHold!-1)<.001);
    assert.ok(Math.abs(path.expectedUpsideVsHold!-path.expectedDownsideVsHold!-path.deltaMean!)<.025);
  }
});

test('refuses a mismatched public GW, malformed chip record, stale capture or missing future deadline',()=>{
  const {snapshot,entry,now}=scenario();
  assert.throws(()=>buildFiveWeekPlan(snapshot,{...entry,currentEvent:entry.currentEvent-1},now),/different gameweeks/);
  assert.throws(()=>buildFiveWeekPlan(snapshot,{...entry,chipsUsed:[{name:'unknown',event:1}]},now),/chip history/i);
  assert.throws(()=>buildFiveWeekPlan(snapshot,{...entry,provenance:{...entry.provenance!,sourceCapturedAt:'2000-01-01T00:00:00Z'}},now),/stale/);
  const missing={...snapshot,gameweeks:snapshot.gameweeks.filter(g=>g.id!==snapshot.meta.nextEventId+2)};
  assert.throws(()=>buildFiveWeekPlan(missing,entry,now),/deadline/);
});

test('settles frozen hold, captain absence, hit and chip against official, final participation only',async()=>{
  const {settleWeek}=await import('../scripts/settle-my-team-plan');
  const {snapshot,entry,now}=scenario(38);
  const plan=buildFiveWeekPlan(snapshot,entry,now);
  const report={...plan,provenance:{snapshotId:'abc',revision:'fixture',snapshotSource:'fixture',modelVersion:'fixture',entryAt:now.toISOString(),entrySourceUrl:'fixture',
    forecastInputs:{localModel:'fixture',importedFileDate:null,importedPlayerWeeks:0,localPlayerWeeks:15,independentExternalModelsVerified:0}}};
  const w=report.weeks[0];
  const ids=[...w.starters,...w.bench].map(p=>p.id);
  const live={elements:ids.map(id=>({id,stats:{played:id!==w.captain.id,minutes:id===w.captain.id?0:90,total_points:id===w.vice.id?7:id===w.captain.id?0:2}}))};
  const picks={active_chip:null,entry_history:{event:38,points:35,event_transfers_cost:4,overall_rank:100},
    picks:ids.map((id,i)=>({element:id,position:i+1,is_captain:id===w.captain.id,is_vice_captain:id===w.vice.id})),automatic_subs:[]};
  const event=snapshot.gameweeks.find(g=>g.id===38)!;
  const observed=new Date(Date.parse(event.deadlineTime)+86400000).toISOString();
  assert.throws(()=>settleWeek(report,38,snapshot,live,picks,[],observed),/final/);
  event.finished=true;event.dataChecked=true;
  w.hitCost=4;w.chip='tc';
  const settlement=settleWeek(report,38,snapshot,live,picks,[],observed);
  assert.equal(settlement.realisedCaptainExtra,14);
  assert.equal(settlement.sameSquadScoringChipEffect,7);
  assert.equal(settlement.realisedAdviceNet-settlement.realisedFixedHold,3);
  assert.equal(settlement.actualManagerNet,31);
  assert.equal(settlement.followedAll,false);
  assert.throws(()=>settleWeek({...report,computedAt:event.deadlineTime},38,snapshot,live,picks,[],observed),/pre-deadline/);
  assert.throws(()=>settleWeek(report,38,snapshot,{elements:live.elements.slice(1)},picks,[],observed),/participation/);
});

test('a temporary Free Hit buy cannot overwrite the permanent selling basis',async()=>{
  const {reconcilePublicFinances}=await import('../scripts/verify-personal-state');
  const {snapshot}=scenario(4);
  const originals=snapshot.players.map(p=>({element:p.id,purchase_price:40}));
  const first={picks:originals,active_chip:null,entry_history:{event:1,bank:3}};
  const current={picks:originals.map(p=>({element:p.element})),active_chip:null,entry_history:{event:3,bank:7}};
  const history={current:[1,2,3].map(event=>({event,event_transfers:0,points:0,event_transfers_cost:0,overall_rank:null})),chips:[{name:'freehit',event:2}]};
  const ledger=[{event:2,element_in:1,element_out:2,element_in_cost:48,time:'2026-07-28T12:00:00Z'}];
  assert.equal(reconcilePublicFinances(snapshot,1,current,first,history,ledger).prices[1],45);
  assert.throws(()=>reconcilePublicFinances(snapshot,1,current,first,{...history,chips:undefined},ledger),/chip history/);
  assert.throws(()=>reconcilePublicFinances(snapshot,1,current,first,history,
    [{...ledger[0],event:4}]),/upcoming transfers/);
});

test('personal goalkeeper policy holds a regular doubtful starter and considers durable replacements only if he is out', async () => {
  const { personalGoalkeeperPolicy } = await import('../scripts/personal-goalkeeper-policy');
  const { snapshot, entry, now } = scenario();
  const [first, reserve] = snapshot.players;
  const played = Array.from({length:5}, (_, i)=>makeFixture(900+i,i+1,first.teamId,reserve.teamId));
  const incomingClub = 9;
  for (let i=0;i<5;i++) played.push(makeFixture(950+i,i+1,incomingClub,10));
  snapshot.fixtures.push(...played.map(f=>({...f,finished:true})));
  first.starts=5; first.minutes=450; first.chance=50; first.status='d';
  reserve.starts=0; reserve.minutes=0;
  const regular=makePlayer(98,{position:'GKP',teamId:incomingClub,starts:5,minutes:450,cost:45,status:'a',chance:100});
  const cover=makePlayer(99,{position:'GKP',teamId:incomingClub,starts:1,minutes:90,cost:40,status:'a',chance:100});
  snapshot.players.push(regular,cover);
  const owners=entry.picks.map(p=>p.element);
  const doubtful=buildFiveWeekPlan(snapshot,entry,now);
  assert.equal(doubtful.goalkeeperPolicy.awaitingNews,true);
  assert.equal(doubtful.goalkeeperPolicy.transfers.replaceableId,undefined);
  assert.ok(doubtful.weeks.every(w=>w.transfers.every(t=>t.out.position!=='GKP')));
  first.chance=0; first.status='i';
  assert.equal(personalGoalkeeperPolicy(snapshot,snapshot.players,owners).transfers.replaceableId,undefined);
  const unavailable=personalGoalkeeperPolicy(snapshot,snapshot.players,owners,new Set([first.id]));
  assert.equal(unavailable.transfers.replaceableId,first.id);
  assert.deepEqual(unavailable.transfers.incomingIds,[regular.id]);
  const emergency=buildFiveWeekPlan(snapshot,entry,now,undefined,{teamNews:[{playerId:first.id,throughGw:16,status:'u',chance:0,observedAt:now.toISOString(),source:'https://example.test/team-news'}]});
  assert.ok(emergency.weeks.every(w=>w.transfers.filter(t=>t.out.position==='GKP')
    .every(t=>t.out.id===first.id && t.incoming.id===regular.id)));
  reserve.starts=4; reserve.minutes=360; reserve.status='a'; reserve.chance=100;
  assert.equal(personalGoalkeeperPolicy(snapshot,snapshot.players,owners,new Set([first.id])).transfers.replaceableId,undefined);
});

test('fixture watchlist flags the designated opponents and keeps numeric forecasts', async () => {
  const { managerFixtureRisk, personalFixtureOpportunities } = await import('../scripts/personal-fixture-context');
  const { snapshot, entry, now } = scenario();
  const [first, second] = snapshot.teams;
  first.code = 3;
  const plan = buildFiveWeekPlan(snapshot, entry, now);
  const opponent = plan.weeks[0].currentSquad.find(p=>p.club===second.shortName)!;
  assert.ok(opponent.fixtures.some(f=>f.managerRisk==='hard'));
  assert.equal(managerFixtureRisk(43),'hard');
  assert.equal(managerFixtureRisk(14),'hard');
  assert.equal(managerFixtureRisk(undefined),null);
  assert.ok(plan.goalkeeperComparison[0].weeks.every(w=>Number.isFinite(w.xPts)));
  assert.deepEqual(personalFixtureOpportunities([],20),{gw:20,attack:[],cleanSheet:[]});
});

test('validated context extends the horizon, reports observed EO, and applies team news only through its stated gameweek', () => {
  const { snapshot,entry,now }=scenario();
  const settled=snapshot.gameweeks.find(g=>g.id===14)!;
  settled.dataChecked=true;
  const source='https://example.test/gw14';
  const raw={horizon:8,cohort:{season:snapshot.meta.season,gameweek:14,observedAt:now.toISOString(),source,
    sampleSize:200,cutoffPoints:550,players:[{id:1,ownership:90,effectiveOwnership:180}]},
    teamNews:[{playerId:1,throughGw:15,status:'u',chance:0,observedAt:now.toISOString(),source}]};
  const plan=buildFiveWeekPlan(snapshot,entry,now,undefined,raw);
  assert.equal(plan.horizon.length,8);
  assert.deepEqual(plan.horizonSummary.map(row=>row.weeks),[1,2,8]);
  assert.equal(plan.cohort?.pointsOutsideCutoff,50);
  assert.equal(plan.averageComparison.managerPointsPerWeek,62.5);
  assert.match(renderText(plan), /8-gameweek plan/);
  assert.match(renderText(plan), /fixed-squad comparison across the reported gameweeks/);
  assert.equal(plan.weeks[0].currentSquad.find(p=>p.id===1)?.xPts,0);
  assert.ok((plan.weeks[1].currentSquad.find(p=>p.id===1)?.xPts??0)>0);
  assert.throws(()=>buildFiveWeekPlan(snapshot,entry,now,undefined,{...raw,cohort:{...raw.cohort,gameweek:13}}),/latest completed/);
  assert.throws(()=>buildFiveWeekPlan(snapshot,entry,now,undefined,{...raw,teamNews:[{...raw.teamNews[0],throughGw:14}]}),/applicable gameweek/);
});

test('completed transfer changes the opening squad and allowance exactly once and is shown in the report', () => {
  const {snapshot,entry,now}=scenario();
  snapshot.players.push({...snapshot.players[2],id:16,name:'New defender',cost:51});
  const completed={gameweek:15,moves:[{outId:3,inId:16,sellTenths:50,buyTenths:51}]};
  const report=buildFiveWeekPlan(snapshot,entry,now,undefined,{horizon:1},completed);
  assert.ok(report.openingState.squad.includes(16));
  assert.ok(!report.openingState.squad.includes(3));
  assert.equal(report.openingState.bankTenths,4);
  assert.equal(report.openingState.freeTransfers,1);
  assert.equal(report.completedTransfers[0].incoming.name,'New defender');
  assert.ok(report.weeks[0].transfers.every(t=>t.out.id!==3));
  assert.match(renderText(report),/Transfers already made[\s\S]*→ New defender/);
  const photos = new Map([[16,{photo:{uri:'data:image/png;base64,preview',source:'official'}}]]);
  assert.match(renderBoard(report,report.weeks[0],photos,'','pitch',now.toISOString()), /ALREADY COMPLETED[\s\S]*New defender/);
  assert.match(renderRoadmap(report,photos,'',now.toISOString()), /Already completed[\s\S]*<img src="data:image\/png;base64,preview" alt="">New defender/);
  assert.throws(()=>buildFiveWeekPlan(snapshot,entry,now,undefined,{horizon:1},{...completed,gameweek:14}),/next official gameweek/);
});
