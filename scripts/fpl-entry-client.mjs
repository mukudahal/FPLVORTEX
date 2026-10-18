/** On-demand official-host public JSON only. No credentials, polling, or account mutations. */
import { buildLiveResearch } from '../dist/js/live-adviser.js';
import { buildOfficialPlan, integer } from '../dist/js/official-planner.js';
const API='https://fantasy.premierleague.com/api';
const caches=new WeakMap(),flights=new WeakMap();
const CACHE_MS=60_000,MAX_ENTRIES=100;
export function validateEntryId(input){
 const raw=String(input??'');if(!/^[1-9]\d{0,8}$/.test(raw))throw new RangeError('FPL entry ID must be a positive integer (up to 9 digits)');
 return Number(raw);
}
const name=v=>typeof v==='string'?v.slice(0,500):'';
export function validatePublicPicks(rows){
 if(!Array.isArray(rows)||rows.length!==15||rows.some(p=>!p||integer(p.element,1)===null||integer(p.position,1,15)===null||integer(p.multiplier,0,3)===null)||new Set(rows.map(p=>p.element)).size!==15||new Set(rows.map(p=>p.position)).size!==15||rows.filter(p=>p.is_captain===true).length!==1||rows.filter(p=>p.is_vice_captain===true).length!==1||rows.some(p=>p.is_captain&&p.is_vice_captain))throw new Error('Invalid public picks: require 15 unique IDs, slots, captain and vice captain');
 return rows.slice().sort((a,b)=>a.position-b.position).map(p=>({id:p.element,position:p.position,multiplier:p.multiplier,isCaptain:p.is_captain===true,isViceCaptain:p.is_vice_captain===true}));
}
async function readSource(path,fetchImpl,now,provenance,array=false){
 const url=API+path;
 try{
  const res=await fetchImpl(url,{method:'GET',headers:{accept:'application/json'},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(8500)});
  if(!res?.ok)throw new Error(`HTTP ${res?.status??'unavailable'}`);
  const value=await res.json();if(array?!Array.isArray(value):!value||typeof value!=='object'||Array.isArray(value))throw new Error('Malformed JSON');
  provenance.push({url,fetchedAt:new Date(now()).toISOString(),status:'available'});return value;
 }catch(error){provenance.push({url,fetchedAt:new Date(now()).toISOString(),status:'unavailable',detail:error instanceof Error?error.message:'Source unavailable'});throw new Error(`FPL ${path}: ${error instanceof Error?error.message:'unavailable'}`);}
}
export function summarizeAppearances(history){
 if(!Array.isArray(history))throw new Error('Missing match history');
 const seen=new Set();let starts=0,subOn=0,subOff=0,minutes=0,appearances=0;
 for(const row of history){
  if(!row||integer(row.fixture,1)===null||seen.has(row.fixture)||integer(row.minutes,0,130)===null||integer(row.starts,0,1)===null||row.starts===1&&row.minutes===0)throw new Error('Invalid or duplicate match appearance');
  seen.add(row.fixture);minutes+=row.minutes;starts+=row.starts;
  if(row.minutes>0){appearances++;if(row.starts===0)subOn++;}
  // FPL minutes alone do not prove an off substitution (dismissals/extra time). Never infer sub-off.
 }
 return {matches:history.length,starts,subOn,subOff:null,minutes,appearances,averageMinutesPerAppearance:appearances?Number((minutes/appearances).toFixed(1)):null,ninetyEquivalents:Number((minutes/90).toFixed(2)),note:'Match history starts/sub-on are reported/derived; sub-off is unavailable without substitution events.'};
}
async function sync(entryId,{fetchImpl,now,includeAppearances}){
 const provenance=[],warnings=[];const read=(path,array=false)=>readSource(path,fetchImpl,now,provenance,array);
 const profile=await read(`/entry/${entryId}/`);
 if(profile.id!==entryId)throw new Error('Returned manager ID did not match the requested entry');
 const [historyResult,bootstrapResult,fixtureResult,transferResult]=await Promise.allSettled([read(`/entry/${entryId}/history/`),read('/bootstrap-static/'),read('/fixtures/',true),read(`/entry/${entryId}/transfers/`,true)]);
 let history=null;
 if(historyResult.status==='fulfilled'&&Array.isArray(historyResult.value.current)&&Array.isArray(historyResult.value.chips)&&historyResult.value.chips.every(c=>c&&typeof c.name==='string'&&integer(c.event,1,38)!==null))history=historyResult.value;
 else warnings.push('Entry history unavailable or malformed; chip history and historical totals are unknown.');
 const rounds=(history?.current??[]).filter(r=>r&&integer(r.event,1,38)!==null).sort((a,b)=>a.event-b.event),latest=rounds.at(-1);
 const gw=integer(profile.current_event,1,38)??integer(latest?.event,1,38);
 const data={source:'Official FPL host · public website JSON (unsupported interface)',mode:'live-source-response',fetchedAt:new Date(now()).toISOString(),entryId,teamName:name(profile.name),overallRank:integer(profile.summary_overall_rank,1)??integer(latest?.overall_rank,1),overallPoints:integer(profile.summary_overall_points,-200)??integer(latest?.total_points,-200),eventPoints:integer(profile.summary_event_points,-200)??integer(latest?.points,-200),currentGameweek:gw,latestHistoryGameweek:integer(latest?.event,1,38),bankInTenths:integer(profile.last_deadline_bank),teamValueInTenths:integer(profile.last_deadline_value),chipHistoryKnown:history!==null,chipsPlayed:(history?.chips??[]).filter(c=>c&&typeof c.name==='string'&&integer(c.event,1,38)!==null).map(c=>({name:name(c.name),gameweek:c.event})),history:rounds.map(r=>({gw:r.event,points:integer(r.points,-200),totalPoints:integer(r.total_points,-200),overallRank:integer(r.overall_rank,1)})),transferSummary:{seasonCount:integer(profile.summary_total_transfers),gameweekCount:integer(latest?.event_transfers),gameweekCost:integer(latest?.event_transfers_cost),gameweek:integer(latest?.event,1,38),freeTransfers:null},transfers:null,picks:null,liveResearch:null,officialPlan:null,appearances:null,provenance,warnings,caution:'Last-deadline public picks are not the private pre-deadline squad. Public IDs are not automatically mapped to demo player IDs. Bank and value are last-deadline facts; confirm current bank/selling prices/FTs in FPL.'};
 if(transferResult.status==='fulfilled'&&transferResult.value.length<=5000)data.transfers=transferResult.value.filter(t=>t&&integer(t.element_in,1)!==null&&integer(t.element_out,1)!==null&&integer(t.event,1,38)!==null).map(t=>({inId:t.element_in,outId:t.element_out,gameweek:t.event,inCost:integer(t.element_in_cost),outCost:integer(t.element_out_cost),time:name(t.time)}));
 else warnings.push('Public transfer log unavailable. Current free transfers cannot be inferred.');
 if(gw!==null){
  try{
   const squad=await read(`/entry/${entryId}/event/${gw}/picks/`),players=validatePublicPicks(squad.picks);
   data.picks={gameweek:gw,playerIds:players.map(p=>p.id),captainId:players.find(p=>p.isCaptain).id,activeChip:typeof squad.active_chip==='string'?name(squad.active_chip):null,players,note:'Last-deadline public selections; private changes are not visible.'};
   if(squad.entry_history?.event===gw){data.transferSummary.gameweek=gw;data.transferSummary.gameweekCount=integer(squad.entry_history.event_transfers);data.transferSummary.gameweekCost=integer(squad.entry_history.event_transfers_cost);}
  }catch(error){warnings.push(error.message);}
 }else warnings.push('No public gameweek disclosed yet.');
 let bootstrap=null;
 if(bootstrapResult.status==='fulfilled'&&Array.isArray(bootstrapResult.value.elements)&&Array.isArray(bootstrapResult.value.teams))bootstrap=bootstrapResult.value;
 else warnings.push('Player catalogue unavailable: names and player statistics are withheld.');
 if(bootstrap&&data.picks){
  const elements=bootstrap.elements.filter(p=>p&&integer(p.id,1)!==null),teams=bootstrap.teams.filter(t=>t&&integer(t.id,1)!==null);
  const ambiguous=new Set(elements.map(p=>p.id)).size!==elements.length||new Set(teams.map(t=>t.id)).size!==teams.length;
  if(ambiguous)warnings.push('Duplicate catalogue IDs; player names and planning withheld.');
  else {
   const byId=new Map(elements.map(p=>[p.id,p])),byClub=new Map(teams.map(t=>[t.id,t]));
   data.picks.players=data.picks.players.map(p=>{const raw=byId.get(p.id),club=byClub.get(raw?.team);return {...p,name:raw?name(raw.web_name):null,club:club?name(club.short_name):null,positionName:{1:'GKP',2:'DEF',3:'MID',4:'FWD'}[raw?.element_type]??null,priceTenths:integer(raw?.now_cost),officialStatus:raw?name(raw.status):null,officialNews:raw?name(raw.news):null,reportedStarts:integer(raw?.starts),reportedMinutes:integer(raw?.minutes),chanceNext:integer(raw?.chance_of_playing_next_round,0,100)};});
   if(fixtureResult.status==='fulfilled'&&fixtureResult.value.length<=900){
    data.officialPlan=buildOfficialPlan({bootstrap,fixtures:fixtureResult.value,picks:data.picks.players,now:now(),fetchedAt:data.fetchedAt});
    if(data.picks.activeChip==='freehit'){data.officialPlan.blockers.push('The disclosed squad is a temporary Free Hit roster; permanent-squad planning is withheld until it is restored.');data.officialPlan.roadmap=[];data.officialPlan.watchlist=[];data.officialPlan.priorities=[];data.officialPlan.confidence='limited';}
    if(data.officialPlan.blockers.length===0){try{data.liveResearch=buildLiveResearch({bootstrap,fixtures:fixtureResult.value,picks:data.picks.players,latestGW:data.latestHistoryGameweek??gw});}catch{warnings.push('Speculative model could not be calculated; official facts remain available.');}}
   }else warnings.push('Fixtures unavailable: GW19 roadmap and speculative projections withheld.');
  }
 }
 if(includeAppearances&&data.picks){
  const summaries=[];let index=0;
  await Promise.all(Array.from({length:3},async()=>{while(index<data.picks.players.length){const player=data.picks.players[index++];try{const result=await read(`/element-summary/${player.id}/`);summaries.push({playerId:player.id,...summarizeAppearances(result.history),status:'available'});}catch{summaries.push({playerId:player.id,status:'unavailable'});}}}));
  data.appearances=summaries.sort((a,b)=>a.playerId-b.playerId);
 }
 data.fetchedAt=new Date(now()).toISOString();
 return data;
}
/** Cache isolated by fetch implementation; bounded, coalesced, no automatic refresh. */
export async function fetchLiveFplEntry(rawId,{fetchImpl=fetch,now=Date.now,bypassCache=false,includeAppearances=false}={}){
 const entryId=validateEntryId(rawId),key=`${entryId}:${includeAppearances}`;
 let cache=caches.get(fetchImpl);if(!cache){cache=new Map();caches.set(fetchImpl,cache);}
 let inFlight=flights.get(fetchImpl);if(!inFlight){inFlight=new Map();flights.set(fetchImpl,inFlight);}
 const previous=cache.get(key),age=previous?now()-previous.timestamp:null;
 if(!bypassCache&&previous&&age>=0&&age<CACHE_MS)return {...previous.data,cacheAgeSeconds:Math.floor(age/1000)};
 if(inFlight.has(key))return inFlight.get(key);
 const pending=sync(entryId,{fetchImpl,now,includeAppearances}).then(data=>{
  if(cache.size>=MAX_ENTRIES)cache.delete(cache.keys().next().value);cache.set(key,{timestamp:now(),data});return {...data,cacheAgeSeconds:0};
 }).finally(()=>inFlight.delete(key));
 inFlight.set(key,pending);return pending;
}
