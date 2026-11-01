import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJointSolverRequest } from '../src/lib/jointSolverRequest.ts';
import { makePlayer, makeTeam } from './helpers.ts';
import type { EntryData, EnrichedPlayer, Snapshot, Position } from '../src/lib/types.ts';
import type { PlannerSimulationOutput } from '../src/lib/repoModel/compassPlanner.ts';

const NOW = new Date('2026-11-01T17:00:00Z');
const positions: Position[] = [
  'GKP','GKP','DEF','DEF','DEF','DEF','DEF',
  'MID','MID','MID','MID','MID','FWD','FWD','FWD',
];
function fixture() {
  const players = positions.map((position,i)=>makePlayer(i+1,{
    position, teamId:i%10+1, team:makeTeam(i%10+1), cost:50,
  })) as EnrichedPlayer[];
  players.push(makePlayer(16,{
    position:'MID',teamId:8,team:makeTeam(8),cost:55,
  }) as EnrichedPlayer);
  const gws=[37,38];
  const snapshot={
    meta:{nextEventId:37,stale:false},
    fixtures:gws.flatMap(gw=>Array.from({length:5},(_,i)=>({
      event:gw,teamH:i*2+1,teamA:i*2+2,
    }))),
  } as unknown as Snapshot;
  const planner={gws,forecastByGw:Object.fromEntries(gws.map(gw=>[
    gw,Object.fromEntries(players.map(p=>[p.id,p.id===16?9:4])),
  ]))} as PlannerSimulationOutput;
  const squadIds=players.slice(0,15).map(p=>p.id);
  const entry={
    id:81,source:'live',activeChip:null,generatedAt:'2026-11-01T16:55:00Z',
    chipsUsed:[{name:'freehit',event:19}],freeTransfers:0,
    postLockTransfersUsed:0,
    provenance:{kind:'official',requestedIdVerified:true,sourceCapturedAt:null},
    history:{bank:5,event:36},
    picks:squadIds.map(element=>({
      element,sellingPrice:5,purchasePrice:5,
      priceBasisSource:'official-selling-price',
    })),
  } as EntryData;
  return {
    entry,snapshot,planner,players,squadIds,
    bankTenths:5,freeTransfers:0,
    sellingPrices:Object.fromEntries(squadIds.map(id=>[id,50])),
    lockedIds:[1],decay:.85,now:NOW,
  };
}

test('joint request is a bounded pure forecast export with verified chip, bank, FT, price provenance',()=>{
  const input=fixture();
  const output=buildJointSolverRequest(input);
  assert.equal(output.entryId,81);
  assert.equal(output.solver.current_team.bank,.5);
  assert.equal(output.solver.current_team.free_transfers,0);
  assert.equal(output.solver.settings.solutions_requested,1);
  assert.ok(output.solver.players.length<=40);
  assert.ok(input.squadIds.every(id=>output.solver.players.some(p=>p.player_id===id)));
  assert.deepEqual(output.solver.settings.squad_chip_halves,{wildcard:[2],free_hit:[2]});
  assert.deepEqual(output.solver.settings.locked_players,[1]);
  assert.equal(output.solver.players.find(p=>p.player_id===16)?.xpts_by_gw[37],9);
  assert.equal(output.solver.settings.first_half_fh_used_gw19,true);
});

test('joint request cannot silently replace an owned squad, bank, selling basis or manual plan',()=>{
  const input=fixture();
  assert.throws(()=>buildJointSolverRequest({...input,bankTenths:6}),/differ/);
  assert.throws(()=>buildJointSolverRequest({...input,freeTransfers:1}),/differ/);
  assert.throws(()=>buildJointSolverRequest({
    ...input,sellingPrices:{...input.sellingPrices,1:49},
  }),/differ/);
  assert.throws(()=>buildJointSolverRequest({
    ...input,entry:{...input.entry,postLockTransfersUsed:1},
  }),/not verified/);
  assert.throws(()=>buildJointSolverRequest({
    ...input,planner:{...input.planner,sourcePlan:{
      id:'saved',name:'Protected saved plan',committedGameweeks:1,lockedPlayers:0,
    }},
  }),/manual plan/);
});

test('8–10 GW joint solver keeps the complete owned 15 with a bounded positional shortlist',()=>{
  const input=fixture();
  const additional:Position[]=[
    'GKP','GKP','GKP',
    'DEF','DEF','DEF','DEF','DEF','DEF','DEF','DEF',
    'MID','MID','MID','MID','MID','MID','MID','MID',
    'FWD','FWD','FWD','FWD','FWD',
  ];
  for(let i=0;i<additional.length;i++){
    const id=17+i;
    input.players.push(makePlayer(id,{
      position:additional[i],teamId:i%20+1,team:makeTeam(i%20+1),cost:50,
    }) as EnrichedPlayer);
  }
  const gws=Array.from({length:10},(_,i)=>20+i);
  input.snapshot={
    ...input.snapshot,meta:{...input.snapshot.meta,nextEventId:20},
    fixtures:gws.flatMap(gw=>Array.from({length:10},(_,i)=>({
      event:gw,teamH:2*i+1,teamA:2*i+2,
    }))),
  };
  input.planner={
    ...input.planner,gws,
    forecastByGw:Object.fromEntries(gws.map(gw=>[gw,
      Object.fromEntries(input.players.map(p=>[p.id,
        p.position==='GKP'?3:p.position==='MID'?5:4])),
    ])),
  };
  input.entry={...input.entry,history:{...input.entry.history,event:19}};
  const result=buildJointSolverRequest(input);
  assert.equal(result.solver.settings.start_gw,20);
  assert.equal(result.solver.settings.end_gw,29);
  assert.ok(result.solver.players.length<=30);
  assert.ok(input.squadIds.every(id=>result.solver.players.some(p=>p.player_id===id)));
  assert.equal(result.solver.players.length,30);
  const outside=result.solver.players.filter(p=>!input.squadIds.includes(p.player_id));
  for(const [pos,min] of [['GK',1],['DEF',3],['MID',3],['FWD',2]] as const){
    assert.ok(outside.filter(p=>p.position===pos).length>=min,
      'position-alternative shortlist for '+pos);
  }
  const shorter=buildJointSolverRequest({
    ...input,planner:{...input.planner,gws:gws.slice(0,5)},
  });
  assert.ok(shorter.solver.players.length<=40);
  assert.ok(shorter.solver.players.length>=result.solver.players.length);
});
