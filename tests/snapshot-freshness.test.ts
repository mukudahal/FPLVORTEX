import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSnapshotFreshness, isOlderSnapshot, mirroredSnapshotState, snapshotFreshnessNotice } from '../src/lib/snapshotFreshness.ts';
import { snapshotSourceLabel } from '../src/lib/projectionFreshness.ts';
import type { SnapshotMeta } from '../src/lib/types.ts';
import type { Snapshot } from '../src/lib/types.ts';

const snapshot = (generatedAt: string) => ({ meta: { generatedAt } }) as Snapshot;

test('out-of-order responses cannot replace a snapshot with an older timestamp', () => {
  assert.equal(isOlderSnapshot(snapshot('2026-10-29T12:00:00Z'), snapshot('2026-10-29T11:59:00Z')), true);
  assert.equal(isOlderSnapshot(snapshot('2026-10-29T12:00:00Z'), snapshot('2026-10-29T12:00:00Z')), false);
  assert.equal(isOlderSnapshot(snapshot('2026-10-29T12:00:00Z'), snapshot('2026-10-29T12:01:00Z')), false);
  assert.equal(isOlderSnapshot(null, snapshot('2026-10-29T12:00:00Z')), false);
  assert.equal(isOlderSnapshot(snapshot('invalid'), snapshot('2026-10-29T12:00:00Z')), false);
});

test('static fallback is marked stale even if its saved metadata says live', async () => {
  const { fetchSnapshot } = await import('../src/lib/api.ts');
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    if (String(url).includes('/api/')) return new Response('', { status: 503 });
    return new Response(JSON.stringify({ meta: { source: 'live', stale: false, upstreamOk: true, generatedAt: '2026-10-15T00:00:00Z' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await fetchSnapshot();
    assert.equal(result.meta.source, 'offline');
    assert.equal(result.meta.stale, true);
    assert.equal(result.meta.upstreamOk, false);
    assert.equal(calls.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

const NOW = new Date('2026-10-29T19:00:00Z');
const baseMeta = {
  source: 'live', upstreamOk: true, stale: false, refreshSeconds: 600,
  generatedAt: '2026-10-29T18:55:00Z', servedAt: '2026-10-29T19:00:00Z',
} as SnapshotMeta;

test('snapshot age is calculated from generation, not from recently served time', () => {
  assert.deepEqual(getSnapshotFreshness(baseMeta, NOW), { status: 'recent', ageMinutes: 5 });
  const outdated = { ...baseMeta, generatedAt: '2026-10-29T18:00:00Z' };
  assert.deepEqual(getSnapshotFreshness(outdated, NOW), { status: 'stale', ageMinutes: 60 });
  assert.match(snapshotFreshnessNotice(outdated, NOW), /stale \(60 min old\)/);
  assert.match(snapshotFreshnessNotice(outdated, NOW), /served: 2026-10-29T19:00:00Z/);
});

test('unknown future or invalid generation times cannot be declared current', () => {
  assert.equal(getSnapshotFreshness({ ...baseMeta, generatedAt: 'invalid' }, NOW).status, 'unknown');
  assert.equal(getSnapshotFreshness({ ...baseMeta, generatedAt: '2026-10-30T00:00:00Z' }, NOW).status, 'unknown');
  assert.equal(getSnapshotFreshness({ ...baseMeta, stale: true }, NOW).status, 'stale');
  assert.match(snapshotFreshnessNotice({ ...baseMeta, generatedAt: 'invalid' }, NOW), /age unknown/);
});

test('recent imported mirror stays a cache but never claims verified live upstream', () => {
  const mirrored = { ...baseMeta, mirroredFrom: 'https://fplvortex.onrender.com', mirroredAt: '2026-10-29T18:57:00Z' };
  assert.deepEqual(mirroredSnapshotState(mirrored, 180 * 60_000, NOW), {
    source: 'cache', upstreamOk: false, stale: false,
  });
  assert.equal(mirroredSnapshotState({ ...mirrored, mirroredAt: 'invalid' }, 180 * 60_000, NOW).stale, true);
  assert.equal(mirroredSnapshotState({ ...mirrored, generatedAt: '2026-10-29T20:00:00Z' }, 180 * 60_000, NOW).stale, true);
  assert.equal(mirroredSnapshotState({ ...mirrored, mirroredAt: '2026-10-29T18:45:00Z' }, 180 * 60_000, NOW).stale, true);
  assert.equal(mirroredSnapshotState({ ...mirrored, mirroredAt: '2026-10-29T20:00:00Z' }, 180 * 60_000, NOW).stale, true);
  assert.equal(mirroredSnapshotState({ ...mirrored, generatedAt: '2026-10-29T12:00:00Z' }, 180 * 60_000, NOW).stale, true);
});

test('mirror/source labels never misrepresent a non-live snapshot as live', () => {
  const fresh = { ...baseMeta, generatedAt: new Date().toISOString() };
  assert.equal(snapshotSourceLabel(fresh), 'FPL LIVE');
  assert.equal(snapshotSourceLabel({ ...fresh, source: 'cache' }), 'FPL CACHE');
  assert.equal(snapshotSourceLabel({ ...fresh, source: 'cache', mirroredFrom: 'https://fplvortex.onrender.com', upstreamOk: false }), 'FPL MIRROR');
  assert.equal(snapshotSourceLabel({ ...fresh, source: 'cache', stale: true }), 'STALE CACHE');
  assert.equal(snapshotSourceLabel({ ...fresh, source: 'live', generatedAt: 'invalid' }), 'OFFLINE');
});
