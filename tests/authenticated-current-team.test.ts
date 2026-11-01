import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAuthenticatedCurrentTeam, type AuthenticatedFplRead } from '../server/authenticatedCurrentTeam.ts';
import { enrichPlayers } from '../src/lib/analytics.ts';
import { verifiedJointManagerState } from '../src/lib/verifiedJointManagerState.ts';
import type { Snapshot, EntryData } from '../src/lib/types.ts';

const NOW = new Date('2026-11-01T22:00:00.000Z');
function fixture() {
  const snapshot = JSON.parse(readFileSync(
    new URL('../public/data/fpl-snapshot.json', import.meta.url), 'utf8',
  )) as Snapshot;
  // The fixture is downloaded/committed public FPL data, not a real user's
  // authenticated account. All private fields are synthetic test doubles.
  snapshot.meta = {
    ...snapshot.meta, nextEventId:9, stale:false, isLive:true, upstreamOk:true,
  };
  const all=enrichPlayers(snapshot,'balanced');
  const original=all.slice(0,15);
  const IDs=original.map(p=>p.id);
  const privatePicks=original.map((p,i)=>({
    element:p.id, position:i+1,
    purchase_price:p.cost, selling_price:p.cost,
    is_captain:i===0,is_vice_captain:i===1,
    multiplier:i===0?2:i<11?1:0,
  }));
  const chips=['wildcard','freehit','bboost','3xc'].map(name=>({
    name, number:1,start_event:name==='wildcard'||name==='freehit'?2:1,
    stop_event:19,status_for_entry:'available',
    played_by_entry:[],chip_type:name==='wildcard'||name==='freehit'?'transfer':'team',
  }));
  const myTeam={
    picks:privatePicks,chips,transfers:{
      status:'free',cost:0,made:0,limit:2,bank:12,value:750,
    },
  };
  const publicEntry={
    id:12345,source:'live',generatedAt:NOW.toISOString(),
    provenance:{kind:'official',requestedIdVerified:true,sourceCapturedAt:null},
    managerStateSource:'public-locked-snapshot',
    activeChip:null,chipsUsed:[],freeTransfers:2,postLockTransfersUsed:0,
    currentEvent:8,history:{event:8,bank:12},
    picks:privatePicks.map(p=>({
      element:p.element,position:p.position,multiplier:p.multiplier,
      isCaptain:p.is_captain,isViceCaptain:p.is_vice_captain,
    })),
    players:original,
  } as unknown as EntryData;
  const accesses:string[]=[];
  const read:AuthenticatedFplRead=async path=>{
    accesses.push(path);
    return path==='/me/'
      ? {player:{entry:12345,email:'DO-NOT-EXPOSE@example.test'}}
      : structuredClone(myTeam);
  };
  return {snapshot,publicEntry,myTeam,read,accesses,IDs};
}

test('authenticated FPL session GET /me/ and /my-team/ yields verified current prices and chip/FT bank without leaking PII',async()=>{
  const f=fixture();
  const entry=await readAuthenticatedCurrentTeam(
    12345,9,f.publicEntry,f.snapshot,f.read,NOW,
  );
  assert.deepEqual(f.accesses,['/me/','/my-team/12345/']);
  assert.equal(entry.managerStateSource,'authenticated-current-team');
  assert.equal(entry.freeTransfers,2);
  assert.equal(entry.history.bank,12);
  assert.equal(entry.postLockTransfersUsed,0);
  assert.deepEqual(entry.authenticatedAvailableChipHalves,{
    wildcard:[1],free_hit:[1],bench_boost:[1],triple_captain:[1],
  });
  assert.deepEqual(entry.picks.map(p=>p.element),f.IDs);
  assert.ok(entry.picks.every((p,i)=>p.priceBasisSource==='official-selling-price' &&
    p.purchasePrice===f.myTeam.picks[i].purchase_price/10));
  const readOnly=verifiedJointManagerState(entry,f.IDs,9,NOW);
  assert.deepEqual(readOnly.chips.squad_chip_halves,{
    wildcard:[1],free_hit:[1],
  });
  assert.ok(!JSON.stringify(entry).includes('DO-NOT-EXPOSE@example.test'));
  assert.equal(f.publicEntry.managerStateSource,'public-locked-snapshot');
});

test('private session must actually belong to the requested manager',async()=>{
  const f=fixture();
  const read:AuthenticatedFplRead=async path=>
    path==='/me/'?{player:{entry:99999}}:f.myTeam;
  await assert.rejects(()=>readAuthenticatedCurrentTeam(
    12345,9,f.publicEntry,f.snapshot,read,NOW,
  ),/different manager/);
});

test('private roster rejects duplicate or missing players, price mismatch and stale official market',async()=>{
  for(const mutate of [
    (f:ReturnType<typeof fixture>)=>{f.myTeam.picks.pop();},
    (f:ReturnType<typeof fixture>)=>{f.myTeam.picks[1].element=f.myTeam.picks[0].element;},
    (f:ReturnType<typeof fixture>)=>{f.myTeam.picks[1].selling_price+=2;},
    (f:ReturnType<typeof fixture>)=>{f.snapshot.meta.stale=true;},
    (f:ReturnType<typeof fixture>)=>{f.snapshot.meta.nextEventId=10;},
  ]){
    const f=fixture();mutate(f);
    await assert.rejects(()=>readAuthenticatedCurrentTeam(
      12345,9,f.publicEntry,f.snapshot,f.read,NOW,
    ),RangeError);
  }
});

test('chips reject pending, unknown, duplicate, ambiguous half and public-history contradictions',async()=>{
  for(const mutate of [
    (f:ReturnType<typeof fixture>)=>{f.myTeam.chips[0].status_for_entry='pending';},
    (f:ReturnType<typeof fixture>)=>{f.myTeam.chips[0].name='new-chip';},
    (f:ReturnType<typeof fixture>)=>{f.myTeam.chips.pop();},
    (f:ReturnType<typeof fixture>)=>{f.myTeam.chips[0].start_event=10;},
    (f:ReturnType<typeof fixture>)=>{f.myTeam.chips[0].stop_event=22;},
    (f:ReturnType<typeof fixture>)=>{f.publicEntry.chipsUsed=[{name:'wildcard',event:4}];},
  ]){
    const f=fixture();mutate(f);
    await assert.rejects(()=>readAuthenticatedCurrentTeam(
      12345,9,f.publicEntry,f.snapshot,f.read,NOW,
    ),RangeError);
  }
});

test('confirmed transfers or unlimited budgets cannot be misrepresented as verified FT',async()=>{
  for(const mutate of [
    (f:ReturnType<typeof fixture>)=>{f.myTeam.transfers.made=1;},
    (f:ReturnType<typeof fixture>)=>{f.myTeam.transfers.cost=4;},
    (f:ReturnType<typeof fixture>)=>{f.myTeam.transfers.limit=-1;},
  ]){
    const f=fixture();mutate(f);
    await assert.rejects(()=>readAuthenticatedCurrentTeam(
      12345,9,f.publicEntry,f.snapshot,f.read,NOW,
    ),RangeError);
  }
});
