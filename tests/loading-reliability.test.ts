import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { readSnapshotCache, writeSnapshotCache } from '../src/lib/snapshotCache.ts';
import { assertFreshSnapshot } from '../server/snapshotValidation.ts';
import type { Snapshot } from '../src/lib/types.ts';

const now = Date.parse('2026-10-29T22:00:00Z');
async function sample(): Promise<Snapshot> {
  const s = JSON.parse(await readFile('public/data/fpl-snapshot.json', 'utf8')) as Snapshot;
  s.meta = { ...s.meta, generatedAt: new Date(now - 60_000).toISOString(),
    source: 'live', stale: false, upstreamOk: true };
  return s;
}

test('instant browser snapshot preserves source dates and always discloses offline state', async () => {
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
  const s = await sample();
  writeSnapshotCache(storage, s);
  const cached = readSnapshotCache(storage, now)!;
  assert.equal(cached.meta.generatedAt, s.meta.generatedAt);
  assert.equal(cached.meta.source, 'offline');
  assert.equal(cached.meta.stale, true);
  assert.equal(cached.meta.upstreamOk, false);
  assert.deepEqual(cached.players, s.players);
  assert.deepEqual(cached.fixtures, s.fixtures);
  assert.equal(s.meta.source, 'live');
  for (const bad of ['{', '{}', JSON.stringify({ ...s, players: [] }),
    JSON.stringify({ ...s, meta: { ...s.meta, generatedAt: '2026-10-27T00:00:00Z' } }),
    JSON.stringify({ ...s, meta: { ...s.meta, generatedAt: '2026-10-30T00:00:00Z' } })]) {
    stored = bad;
    assert.equal(readSnapshotCache(storage, now), null);
  }
  const blocked = { getItem: () => { throw Error('disabled'); }, setItem: () => { throw Error('quota'); } };
  assert.equal(readSnapshotCache(blocked, now), null);
  assert.doesNotThrow(() => writeSnapshotCache(blocked, s));
});

test('refresh validation refuses to promote stale, future, incomplete or offline data', async () => {
  const s = await sample();
  assert.doesNotThrow(() => assertFreshSnapshot(s, now));
  for (const bad of [null, {}, { ...s, players: [] },
    { ...s, meta: { ...s.meta, stale: true } },
    { ...s, meta: { ...s.meta, upstreamOk: false } },
    { ...s, meta: { ...s.meta, source: 'offline' } },
    { ...s, meta: { ...s.meta, season: '2025/26' } },
    { ...s, meta: { ...s.meta, stale: undefined } },
    { ...s, meta: { ...s.meta, generatedAt: 'invalid' } },
    { ...s, meta: { ...s.meta, generatedAt: '2026-10-30T00:00:00Z' } },
    { ...s, meta: { ...s.meta, generatedAt: '2026-10-29T21:00:00Z' } }]) {
    assert.throws(() => assertFreshSnapshot(bad, now));
  }
});

async function worker(cacheValue: Response | null, fetcher: () => Promise<Response>) {
  const handlers: Record<string, (event: any) => void> = {};
  const source = await readFile('public/sw.js', 'utf8');
  vm.runInNewContext(source, {
    self: { location: { origin: 'https://test.local' }, addEventListener: (name: string, fn: any) => { handlers[name] = fn; } },
    caches: { open: async () => ({ match: async () => cacheValue?.clone(), put: async () => undefined }) },
    fetch: fetcher, URL, Response, Date, Promise,
  });
  return (path: string, navigate = false) => {
    let response!: Promise<Response>;
    const background: Promise<unknown>[] = [];
    handlers.fetch({ request: { method: 'GET', url: 'https://test.local' + path, mode: navigate ? 'navigate' : 'cors' },
      respondWith: (p: Promise<Response>) => { response = p; }, waitUntil: (p: Promise<unknown>) => background.push(p) });
    return { response, background };
  };
}

test('service worker cached navigation opens without waiting for a sleeping server', async () => {
  let resolve!: (r: Response) => void;
  const network = new Promise<Response>(r => { resolve = r; });
  const run = await worker(new Response('<html>cached app</html>'), () => network);
  const result = run('/', true);
  const response = await result.response;
  assert.equal(await response.text(), '<html>cached app</html>');
  assert.equal(result.background.length, 1);
  resolve(new Response('<html>updated app</html>'));
  await Promise.all(result.background);
});

test('service worker outage cannot replay a cached snapshot or health check as live', async () => {
  const s = await sample();
  const run = await worker(new Response(JSON.stringify(s)), async () => { throw Error('offline'); });
  const offline = await (await run('/api/vortex/snapshot').response).json();
  assert.equal(offline.meta.generatedAt, s.meta.generatedAt);
  assert.equal(offline.meta.source, 'offline');
  assert.equal(offline.meta.stale, true);
  assert.equal(offline.meta.upstreamOk, false);
  assert.equal((await run('/api/health').response).status, 503);
});

test('health readiness returns the labelled snapshot while external feeds are still pending', async () => {
  const originalFetch = globalThis.fetch;
  const originalOffline = process.env.VORTEX_OFFLINE;
  delete process.env.VORTEX_OFFLINE;
  let release!: () => void;
  let started = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = (async () => { started = true; await gate; throw Error('test upstream unavailable'); }) as typeof fetch;
  const fpl = await import('../server/fpl.ts');
  let released = false;
  const timeout = setTimeout(() => { released = true; release(); }, 1500);
  try {
    const health = await fpl.getHealth();
    assert.equal(started, true);
    assert.equal(released, false, 'health waited for the external feed');
    assert.equal(health.ok, true);
    assert.equal(health.stale, true);
    assert.equal(health.upstreamOk, false);
  } finally {
    clearTimeout(timeout);
    process.env.VORTEX_OFFLINE = '1';
    release();
    await fpl.getSnapshot(true);
    globalThis.fetch = originalFetch;
    if (originalOffline === undefined) delete process.env.VORTEX_OFFLINE;
    else process.env.VORTEX_OFFLINE = originalOffline;
  }
});
