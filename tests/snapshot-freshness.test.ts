import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOlderSnapshot } from '../src/lib/snapshotFreshness.ts';
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
