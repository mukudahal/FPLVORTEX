import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEntry, getHealth, getLeague, getSnapshot } from './fpl.ts';
import { isNumericId, UpstreamHttpError } from './http.ts';
import { getRepoBenchmarks, getRepoVideos } from './repoData.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const isProduction = process.env.NODE_ENV === 'production';
const port = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
export const app = express();

app.disable('x-powered-by');
app.set('etag', 'weak');
app.use(compression());
app.use(express.json({ limit: '64kb' }));

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
  const snapshot = await getSnapshot(force);
  res.set('Cache-Control', snapshot.meta.isLive ? 'public, max-age=15' : 'public, max-age=60');
  res.json(snapshot);
}));

app.post('/api/vortex/refresh', rateLimit(12, 60_000), asyncRoute(async (_req, res) => {
  const snapshot = await getSnapshot(true);
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, meta: snapshot.meta });
}));

app.get(
  '/api/vortex/entry/:id',
  rateLimit(45, 60_000),
  asyncRoute(async (req, res) => {
    const id = String(req.params.id ?? '');
    if (!isNumericId(id)) {
      res.status(400).json({ error: 'Enter a valid numeric FPL team ID.' });
      return;
    }
    const entry = await getEntry(id);
    res.set('Cache-Control', 'public, max-age=30');
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

app.get('/api/vortex/benchmarks', asyncRoute(async (req, res) => {
  const snapshot = await getSnapshot();
  const gwParam = Number.parseInt(String(req.query.gw ?? ''), 10);
  const targetEventId = Number.isInteger(gwParam) && gwParam >= 1 && gwParam <= 38 ? gwParam : snapshot.meta.nextEventId;
  const benchmarks = await getRepoBenchmarks(targetEventId);
  res.set('Cache-Control', 'public, max-age=300');
  res.json(benchmarks);
}));

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
      if (req.method !== 'GET' || !wantsHtml) {
        next();
        return;
      }
      try {
        const template = await import('node:fs/promises').then((fs) => fs.readFile(path.join(root, 'index.html'), 'utf8'));
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
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
        index: false,
        maxAge: '1h',
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
          if (filePath.endsWith('.json')) res.setHeader('Cache-Control', 'public, max-age=300');
        },
      }),
    );
    app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') {
        next();
        return;
      }
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
