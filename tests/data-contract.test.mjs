import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedClock, sampleSnapshot } from './fixtures.mjs';
import { snapshotStatus, validateLicensedSnapshot } from '../dist/js/data-contract.js';

test('accepts a fully attributed synthetic fixture and strips photo identifiers', () => {
  const snapshot = validateLicensedSnapshot(sampleSnapshot(), fixedClock);
  assert.equal(snapshot.players.length, 2);
  assert.equal(snapshot.players[0].imageCode, undefined);
  assert.equal(snapshot.rights.modelTrainingPermitted, false);
  assert.equal(snapshot.capturedAt, '2026-10-17T18:00:00.000Z');
});
test('rejects ingest without approved machine processing/display rights', () => {
  const input = sampleSnapshot();
  input.rights.automatedProcessingPermitted = false;
  assert.throws(() => validateLicensedSnapshot(input, fixedClock), /not approved/);
  input.rights.automatedProcessingPermitted = true;
  input.rights.endUserDisplayPermitted = false;
  assert.throws(() => validateLicensedSnapshot(input, fixedClock), /not approved/);
});
test('duplicate players and mismatched horizons fail rather than silently truncating', () => {
  const duplicated = sampleSnapshot();
  duplicated.players[1].id = duplicated.players[0].id;
  assert.throws(() => validateLicensedSnapshot(duplicated, fixedClock), /Duplicate player/);
  const differentHorizon = sampleSnapshot();
  differentHorizon.players[1].fixtures = [1,2];
  assert.throws(() => validateLicensedSnapshot(differentHorizon, fixedClock), /horizon/);
});
test('invalid prices, minutes, fixture ratings, timestamps and season are refused', () => {
  for (const mutate of [
    source => { source.players[0].price = -1; },
    source => { source.players[0].expectedMinutes = 99; },
    source => { source.players[0].fixtures[0] = 6; },
    source => { source.season = '2026/45'; },
    source => { source.capturedAt = '2050-01-01T00:00:00Z'; },
    source => { source.rights.sourceName = ''; }
  ]) {
    const input = sampleSnapshot();
    mutate(input);
    assert.throws(() => validateLicensedSnapshot(input, fixedClock));
  }
});
test('source status never claims a trained/live model even with fresh licensed data', () => {
  const snapshot = validateLicensedSnapshot(sampleSnapshot(), fixedClock);
  const status = snapshotStatus(snapshot, fixedClock, 360);
  assert.equal(status.mode, 'licensed');
  assert.equal(status.live, false);
  assert.equal(status.trainedModelAvailable, false);
  assert.equal(status.stale, false);
  assert.equal(snapshotStatus(snapshot, new Date('2026-10-18T12:00:00Z')).stale, true);
  assert.equal(snapshotStatus(null).mode, 'demo');
});