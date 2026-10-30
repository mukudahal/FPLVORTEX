import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayManualTransfers, swapManualLineup, type ManualPlayer, type ManualTransfer } from '../src/lib/manualPlanner';

const players = new Map<number, ManualPlayer>([
  [1, { id: 1, position: 'GKP', teamId: 1 }],
  [2, { id: 2, position: 'GKP', teamId: 2 }],
  [3, { id: 3, position: 'GKP', teamId: 3 }],
  [4, { id: 4, position: 'DEF', teamId: 4 }],
  [5, { id: 5, position: 'DEF', teamId: 5 }],
]);
const move: ManualTransfer = { gw: 10, outId: 1, inId: 3, sellingPrice: 45, purchasePrice: 52, enteredAt: '2026-10-30T12:00:00Z' };

test('manual transfers apply from the chosen week and carry forward with user prices', () => {
  const initial = { squad: [1, 2, 4, 5], bank: 10 };
  assert.deepEqual(replayManualTransfers(initial, [move], 9, players), { ok: true, state: initial });
  assert.deepEqual(replayManualTransfers(initial, [move], 15, players), { ok: true, state: { squad: [3, 2, 4, 5], bank: 3 } });
  assert.deepEqual(initial.squad, [1, 2, 4, 5]);
});

test('unknown bank stays unknown and invalid transfers are reported', () => {
  assert.deepEqual(replayManualTransfers({ squad: [1, 2], bank: null }, [move], 10, players), { ok: true, state: { squad: [3, 2], bank: null } });
  assert.equal(replayManualTransfers({ squad: [1, 2], bank: 0 }, [move], 10, players).ok, false);
  assert.equal(replayManualTransfers({ squad: [1, 2], bank: 50 }, [{ ...move, inId: 4 }], 10, players).ok, false);
  assert.equal(replayManualTransfers({ squad: [1, 2], bank: 50 }, [{ ...move, inId: 2 }], 10, players).ok, false);
});

test('swaps only exchange same-position players between pitch and bench', () => {
  assert.deepEqual(swapManualLineup([1, 4], [2, 5], 1, 2, players), { starters: [2, 4], bench: [1, 5] });
  assert.equal(swapManualLineup([1, 4], [2, 5], 1, 5, players), null);
  assert.equal(swapManualLineup([1, 4], [2, 5], 1, 4, players), null);
});
