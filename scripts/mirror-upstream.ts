import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Snapshot } from '../src/lib/types.ts';
import { assertFreshSnapshot } from '../server/snapshotValidation.ts';

/**
 * Mirrors a published FPL VORTEX deployment's live snapshot into the repo.
 *
 * The deployment (Render/Fly/any host with open egress) is already doing the expensive work:
 * official FPL bootstrap + fixtures + live points *and* bookmaker odds enrichment.
 * Running this script inside CI copies that fully enriched snapshot down, so a sandboxed
 * local preview can show exactly what the public deployment shows.
 *
 * Usage:
 *   VORTEX_UPSTREAM_BASE=https://fplvortex.onrender.com npm run data:mirror
 */

const UPSTREAM_BASE = (process.env.VORTEX_UPSTREAM_BASE ?? 'https://fplvortex.onrender.com').replace(/\/+$/, '');
const OUTPUT = path.resolve(process.cwd(), process.env.VORTEX_SNAPSHOT_PATH ?? 'public/data/fpl-snapshot.json');
const ATTEMPT_TIMEOUT_MS = Number.parseInt(process.env.VORTEX_MIRROR_TIMEOUT_MS ?? '90000', 10) || 90_000;

interface Attempt {
  path: string;
  label: string;
}

const ATTEMPTS: Attempt[] = [
  { path: '/api/vortex/snapshot?refresh=1', label: 'live refresh' },
  { path: '/api/vortex/snapshot', label: 'cached snapshot' },
];

function assertSnapshot(value: unknown): asserts value is Snapshot {
  if (!value || typeof value !== 'object') throw new Error('Upstream payload is not an object');
  const candidate = value as Partial<Snapshot>;
  if (!candidate.meta || typeof candidate.meta !== 'object') throw new Error('Upstream payload is missing meta');
  if (!Array.isArray(candidate.players) || candidate.players.length < 400) {
    throw new Error(`Upstream payload has too few players (${candidate.players?.length ?? 0})`);
  }
  if (!Array.isArray(candidate.fixtures) || candidate.fixtures.length < 300) {
    throw new Error(`Upstream payload has too few fixtures (${candidate.fixtures?.length ?? 0})`);
  }
  if (!Array.isArray(candidate.teams) || candidate.teams.length < 20) {
    throw new Error(`Upstream payload has too few teams (${candidate.teams?.length ?? 0})`);
  }
  if (typeof candidate.meta.currentEventId !== 'number') {
    throw new Error('Upstream payload is missing meta.currentEventId');
  }
}

async function fetchAttempt(attempt: Attempt): Promise<Snapshot> {
  const url = `${UPSTREAM_BASE}${attempt.path}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    headers: {
      accept: 'application/json',
      'user-agent': 'FPL-VORTEX/mirror (+snapshot sync)',
    },
  });
  if (!response.ok) throw new Error(`Upstream ${response.status} for ${attempt.path}`);
  const payload: unknown = await response.json();
  assertSnapshot(payload);
  assertFreshSnapshot(payload);
  return payload;
}

async function mirror(): Promise<Snapshot> {
  const failures: string[] = [];
  for (const attempt of ATTEMPTS) {
    try {
      console.log(`[mirror] Fetching ${UPSTREAM_BASE}${attempt.path} (${attempt.label})…`);
      return await fetchAttempt(attempt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${attempt.label}: ${message}`);
      console.warn(`[mirror] ${attempt.label} failed: ${message}`);
    }
  }
  throw new Error(`Could not mirror ${UPSTREAM_BASE}\n  - ${failures.join('\n  - ')}`);
}

function oddsSummary(snapshot: Snapshot): string {
  const odds = snapshot.meta.oddsMeta;
  if (!odds) return 'odds: none';
  return `odds: ${odds.status} · ${odds.matchedFixtures ?? 0} fixtures matched`;
}

async function main(): Promise<void> {
  const upstream = await mirror();
  const mirroredAt = new Date().toISOString();
  const snapshot: Snapshot = {
    ...upstream,
    meta: {
      ...upstream.meta,
      source: 'snapshot',
      // Preserve the verified upstream state and original generation time.
      mirroredFrom: UPSTREAM_BASE,
      mirroredAt,
    },
  };

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  const serialized = `${JSON.stringify(snapshot)}\n`;
  await writeFile(OUTPUT, serialized, 'utf8');

  const sizeKb = Math.round((Buffer.byteLength(serialized) / 1024) * 10) / 10;
  console.log(`[mirror] Wrote ${path.relative(process.cwd(), OUTPUT)} (${sizeKb} KB)`);
  console.log(
    `[mirror] ${snapshot.players.length} players · ${snapshot.fixtures.length} fixtures · GW${snapshot.meta.currentEventId} current / GW${snapshot.meta.nextEventId} next`,
  );
  console.log(`[mirror] Upstream generated at ${snapshot.meta.generatedAt} · ${oddsSummary(snapshot)}`);
}

main().catch((error) => {
  console.error('[mirror] Failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

