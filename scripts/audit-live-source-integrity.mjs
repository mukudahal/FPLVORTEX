/**
 * P4 production integrity smoke: READ ONLY, no mutation or manager/league info printed.
 * Does not refresh the odds feed or change the deployed website.
 * Probe failures are reported as UNVERIFIED, never silently declared successful.
 */
const BASE = (process.env.VORTEX_AUDIT_BASE || 'https://fplvortex.onrender.com').replace(/\/$/, '');
const CHECKED = new Date().toISOString();

async function request(path) {
  const response = await fetch(BASE + path, {
    method: 'GET',
    headers: { accept: 'application/json', 'user-agent': 'FPLVORTEX-ReadOnlySourceAudit/1.0' },
    signal: AbortSignal.timeout(60_000),
    cache: 'no-store',
  });
  let data = null;
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    data = await response.json().catch(() => null);
  }
  return { status: response.status, data };
}
function invariant(ok, msg) {
  if (!ok) throw new Error(msg);
}
function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function report(label, status, details) {
  console.log(label + ': ' + status + (details ? ' · ' + details : ''));
}
async function inspectIdentity(kind, id, expected) {
  const path = '/api/vortex/' + kind + '/' + encodeURIComponent(id);
  const { status, data } = await request(path);
  if (expected === 'invalid') {
    invariant(status === 400, kind + ' invalid ID accepted or returned unexpected status ' + status);
    report(kind + ' invalid ID', 'PASS', '400');
    return;
  }
  if (status === 200) {
    invariant(data && String(data.id) === id, kind + ' response identity mismatched requested ID');
    invariant(data.provenance?.kind === 'official' && data.provenance.requestedIdVerified === true,
      kind + ' arbitrary requested ID returned unverified demo/archived data');
    report(kind + ' unknown ID', 'PASS', 'official identity verified; no unrelated fallback');
  } else {
    invariant(status === 404 || status === 503,
      kind + ' unknown ID unexpected status ' + status);
    report(kind + ' unknown ID', 'PASS', 'not substituted; HTTP ' + status);
  }
}
async function main() {
  console.log('P4 RENDER DATA INTEGRITY CHECK — READ ONLY');
  console.log('Base: ' + BASE + '; checked UTC: ' + CHECKED);
  const health = await request('/api/health');
  invariant(health.status === 200 && health.data?.ok === true, 'health endpoint not ready');
  report('Health', 'PASS', 'source=' + (health.data.source ?? 'unknown') +
    ', stale=' + String(health.data.stale) + ', players=' + health.data.players +
    ', fixtures=' + health.data.fixtures);

  const snapshot = await request('/api/vortex/snapshot');
  invariant(snapshot.status === 200 && snapshot.data?.meta, 'snapshot endpoint not usable');
  const { meta, players, fixtures } = snapshot.data;
  invariant(Array.isArray(players) && players.length > 0 &&
    Array.isArray(fixtures) && fixtures.length > 0, 'snapshot missing players or fixtures');
  invariant(validIso(meta.generatedAt), 'snapshot generation timestamp missing or invalid');
  invariant(Date.parse(meta.generatedAt) <= Date.now() + 60_000, 'snapshot generation timestamp in future');
  const quality = meta.playerDataQuality;
  if (quality) {
    invariant(quality.playerCount >= 0 && quality.validIds <= quality.playerCount,
      'player quality counters internally inconsistent');
  }
  report('Snapshot', 'PASS', 'generated=' + meta.generatedAt +
    ', source=' + meta.source + ', stale=' + String(meta.stale) +
    ', players=' + players.length + ', fixtures=' + fixtures.length +
    ', playerQuality=' + (quality?.status ?? 'unknown'));

  const videos = await request('/api/vortex/videos');
  invariant(videos.status === 200 && Array.isArray(videos.data?.videos), 'videos endpoint unusable');
  const v = videos.data;
  invariant(['live', 'repository', 'mixed'].includes(v.source), 'video source provenance missing/invalid');
  if (v.source === 'live' || v.source === 'mixed') {
    invariant(validIso(v.feedCheckedAt) && Number.isInteger(v.liveFeedItems) &&
      v.liveFeedItems > 0, 'RSS source has no valid feed checked time or item count');
  }
  if (v.source === 'repository') {
    invariant(v.feedCheckedAt === null || v.feedCheckedAt === undefined,
      'repository archive masquerades as RSS-checked');
  }
  report('Videos', 'PASS', 'source=' + v.source +
    ', RSS checked=' + (v.feedCheckedAt || 'unknown') +
    ', archive captured=' + (v.archiveCapturedAt || v.capturedAt || 'unknown') +
    ', rows=' + v.videos.length);

  await inspectIdentity('entry', '0', 'invalid');
  await inspectIdentity('league', '0', 'invalid');
  const improbableId = '999999999999';
  await inspectIdentity('entry', improbableId, 'unknown');
  await inspectIdentity('league', improbableId, 'unknown');

  console.log('P4 PASS — live endpoint identities, snapshot provenance and video source verified.');
}
main().catch(error => {
  console.error('P4 UNVERIFIED / FAILED: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
