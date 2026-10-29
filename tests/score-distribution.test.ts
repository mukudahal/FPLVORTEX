import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastFromGoalRates, mixScoreDistributions, poissonScoreDistribution, summarizeScoreDistribution } from '../src/lib/repoModel/scoreDistribution';

const near = (actual: number, expected: number, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('all match outcomes follow the same distribution with negligible omitted tail', () => {
  const grid = poissonScoreDistribution({ home: 1.85, away: .95 });
  assert.ok(grid.omittedMass < 1e-8);
  const result = summarizeScoreDistribution(grid);
  near(result.homeXg, 1.85); near(result.awayXg, .95);
  near(result.homeWin + result.draw + result.awayWin, 1);
  near(result.homeWin, .5851, .0001);
  near(result.draw, .2249, .0001);
  near(result.homeCs, Math.exp(-.95));
  near(result.awayCs, Math.exp(-1.85));
  near(result.homeScore2Plus, 1 - Math.exp(-1.85) * (1 + 1.85));
});

test('mixtures combine probabilities, not Poisson at average rates', () => {
  const a = poissonScoreDistribution({ home: 1.5, away: .8 });
  const b = poissonScoreDistribution({ home: 2, away: 1.4 });
  const result = summarizeScoreDistribution(mixScoreDistributions(a, b, .5));
  near(result.homeCs, (Math.exp(-.8) + Math.exp(-1.4)) / 2);
  assert.ok(Math.abs(result.homeCs - Math.exp(-1.1)) > .01);
  near(result.awayXg, 1.1);
  near(result.homeWin + result.draw + result.awayWin, 1);
  near(summarizeScoreDistribution(mixScoreDistributions(a, b, 0)).homeCs, Math.exp(-.8));
  near(summarizeScoreDistribution(mixScoreDistributions(a, b, 1)).homeCs, Math.exp(-1.4));
  assert.throws(() => mixScoreDistributions(a, b, 1.1));
});

test('handles zero, large and invalid scoring rates', () => {
  const zero = forecastFromGoalRates(0, 0);
  assert.equal(zero.draw, 1); assert.equal(zero.homeCs, 1);
  const high = poissonScoreDistribution({ home: 30, away: 20 });
  assert.ok(high.omittedMass < 1e-8);
  assert.throws(() => forecastFromGoalRates(-1, 1));
  assert.throws(() => forecastFromGoalRates(NaN, 1));
});
