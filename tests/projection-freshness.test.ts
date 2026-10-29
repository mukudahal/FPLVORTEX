import test from 'node:test';
import assert from 'node:assert/strict';
import { filenameProjectionDate, importedProjectionsNotice, projectionFreshness, snapshotSourceLabel } from '../src/lib/projectionFreshness.ts';
import type { RepoDataMeta, SnapshotMeta } from '../src/lib/types.ts';

const meta = { benchmarkFile: '3_data_third_party/fplcopilot-projections-gw7-2026-10-15-v4.csv', benchmarkPlayers: 667, projectionFileDate: '2026-10-15', projectionGameweeks: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16] } as RepoDataMeta;
const onOct29 = new Date('2026-10-29T15:30:00.000Z');

test('infers filename provenance without claiming provider publication', () => {
  assert.equal(filenameProjectionDate(meta.benchmarkFile), '2026-10-15');
  assert.equal(filenameProjectionDate('imports/no-date.csv'), null);
  assert.equal(filenameProjectionDate('gw-2026-02-30.csv'), null);
});
test('import older than seven UTC calendar days is stale', () => {
  assert.deepEqual(projectionFreshness('2026-10-15', onOct29), { status: 'stale', ageDays: 14 });
  const notice = importedProjectionsNotice(meta, onOct29) ?? '';
  assert.match(notice, /Imported projections may be stale/);
  assert.match(notice, /GW7–GW16/);
  assert.match(notice, /not a verified provider publication time/);
});
test('a seven-day-old filename does not exceed the threshold', () => {
  assert.deepEqual(projectionFreshness('2026-10-22', onOct29), { status: 'recent', ageDays: 7 });
});
test('invalid, missing, or future dates are unknown, never recent', () => {
  for (const date of [null, '', '2026-02-30', '2026-11-01']) {
    assert.equal(projectionFreshness(date, onOct29).status, 'unknown');
  }
  assert.match(importedProjectionsNotice({ ...meta, benchmarkFile: 'unknown.csv', projectionFileDate: null }, onOct29) ?? '', /freshness unknown/);
});
test('official FPL snapshot refresh cannot refresh the imported file date', () => {
  const a = importedProjectionsNotice(meta, onOct29);
  assert.equal(a, importedProjectionsNotice({ ...meta }, onOct29));
  assert.ok(a?.includes('Separate from live FPL data'));
});
test('absence of import rows suppresses the import warning', () => {
  assert.equal(importedProjectionsNotice({ ...meta, benchmarkPlayers: 0 }, onOct29), null);
  assert.equal(importedProjectionsNotice(undefined, onOct29), null);
});
test('cached and offline FPL data never masquerade as direct live data', () => {
  const m = { source: 'live', upstreamOk: true, stale: false } as SnapshotMeta;
  assert.equal(snapshotSourceLabel(m), 'FPL LIVE');
  assert.equal(snapshotSourceLabel({ ...m, source: 'cache' }), 'FPL CACHE');
  assert.equal(snapshotSourceLabel({ ...m, source: 'cache', stale: true }), 'STALE CACHE');
  assert.equal(snapshotSourceLabel({ ...m, source: 'snapshot' }), 'SNAPSHOT');
  assert.equal(snapshotSourceLabel(undefined), 'OFFLINE');
});
