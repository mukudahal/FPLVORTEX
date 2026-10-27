const CACHE_NAME = 'fpl-vortex-v2';
const OFFLINE_SNAPSHOT = '/data/fpl-snapshot.json';
const OFFLINE_LEAGUE = '/data/fpl-league-fallback.json';
const CORE_ASSETS = [
  '/',
  '/favicon.svg',
  '/icon.svg',
  '/manifest.webmanifest',
  '/fonts/InterVariable.woff2',
  OFFLINE_SNAPSHOT,
  OFFLINE_LEAGUE,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackPath) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackPath) {
      const fallback = await cache.match(fallbackPath);
      if (fallback) {
        return new Response(fallback.body, {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Vortex-Offline': 'snapshot' },
        });
      }
    }
    return new Response(JSON.stringify({ error: 'Offline and no cached response is available.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone()).catch(() => undefined);
      return response;
    })
    .catch(() => cached);
  return cached ?? network;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    const fallback = url.pathname.includes('/snapshot') || url.pathname.includes('/health') ? OFFLINE_SNAPSHOT : undefined;
    event.respondWith(networkFirst(request, fallback));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
