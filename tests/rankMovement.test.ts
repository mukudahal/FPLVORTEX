import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rankMovement } from '../src/lib/rankMovement';

test('a numerically lower FPL rank is an improvement', () => {
  assert.deepEqual(rankMovement(353532, 410100), { direction: 'up', delta: 56568 });
});
test('a numerically higher FPL rank is a decline', () => {
  assert.deepEqual(rankMovement(410100, 353532), { direction: 'down', delta: -56568 });
});
test('unknown prior rank cannot be inferred, and unchanged rank is flat', () => {
  assert.deepEqual(rankMovement(353532, null), { direction: 'unknown', delta: null });
  assert.deepEqual(rankMovement(353532, 353532), { direction: 'same', delta: 0 });
});
