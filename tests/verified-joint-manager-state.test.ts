import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedJointManagerState } from '../src/lib/verifiedJointManagerState.ts';
import type { EntryData, EntryPick } from '../src/lib/types.ts';

const NOW = new Date('2026-11-01T17:00:00Z');
const SQUAD = Array.from({ length: 15 }, (_, i) => i + 1);
function entry(
  sources: EntryPick['priceBasisSource'][] =
  Array.from({ length: 15 }, () => 'official-selling-price'),
): EntryData {
  return {
    id: 12345, source: 'live', generatedAt: '2026-11-01T16:55:00Z',
    provenance: { kind:'official', requestedIdVerified:true, sourceCapturedAt:null },
    activeChip: null, chipsUsed: [{ name:'freehit', event:19 }],
    currentEvent: 19, freeTransfers: 3, postLockTransfersUsed: 0,
    // Synthetic authenticated-team evidence ONLY. Public FPL picks do not
    // carry the current pending-transfer/price-basis provenance required
    // to authorize this research optimizer.
    managerStateSource: 'authenticated-current-team',
    authenticatedAvailableChipHalves: {
      wildcard:[2], free_hit:[2], bench_boost:[2], triple_captain:[2],
    },
    history: { event:19, bank:12 },
    picks: SQUAD.map((element,i) => ({
      element, sellingPrice:4.9, purchasePrice:4.9,
      priceBasisSource: sources[i],
    })),
  } as EntryData;
}

test('verified joint state retains official 15-man price basis, bank tenths and chip history', () => {
  const inputs = entry(SQUAD.map((_,i) =>
    i % 3 === 0 ? 'official-selling-price'
    : i % 3 === 1 ? 'official-purchase-price'
    : 'official-transfer-history'));
  const result = verifiedJointManagerState(inputs,SQUAD,20,NOW);
  assert.equal(result.entryId,12345);
  assert.equal(result.bankTenths,12);
  assert.equal(result.freeTransfersNow,3);
  assert.equal(result.squadIds.length,15);
  assert.equal(Object.keys(result.sellingPricesTenths).length,15);
  assert.ok(SQUAD.every(id=>result.sellingPricesTenths[id]===49));
  assert.equal(result.chips.first_half_fh_used_gw19,true);
  assert.deepEqual(result.chips.squad_chip_halves,{wildcard:[2],free_hit:[2]});
});

test('inferred prices and missing official entry evidence cannot drive exact joint chips', () => {
  const good = entry();
  const cases: EntryData[] = [
    { ...good, picks:good.picks.map((p,i)=>i===14?{...p,priceBasisSource:'inferred-season-start'}:p) },
    { ...good, picks:good.picks.map((p,i)=>i===14?{...p,priceBasisSource:undefined}:p) },
    { ...good, picks:good.picks.map((p,i)=>i===14?{...p,sellingPrice:4.95}:p) },
    { ...good, picks:good.picks.map((p,i)=>i===14?{...p,sellingPrice:undefined}:p) },
    { ...good, managerStateSource:'public-locked-snapshot' },
    { ...good, managerStateSource:undefined },
    { ...good, postLockTransfersUsed:undefined },
    { ...good, postLockTransfersUsed:1 },
    { ...good, history:{...good.history,bank:-1} },
    { ...good, history:{...good.history,event:17} },
    { ...good, freeTransfers:6 },
    { ...good, source:'cache' },
    { ...good, generatedAt:'2026-10-01T00:00:00Z' },
    { ...good, provenance:{...good.provenance!,requestedIdVerified:false} },
    { ...good, chipsUsed:undefined },
  ];
  for(const bad of cases) {
    assert.throws(()=>verifiedJointManagerState(bad,SQUAD,20,NOW),RangeError);
  }
  assert.throws(()=>verifiedJointManagerState(good,SQUAD.slice(1),20,NOW),RangeError);
  assert.throws(()=>verifiedJointManagerState(good,[...SQUAD.slice(1),16],20,NOW),RangeError);
  assert.throws(()=>verifiedJointManagerState(good,[...SQUAD.slice(1),15],20,NOW),RangeError);
});


test('ordinary live public history remains ineligible even with complete published transfers and chip records', () => {
  const publicEntry = entry();
  publicEntry.managerStateSource = 'public-locked-snapshot';
  assert.throws(
    () => verifiedJointManagerState(publicEntry,SQUAD,20,NOW),
    /authenticated current-team data is required/,
  );
});
