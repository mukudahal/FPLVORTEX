/** Read-only, on-demand FPL manager snapshot. Uses public website JSON endpoints, not an official supported API.
 * No cookies, no credentials, no polling, no bulk extraction. Review source terms before production use.
 */
import { buildLiveResearch } from '../dist/js/live-adviser.js';
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
    latestHistoryGameweek:finiteInt(latest?.event),
    bankInTenths:finiteInt(profile.last_deadline_bank),
    teamValueInTenths:finiteInt(profile.last_deadline_value),
    chipsPlayed:played,
    history:rounds.slice(-8).map(row=>({
      gw:row.event, points:finiteInt(row.points), totalPoints:finiteInt(row.total_points),
      overallRank:finiteRank(row.overall_rank)
    })),
    picks:null,
    liveResearch:null,
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
          players:squad.picks.map(p=>({id:finiteInt(p.element),position:finiteInt(p.position),multiplier:finiteInt(p.multiplier),isCaptain:p.is_captain===true,isViceCaptain:p.is_vice_captain===true})),
          note:'Official FPL squad IDs, not synthetic VORTEX model IDs.'
        };
      }
    } catch { /* No pick disclosure is not a profile sync failure. */ }
  }
  if(data.picks?.players?.length===15){
    try {
      const bootstrap=await getJSON('/bootstrap-static/',fetchImpl);
      if(!Array.isArray(bootstrap.elements) || !Array.isArray(bootstrap.teams)) throw new Error('Invalid FPL catalog');
      const playersById=new Map(bootstrap.elements.filter(p=>finiteInt(p.id)!==null).map(p=>[p.id,p]));
      const teamsById=new Map(bootstrap.teams.filter(t=>finiteInt(t.id)!==null).map(t=>[t.id,t]));
      data.picks.players=data.picks.players.map(p=>{
        const player=playersById.get(p.id),team=teamsById.get(player?.team);
        return {...p,
          name:player?restrictName(player.web_name):null,
          club:team?restrictName(team.short_name):null,
          positionName:{1:'GKP',2:'DEF',3:'MID',4:'FWD'}[player?.element_type]??null,
          priceTenths:finiteInt(player?.now_cost),
          officialStatus:player?restrictName(player.status):null,
          officialNews:player?restrictName(player.news):null,
          reportedStarts:finiteInt(player?.starts),
          reportedMinutes:finiteInt(player?.minutes),
          chanceNext:finiteInt(player?.chance_of_playing_next_round)
        };
      });
      // Request one public fixture list only after manager-picks sync has been explicitly initiated.
      // Unavailable fixtures must never fabricate recommendations.
      try {
        const fixturesResponse=await fetchImpl(`${API}/fixtures/`,{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(8500)});
        if(!fixturesResponse?.ok)throw new Error('Fixture data unavailable');
        const fixtures=await fixturesResponse.json();
        if(!Array.isArray(fixtures)||fixtures.length>900)throw new Error('Invalid fixture dataset');
        data.liveResearch=buildLiveResearch({bootstrap,fixtures,picks:data.picks.players,latestGW:data.latestHistoryGameweek??gw});
      }catch{/* No forecast if fixture coverage unavailable. */}
    }catch{/* Still return the original public picks, never invent player identities. */}
  }
  cache.set(key,{timestamp:now(),data});
  return data;
}