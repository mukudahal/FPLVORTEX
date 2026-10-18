/** Read-only, on-demand FPL manager snapshot. Uses public website JSON endpoints, not an official supported API.
 * No cookies, no credentials, no polling, no bulk extraction. Review source terms before production use.
 */
const API = 'https://fantasy.premierleague.com/api';
const CACHE_MS = 60_000;
const cache = new Map();

export function validateEntryId(input) {
  const raw = String(input ?? '');
  if (!/^[1-9]\d{0,8}$/.test(raw)) throw new RangeError('FPL entry ID must be a positive integer (up to 9 digits)');
  const id = Number(raw);
  if (!Number.isSafeInteger(id)) throw new RangeError('Invalid FPL entry ID');
  return id;
}
function finiteInt(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function finiteRank(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
function restrictName(value) {
  return typeof value === 'string' ? value.slice(0, 90) : '';
}
async function getJSON(path, fetchImpl) {
  const response = await fetchImpl(`${API}${path}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8500)
  });
  if (!response?.ok) throw new Error(`FPL returned HTTP ${response?.status ?? 'unavailable'}`);
  const result = await response.json();
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Malformed FPL response');
  return result;
}
/** Optionally inject fetch for deterministic tests. A real request is made only when explicitly invoked. */
export async function fetchLiveFplEntry(rawId, {fetchImpl=fetch, now=Date.now, bypassCache=false}={}) {
  const entryId = validateEntryId(rawId);
  const key = String(entryId);
  const previous = cache.get(key);
  if (!bypassCache && previous && now()-previous.timestamp<CACHE_MS) return previous.data;
  const [profile, history] = await Promise.all([
    getJSON(`/entry/${entryId}/`, fetchImpl),
    getJSON(`/entry/${entryId}/history/`, fetchImpl)
  ]);
  if (profile.id !== entryId) throw new Error('Returned manager ID did not match the requested entry');
  if (!Array.isArray(history.current) || !Array.isArray(history.chips)) throw new Error('Malformed FPL entry history');
  const rounds = history.current
    .filter(row=>finiteInt(row.event)!==null && row.event >= 1 && row.event<=38)
    .sort((a,b)=>a.event-b.event);
  const latest = rounds.at(-1) ?? null;
  const gw = finiteInt(profile.current_event) ?? finiteInt(latest?.event);
  const played = history.chips
    .filter(chip=>typeof chip.name==='string' && finiteInt(chip.event)!==null)
    .map(chip=>({name:restrictName(chip.name),gameweek:chip.event}));
  const data = {
    source:'FPL website public entry JSON (unsupported API)',
    mode:'live-source-response',
    fetchedAt:new Date(now()).toISOString(),
    entryId,
    teamName:restrictName(profile.name),
    overallRank:finiteRank(profile.summary_overall_rank) ?? finiteRank(latest?.overall_rank),
    overallPoints:finiteInt(profile.summary_overall_points) ?? finiteInt(latest?.total_points),
    eventPoints:finiteInt(profile.summary_event_points) ?? finiteInt(latest?.points),
    currentGameweek:gw,
    latestCompletedGameweek:finiteInt(latest?.event),
    bankInTenths:finiteInt(profile.last_deadline_bank),
    teamValueInTenths:finiteInt(profile.last_deadline_value),
    chipsPlayed:played,
    history:rounds.slice(-8).map(row=>({
      gw:row.event, points:finiteInt(row.points), totalPoints:finiteInt(row.total_points),
      overallRank:finiteRank(row.overall_rank)
    })),
    picks:null,
    caution:'The FPL website API is not officially supported. Rank updates may lag the live gameweek. Squad and forecasts are not automatically mapped to demo player IDs.'
  };
  // Picks may be hidden around deadline or blocked by source; profile/history remain useful.
  if (gw && gw >= 1 && gw <= 38) {
    try {
      const squad = await getJSON(`/entry/${entryId}/event/${gw}/picks/`,fetchImpl);
      if (Array.isArray(squad.picks) && squad.picks.length===15) {
        data.picks = {
          gameweek:gw,
          playerIds:squad.picks.map(p=>finiteInt(p.element)).filter(v=>v!==null),
          captainId:finiteInt(squad.picks.find(p=>p.is_captain)?.element),
          activeChip:typeof squad.active_chip==='string'?restrictName(squad.active_chip):null,
          note:'FPL player IDs only. No mapping to synthetic VORTEX squad.'
        };
      }
    } catch { /* No pick disclosure is not a profile sync failure. */ }
  }
  cache.set(key,{timestamp:now(),data});
  return data;
}