/** Read-only Home dashboard integration. Public FPL website JSON is unsupported and usage terms must be reviewed before commercial use. */
import { fetchLiveFplEntry, validateEntryId } from './fpl-entry-client.mjs';
import { readPublicLeague } from './public-league-store.mjs';
import { forecastMatch } from '../src/public-league.mjs';

const API='https://fantasy.premierleague.com/api';
const cache=new Map();
const TTL=90_000;
const safeInt=(value)=>Number.isSafeInteger(value)&&value>=0?value:null;
const safeNumber=(value)=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const safeText=(value,length=110)=>typeof value==='string'?value.slice(0,length):'';
async function fetchJson(path,fetchImpl){
  const response=await fetchImpl(API+path,{headers:{accept:'application/json'},signal:AbortSignal.timeout(9000)});
  if(!response?.ok)throw new Error(`FPL returned HTTP ${response?.status??'unavailable'}`);
  return response.json();
}
export function poissonWin(home,away){
  if(![home,away].every(n=>Number.isFinite(n)&&n>=0&&n<=10))throw new RangeError('Invalid goal inputs');
  const mass=(rate,k)=>{let val=Math.exp(-rate);for(let j=1;j<=k;j++)val*=rate/j;return val;};
  let win=0,draw=0;
  for(let i=0;i<=18;i++)for(let j=0;j<=18;j++){const p=mass(home,i)*mass(away,j);if(i>j)win+=p;else if(i===j)draw+=p;}
  return {home:win,draw,away:Math.max(0,1-win-draw)};
}
export function getLeagueView(league,currentGw,nextGw){
  if(!league)return {mode:'unavailable',fixtures:[],predictions:[]};
  const fixtures=league.matches.filter(x=>x.gameweek===currentGw).map(x=>({id:null,gameweek:currentGw,date:x.date,kickoff:null,home:x.homeCode,away:x.awayCode,homeScore:x.score?.[0]??null,awayScore:x.score?.[1]??null,finished:Boolean(x.score),started:Boolean(x.score),provider:'OpenFootball community'}));
  const forecastRows=[];
  for(const match of league.matches.filter(x=>x.gameweek===nextGw)){
    const prediction=forecastMatch(league,match);
    const outcome=poissonWin(prediction.homeGoals,prediction.awayGoals);
    forecastRows.push({club:match.homeCode,opponent:match.awayCode,venue:'H',xg:prediction.homeGoals,cs:prediction.homeCsProbability,win:outcome.home,fixture:`${match.awayCode} (H)`});
    forecastRows.push({club:match.awayCode,opponent:match.homeCode,venue:'A',xg:prediction.awayGoals,cs:prediction.awayCsProbability,win:outcome.away,fixture:`${match.homeCode} (A)`});
  }
  return {mode:'community-fixtures / unvalidated projection',fixtures,predictions:forecastRows};
}
export function normalizeCatalog(bootstrap){
  if(!bootstrap||!Array.isArray(bootstrap.elements)||!Array.isArray(bootstrap.teams)||!Array.isArray(bootstrap.events))throw new TypeError('Malformed FPL catalogue');
  const teams=new Map(bootstrap.teams.map(t=>[t.id,safeText(t.short_name,12)]));
  return {currentGameweek:bootstrap.events.find(e=>e.is_current)?.id??null,nextGameweek:bootstrap.events.find(e=>e.is_next)?.id??null,
    players:bootstrap.elements.slice(0,900).filter(p=>safeInt(p.id)!==null).map(p=>({
      id:p.id,name:safeText(p.web_name,70),fullName:safeText(p.first_name+' '+p.second_name,90),club:teams.get(p.team)??'—',position:({1:'GKP',2:'DEF',3:'MID',4:'FWD'})[p.element_type]??'—',
      points:safeInt(p.total_points),gwPoints:safeInt(p.event_points),priceTenths:safeInt(p.now_cost),selected:safeNumber(p.selected_by_percent),
      transferIn:safeInt(p.transfers_in_event),transferOut:safeInt(p.transfers_out_event),costChangeEvent:Number.isInteger(p.cost_change_event)?p.cost_change_event:null,
      status:safeText(p.status,6),news:safeText(p.news,190),chance:p.chance_of_playing_next_round===null?null:safeInt(p.chance_of_playing_next_round),
      photo:null // Rights-cleared player portraits are mapped separately on the client.
    }))};
}
export function normalizeFixtures(input,teams,currentGw){
  if(!Array.isArray(input))throw new TypeError('Invalid fixture response');
  const map=new Map(teams.map(t=>[t.id,safeText(t.short_name,12)]));
  return input.slice(0,60).filter(x=>Number.isInteger(x.event)&&x.event===currentGw).map(x=>({
    id:safeInt(x.id),gameweek:x.event,date:typeof x.kickoff_time==='string'?x.kickoff_time.slice(0,10):null,
    kickoff:typeof x.kickoff_time==='string'?x.kickoff_time:null,
    home:map.get(x.team_h)??'—',away:map.get(x.team_a)??'—',homeScore:safeInt(x.team_h_score),awayScore:safeInt(x.team_a_score),
    started:Boolean(x.started),finished:Boolean(x.finished),provider:'FPL website public fixtures'
  }));
}
const isVideoId=x=>/^[A-Za-z0-9_-]{11}$/.test(x);
export function configuredVideos(env=process.env){
  const ids=(env.FPLVORTEX_YOUTUBE_VIDEO_IDS??'').split(',').map(x=>x.trim()).filter(isVideoId).slice(0,8);
  const channel=(env.FPLVORTEX_YOUTUBE_CHANNEL_URL??'').trim();
  return {ids,channelUrl:/^https:\/\/(www\.)?youtube\.com\/(?:@[-\w.]+|channel\/UC[A-Za-z0-9_-]+)\/?$/.test(channel)?channel:null};
}
export async function getHomeOverview(rawEntryId,{gw=null,fetchImpl=fetch,now=Date.now,readLeague=readPublicLeague,env=process.env,bypassCache=false}={}){
  const entryId=validateEntryId(rawEntryId);
  if(gw!==null&&(!Number.isInteger(gw)||gw<1||gw>38))throw new RangeError('Gameweek must be from 1 to 38');
  const key=`${entryId}/${gw??'current'}`;
  const existing=cache.get(key);
  if(!bypassCache&&existing&&now()-existing.time<TTL)return existing.value;
  const [entryResult,bootstrapResult,fixturesResult,leagueResult]=await Promise.allSettled([
    fetchLiveFplEntry(entryId,{fetchImpl,now,bypassCache}),fetchJson('/bootstrap-static/',fetchImpl),fetchJson('/fixtures/',fetchImpl),readLeague()
  ]);
  const entry=entryResult.status==='fulfilled'?entryResult.value:null;
  let catalog=null,officialFixtures=[];
  if(bootstrapResult.status==='fulfilled'){
    try{catalog=normalizeCatalog(bootstrapResult.value);}catch{/* invalid catalogue omitted */}
  }
  const currentGw=gw??catalog?.currentGameweek??entry?.currentGameweek??7;
  const nextGw=Math.min(38,currentGw+1);
  if(catalog&&fixturesResult.status==='fulfilled'){
    try{officialFixtures=normalizeFixtures(fixturesResult.value,bootstrapResult.value.teams,currentGw)}catch{/* independent failure */}
  }
  const league=getLeagueView(leagueResult.status==='fulfilled'?leagueResult.value:null,currentGw,nextGw);
  const fixtures=officialFixtures.length?officialFixtures:league.fixtures;
  const result={
    source:'FPL public website JSON (unsupported API), OpenFootball CC0',asOf:new Date(now()).toISOString(),entryId,
    currentGameweek:currentGw,nextGameweek:nextGw,
    entry,players:catalog?.players??[],fixtures,predictions:league.predictions,
    live:{entry:entry!==null,players:Boolean(catalog),fixtures:officialFixtures.length>0,model:league.predictions.length>0},
    video:configuredVideos(env),
    notices:['FPL fields and results are source-reported and may update during a GW.','Next-GW team xG, clean-sheet and win odds use an untrained independent Poisson baseline, NOT bookmaker/Opta odds.','Player price ETA unavailable without validated historic thresholds and authorization.','Portraits are shown only where separately licensed.']
  };
  cache.set(key,{time:now(),value:result});return result;
}