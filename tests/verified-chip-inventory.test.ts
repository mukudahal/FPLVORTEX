import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedChipInventory } from '../src/lib/verifiedChipInventory.ts';
import type { EntryData } from '../src/lib/types.ts';

const NOW = new Date('2026-11-01T17:00:00Z');
function entry(chipsUsed: EntryData['chipsUsed'] = []): EntryData {
  return {
    id: 12345, source: 'live', activeChip: null, chipsUsed,
    generatedAt: '2026-11-01T16:55:00Z',
    provenance: {
      kind: 'official', requestedIdVerified: true,
      sourceCapturedAt: '2026-11-01T16:55:00Z',
    },
  } as EntryData;
}
test('verified 2026/27 chips use official played history and never cross half expiry', () => {
  const owned = entry([
    { name: 'wildcard', event: 5 },
    { name: '3xc', event: 8 },
    { name: 'freehit', event: 19 },
  ]);
  const future = verifiedChipInventory(owned, 20, NOW);
  assert.deepEqual(future.squad_chip_halves, { wildcard: [2], free_hit: [2] });
  assert.deepEqual(future.scoring_chip_halves, { bench_boost: [2], triple_captain: [2] });
  assert.equal(future.first_half_fh_used_gw19, true);
  const firstHalf = verifiedChipInventory(entry([
    { name: 'wildcard', event: 5 },
    { name: '3xc', event: 8 },
  ]), 18, NOW);
  assert.deepEqual(firstHalf.squad_chip_halves, { wildcard: [2], free_hit: [1, 2] });
  assert.deepEqual(firstHalf.scoring_chip_halves, {
    bench_boost: [1, 2], triple_captain: [2],
  });
});

test('unknown or stale manager chip data never creates free chip inventory', () => {
  const good = entry([]);
  for (const invalid of [
    null,
    { ...good, source: 'cache' },
    { ...good, source: 'snapshot' },
    { ...good, chipsUsed: undefined },
    { ...good, activeChip: 'wildcard' },
    { ...good, provenance: { ...good.provenance!, kind: 'archived' as const } },
    { ...good, provenance: { ...good.provenance!, requestedIdVerified: false } },
    { ...good, generatedAt: '' },
    { ...good, generatedAt: '2026-10-01T00:00:00Z' },
    { ...good, generatedAt: '2026-11-03T00:00:00Z' },
  ]) {
    assert.throws(() => verifiedChipInventory(invalid, 20, NOW), RangeError);
  }
});

test('future or duplicate chip usage fails closed, no hidden assumptions', () => {
  assert.throws(() => verifiedChipInventory(entry([
    { name: 'bboost', event: 20 },
  ]), 20, NOW), /future chip/);
  assert.throws(() => verifiedChipInventory(entry([
    { name: 'bboost', event: 9 }, { name: 'bench_boost', event: 10 },
  ]), 15, NOW), /Duplicate/);
  assert.throws(() => verifiedChipInventory(entry([
    { name: 'unknown', event: 9 },
  ]), 20, NOW), /invalid/);
  assert.throws(() => verifiedChipInventory(entry([]), 39, NOW), /Invalid future Gameweek/);
});
