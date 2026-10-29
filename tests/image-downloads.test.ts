import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createImageDownloadRouter } from '../server/imageDownloads.ts';

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64');

test('ordinary HTTPS-style download returns the original PNG and expires', async () => {
  const app = express(); app.use('/api/vortex/image-downloads', createImageDownloadRouter(500));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Server did not start');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const upload = await fetch(`${base}/api/vortex/image-downloads?filename=../my%20team.png`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: image });
    assert.equal(upload.status, 201); const { path } = await upload.json() as { path: string };
    assert.match(path, /^\/api\/vortex\/image-downloads\/[a-f0-9]{48}$/);
    const response = await fetch(base + path);
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('content-length'), String(image.length));
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="..-my-team.png"');
    assert.match(response.headers.get('cache-control')!, /no-store/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(`${base}/api/vortex/image-downloads`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: 'invalid' })).status, 400);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
