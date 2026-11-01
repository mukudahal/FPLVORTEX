import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyJointChipPaths, type JointRequest, type JointPlan, type JointWeek,
} from '../src/lib/jointChipPathValidation.ts';
import type { ExactMilpResponse } from '../src/lib/exactMilpBridge.ts';
import type { VerifiedChipInventory } from '../src/lib/verifiedChipInventory.ts';
import { createReviewedJointChipPlan } from '../src/lib/jointChipPlanAdapter.ts';
import { replay, type PlanCtx } from '../src/lib/repoModel/planEngine.ts';
import type { PlanPlayer } from '../src/lib/repoModel/planTypes.ts';

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


test('explicit save-new joint FH proposal replays temporary swaps and restores permanent squad',()=>{
  const {request,verified,response}=fixture();
  const [path]=verifyJointChipPaths(request,response,verified);
  assert.ok(path);
  const saved=createReviewedJointChipPlan({
    request,path,id:'joint-fh-123',name:'Synthetic FH proposal',
    createdAt:'2026-11-01T17:00:00.000Z',
  });
  assert.equal(saved.chips[37],'fh');
  assert.deepEqual(saved.transfers[37],[{out:8,in:16}]);
  assert.equal(saved.transfers[38],undefined);
  assert.deepEqual(saved.baseSquad,owned);
  assert.equal(saved.baseBankTenths,10);
  assert.equal(saved.baseFreeTransfers,1);
  assert.equal(saved.lineups[37].length,15);
  assert.deepEqual(saved.captains[37],{captain:13,vice:14});

  const players=new Map<number,PlanPlayer>();
  for(const p of request.players) players.set(p.player_id,{
    id:p.player_id,code:p.player_id,name:p.name,team:p.team_id,
    type:p.position==='GK'?1:p.position==='DEF'?2:p.position==='MID'?3:4,
    cost:Math.round(p.current_price*10),status:'a',news:'',chance:100,
    owned:1,form:1,net:0,pen:null,fk:null,ck:null,
    xp:[p.xpts_by_gw[37],p.xpts_by_gw[38]],
  });
  const ctx:PlanCtx={
    players,gws:[37,38],baseSquad:[...owned],
    bank0:10,sell0:saved.sellingPrices,freeNow:1,
  };
  const temporary=replay(ctx,saved.transfers,37,saved.chips);
  assert.ok(temporary.squad.includes(16));
  assert.ok(!temporary.squad.includes(8));
  assert.equal(temporary.bank,5);
  assert.equal(temporary.ledger[0].hit,0);
  assert.equal(temporary.ledger[0].ftAfter,1);
  const restored=replay(ctx,saved.transfers,38,saved.chips);
  assert.deepEqual([...restored.squad].sort((a,b)=>a-b),owned);
  assert.equal(restored.bank,10);
  assert.equal(restored.ledger[1].ftAfter,2);
});
