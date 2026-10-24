'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fingerprintSnapshot, canonicalJson, seasonForFirstDeadline } = require('../src/lib/snapshotIdentity.ts');

test('canonical JSON digest does not depend on object key ordering', () => {
  const first = fingerprintSnapshot('2026/27', 8, 'official:fpl:bootstrap', { b: 2, a: { y: [1, 2], x: 3 } });
  const second = fingerprintSnapshot('2026/27', 8, 'official:fpl:bootstrap', { a: { x: 3, y: [1, 2] }, b: 2 });
  assert.equal(first.contentSha256, second.contentSha256);
  assert.notEqual(first.contentSha256, fingerprintSnapshot('2026/27', 8, 'official:fpl:bootstrap', { a: { x: 3, y: [2, 1] }, b: 2 }).contentSha256);
  assert.equal(first.contentSha256.length, 64);
});

test('snapshot identity is source-, season- and GW-specific', () => {
  assert.notEqual(fingerprintSnapshot('2026/27', 8, 'official:fpl:fixtures', []).contentSha256,
    fingerprintSnapshot('2026/27', 8, 'official:fpl:bootstrap', {}).contentSha256);
  assert.throws(() => fingerprintSnapshot('2026/27', 39, 'official:fpl:fixtures', []), /gameweek/);
  assert.throws(() => fingerprintSnapshot('2026/27', 8, '../private', {}), /source/);
  assert.match(canonicalJson({ b: null, a: 1 }), /^\{"a":1,"b":null\}$/);
});

test('season is based on official first deadline, not the system clock', () => {
  assert.equal(seasonForFirstDeadline('2026-08-13T17:00:00Z'), '2026/27');
  assert.equal(seasonForFirstDeadline('2027-01-02T12:00:00Z'), '2026/27');
  assert.throws(() => seasonForFirstDeadline('no date'), /deadline/);
});

test('SQL migration prevents UPDATE and DELETE of historical snapshots', () => {
  const root = path.resolve(__dirname, '..');
  const sql = fs.readFileSync(path.join(root, 'migrations/0005_immutable_snapshots.sql'), 'utf8');
  assert.match(sql, /BEFORE UPDATE OR DELETE ON data_snapshots/);
  assert.match(sql, /RAISE EXCEPTION/);
});

test('scheduled refresh persists snapshots before reporting success', () => {
  const route = fs.readFileSync(path.resolve(__dirname, '../src/app/api/cron/refresh/route.ts'), 'utf8');
  assert.match(route, /await captureOfficialFplSnapshots\(rawBootstrap, fixtures\)/);
  assert.ok(route.indexOf('await captureOfficialFplSnapshots') < route.indexOf('await cacheSet'));
});
