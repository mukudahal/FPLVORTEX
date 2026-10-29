import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('portrait and badge proxies serve genuine fetched bytes when disk cache writes fail', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'vortex-proxy-test-'));
  const blocked = path.join(folder, 'not-a-directory');
  await writeFile(blocked, 'occupied');
  const previous = { fetch: globalThis.fetch, cache: process.env.VORTEX_IMAGE_CACHE_DIR, listen: process.env.VORTEX_NO_LISTEN };
  process.env.VORTEX_IMAGE_CACHE_DIR = path.join(blocked, 'cache');
  process.env.VORTEX_NO_LISTEN = '1';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAEG0lEQVR4nAEQBO/7AZ15saPiuM95Uunn6iomb7dcEpKJOelJ+E4bc/sLa5TqwJ/Rmf6/tF7GDv+TRjlgEJ17ySfkQzinTnuki+fl6YEBmREDbFrXH5x74n7/7J9cEDE//CCNApcEuUzPRnPwvxlvKa5s87LiiYNFOqOICWaF2MQR7wM1LA1qQPfYrl7k4AHgy244SpKROoLA2yTkZF2x+1T/iMCiVA/UcB8j7EyYwbL4CQwHQ5VattXaipcyd7plM+rrE+sI8Kfuq+BLTFEQAGPqC/XuWXTDeQ8rVu1zKhoRMb4XfepCYZdnwhiOEuZbE2T12HF7DVgDyo2apqO3Q3/1n85jkR8L0LPPumbenHUAhT5GiXib9B9MHR75oYwb7BOh52DoPywU8YhSjUG7DUsy3VPUronuoHpPV54v96ziwdKY3PAclFy/Wc2TLNM5MQJrkxgrWsLa8k0InRL4AS29e+lw2qKPu7FczMO9C78qsf9iGkB4kQg6ft9BnYPoJfsPaEM959e7BXruXLRn39lDAS83vKKvC8wzY2LdiKgOPswffCE1S9cv/Fs7r9v2We524Q/ImXnWUm9LGh48j2I0v9Or6fesymJtHJOpiXDtnQcE0ocTiSmmNV3NaSBd4uAD4eeQEMuD8WNNSU7NB/xP+JrzGja5pAk879+I8bTsyS8NjuFp6e1x8SbYclIUDELCpAGlJMXXJw7r7W289wLUBapI7PFRLLLDv5j4EdY2q8Pgxq4MqoJfNfEWQ+7Y3uMSZ8wrPBEmNFHBswQ+nwhaL9CgAkl8lAkDCBnznsznimK+HSgc8ChtBvdsrS1pEV3/HWMUaUNemlc03z4Lpu0xAn+iFDI3zQ09h/s6FHPATtvjhS0Be9K1j+2YRfpUnkm6SkT5fHMha9ZOaQbYruIqeHuxi7Cns93RALBs9iGbetwsVivHDOIOAJQWCyQkmwdfN73n/ADY1kUXivB6wZXRDwyWPXHcNfcRHN+bICfETaCggZT0KIy2xcpUBDSu6KwSbDRDrpgQWkMQRRyAYiLNsWHJJIyYAZnPAf9pT9F4p+uiEEOj6LnN6zy4op8IlZLYvE9CGOcVYUWtEReiN6wSLFoKkgrSZcxPMZHm7P00N2X1p9ykwzcAyKdOROPiwsSTEhakb70VV+mujhwI0yJLmsZMb8oGfSijPCd0Wa/UAMxHLfRyBtu47eU34Av+PLjidm1Di6jN+AFfaSaAD4vpQ8YtrWroTDtUU42qaO3DnDK6kZ3DWF45wjo0U6zPxBGLMI0bzC0AZN7zR+8awl4Gl/SjNfXvWJg4AgJ/DUOnU0xmLp1YXSMiIXMgFrPeaebn0Qj066lvtw9LKZq/tD3K3cKUs2mvsRIf/Lv1F2lyhrjqtO+5xkl9NP2ygAHgOo99XAAAAABJRU5ErkJggg==', 'base64');
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith('https://resources.premierleague.com/')) {
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    }
    return previous.fetch(input, init);
  }) as typeof fetch;
  const { app } = await import('../server/index.ts');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Server not listening');
  try {
    for (const route of ['/api/img/player/987654321', '/api/img/badge/987654321']) {
      const response: Response = await previous.fetch(`http://127.0.0.1:${address.port}${route}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    globalThis.fetch = previous.fetch;
    if (previous.cache === undefined) delete process.env.VORTEX_IMAGE_CACHE_DIR;
    else process.env.VORTEX_IMAGE_CACHE_DIR = previous.cache;
    if (previous.listen === undefined) delete process.env.VORTEX_NO_LISTEN;
    else process.env.VORTEX_NO_LISTEN = previous.listen;
    await rm(folder, { recursive: true, force: true });
  }
});
