import { parseCsvRows } from '../server/odds';
import type { OfficialPoints } from './settle-my-team-plan';

const PROVIDER_REPO = 'olbauday/FPL-Core-Insights';
const METRICS = ['total_points','minutes','expected_goals','expected_assists'] as const;
const numeric = (value: unknown) =>
  typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;

export function compareCoreGameweek(csv: string, official: OfficialPoints, gw: number) {
  const officialRows = new Map(official.elements.map(row=>[row.id,row.stats]));
  const rows = parseCsvRows(csv);
  const byId = new Map<number, typeof rows[number]>();
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id<1 || Number(row.gw)!==gw || byId.has(id)) throw new Error('Unexpected or duplicate FPL Core observation');
    byId.set(id,row);
  }
  const counts = Object.fromEntries(METRICS.map(name=>[name,{compared:0,matches:0}])) as Record<typeof METRICS[number],{compared:number;matches:number}>;
  let matchedPlayers = 0;
  for (const [id,row] of byId) {
    const stats = officialRows.get(id);
    if (!stats) continue;
    matchedPlayers++;
    for (const field of METRICS) {
      const expected = numeric((stats as Partial<Record<typeof METRICS[number],unknown>>)[field]);
      const value = numeric(row[field]);
      if (!Number.isFinite(expected) || !Number.isFinite(value)) continue;
      counts[field].compared++;
      if (Math.abs(value-expected)<1e-6) counts[field].matches++;
    }
  }
  if (!matchedPlayers || !counts.total_points.compared) throw new Error('FPL Core data could not be matched to official outcomes');
  return {gameweek:gw,officialPlayers:officialRows.size,providerRows:byId.size,matchedPlayers,counts};
}

export async function fetchCoreGameweekAudit(season: string, gw: number, official: OfficialPoints) {
  const firstYear = Number(season.slice(0,4));
  if (!/^\d{4}\/\d{2}$/.test(season) || String(firstYear+1).slice(-2)!==season.slice(-2)) return null;
  try {
    const commit = await fetch('https://api.github.com/repos/'+PROVIDER_REPO+'/commits/main',{signal:AbortSignal.timeout(7000)});
    if (!commit.ok) return null;
    const {sha} = await commit.json() as {sha?:string};
    if (!sha || !/^[0-9a-f]{40}$/.test(sha)) return null;
    const path = ['data',firstYear+'-'+(firstYear+1),'By Gameweek','GW'+gw,'player_gameweek_stats.csv'].map(encodeURIComponent).join('/');
    const source = 'https://raw.githubusercontent.com/'+PROVIDER_REPO+'/'+sha+'/'+path;
    const response = await fetch(source,{signal:AbortSignal.timeout(8000)});
    if (!response.ok) return null;
    const csv = await response.text();
    if (csv.length>2_000_000) return null;
    return {...compareCoreGameweek(csv,official,gw),source,revision:sha,retrievedAt:new Date().toISOString()};
  } catch { return null; }
}
