/**
 * Read-only public probe of the existing Render API: this never forces a paid odds refresh.
 * Reports what the deployed server actually returned, not what the source code promises.
 * Run: node scripts/audit-live-odds.mjs
 */
const base = (process.env.VORTEX_AUDIT_BASE || 'https://fplvortex.onrender.com').replace(/\/$/, '');
async function readJson(path) {
  const res = await fetch(base + path, {
    headers: { accept: 'application/json', 'user-agent': 'FPLVORTEX-ReadOnlyOddsAudit/1.0' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} at ${path}`);
  const json = await res.json();
  if (!json || typeof json !== 'object') throw new Error(`Invalid JSON at ${path}`);
  return json;
}
const oddValid = o => typeof o === 'number' && Number.isFinite(o) && o > 1.01 && o < 250;
function counts(rows) {
  const fixtures = rows.length;
  const priced = rows.filter(x => !!x.marketOdds).length;
  const x12 = rows.filter(x => oddValid(x.marketOdds?.oddsHome) &&
    oddValid(x.marketOdds?.oddsDraw) && oddValid(x.marketOdds?.oddsAway)).length;
  const totals = rows.filter(x => typeof x.marketOdds?.totalLine === 'number' &&
    Number.isFinite(x.marketOdds.totalLine) && x.marketOdds.totalLine > 0 &&
    oddValid(x.marketOdds?.oddsOver) && oddValid(x.marketOdds?.oddsUnder)).length;
  return { fixtures, priced, complete1x2: x12, completeTotals: totals };
}
async function main() {
  const health = await readJson('/api/health');
  const first = health.nextEventId;
  if (!Number.isInteger(first) || first < 1 || first > 38) throw new Error('No valid nextEventId in live health response');
  console.log('LIVE RENDER ODDS AUDIT — READ-ONLY');
  console.log(`Host: ${base}; UTC checked: ${new Date().toISOString()}`);
  console.log(`Snapshot: source=${health.source ?? 'unknown'}, stale=${health.stale ?? 'unknown'}, FPL upstreamOk=${health.upstreamOk ?? 'unknown'}`);
  console.log(`The Odds API key configured: ${health.oddsMeta?.apiKeyConfigured === true ? 'yes (connection NOT guaranteed)' : health.oddsMeta?.apiKeyConfigured === false ? 'no' : 'unknown'}`);
  console.log(`Provider summary: ${health.oddsMeta?.provider ?? 'unknown'} (parsed rows do not prove upcoming quote coverage)`);
  console.log(`Provider feed fetch time: ${health.oddsMeta?.updatedAt ?? 'unknown'} (NOT the bookmaker quote time)`);
  const weeks = [first, first + 1, first + 2].filter(gw => gw <= 38);
  const rows = [];
  for (const gw of weeks) {
    const resp = await readJson('/api/vortex/odds?gw=' + gw);
    const list = Array.isArray(resp.fixtures) ? resp.fixtures : [];
    rows.push(...list);
    console.log(`GW${gw}: ${JSON.stringify(counts(list))}`);
  }
  console.log('NEXT THREE GAMEWEEKS TOTAL: ' + JSON.stringify(counts(rows)));
  const providers = health.oddsMeta?.feedDiagnostics;
  if (Array.isArray(providers)) {
    for (const d of providers) {
      console.log(`Feed ${d.provider ?? 'unknown'}: access=${d.access ?? 'unknown'} fetched=${d.fetched === true ? 'yes' : 'no'} parsedRows=${d.parsedRows ?? 0}`);
    }
  } else {
    console.log('Per-feed connection details unavailable on current production version.');
  }
  const bookmakerTimestamped = rows.filter(f => f.marketOdds?.quoteTimeSource === 'bookmaker' &&
    typeof f.marketOdds?.updatedAt === 'string' && Number.isFinite(Date.parse(f.marketOdds.updatedAt)));
  console.log(`VERIFIED SOURCE TIMESTAMP RECORDS: ${bookmakerTimestamped.length}/${rows.filter(f => f.marketOdds).length} priced fixtures`);
  console.log('CAVEAT: A successful fetch verifies connectivity to the deployed odds API, not guaranteed connectivity to each external bookmaker.');
}
main().catch(error => {
  console.error('LIVE RENDER ODDS AUDIT UNVERIFIED: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
