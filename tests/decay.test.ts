import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historicalRate90, stabilizeRate, futureGwScore } from '../src/lib/repoModel/decay';
import { horizonXP, type PlanCtx } from '../src/lib/repoModel/planEngine';

const match = (fixtureId: number, gw: number, value: number, minutes = 90) => ({ fixtureId, gw, value, minutes, finished: true });

test('weights match totals by minutes and shrinks towards the prior', () => {
  const result = historicalRate90([match(1, 8, .9), match(2, 7, .1), match(3, 6, .1)], 8);
  assert.ok(Math.abs(result.rate! - .41069) < .001);
  assert.ok(Math.abs(result.weightedMinutes - 231.525) < .001);
  assert.equal(result.lowSample, false);
  const expected = (result.weightedMinutes * result.rate! + 450 * .3) / (result.weightedMinutes + 450);
  assert.ok(Math.abs(stabilizeRate(result.rate, result.weightedMinutes, .3) - expected) < 1e-12);
});

test('ignores unfinished, missing, zero-minute, future and old observations; handles doubles', () => {
  const result = historicalRate90([
    match(1, 8, .2, 45), match(2, 8, .3, 45),
    { ...match(3, 8, 99), finished: false }, { ...match(4, 8, 99), value: null },
    match(5, 8, 99, 0), match(6, 13, 99), match(7, 1, 99),
  ], 12, .85, 5);
  assert.ok(Math.abs(result.rate! - .5) < 1e-12);
  assert.equal(result.lowSample, true);
  assert.equal(historicalRate90([], 8).rate, null);
  assert.equal(stabilizeRate(null, 0, .3), .3);
  assert.throws(() => historicalRate90([match(1, 8, .1), match(1, 8, .2)], 8));
});

test('future score retains blank gameweeks and does not alter raw points', () => {
  const points = [6, 5, 7];
  assert.ok(Math.abs(futureGwScore(points) - 15.3075) < 1e-10);
  assert.equal(points.reduce((a, b) => a + b), 18);
  assert.ok(Math.abs(futureGwScore([6, 0, 7]) - 11.0575) < 1e-10);
  assert.equal(futureGwScore(points, 1), 18);
  assert.throws(() => futureGwScore(points, 0));
  assert.throws(() => futureGwScore([NaN]));
});

test('planner horizon supports opt-in decay without changing existing totals', () => {
  const ctx = { gws: [1, 2, 3], players: new Map() } as unknown as PlanCtx;
  assert.equal(horizonXP(ctx, [], 0, 3), 0);
  assert.equal(horizonXP(ctx, [], 0, 3, .85), 0);
  assert.throws(() => horizonXP(ctx, [], 0, 3, 2));
});
