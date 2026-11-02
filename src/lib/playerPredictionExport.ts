import type { EnrichedPlayer } from './types';

/** No cross-GW substitution: a next-week estimate is not evidence for a later GW. */
export function playerGwForecast(player: Pick<EnrichedPlayer, 'projection' | 'gwProjections'>, gw: number, nextGw: number): number | null {
  if (!Number.isInteger(gw) || gw < nextGw || gw > 38) return null;
  const supplied = player.gwProjections?.[gw];
  if (typeof supplied === 'number' && Number.isFinite(supplied) && supplied >= 0) return supplied;
  if (gw === nextGw && Number.isFinite(player.projection) && player.projection >= 0) return player.projection;
  return null;
}

function csvCell(value: unknown): string {
  const str = String(value ?? '');
  // Leading spreadsheet-formula characters must not become executable formulas.
  const safe = /^[\t\r\n ]*[=+@-]/.test(str) ? "'" + str : str;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function playerPredictionsCsv(players: EnrichedPlayer[], gw: number, nextGw: number,
  verifiedGw?: (p:EnrichedPlayer,gw:number)=>number|null,
  verifiedFive?: (p:EnrichedPlayer)=>number|null): string {
  const headers = ['FPL_ID','Code','Player','Club','Position','Price_GBPm',`GW${gw}_VORTEX_xPts`,
    '5GW_VORTEX_xPts','Legacy_5GW_xP','Model_xPts','Expected_Minutes','DEFCON_xPts',
    'Selected_By_Pct_NOT_EO','Fixture_Ease_5GW','Forecast_Status'];
  const rows = players.map(p => {
    const gwXp = verifiedGw ? verifiedGw(p, gw) : playerGwForecast(p, gw, nextGw);
    const fiveXp = verifiedFive ? verifiedFive(p) : p.horizon5Projection;
    return [p.id, p.code ?? '', p.name, p.team.shortName, p.position,
      p.price.toFixed(1), gwXp === null ? 'N/A' : gwXp.toFixed(2),
      fiveXp === null ? 'N/A' : fiveXp.toFixed(2), gwXp===null?'N/A':p.modelBreakdown.optaXP5Gw.toFixed(2),
      gwXp===null?'N/A':p.modelBreakdown.modelXPts.toFixed(2),
      checkedMinutes ? (checkedMinutes(p,gw)?.toFixed(1)??'N/A') : p.modelBreakdown.expectedMinutes.toFixed(1),
      gwXp===null?'N/A':p.modelBreakdown.defcon.toFixed(2), p.ownership.toFixed(1),
      p.modelBreakdown.fiveGwEaseScore, gwXp === null ? 'Unavailable' : 'Model forecast; uncalibrated'];
  });
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
