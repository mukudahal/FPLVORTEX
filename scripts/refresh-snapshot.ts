import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchFplJson } from '../server/http.ts';
import { normalizeSnapshot, type RawFplData } from '../server/normalize.ts';
import { assertFreshSnapshot } from '../server/snapshotValidation.ts';

type RawRecord = Record<string, any>;

function currentEventFromBootstrap(bootstrap: RawRecord): number {
  const events = Array.isArray(bootstrap.events) ? bootstrap.events : [];
  const current = events.find((event: RawRecord) => event.is_current) ?? events.find((event: RawRecord) => !event.finished);
  return Number(current?.id ?? events.at(-1)?.id ?? 1);
}

async function main(): Promise<void> {
  const [bootstrap, fixtures] = await Promise.all([
    fetchFplJson<RawRecord>('/bootstrap-static/', { retries: 2 }),
    fetchFplJson<RawRecord[]>('/fixtures/', { retries: 2 }),
  ]);
  const eventId = currentEventFromBootstrap(bootstrap);
  let live: RawRecord | null = null;
  try {
    live = await fetchFplJson<RawRecord>(`/event/${eventId}/live/`, { retries: 1 });
  } catch {
    console.warn('Live gameweek endpoint unavailable; using bootstrap event points.');
  }
  const raw: RawFplData = { bootstrap, fixtures, live };
  const generatedAt = new Date().toISOString();
  const snapshot = normalizeSnapshot(raw, {
    source: 'snapshot',
    upstreamOk: true,
    stale: false,
    generatedAt,
    servedAt: generatedAt,
  });
  const output = path.resolve(process.cwd(), process.env.VORTEX_SNAPSHOT_PATH ?? 'public/data/fpl-snapshot.json');
  assertFreshSnapshot(snapshot);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(snapshot)}\n`, 'utf8');
  const sizeKb = Math.round((Buffer.byteLength(JSON.stringify(snapshot)) / 1024) * 10) / 10;
  console.log(`Snapshot refreshed: ${snapshot.players.length} players, ${snapshot.fixtures.length} fixtures, ${sizeKb} KB`);
  console.log(`Season ${snapshot.meta.season} · current GW ${snapshot.meta.currentEventId} · next GW ${snapshot.meta.nextEventId}`);
  console.log(`Saved to ${output}`);
}

main().catch((error) => {
  console.error('Snapshot refresh failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

