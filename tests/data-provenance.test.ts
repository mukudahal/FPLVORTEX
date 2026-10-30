import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessEvidence, createPlanningHorizon, type EvidenceMetadata } from '../src/lib/dataProvenance.ts';

const nowMs = Date.parse('2026-10-30T20:00:00Z');
const policy = { nowMs, maxAgeMs: 20 * 60_000 };

test('FPL retrieval is fresh without inventing an upstream publication timestamp', () => {
  const status = assessEvidence({
    kind: 'official-fpl', provider: 'FPL bootstrap-static',
    retrievedAt: '2026-10-30T19:50:00Z', sourceUpdatedAt: null,
  }, policy);
  assert.equal(status.state, 'fresh');
  assert.equal(status.anchor, 'retrieved');
  assert.equal(status.anchorAt, '2026-10-30T19:50:00.000Z');
});

test('official source missing successful retrieval never claims live data', () => {
  const status = assessEvidence({ kind: 'official-fpl', provider: 'FPL' }, policy);
  assert.equal(status.state, 'unavailable');
});

test('old bookmaker quote is stale despite a just-refreshed local cache', () => {
  const status = assessEvidence({
    kind: 'market-odds', provider: 'licensed feed', licenseStatus: 'verified',
    quotedAt: '2026-10-30T18:00:00Z',
    retrievedAt: '2026-10-30T19:59:00Z',
  }, policy);
  assert.equal(status.state, 'stale');
  assert.equal(status.anchor, 'quoted');
  assert.equal(status.anchorAt, '2026-10-30T18:00:00.000Z');
});

test('quote timestamp and license are mandatory even if retrieval was recent', () => {
  const base: EvidenceMetadata = {
    kind: 'market-odds', provider: 'licensed feed', retrievedAt: '2026-10-30T19:59:00Z',
  };
  assert.equal(assessEvidence(base, policy).state, 'unverified');
  assert.equal(assessEvidence({ ...base, licenseStatus: 'verified' }, policy).state, 'unverified');
  assert.equal(assessEvidence({ ...base, licenseStatus: 'restricted' }, policy).state, 'unavailable');
  assert.equal(assessEvidence({ ...base, licenseStatus: 'verified', quotedAt: '2026-10-30T19:58:00Z' }, policy).state, 'fresh');
});

test('verified news requires source URL and labels actual publication or retrieval time', () => {
  const base: EvidenceMetadata = {
    kind: 'verified-news', provider: 'Official FPL availability note',
    retrievedAt: '2026-10-30T19:59:00Z',
  };
  assert.equal(assessEvidence(base, policy).state, 'unverified');
  assert.equal(assessEvidence({ ...base, sourceUrl: 'javascript:alert(1)' }, policy).state, 'unverified');
  const withoutPublication = assessEvidence({ ...base, sourceUrl: 'https://fantasy.premierleague.com/' }, policy);
  assert.equal(withoutPublication.state, 'fresh');
  assert.equal(withoutPublication.anchor, 'retrieved');
  const withPublication = assessEvidence({ ...base, sourceUrl: 'https://fantasy.premierleague.com/',
    sourceUpdatedAt: '2026-10-28T14:00:00Z',
  }, policy);
  assert.equal(withPublication.state, 'stale');
  assert.equal(withPublication.anchor, 'published');
});

test('forecast and statistical fallback require version and snapshot; cannot pretend to be odds', () => {
  const base: EvidenceMetadata = {
    kind: 'model-forecast', provider: 'VORTEX expected points',
    computedAt: '2026-10-30T19:53:00Z',
  };
  assert.equal(assessEvidence(base, policy).state, 'unverified');
  const full = { ...base, modelVersion: 'v2-pending-validation', snapshotId: 'snapshot-001' };
  assert.equal(assessEvidence(full, policy).state, 'fresh');
  assert.equal(assessEvidence({ ...full, kind: 'statistical-fallback' }, policy).anchor, 'computed');
});

test('invalid and future timestamps never count as verified/fresh', () => {
  const base: EvidenceMetadata = { kind: 'official-fpl', provider: 'FPL', retrievedAt: '2026-10-30T19:55:00Z' };
  assert.equal(assessEvidence({ ...base, retrievedAt: '2026-10-30 19:55' }, policy).state, 'unverified');
  assert.equal(assessEvidence({ ...base, retrievedAt: '2026-10-30T20:09:00Z' }, policy).state, 'unverified');
  assert.throws(() => assessEvidence(base, { nowMs, maxAgeMs: -1 }), RangeError);
  assert.throws(() => assessEvidence(base, { nowMs: NaN, maxAgeMs: 1000 }), RangeError);
});

test('the ten-GW horizon is derived from actual supplied season endpoints', () => {
  assert.deepEqual(createPlanningHorizon(12, 38), [12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  assert.deepEqual(createPlanningHorizon(36, 38), [36, 37, 38]);
  assert.deepEqual(createPlanningHorizon(39, 38), []);
  assert.deepEqual(createPlanningHorizon(null, 38), []);
  assert.deepEqual(createPlanningHorizon(undefined, 38), []);
  assert.deepEqual(createPlanningHorizon(7, 8), [7, 8]);
  assert.deepEqual(createPlanningHorizon(7, 8, 1), [7]);
  assert.throws(() => createPlanningHorizon(0, 38), RangeError);
  assert.throws(() => createPlanningHorizon(7, 38, 11), RangeError);
  assert.throws(() => createPlanningHorizon(7, 0), RangeError);
});
