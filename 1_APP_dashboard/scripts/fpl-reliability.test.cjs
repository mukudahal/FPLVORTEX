'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validFplPath, retryableStatus, retryWaitMilliseconds, maxStaleAgeMilliseconds } = require('../src/lib/fplReliability.ts');

test('only relative official FPL paths are allowed', () => {
  assert.equal(validFplPath('bootstrap-static/'), true);
  assert.equal(validFplPath('leagues-classic/1/standings/?page_standings=2'), true);
  for (const unsafe of ['https://example.org', '/bootstrap-static/', '../admin', 'x\nHost:evil', 'entry/123/#frag']) {
    assert.equal(validFplPath(unsafe), false, unsafe);
  }
});

test('retry policy does not repeat permanent upstream client errors', () => {
  for (const status of [400, 401, 403, 404, 422]) assert.equal(retryableStatus(status), false);
  for (const status of [408, 429, 500, 502, 503, 504]) assert.equal(retryableStatus(status), true);
});

test('server Retry-After is honored but capped at ten seconds', () => {
  assert.equal(retryWaitMilliseconds(1, '2', 0), 2000);
  assert.equal(retryWaitMilliseconds(1, '120', 0), 10000);
  assert.equal(retryWaitMilliseconds(0, null, 0), 500);
  assert.equal(retryWaitMilliseconds(3, null, 0), 4000);
  assert.equal(retryWaitMilliseconds(5, null, 0), 5000);
});

test('stale response fallback expires instead of hiding long outages', () => {
  assert.equal(maxStaleAgeMilliseconds(0), 120000);
  assert.equal(maxStaleAgeMilliseconds(60), 120000);
  assert.equal(maxStaleAgeMilliseconds(300), 600000);
  assert.throws(() => maxStaleAgeMilliseconds(-1), /lifetime/);
});

test('bootstrap and fixtures public APIs expose freshness provenance', () => {
  const root = path.resolve(__dirname, '..');
  for (const relative of ['fpl/bootstrap/route.ts', 'fpl/fixtures/route.ts']) {
    const text = fs.readFileSync(path.join(root, 'src/app/api', relative), 'utf8');
    assert.match(text, /"x-fpl-data-status"/);
    assert.match(text, /"x-fpl-fetched-at"/);
  }
});
