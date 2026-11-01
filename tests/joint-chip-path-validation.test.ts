import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyJointChipPaths, type JointRequest, type JointPlan, type JointWeek,
} from '../src/lib/jointChipPathValidation.ts';
import type { ExactMilpResponse } from '../src/lib/exactMilpBridge.ts';
import type { VerifiedChipInventory } from '../src/lib/verifiedChipInventory.ts';

const owned = Array.from({ length:15 },(_,i)=>i+1);
const positions = Array.from({ length:16 },(_,i)=>
  i<=1 ? 'GK' : i<=6 ? 'DEF' : i<=11||i===15 ? 'MID' : 'FWD');
function values() {
  return Object.fromEntries(Array.from({length:16},(_,i)=>
    [i+1, i===15 ? 9 : i<=1 ? 3 : 4])) as Record<number,number>;
}
function fixture() {
  const players=Array.from({length:16},(_,i)=>{
    const id=i+1;
    return {
      player_id:id,name:'Synthetic '+id,team_id:i%10+1,
      position:positions[i],current_price:id===16?5.5:5,
      selling_price:id<=15?5:null,
      xpts_by_gw:{37:values()[id],38:values()[id]},
      xmin_by_gw:{37:null,38:null},availability_by_gw:{37:null,38:null},
      has_fixture_by_gw:{37:true,38:true},
    };
  });
  const verified:VerifiedChipInventory={
    entryId:1,provenanceCheckedAt:'2026-11-01T17:00:00Z',
    scoring_chip_halves:{triple_captain:[2]},
    squad_chip_halves:{free_hit:[2]},
    first_half_fh_used_gw19:false,
  };
  const request={
    players,
    current_team:{squad_player_ids:owned,bank:1,free_transfers:1,current_gameweek:37},
    settings:{
      start_gw:37,end_gw:38,transfer_depth:2,max_transfers_per_gw:1,
      max_total_hits:12,time_decay:.85,free_transfer_value:0,bank_value_per_million:0,
      solutions_requested:1,time_limit_seconds:9,mip_gap:.02,locked_players:[1],
      excluded_players:[],forced_transfers:[],allow_blank_starters:true,
      scoring_chip_halves:verified.scoring_chip_halves,
      squad_chip_halves:verified.squad_chip_halves,
      first_half_fh_used_gw19:false,
    },
  } as unknown as JointRequest;
  const makeWeek=(gw:37|38, fh:boolean):JointWeek=>{
    const squad=fh?[...owned.filter(id=>id!==8),16]:owned;
    const starters=fh
      ?[1,3,4,5,16,9,10,11,13,14,15]
      :[1,3,4,5,8,9,10,11,13,14,15];
    const bench=squad.filter(id=>!starters.includes(id));
    const points=starters.reduce((x,id)=>x+request.players.find(p=>p.player_id===id)!.xpts_by_gw[gw],0)+4;
    return{
      gw,squad,permanent_squad_after:owned,
      starters,bench,captain:13,vice_captain:14,
      chip:fh?'free_hit':null,chip_bonus:0,
      transfers_in:[],transfers_out:[],
      temporary_transfers_in:fh?[16]:[],
      temporary_transfers_out:fh?[8]:[],
      temporary_bank:fh?.5:null,
      free_transfers_before:1,free_transfers_after:fh?1:2,
      bank:1,hit_cost:0,expected_points_after_hits:points,
    };
  };
  const gameweeks=[makeWeek(37,true),makeWeek(38,false)];
  const points=gameweeks.map(w=>w.expected_points_after_hits);
  const total=points[0]+points[1],weighted=points[0]+.85*points[1];
  const plan:JointPlan={
    gameweeks,raw_expected_points_after_hits:total,
    discounted_points_after_hits:weighted,evaluation_score:weighted,
    solver:{status:0,message:'Synthetic legal',mip_gap:0,optimality_proven:true},
  };
  const response:ExactMilpResponse={
    plans:[plan],solver_attempts:[plan.solver],runtime_seconds:.1,
    assumptions:{chip_mode:'joint synthetic'},warnings:[],
  };
  return {request,verified,response};
}

test('independent TS replay verifies FH temporary budget, bank, FT and original squad restoration',()=>{
  const {request,verified,response}=fixture();
  const ranked=verifyJointChipPaths(request,response,verified);
  assert.equal(ranked.length,1);
  assert.deepEqual(ranked[0].chipSchedule,[{gw:37,chip:'free_hit'}]);
  assert.equal(ranked[0].totalHits,0);
  assert.equal(ranked[0].totalMoves,1);
  assert.equal(ranked[0].deltaObjective,0);
});

test('joint verifier fails closed on wrong cash, legal state or entitlement',()=>{
  for(const change of [
    (r:ExactMilpResponse)=>{ (r.plans[0].gameweeks[0] as JointWeek).temporary_bank=.4; },
    (r:ExactMilpResponse)=>{ r.plans[0].gameweeks[0].free_transfers_after=2; },
    (r:ExactMilpResponse)=>{ (r.plans[0].gameweeks[0] as JointWeek).permanent_squad_after=[1,2]; },
    (r:ExactMilpResponse)=>{ r.plans[0].gameweeks[0].expected_points_after_hits+=5; },
    (r:ExactMilpResponse)=>{ (r.plans[0].gameweeks[0] as JointWeek).chip='wildcard'; },
  ]){
    const {request,verified,response}=fixture();
    change(response);
    assert.throws(()=>verifyJointChipPaths(request,response,verified),RangeError);
  }
  const {request,response,verified}=fixture();
  const dishonest:VerifiedChipInventory={...verified,squad_chip_halves:{}};
  assert.throws(()=>verifyJointChipPaths(request,response,dishonest),/chip inventory/);
});
