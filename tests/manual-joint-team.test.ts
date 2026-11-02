import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlayer, makeTeam } from './helpers.ts';
import {
  MANUAL_CHIPS, fplSellingPriceTenths, validateManualJointTeam,
  type ManualJointTeamInput, type ManualChipStatuses,
} from '../src/lib/manualJointTeam.ts';
import { buildManualJointSolverRequest } from '../src/lib/manualJointSolverRequest.ts';
import type { EnrichedPlayer, Snapshot, Position } from '../src/lib/types.ts';
import type { PlannerSimulationOutput } from '../src/lib/repoModel/compassPlanner.ts';

const positionOrder:Position[]=[
  'GKP','GKP','DEF','DEF','DEF','DEF','DEF',
  'MID','MID','MID','MID','MID','FWD','FWD','FWD',
];
const now=new Date('2026-11-01T17:00:00Z');

function fixture(gw=9,horizon=4){
  const players:EnrichedPlayer[]=positionOrder.map((position,i)=>
    makePlayer(i+1,{position,teamId:i%10+1,team:makeTeam(i%10+1),cost:50})
    as EnrichedPlayer);
  players.push(makePlayer(16,{
    position:'MID',teamId:8,team:makeTeam(8),cost:55,
  }) as EnrichedPlayer);
  const gameweeks=Array.from({length:horizon},(_,i)=>gw+i);
  const snapshot={
    meta:{nextEventId:gw,stale:false,isLive:true,upstreamOk:true},
    players,fixtures:gameweeks.flatMap(event=>
      Array.from({length:5},(_,i)=>({event,teamH:2*i+1,teamA:2*i+2}))),
  } as unknown as Snapshot;
  const chipStatuses=Object.fromEntries(MANUAL_CHIPS.map(chip=>
    [chip,{1:'unknown',2:'unknown'}])) as ManualChipStatuses;
  const manual:ManualJointTeamInput={
    gameweek:gw,
    players:players.slice(0,15).map(p=>({
      playerId:p.id,purchaseTenths:50,sellingTenths:50,
    })),
    bankTenths:10,freeTransfers:2,chipStatuses,
    fhPlayedInGw19:'unknown',acknowledged:true,
  };
  const planner={
    gws:gameweeks,forecastByGw:Object.fromEntries(gameweeks.map(g=>[
      g,Object.fromEntries(players.map(p=>[p.id,p.id===16?8:4])),
    ])),
  } as PlannerSimulationOutput;
  return {snapshot,manual,players,planner};
}

test('FPL half-profit price rule handles £0.1m rises, gains and drops exactly',()=>{
  assert.equal(fplSellingPriceTenths(50,51),50);
  assert.equal(fplSellingPriceTenths(50,52),51);
  assert.equal(fplSellingPriceTenths(50,55),52);
  assert.equal(fplSellingPriceTenths(50,48),48);
});

test('manual squad is never authenticated; unknown chips are NOT available',()=>{
  const f=fixture();
  const validated=validateManualJointTeam(f.manual,f.snapshot,4,now);
  assert.equal(validated.provenance,'manager-entered-unverified');
  assert.equal(validated.bankTenths,10);
  assert.equal(validated.freeTransfers,2);
  assert.equal(validated.squadIds.length,15);
  assert.equal(Object.keys(validated.sellingPricesTenths).length,15);
  assert.deepEqual(validated.chips.squad_chip_halves,{});
  assert.deepEqual(validated.chips.scoring_chip_halves,{});
  assert.equal(validated.unknownChips.length,4);
});

test('manual declared unused chips generate a distinctly MANUAL joint payload',()=>{
  const f=fixture();
  f.manual.chipStatuses.free_hit[1]='available';
  f.manual.chipStatuses.bench_boost[1]='available';
  f.manual.chipStatuses.wildcard[1]='unavailable';
  f.manual.chipStatuses.triple_captain[1]='unavailable';
  const built=buildManualJointSolverRequest({
    ...f,lockedIds:[1],decay:.85,now,
  });
  assert.equal(built.inputProvenance,'manager-entered-unverified');
  assert.deepEqual(built.solver.settings.squad_chip_halves,{free_hit:[1]});
  assert.deepEqual(built.solver.settings.scoring_chip_halves,{bench_boost:[1]});
  assert.equal(built.solver.current_team.bank,1.0);
  assert.equal(built.solver.current_team.free_transfers,2);
  assert.equal(built.solver.players.find(p=>p.player_id===1)?.selling_price,5);
  assert.equal(built.solver.settings.solutions_requested,1);
  assert.ok(built.solver.players.length<=40);
  assert.ok(built.solver.current_team.squad_player_ids.every(id=>
    built.solver.players.some(p=>p.player_id===id)));
});

test('15-owner quotas, duplicates, clubs, bank, FT, attestation and selling-price changes fail closed',()=>{
  const mutators:Array<(f:ReturnType<typeof fixture>)=>void>=[
    f=>{f.manual.acknowledged=false;},
    f=>{f.manual.players.pop();},
    f=>{f.manual.players[1].playerId=f.manual.players[0].playerId;},
    f=>{f.manual.players[1].playerId=999999;},
    f=>{f.manual.players[1].sellingTenths=49;},
    f=>{f.manual.players[1].purchaseTenths=49;},
    f=>{f.manual.players[1].purchaseTenths=50.1;},
    f=>{f.manual.bankTenths=-1;},
    f=>{f.manual.bankTenths=10.5;},
    f=>{f.manual.freeTransfers=6;},
    f=>{f.manual.freeTransfers=1.5;},
    f=>{f.snapshot.meta.stale=true;},
    f=>{f.snapshot.meta.isLive=false;},
    f=>{f.snapshot.meta.nextEventId=8;},
    f=>{f.manual.players[2].playerId=16;},
    f=>{f.manual.chipStatuses.free_hit[1]='invalid' as never;},
  ];
  for(const mutate of mutators){
    const f=fixture();mutate(f);
    assert.throws(()=>validateManualJointTeam(f.manual,f.snapshot,4,now),RangeError);
  }
  const club=fixture();
  // Four original squad players belong to team #1.
  for(const p of club.snapshot.players.slice(0,4))p.teamId=1;
  assert.throws(()=>validateManualJointTeam(club.manual,club.snapshot,4,now),/three players/);
});

test('GW19 to GW20 needs the exact season-half statuses without inventing carried chips',()=>{
  const f=fixture(18,4);
  f.manual.chipStatuses.free_hit[1]='available';
  f.manual.chipStatuses.free_hit[2]='available';
  f.manual.chipStatuses.bench_boost[2]='unavailable';
  const valid=validateManualJointTeam(f.manual,f.snapshot,4,now);
  assert.deepEqual(valid.chips.squad_chip_halves,{free_hit:[1,2]});
  assert.equal(valid.unknownChips.length,5);
});

test('GW20 FH requires explicit GW19 use/no-use testimony, not speculation',()=>{
  const f=fixture(20,4);
  f.manual.chipStatuses.free_hit[2]='available';
  assert.throws(()=>validateManualJointTeam(f.manual,f.snapshot,4,now),/GW20 Free Hit/);
  f.manual.fhPlayedInGw19='yes';
  let valid=validateManualJointTeam(f.manual,f.snapshot,4,now);
  assert.equal(valid.chips.first_half_fh_used_gw19,true);
  f.manual.fhPlayedInGw19='no';
  valid=validateManualJointTeam(f.manual,f.snapshot,4,now);
  assert.equal(valid.chips.first_half_fh_used_gw19,false);
});
