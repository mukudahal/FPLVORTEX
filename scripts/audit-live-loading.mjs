/** Passive timings of the deployed application, without forcing upstream/paid feed refreshes. */
const base = (process.env.VORTEX_AUDIT_BASE || 'https://fplvortex.onrender.com').replace(/\/$/, '');
console.log('RENDER LOADING AUDIT — ' + new Date().toISOString());
for (const path of ['/', '/api/health', '/api/vortex/snapshot']) {
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    const response = await fetch(base + path, { signal: AbortSignal.timeout(90_000),
      headers: { 'user-agent': 'FPLVORTEX-ReadOnlyLoadingAudit/1.0' }, cache: 'no-store' });
    const body = await response.text();
    const elapsed = Math.round(performance.now() - start);
    if (!response.ok) throw new Error(path + ' HTTP ' + response.status);
    samples.push(elapsed);
    if (path === '/api/vortex/snapshot' && i === 2) {
      const snapshot = JSON.parse(body);
      console.log('Snapshot: source=' + snapshot.meta.source + ', stale=' + snapshot.meta.stale +
        ', generated=' + snapshot.meta.generatedAt + ', players=' + snapshot.players.length);
    }
  }
  console.log(path + ': samples_ms=' + samples.join(',') +
    ' median_ms=' + [...samples].sort((a, b) => a - b)[1]);
}
console.log('These are HTTP timings from the CI runner, not browser rendering times or an idle cold-start guarantee.');
