import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';
import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEntry, getHealth, getLeague, getSnapshot, getSnapshotFast } from './fpl.ts';
import { createImageDownloadRouter } from './imageDownloads.ts';
import { isNumericId, UpstreamHttpError } from './http.ts';
import { getRepoBenchmarks, getRepoVideos } from './repoData.ts';
import { marketCoverage } from '../src/lib/marketCoverage.ts';
import { buildPublicDataHealth } from '../src/lib/publicDataHealth.ts';
import { verifiedJointManagerState } from '../src/lib/verifiedJointManagerState.ts';
import { readAuthenticatedCurrentTeam } from './authenticatedCurrentTeam.ts';
import { getTrustedFplReadForRequest } from './trustedFplAuth.ts';
import type { JointRequest } from '../src/lib/jointChipPathValidation.ts';
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
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
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

app.post('/api/vortex/image-downloads', rateLimit(30, 60_000));
app.use('/api/vortex/image-downloads', createImageDownloadRouter());

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

/** Public source-health summary; no secrets, private manager data or raw odds. */
app.get('/api/vortex/data-status', asyncRoute(async (_req, res) => {
  const snapshot = await getSnapshotFast();
  res.set('Cache-Control', 'no-store');
  res.json(buildPublicDataHealth(snapshot, Date.now(), {
    marketRedisplayRightsVerified: process.env.VORTEX_ODDS_REDISPLAY_LICENSE_VERIFIED === '1',
  }));
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
    nextThreeGameweeks: marketCoverage(snapshot.fixtures, targetGw),
    feedDiagnostics: snapshot.meta.oddsMeta?.feedDiagnostics ?? [],
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

/**
 * Optional exact-formulation NO-CHIP MILP comparison (not the chip-aware
 * heuristics and not a manager action). A single bounded subprocess prevents
 * abuse of the public service's CPU/memory; requests cannot mutate plans.
 */
let exactMilpBusy = false;
app.post('/api/vortex/solver/exact', rateLimit(3, 60_000), asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (process.env.VORTEX_EXACT_SOLVER_ENABLED === '0') {
    res.status(503).json({ error: 'Exact no-chip comparison is disabled on this deployment.' });
    return;
  }
  const payload = req.body;
  if (!payload || !Array.isArray(payload.players) || payload.players.length < 15 || payload.players.length > 60 ||
      !payload.settings || payload.settings.time_limit_seconds > 10 ||
      !Number.isInteger(payload.settings.solutions_requested) || payload.settings.solutions_requested < 1 || payload.settings.solutions_requested > 3 || payload.settings.max_transfers_per_gw > 2 ||
      payload.settings.end_gw - payload.settings.start_gw >= 10) {
    res.status(422).json({ error: 'Invalid or unsupported bounded MILP comparison.' });
    return;
  }
  const input = JSON.stringify(payload);
  if (Buffer.byteLength(input) > 120_000) {
    res.status(413).json({ error: 'MILP input exceeds the permitted limit.' });
    return;
  }
  if (exactMilpBusy) {
    res.status(429).json({ error: 'Exact Solver is occupied. Retry after this calculation finishes.' });
    return;
  }
  exactMilpBusy = true;
  try {
    const python = process.env.VORTEX_EXACT_PYTHON || 'python3';
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(python, ['-m', 'fpl_solver.cli'], {
        cwd: root, timeout: 12_000, maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
      }, (err, stdout) => err ? reject(err) : resolve(stdout));
      child.stdin?.on('error', () => { /* Child error is handled by execFile callback. */ });
      child.stdin?.end(input);
    });
    const response = JSON.parse(output) as { plans?: unknown[] };
    if (!Array.isArray(response.plans)) throw new Error('Malformed MILP result');
    res.json(response);
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    const status = e.code === 'ETIMEDOUT' ? 504 : e.code === 'ENOENT' ? 503 : (e as Error).message?.includes('code 2') ? 422 : 503;
    res.status(status).json({ error: status === 504
      ? 'The exact MILP exceeded its time limit. No optimality is claimed.'
      : status === 422 ? 'Invalid no-chip MILP inputs. Review prices and forecasts.'
      : 'Exact Solver is unavailable. The existing Planner remains unchanged.' });
  } finally {
    exactMilpBusy = false;
  }
}));

/**
 * Current authenticated FPL squad, read-only and never publicly cached.
 * A trusted request-scoped provider must first verify the VORTEX caller
 * and authorize reading that same manager's FPL account. No passwords,
 * cookies, or self-asserted private JSON accepted in this HTTP endpoint.
 */
app.get('/api/vortex/solver/current-team', rateLimit(5, 60_000), asyncRoute(async (req,res) => {
  res.set('Cache-Control', 'no-store, private');
  if (process.env.VORTEX_JOINT_SOLVER_ENABLED !== '1') {
    res.status(503).json({error:'Joint-chip research authentication is not enabled on this deployment.'});
    return;
  }
  const entryId=Number(req.query.entryId);
  if (!Number.isSafeInteger(entryId) || entryId<=0 || String(entryId)!==String(req.query.entryId)) {
    res.status(422).json({error:'Expected one valid numeric FPL manager ID.'});
    return;
  }
  const trustedRead=await getTrustedFplReadForRequest(req);
  if (!trustedRead) {
    res.status(409).json({
      code:'CURRENT_TEAM_AUTH_REQUIRED',
      error:'A consented, request-bound FPL current-team connection is not available. No credential, team or chip data was collected.',
    });
    return;
  }
  const snapshot=await getSnapshot(true);
  if (snapshot.meta.stale || !snapshot.meta.upstreamOk || !snapshot.meta.isLive ||
      !Number.isInteger(snapshot.meta.nextEventId)) {
    res.status(503).json({error:'Fresh official current-Gameweek player market unavailable.'});
    return;
  }
  try {
    const historical=await getEntry(String(entryId),{force:true});
    const verified=await readAuthenticatedCurrentTeam(
      entryId,snapshot.meta.nextEventId,historical,snapshot,trustedRead,
    );
    res.json(verified);
  } catch {
    res.status(409).json({
      code:'CURRENT_TEAM_VERIFICATION_FAILED',
      error:'The authenticated FPL account, live team, price basis or chip availability failed verification.',
    });
  }
}));

/**
 * Research-only joint WC/FH/BB/TC exact model. DEFAULT-OFF on Render.
 *
 * When deliberately enabled in staging, the server itself MUST verify the
 * requested FPL entry, original selling prices and unused chip inventory.
 * A client's claim that it owns a chip or has spare bank money is ignored.
 * No official FPL account mutation and no saved Transfer Lab plan write.
 */
let jointMilpPreflightBusy = false;
app.post('/api/vortex/solver/joint', rateLimit(1, 60_000), asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (process.env.VORTEX_JOINT_SOLVER_ENABLED !== '1') {
    res.status(503).json({ error: 'Joint-chip research Solver is not enabled on this deployment.' });
    return;
  }
  const input = req.body as { entryId?: number; solver?: JointRequest };
  const request = input?.solver;
  const settings = request?.settings;
  if (!Number.isSafeInteger(input?.entryId) || (input.entryId ?? 0) <= 0 ||
      !request || !settings || !Array.isArray(request.players) ||
      request.players.length < 15 || request.players.length > 40 ||
      !Array.isArray(request.current_team?.squad_player_ids) ||
      request.current_team.squad_player_ids.length !== 15 ||
      settings.time_limit_seconds > 10 || settings.time_limit_seconds < 1 ||
      settings.solutions_requested !== 1 ||
      settings.max_transfers_per_gw > 2 ||
      settings.start_gw < 1 || settings.end_gw > 38 ||
      settings.end_gw < settings.start_gw ||
      settings.end_gw - settings.start_gw >= 10 ||
      Object.keys(settings.forced_chip_uses ?? {}).length !== 0) {
    res.status(422).json({ error: 'Invalid bounded joint-chip Solver research request.' });
    return;
  }
  const serialized = JSON.stringify(request);
  if (Buffer.byteLength(serialized) > 120_000) {
    res.status(413).json({ error: 'Joint solver request exceeds the 120 KB limit.' });
    return;
  }
  if (exactMilpBusy || jointMilpPreflightBusy) {
    res.status(429).json({ error: 'Solver is occupied; retry after the current run.' });
    return;
  }
  // Claim the preflight lock BEFORE any await. Concurrent requests must not
  // all fetch official FPL manager data or race into overlapping HiGHS jobs.
  jointMilpPreflightBusy = true;
  try {
  // Only a server-installed first-party, REQUEST-BOUND session resolver
  // can authorize the two read-only FPL endpoints. Never accept user
  // session cookies, credentials or self-asserted private records in JSON.
  const trustedRead = await getTrustedFplReadForRequest(req);
  if (!trustedRead) {
    res.status(409).json({
      code: 'CURRENT_TEAM_AUTH_REQUIRED',
      error: 'Authenticated current FPL squad access is not connected. The public last-deadline team cannot verify pending transfers or chip state.',
    });
    return;
  }
  // Independently verify the official public history and live market,
  // then /me/ owner ID and GET /my-team/ prices/roster/chips/transfer cash.
  // The private data is never returned to another caller.
  const snapshot = await getSnapshot(true);
  if (snapshot.meta.stale || !snapshot.meta.upstreamOk ||
      snapshot.meta.nextEventId !== settings.start_gw || !snapshot.meta.isLive) {
    res.status(503).json({ error: 'Live FPL fixtures are not verified; refresh before joint optimization.' });
    return;
  }
  let officialEntry;
  try {
    const publicEntry = await getEntry(String(input.entryId), { force: true });
    officialEntry = await readAuthenticatedCurrentTeam(
      input.entryId!,settings.start_gw,publicEntry,snapshot,trustedRead,
    );
  } catch {
    res.status(409).json({
      code: 'CURRENT_TEAM_VERIFICATION_FAILED',
      error: 'Authenticated current FPL manager identity, squad, bank, chip or selling values could not be verified.',
    });
    return;
  }
  const official = verifiedJointManagerState(
    officialEntry, request.current_team.squad_player_ids, settings.start_gw,
  );
  const originals = request.current_team.squad_player_ids;
  const officialSaleMatches = originals.every((id: number) => {
    const p = request.players.find(player => player.player_id === id);
    return p && official.sellingPricesTenths[id] === Math.round(p.selling_price! * 10);
  });
  if (official.entryId !== input.entryId ||
      request.current_team.free_transfers !== official.freeTransfersNow ||
      Math.round(request.current_team.bank * 10) !== official.bankTenths ||
      !officialSaleMatches) {
    res.status(422).json({ error: 'FPL entry bank, selling values or free transfers do not match verified live account.' });
    return;
  }
  const sameChipInventory = (provided: Record<string, unknown>, verified: Record<string, unknown>) => {
    const order = (record: Record<string, unknown>) => JSON.stringify(
      Object.fromEntries(Object.keys(record).sort().map(key =>
        [key, Array.isArray(record[key]) ? [...record[key] as number[]].sort() : record[key]])),
    );
    return order(provided) === order(verified);
  };
  if (!sameChipInventory(settings.scoring_chip_halves ?? {},
        official.chips.scoring_chip_halves) ||
      !sameChipInventory(settings.squad_chip_halves ?? {},
        official.chips.squad_chip_halves) ||
      settings.first_half_fh_used_gw19 !== official.chips.first_half_fh_used_gw19) {
    res.status(422).json({ error: 'Requested chip inventory conflicts with verified official FPL history.' });
    return;
  }
  // Official identity, club, position and current market price also matter.
  const market = new Map(snapshot.players.map(player => [player.id, player]));
  if (request.players.some(player => {
    const current = market.get(player.player_id);
    return !current || current.teamId !== player.team_id ||
      Math.round(player.current_price * 10) !== current.cost ||
      ({ GKP:'GK',DEF:'DEF',MID:'MID',FWD:'FWD' } as Record<string,string>)[current.position] !== player.position;
  })) {
    res.status(422).json({ error: 'Player identities or market prices are inconsistent with the official live snapshot.' });
    return;
  }
  // The existing public no-chip endpoint may have started during our
  // upstream preflight. Check again before launching the joint subprocess.
  if (exactMilpBusy) {
    res.status(429).json({ error: 'Solver became occupied during verification. Retry.' });
    return;
  }
  exactMilpBusy = true;
  try {
    const python = process.env.VORTEX_EXACT_PYTHON || 'python3';
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(python, ['-m', 'fpl_solver.joint_cli'], {
        cwd: root, timeout: 12_000, maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, OPENBLAS_NUM_THREADS:'1', OMP_NUM_THREADS:'1' },
      }, (err, stdout) => err ? reject(err) : resolve(stdout));
      child.stdin?.on('error', () => { /* execFile callback owns child errors. */ });
      child.stdin?.end(serialized);
    });
    const result = JSON.parse(output) as { plans?: unknown[]; solver_attempts?: unknown[] };
    if (!Array.isArray(result.plans) || !Array.isArray(result.solver_attempts))
      throw new Error('Malformed bounded joint optimizer response.');
    res.json(result);
  } catch {
    res.status(503).json({ error: 'No verified joint-chip optimization result. Existing Planner is unchanged.' });
  } finally {
    exactMilpBusy = false;
  }
  } finally {
    jointMilpPreflightBusy = false;
  }
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
