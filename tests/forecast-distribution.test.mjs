import test from 'node:test';
import assert from 'node:assert/strict';
import { demoPlayers } from '../dist/js/model.js';
import { forecastDistribution } from '../dist/js/forecast-distribution.js';

test('probabilistic forecast is reproducible from a fixed seed', () => {
  const first = forecastDistribution(demoPlayers[0], 0, 500, 80);
  assert.deepEqual(first, forecastDistribution(demoPlayers[0], 0, 500, 80));
  assert.notDeepEqual(first, forecastDistribution(demoPlayers[0], 0, 500, 81));
});
test('out player has no returns, no points, zero quantiles', () => {
  const result = forecastDistribution({...demoPlayers[0],status:'out'}, 0, 500);
  assert.equal(result.expectedPoints, 0);
  assert.equal(result.p90, 0);
  assert.equal(result.probabilityOfBlank, 1);
  assert.equal(result.probabilityOfReturn, 0);
});
test('quantiles are ordered and probabilities are bounded', () => {
  for(const player of demoPlayers) {
    const result = forecastDistribution(player, 0, 200);
    assert.ok(result.p10 <= result.p50 && result.p50 <= result.p90);
    assert.ok(result.probabilityOfBlank >= 0 && result.probabilityOfBlank <= 1);
    assert.ok(result.probabilityOfReturn >= 0 && result.probabilityOfReturn <= 1);
    assert.ok(result.expectedPoints >= 0 && Number.isFinite(result.expectedPoints));
  }
});
test('an easier opponent produces better simulated output for the same player', () => {
  const player = demoPlayers[0];
  const easy = forecastDistribution({...player,fixtures:[1]},0,6000,99);
  const hard = forecastDistribution({...player,fixtures:[5]},0,6000,99);
  assert.ok(easy.expectedPoints > hard.expectedPoints);
});
test('invalid seeds, horizons and simulation budgets are rejected', () => {
  assert.throws(() => forecastDistribution(demoPlayers[0], 6), RangeError);
  assert.throws(() => forecastDistribution(demoPlayers[0], 0, 99), RangeError);
  assert.throws(() => forecastDistribution(demoPlayers[0], 0, 100, -1), RangeError);
  assert.throws(() => forecastDistribution(demoPlayers[0], 0, 100, 2**40), RangeError);
});