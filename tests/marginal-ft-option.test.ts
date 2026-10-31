import test from 'node:test';
import assert from 'node:assert/strict';
import { marginalFtOptionValue } from '../src/lib/repoModel/marginalFtOption.ts';

test('marginal banked free-transfer value is derived from the same legal action set', () => {
  assert.equal(marginalFtOptionValue(1, [{ transfers: 0, grossGain: 0 }, { transfers: 1, grossGain: 3 }]), 3);
  assert.equal(marginalFtOptionValue(1, [{ transfers: 1, grossGain: 18 }]), 4);
  assert.equal(marginalFtOptionValue(2, [{ transfers: 0, grossGain: 0 }, { transfers: 1, grossGain: 8 }]), 0);
  assert.equal(marginalFtOptionValue(2, [{ transfers: 2, grossGain: 7 }]), 4);
  assert.equal(marginalFtOptionValue(5, [{ transfers: 2, grossGain: 11 }]), 0);
  assert.equal(marginalFtOptionValue(1, [{ transfers: 1, grossGain: -3 }]), 0);
  assert.equal(marginalFtOptionValue(0, [{ transfers: 1, grossGain: 50 }]), 0);
  assert.equal(marginalFtOptionValue(1, []), 0);
});

test('marginal FT model rejects invalid evidence, never fabricating a finite recommendation', () => {
  assert.throws(() => marginalFtOptionValue(-1, []), RangeError);
  assert.throws(() => marginalFtOptionValue(6, []), RangeError);
  assert.throws(() => marginalFtOptionValue(1, [{ transfers: -1, grossGain: 0 }]), RangeError);
  assert.throws(() => marginalFtOptionValue(1, [{ transfers: 1, grossGain: Number.NaN }]), RangeError);
  assert.throws(() => marginalFtOptionValue(1, [{ transfers: 1.5, grossGain: 1 }]), RangeError);
});
