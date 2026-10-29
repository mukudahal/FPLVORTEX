import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitFdrReference, opportunityFdr } from '../src/lib/repoModel/fdrReference.ts';

const history = Array.from({ length: 30 }, (_, i) => ({ forecastAt: '2026-08-01T10:00:00Z', deadlineAt: '2026-08-02T10:00:00Z', goalsFor: i / 10, cleanSheetProbability: i / 100 }));

test('attack and defence scales are separate, fixed and monotonic', () => {
  const ref = fitFdrReference(history, '2026-08-03T00:00:00Z', 'test-v1');
  assert.ok(opportunityFdr(2, ref.attack) < opportunityFdr(1, ref.attack));
  assert.ok(opportunityFdr(.2, ref.defence) < opportunityFdr(.1, ref.defence));
  assert.equal(opportunityFdr(-1, ref.attack), 5);
  assert.equal(opportunityFdr(10, ref.attack), 1);
  const old = opportunityFdr(1.5, ref.attack);
  history.push({ ...history[0], goalsFor: 100 });
  assert.equal(opportunityFdr(1.5, ref.attack), old);
});

test('requires enough pre-deadline forecasts strictly before cutoff', () => {
  const rows = Array.from({ length: 20 }, () => ({ forecastAt: '2026-08-02T10:00:00Z', deadlineAt: '2026-08-02T10:00:00Z', goalsFor: 1, cleanSheetProbability: .3 }));
  assert.throws(() => fitFdrReference(rows, '2026-08-03T00:00:00Z', 'v1'));
  assert.throws(() => fitFdrReference(history.slice(0, 19), '2026-08-03T00:00:00Z', 'v1'));
  assert.throws(() => fitFdrReference(history, 'invalid', 'v1'));
  assert.throws(() => opportunityFdr(1, [1, 2]));
});
