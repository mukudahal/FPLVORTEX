import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHistoryBundle, evaluateBacktest } from '../src/historical-validation.mjs';

import { historyFixture } from './history-fixtures.mjs';

const clock = new Date('2026-10-18T00:00:00Z');
test('valid bundle canonicalizes timestamps and preserves rights',()=>{
  const result=validateHistoryBundle(historyFixture(),clock);
  assert.equal(result.observations.length,3);
  assert.equal(result.rights.modelTrainingPermitted,false);
  assert.equal(result.observations[0].gameweek,31);
});
test('refuses backdated forecasts after kickoff (temporal leakage)',()=>{
  const raw=historyFixture();raw.observations[0].predictedAt=raw.observations[0].kickoffAt;
  assert.throws(()=>validateHistoryBundle(raw,clock),/Prediction must precede kickoff/);
});
test('refuses forecasts with outcomes not yet observable at capture',()=>{
  const raw=historyFixture();raw.capturedAt='2026-03-01T00:00:00Z';
  assert.throws(()=>validateHistoryBundle(raw,clock),/Outcome not yet observable/);
});
test('refuses duplicate player-gameweek, negative probabilities and strings masquerading as numbers',()=>{
  const duplicate=historyFixture();duplicate.observations.push({...duplicate.observations[0]});
  assert.throws(()=>validateHistoryBundle(duplicate,clock),/Duplicate/);
  const negative=historyFixture();negative.observations[0].predictedStartProbability=-0.1;
  assert.throws(()=>validateHistoryBundle(negative,clock),/predictedStartProbability/);
  const stringValue=historyFixture();stringValue.observations[0].actualPoints='3';
  assert.throws(()=>validateHistoryBundle(stringValue,clock),/actualPoints/);
});
test('rejects history without permissions for processing and display',()=>{
  const raw=historyFixture();raw.rights.endUserDisplayPermitted=false;
  assert.throws(()=>validateHistoryBundle(raw,clock),/rights have not been approved/);
});
test('evaluates correct MAE RMSE bias Brier by gameweek and calibration',()=>{
  const {observations}=validateHistoryBundle(historyFixture(),clock);
  const report=evaluateBacktest(observations);
  assert.equal(report.samples,3);
  assert.equal(report.gameweeks,2);
  assert.equal(report.mae,1.6667);
  assert.equal(report.rmse,Math.round(Math.sqrt(3)*10000)/10000);
  assert.equal(report.meanBias,-0.3333);
  assert.equal(report.startingBrier,0.0733);
  assert.equal(report.byGameweek[0].mae,2);
  assert.equal(report.startingCalibration.reduce((count,bucket)=>count+bucket.samples,0),3);
  assert.match(report.caution,/Small sample/);
});
test('no observations produce no metrics; corrupted records cannot silently create NaNs',()=>{
  assert.equal(evaluateBacktest([]),null);
  assert.throws(()=>evaluateBacktest([{...historyFixture().observations[0],expectedPoints:NaN}]),/expectedPoints/);
});