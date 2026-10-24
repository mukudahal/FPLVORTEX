'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { identifyForecast } = require('../src/server/forecastIdentity.ts');
const { eligibleHistory, fitPointsCalibration, calibratedPoints, fixtureUncertainty, validateHistoricalPredictions } = require('../src/lib/forecastScience.ts');

test('run identity is reproducible regardless of parameter key order', () => {
  const common = { season: '2026/27', forecastGw: 8, snapshotId: 'sha256:abcdefff', capturedAt: '2026-10-20T15:00:00Z' };
  const first = identifyForecast({ ...common, params: { b: 2, a: { k: true, j: 1 } } });
  const second = identifyForecast({ ...common, params: { a: { j: 1, k: true }, b: 2 } });
  assert.equal(first.modelRunId, second.modelRunId);
  assert.notEqual(first.modelRunId, identifyForecast({ ...common, params: { b: 3 } }).modelRunId);
});

test('backtest excludes forecasts made after deadline and prevents same-GW leakage', () => {
  const rows = [
    { gw: 5, position: 3, predicted: 5, actual: 3, predictedAt: '2026-09-01T12:00:00Z', deadlineAt: '2026-09-02T12:00:00Z', p60: 0.8, played60: true },
    { gw: 5, position: 3, predicted: 3, actual: 7, predictedAt: '2026-09-03T12:00:00Z', deadlineAt: '2026-09-02T12:00:00Z' },
    { gw: 6, position: 4, predicted: 1, actual: 3, predictedAt: '2026-09-01T12:00:00Z', deadlineAt: '2026-09-02T12:00:00Z' },
  ];
  assert.equal(eligibleHistory(rows, 6).length, 1);
  assert.equal(validateHistoricalPredictions(rows, 6).mae, 2);
  assert.equal(validateHistoricalPredictions(rows, 6).excludedAfterDeadline, 1);
  assert.equal(fitPointsCalibration(rows, 6)[2].verified, false);
  assert.equal(calibratedPoints(4, fitPointsCalibration(rows, 6)[2]), 4);
});

test('blank and double gameweek models count fixtures and unresolved dates', () => {
  const fixtures = [
    { event: 10, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4, kickoff_time: null },
    { event: 10, team_h: 3, team_a: 1, team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: '2026-12-01T16:00:00Z' },
    { event: null, team_h: 4, team_a: 1 },
  ];
  assert.equal(fixtureUncertainty(1, 10, fixtures).label, 'double');
  assert.equal(fixtureUncertainty(1, 10, fixtures).scheduleConfidence, 'pending_date');
  assert.equal(fixtureUncertainty(1, 11, fixtures).label, 'blank');
});
