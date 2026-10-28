import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';
import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEntry, getHealth, getLeague, getSnapshot, getSnapshotFast } from './fpl.ts';
import { isNumericId, UpstreamHttpError } from './http.ts';
import { getRepoBenchmarks, getRepoVideos } from './repoData.ts';
import {
  PL_BADGE_BASE,
  PL_PHOTO_BASE_CURRENT,
  PL_PHOTO_BASE_LEGACY,
  PL_PHOTO_BASE_S3,
  normalizeNumericCode,
} from '../src/lib/playerImages.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const isProduction = process.env.NODE_ENV === 'production';
const port = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
const imageCacheDir = path.join(root, '.cache', 'player-images');

export const app = express();

app.disable('x-powered-by');
app.set('etag', 'weak');
app.use(compression());
app.use(express.json({ limit: '512kb' }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.VORTEX_FRAME_OPTIONS) {
    res.setHeader('X-Frame-Options', process.env.VORTEX_FRAME_OPTIONS);
  }
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
function asyncRoute(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

const requestCounts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const current = requestCounts.get(key);
    if (!current || current.resetAt <= now) {
      requestCounts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > limit) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    next();
  };
}

async function fileExistsNonEmpty(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 200;
  } catch {
    return false;
  }
}

async function fetchImageBytes(urls: string[]): Promise<Buffer | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2200),
        headers: {
          'User-Agent': 'Mozilla/5.0 FPL-VORTEX/4.0',
          Accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
        },
      });
      if (!response.ok) continue;
      const contentType = String(response.headers.get('content-type') ?? '').toLowerCase();
      if (contentType && !contentType.startsWith('image/')) continue;
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.byteLength > 300) return buf;
    } catch {
      // Continue through fallback candidate URLs.
    }
  }
  return null;
}

function buildServerJerseySvg(label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 100" role="img" aria-label="${label}">
    <rect width="88" height="100" rx="18" fill="#10142a"/>
    <path d="M24 22 L34 16 Q44 23 54 16 L64 22 L75 36 L66 44 L61 38 L61 84 L27 84 L27 38 L22 44 L13 36 Z" fill="#1f2756" stroke="#5bf5d6" stroke-width="2.2"/>
    <text x="44" y="60" text-anchor="middle" fill="#f3f6ff" font-family="Inter,system-ui,sans-serif" font-weight="800" font-size="18">${label}</text>
  </svg>`;
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await getHealth());
}));

app.get('/api/status', asyncRoute(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await getHealth());
}));

app.get('/api/vortex/snapshot', asyncRoute(async (req, res) => {
  const force = req.query.refresh === '1';
  // Fast path: answer from the committed snapshot and revalidate behind the request, so a cold
  // instance paints immediately instead of waiting on the upstream FPL + odds fetches.
  const snapshot = await getSnapshotFast(force);
  res.set('Cache-Control', snapshot.meta.isLive ? 'public, max-age=15' : 'public, max-age=60');
  res.json(snapshot);
}));

app.post('/api/vortex/refresh', rateLimit(12, 60_000), asyncRoute(async (_req, res) => {
  const snapshot = await getSnapshot(true);
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, meta: snapshot.meta });
}));

app.get(
  '/api/vortex/saved-teams',
  asyncRoute(async (_req, res) => {
    // Saved FPL Team IDs are kept strictly private per-browser (localStorage/cookie) — never shared across visitors.
    res.set('Cache-Control', 'no-store');
    res.json({ teams: [] });
  }),
);

app.post(
  '/api/vortex/saved-teams',
  rateLimit(60, 60_000),
  asyncRoute(async (req, res) => {
    const id = String(req.body?.id ?? '').trim();
    if (!isNumericId(id)) {
      res.status(400).json({ error: 'Enter a valid numeric FPL team ID.' });
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.json({ teams: [] });
  }),
);

app.delete(
  '/api/vortex/saved-teams/:id',
  rateLimit(60, 60_000),
  asyncRoute(async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ teams: [] });
  }),
);

app.get(
  '/api/vortex/entry/:id',
  rateLimit(45, 60_000),
  asyncRoute(async (req, res) => {
    const id = String(req.params.id ?? '');
    if (!isNumericId(id)) {
      res.status(400).json({ error: 'Enter a valid numeric FPL team ID.' });
      return;
    }
    const force = req.query.refresh === '1' || req.query.force === '1';
    const gwParam = req.query.gw ? Number(req.query.gw) : undefined;
    const entry = await getEntry(id, { force, gameweek: gwParam });
    res.set('Cache-Control', force ? 'no-store' : 'public, max-age=30');
    res.json(entry);
  }),
);

app.get(
  '/api/vortex/league/:id',
  rateLimit(45, 60_000),
  asyncRoute(async (req, res) => {
    const id = String(req.params.id ?? '');
    if (!isNumericId(id)) {
      res.status(400).json({ error: 'Enter a valid numeric classic league ID.' });
      return;
    }
    const league = await getLeague(id);
    res.set('Cache-Control', 'public, max-age=30');
    res.json(league);
  }),
);

app.get('/api/vortex/videos', asyncRoute(async (_req, res) => {
  const videos = await getRepoVideos();
  res.set('Cache-Control', 'public, max-age=300');
  res.json(videos);
}));

app.get('/api/videos', asyncRoute(async (_req, res) => {
  const payload = await getRepoVideos();
  res.set('Cache-Control', 'public, max-age=300');
  res.json(payload.videos);
}));

app.get('/api/vortex/odds', asyncRoute(async (req, res) => {
  const force = req.query.refresh === '1';
  const snapshot = await getSnapshot(force);
  const gwParam = Number.parseInt(String(req.query.gw ?? ''), 10);
  const targetGw = Number.isInteger(gwParam) && gwParam >= 1 && gwParam <= 38 ? gwParam : snapshot.meta.nextEventId;
  const teamMap = new Map(snapshot.teams.map((t) => [t.id, t]));
  const fixtures = snapshot.fixtures
    .filter((fx) => fx.event === targetGw)
    .map((fx) => ({
      fixtureId: fx.id,
      event: fx.event,
      kickoffTime: fx.kickoffTime,
      homeTeam: teamMap.get(fx.teamH)?.name ?? String(fx.teamH),
      awayTeam: teamMap.get(fx.teamA)?.name ?? String(fx.teamA),
      marketOdds: fx.marketOdds ?? null,
    }));
  res.set('Cache-Control', force ? 'no-store' : 'public, max-age=120');
  res.json({
    gameweek: targetGw,
    oddsMeta: snapshot.meta.oddsMeta ?? null,
    matchedCount: fixtures.filter((f) => f.marketOdds !== null).length,
    totalFixtures: fixtures.length,
    fixtures,
  });
}));

app.get('/api/vortex/benchmarks', asyncRoute(async (req, res) => {
  const snapshot = await getSnapshot();
  const gwParam = Number.parseInt(String(req.query.gw ?? ''), 10);
  const targetEventId = Number.isInteger(gwParam) && gwParam >= 1 && gwParam <= 38 ? gwParam : snapshot.meta.nextEventId;
  const benchmarks = await getRepoBenchmarks(targetEventId);
  res.set('Cache-Control', 'public, max-age=300');
  res.json(benchmarks);
}));

app.get('/api/projections', asyncRoute(async (req, res) => {
  const snapshot = await getSnapshot();
  const gwParam = Number.parseInt(String(req.query.gw ?? ''), 10);
  const targetEventId = Number.isInteger(gwParam) && gwParam >= 1 && gwParam <= 38 ? gwParam : snapshot.meta.nextEventId;
  const benchmarks = await getRepoBenchmarks(targetEventId);
  res.set('Cache-Control', 'public, max-age=300');
  res.json(benchmarks);
}));

app.get('/api/player-images/manifest', asyncRoute(async (_req, res) => {
  const manifestPath = path.join(root, 'public', 'player-images', 'player-image-manifest.json');
  const raw = await readFile(manifestPath, 'utf8');
  res.set('Cache-Control', 'public, max-age=600');
  res.type('application/json').send(raw);
}));

app.get('/api/img/player/:code', asyncRoute(async (req, res) => {
  const code = normalizeNumericCode(req.params.code);
  const teamCode = normalizeNumericCode(req.query.teamCode);
  if (!code) {
    res.status(400).json({ error: 'Invalid player photo code.' });
    return;
  }

  const localPublicPath = path.join(root, 'public', 'player-images', 'players', `${code}.png`);
  if (await fileExistsNonEmpty(localPublicPath)) {
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(localPublicPath);
    return;
  }

  const cachedPath = path.join(imageCacheDir, `player-${code}.png`);
  if (await fileExistsNonEmpty(cachedPath)) {
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(cachedPath);
    return;
  }

  const candidates = [
    `${PL_PHOTO_BASE_CURRENT}/250x250/${code}.png`,
    `${PL_PHOTO_BASE_CURRENT}/110x140/${code}.png`,
    `${PL_PHOTO_BASE_LEGACY}/250x250/p${code}.png`,
    `${PL_PHOTO_BASE_LEGACY}/110x140/p${code}.png`,
    `${PL_PHOTO_BASE_S3}/500x500/${code}.png`,
    ...(teamCode
      ? [
          `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-220.png`,
          `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-110.png`,
        ]
      : []),
  ];

  const upstreamBytes = await fetchImageBytes(candidates);
  if (upstreamBytes) {
    await mkdir(imageCacheDir, { recursive: true });
    await writeFile(cachedPath, upstreamBytes);
    res.set('Cache-Control', 'public, max-age=86400');
    res.type('image/png').send(upstreamBytes);
    return;
  }

  res.set('Cache-Control', 'public, max-age=300');
  res.type('image/svg+xml').send(buildServerJerseySvg('FV'));
}));

app.get('/api/img/badge/:teamCode', asyncRoute(async (req, res) => {
  const teamCode = normalizeNumericCode(req.params.teamCode);
  if (!teamCode) {
    res.status(400).json({ error: 'Invalid club badge code.' });
    return;
  }

  const localPublicPath = path.join(root, 'public', 'player-images', 'badges', `t${teamCode}.png`);
  if (await fileExistsNonEmpty(localPublicPath)) {
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(localPublicPath);
    return;
  }

  const cachedPath = path.join(imageCacheDir, `badge-t${teamCode}.png`);
  if (await fileExistsNonEmpty(cachedPath)) {
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(cachedPath);
    return;
  }

  const upstreamBytes = await fetchImageBytes([
    `${PL_BADGE_BASE}/100/t${teamCode}.png`,
    `${PL_BADGE_BASE}/70/t${teamCode}.png`,
    `${PL_BADGE_BASE}/t${teamCode}.png`,
  ]);
  if (upstreamBytes) {
    await mkdir(imageCacheDir, { recursive: true });
    await writeFile(cachedPath, upstreamBytes);
    res.set('Cache-Control', 'public, max-age=86400');
    res.type('image/png').send(upstreamBytes);
    return;
  }

  res.set('Cache-Control', 'public, max-age=300');
  res.type('image/svg+xml').send(buildServerJerseySvg(`T${teamCode}`));
}));

app.post(
  '/api/vortex/solve',
  rateLimit(20, 60_000),
  asyncRoute(async (req, res) => {
    const payload = JSON.stringify(req.body ?? {});
    const scriptPath = path.join(root, 'server', 'solver.py');
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile('python3', [scriptPath], { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        resolve(stdout);
      });
      child.stdin?.write(payload);
      child.stdin?.end();
    });
    res.set('Cache-Control', 'no-store');
    res.type('application/json').send(output);
  }),
);

app.get('/api/fpl/bootstrap', asyncRoute(async (_req, res) => {
  const snapshot = await getSnapshot();
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    meta: snapshot.meta,
    teams: snapshot.teams,
    events: snapshot.gameweeks,
    elements: snapshot.players,
  });
}));

app.get('/api/fpl/fixtures', asyncRoute(async (_req, res) => {
  const snapshot = await getSnapshot();
  res.set('Cache-Control', 'public, max-age=60');
  res.json(snapshot.fixtures);
}));

app.get(
  '/api/fpl/entry/:id',
  rateLimit(45, 60_000),
  asyncRoute(async (req, res) => {
    const id = String(req.params.id ?? '');
    if (!isNumericId(id)) {
      res.status(400).json({ error: 'Enter a valid numeric FPL team ID.' });
      return;
    }
    res.set('Cache-Control', 'public, max-age=30');
    res.json(await getEntry(id));
  }),
);

app.get(
  '/api/fpl/league/:id',
  rateLimit(45, 60_000),
  asyncRoute(async (req, res) => {
    const id = String(req.params.id ?? '');
    if (!isNumericId(id)) {
      res.status(400).json({ error: 'Enter a valid numeric classic league ID.' });
      return;
    }
    res.set('Cache-Control', 'public, max-age=30');
    res.json(await getLeague(id));
  }),
);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

app.use('/brand-kit', express.static(path.join(root, 'brand-kit'), { maxAge: '1h' }));

async function configureFrontend(): Promise<void> {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    app.use(async (req: Request, res: Response, next: NextFunction) => {
      const accept = req.headers.accept ?? '*/*';
      const wantsHtml = accept.includes('text/html') || accept.includes('*/*');
      if ((req.method !== 'GET' && req.method !== 'HEAD') || !wantsHtml) {
        next();
        return;
      }
      try {
        const template = await import('node:fs/promises').then((fs) => fs.readFile(path.join(root, 'index.html'), 'utf8'));
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(req.method === 'HEAD' ? undefined : html);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    });
  } else {
    const dist = path.join(root, 'dist');
    const publicDir = path.join(root, 'public');
    app.use(
      express.static(dist, {
        index: 'index.html',
        maxAge: '1h',
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
          // Vite emits content-hashed asset names, so they can be cached forever.
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
          if (filePath.endsWith('.json')) res.setHeader('Cache-Control', 'public, max-age=300');
        },
      }),
    );
    app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = error instanceof UpstreamHttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    if (status >= 500) console.error('[server]', message);
    if (res.headersSent) return;
    res.status(status).json({
      error: status === 404 ? message : 'The data engine could not complete this request.',
      detail: message,
    });
  });
}

if (process.env.VORTEX_NO_LISTEN !== '1') {
  await configureFrontend();
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`FPL VORTEX running at http://0.0.0.0:${port} (${isProduction ? 'production' : 'development'})`);
  });

  function shutdown() {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} else {
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = error instanceof UpstreamHttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    if (res.headersSent) return;
    res.status(status).json({
      error: status === 404 ? message : 'The data engine could not complete this request.',
      detail: message,
    });
  });
}
