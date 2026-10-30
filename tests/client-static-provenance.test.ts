import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fetchEntry, fetchLeague, fetchOfflineSnapshot, fetchVideos, ApiRequestError } from '../src/lib/api.ts';

/** Never substitute one manager/league's archive for another on a static-only host. */
test('client static fallback preserves snapshot age and fails closed for unmatched IDs', async () => {
  const saved = globalThis.fetch;
  const base = JSON.parse(await readFile('public/data/fpl-snapshot.json', 'utf8'));
  base.meta.generatedAt = '2026-10-15T06:00:00.000Z';
  const archive = {
    entries: { '999999': { root: { id: 999999, name: 'Template XI' }, picks: { picks: [] } } },
    leagues: { '314': { league: { id: 314, name: 'Overall' }, standings: { results: [] } } },
  };
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
  let fetchCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    fetchCount++;
    if (url.includes('/api/vortex/entry/') || url.includes('/api/vortex/league/')) {
      return json({ error: 'Upstream unavailable' }, 503);
    }
    if (url.includes('/data/vortex-snapshot.json')) return json(base);
    if (url.includes('/data/fpl-league-fallback.json')) return json(archive);
    if (url.includes('/api/vortex/videos')) return json({ error: 'offline' }, 503);
    if (url.includes('/data/vortex-videos.json')) return json({
      source: 'live',
      capturedAt: '2026-10-24T10:00:00Z',
      feedCheckedAt: '2026-10-29T19:00:00Z',
      channelId: 'test',
      channelTitle: 'FPL VORTEX',
      videos: [],
    });
    throw Error('Unexpected URL in static fallback test: ' + url);
  }) as typeof fetch;

  try {
    const fallback = await fetchOfflineSnapshot();
    assert.equal(fallback.meta.generatedAt, '2026-10-15T06:00:00.000Z');
    assert.equal(fallback.meta.source, 'offline');
    assert.equal(fallback.meta.stale, true);
    assert.equal(fallback.meta.upstreamOk, false);
    await assert.rejects(fetchEntry('0'), (error: unknown) =>
      error instanceof ApiRequestError && error.status === 400);
    await assert.rejects(fetchEntry('123456'), /No matching offline squad exists/);
    await assert.rejects(fetchLeague('123456'), /no matching offline standings exist/i);
    const videos = await fetchVideos();
    assert.equal(videos.source, 'static-export');
    assert.equal(videos.feedCheckedAt, null);
    assert.equal(videos.capturedAt, '2026-10-24T10:00:00Z');
    assert.ok(fetchCount > 3);
  } finally {
    globalThis.fetch = saved;
  }
});
