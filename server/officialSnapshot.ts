import { fetchFplJson } from './http.ts';
import { normalizeSnapshot, type RawFplData } from './normalize.ts';
import { assertFreshSnapshot } from './snapshotValidation.ts';

/** One official ingestion path for runtime and scheduled recovery generation. */
export async function fetchOfficialSnapshot() {
  const [bootstrap, fixtures] = await Promise.all([
    fetchFplJson<RawFplData['bootstrap']>('/bootstrap-static/', { retries: 2 }),
    fetchFplJson<RawFplData['fixtures']>('/fixtures/', { retries: 2 }),
  ]);
  if (!bootstrap || !Array.isArray(bootstrap.events) || !bootstrap.events.length ||
      !Array.isArray(bootstrap.elements) || !Array.isArray(bootstrap.teams) || !Array.isArray(fixtures)) {
    throw new Error('INVALID_OFFICIAL_PAYLOAD');
  }
  const current = bootstrap.events.find((e: any) => e.is_current) ?? bootstrap.events.find((e: any) => !e.finished) ?? bootstrap.events.at(-1);
  let live: RawFplData['live'] = null;
  try { live = await fetchFplJson(`/event/${current.id}/live/`, { retries: 0, timeoutMs: 5000 }); }
  catch { /* Live scoring is optional; official players and fixtures remain usable. */ }
  const snapshot = normalizeSnapshot({ bootstrap, fixtures, live }, { source: 'live', upstreamOk: true, stale: false });
  assertFreshSnapshot(snapshot);
  return snapshot;
}
