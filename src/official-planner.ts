/** Facts-only decision support. No player forecasts or rank probabilities. */
type Row = Record<string, unknown>;
export type OfficialPick = {id:number;position:number|null;isCaptain:boolean;isViceCaptain:boolean};
export type FixtureFact = {id:number;gw:number;opponent:string;venue:'H'|'A';fdr:number|null;kickoff:string|null};
export type PlayerFact = {
  id:number;name:string;clubId:number;club:string;position:'GKP'|'DEF'|'MID'|'FWD';priceTenths:number|null;
  status:string|null;news:string;newsUpdated:string|null;chanceNext:number|null;
  minutes:number|null;starts:number|null;totalPoints:number|null;goals:number|null;assists:number|null;
  observedXg:number|null;observedXa:number|null;completedTeamMatches:number;averageMinutesPerTeamMatch:number|null;
  pickPosition:number|null;isCaptain:boolean;isViceCaptain:boolean;fixtures:FixtureFact[];
};
export type OfficialPlan = {
  mode:'verified-facts-and-editorial-rules';season:string|null;nextGameweek:number|null;targetGameweek:19;
  generatedAt:string;freshUntil:string;confidence:'limited'|'source-backed';blockers:string[];
  roster:PlayerFact[];watchlist:PlayerFact[];
  priorities:{playerId:number|null;title:string;reason:string;confidence:'source-backed'|'editorial'}[];
  roadmap:{gw:number;deadline:string|null;fixtureCount:number;missingPlayerIds:number[];doublePlayerIds:number[];note:string}[];
  constraints:string[];
};
export const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number|null=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max?v:null;
const num=(v:unknown):number|null=>{const n=typeof v==='string'&&/^\d+(\.\d+)?$/.test(v)?Number(v):typeof v==='number'?v:NaN;return Number.isFinite(n)&&n>=0?n:null;};
const str=(v:unknown)=>typeof v==='string'?v.slice(0,500):'';
const objects=(v:unknown):Row[]=>Array.isArray(v)?v.filter((r):r is Row=>r!==null&&typeof r==='object'&&!Array.isArray(r)):[];
const positions=['','GKP','DEF','MID','FWD'] as const;
export function catalogueSeason(events:unknown):string|null {
  const opening=objects(events).find(e=>e.id===1);const date=Date.parse(str(opening?.deadline_time));
  if(!Number.isFinite(date))return null;
  const year=new Date(date).getUTCFullYear();return `${year}/${String(year+1).slice(-2)}`;
}
export function buildOfficialPlan({bootstrap,fixtures,picks,now=Date.now(),fetchedAt=new Date(now).toISOString()}:{bootstrap:{elements:unknown;teams:unknown;events?:unknown};fixtures:unknown;picks:readonly OfficialPick[];now?:number;fetchedAt?:string}):OfficialPlan {
  const elements=objects(bootstrap.elements),teams=objects(bootstrap.teams),events=objects(bootstrap.events),matches=objects(fixtures);
  const blockers:string[]=[];const season=catalogueSeason(events);
  if(season!=='2026/27')blockers.push('The catalogue season is missing or differs from the 2026/27 target. Planning withheld.');
  const duplicate=(rows:Row[])=>new Set(rows.map(r=>r.id)).size!==rows.length;
  if(duplicate(elements)||duplicate(teams))blockers.push('Duplicate catalogue IDs: player mapping is ambiguous.');
  if(picks.length!==15||new Set(picks.map(p=>p.id)).size!==15)blockers.push('A complete roster of 15 unique official player IDs is required.');
  const upcoming=events.filter(e=>integer(e.id,1,38)!==null&&Number.isFinite(Date.parse(str(e.deadline_time)))&&Date.parse(str(e.deadline_time))>now).sort((a,b)=>Number(a.id)-Number(b.id))[0];
  const nextGameweek=integer(upcoming?.id,1,38);
  if(nextGameweek===null||nextGameweek>19)blockers.push('No upcoming deadline within the GW19 target.');
  const captured=Date.parse(fetchedAt);
  if(!Number.isFinite(captured)||now-captured>15*60_000||captured>now+60_000)blockers.push('Source snapshot is stale or has an invalid retrieval time. Refresh before planning.');
  const clubMap=new Map(teams.map(t=>[t.id,t]));
  const usable=matches.filter(f=>integer(f.id,1)!==null&&integer(f.event,1,38)!==null&&clubMap.has(f.team_h)&&clubMap.has(f.team_a));
  if(!usable.length||duplicate(usable))blockers.push('Official fixture coverage is missing or ambiguous.');
  const uniqueMatches=[...new Map(usable.map(f=>[f.id,f])).values()];
  const ownMap=new Map(picks.map(p=>[p.id,p]));
  const players=elements.flatMap((raw):PlayerFact[]=>{
    const id=integer(raw.id,1),clubId=integer(raw.team,1),pos=integer(raw.element_type,1,4);
    if(id===null||clubId===null||pos===null||!clubMap.has(clubId))return [];
    const pick=ownMap.get(id),minutes=integer(raw.minutes),starts=integer(raw.starts,0,76);
    const completed=uniqueMatches.filter(f=>(f.finished===true||f.finished_provisional===true)&&(f.team_h===clubId||f.team_a===clubId)).length;
    const future=uniqueMatches.filter(f=>Number(f.event)>=(nextGameweek??39)&&Number(f.event)<=19&&(f.team_h===clubId||f.team_a===clubId)).map((f):FixtureFact=>{
      const home=f.team_h===clubId,other=clubMap.get(home?f.team_a:f.team_h);
      return {id:Number(f.id),gw:Number(f.event),opponent:str(other?.short_name)||'Unknown',venue:home?'H':'A',fdr:integer(home?f.team_h_difficulty:f.team_a_difficulty,1,5),kickoff:typeof f.kickoff_time==='string'?f.kickoff_time:null};
    }).sort((a,b)=>a.gw-b.gw||a.id-b.id);
    return [{id,name:str(raw.web_name)||`Player #${id}`,clubId,club:str(clubMap.get(clubId)?.short_name),position:positions[pos] as PlayerFact['position'],priceTenths:integer(raw.now_cost,1,500),status:typeof raw.status==='string'?raw.status:null,news:str(raw.news),newsUpdated:typeof raw.news_added==='string'?raw.news_added:null,chanceNext:integer(raw.chance_of_playing_next_round,0,100),minutes,starts,totalPoints:integer(raw.total_points,-200),goals:integer(raw.goals_scored),assists:integer(raw.assists),observedXg:num(raw.expected_goals),observedXa:num(raw.expected_assists),completedTeamMatches:completed,averageMinutesPerTeamMatch:minutes!==null&&completed>0?Number((minutes/completed).toFixed(1)):null,pickPosition:pick?.position??null,isCaptain:pick?.isCaptain??false,isViceCaptain:pick?.isViceCaptain??false,fixtures:future}];
  });
  const byId=new Map(players.map(p=>[p.id,p]));const roster=picks.flatMap(p=>byId.has(p.id)?[byId.get(p.id)!]:[]);
  if(roster.length!==15)blockers.push('Some official picks are absent from the catalogue; no player substitutions were invented.');
  if(roster.length===15&&(['GKP','DEF','MID','FWD'] as const).some((pos,i)=>roster.filter(p=>p.position===pos).length!==[2,5,5,3][i]))blockers.push('The returned roster has invalid position totals.');
  const priorities:OfficialPlan['priorities']=[];
  for(const p of roster){
    if(p.status!==null&&p.status!=='a'||p.chanceNext!==null&&p.chanceNext<100)priorities.push({playerId:p.id,title:`Review ${p.name}'s availability`,reason:`FPL status ${p.status??'unknown'}; next-round chance ${p.chanceNext===null?'not reported':`${p.chanceNext}%`}. ${p.news||'No explanation supplied.'} This is a current report, not a long-term absence forecast.`,confidence:'source-backed'});
    if(p.pickPosition!==null&&p.pickPosition<=11&&p.averageMinutesPerTeamMatch!==null&&p.completedTeamMatches>=3&&p.averageMinutesPerTeamMatch<60)priorities.push({playerId:p.id,title:`Check ${p.name}'s starting role`,reason:`${p.minutes} season minutes across ${p.completedTeamMatches} completed club matches (${p.averageMinutesPerTeamMatch} min/match). This aggregate can be distorted during a live GW or by a mid-season transfer. Check match history before a move.`,confidence:'editorial'});
  }
  if(!priorities.length)priorities.push({playerId:null,title:'Provisional hold: review near the deadline',reason:'No current availability flags were reported. Preserve flexibility until lineup news and your actual budget/free transfers are confirmed; this does not prove holding is optimal.',confidence:'editorial'});
  const roadmap:OfficialPlan['roadmap']=blockers.length?[]:Array.from({length:20-nextGameweek!},(_,i)=>{
    const gw=nextGameweek!+i;const counts=roster.map(p=>({id:p.id,n:p.fixtures.filter(f=>f.gw===gw).length}));
    const missing=counts.filter(p=>p.n===0).map(p=>p.id),doubles=counts.filter(p=>p.n>1).map(p=>p.id);
    return {gw,deadline:typeof events.find(e=>e.id===gw)?.deadline_time==='string'?String(events.find(e=>e.id===gw)?.deadline_time):null,fixtureCount:counts.reduce((s,p)=>s+p.n,0),missingPlayerIds:missing,doublePlayerIds:doubles,note:missing.length?'Resolve missing or unassigned fixtures before deciding bench cover or a chip.':doubles.length?'Multiple scheduled fixtures: verify minutes and kickoff changes before considering a chip.':'Recheck availability, captain and vice captain; hold unless a confirmed problem or a justified move emerges.'};
  });
  const watchlist=blockers.length?[]:players.filter(p=>!ownMap.has(p.id)&&p.status==='a'&&(p.chanceNext===null||p.chanceNext===100)&&p.starts!==null&&p.starts>=3&&p.fixtures.some(f=>f.gw===nextGameweek)).sort((a,b)=>(b.starts??0)-(a.starts??0)||a.id-b.id);
  return {mode:'verified-facts-and-editorial-rules',season,nextGameweek,targetGameweek:19,generatedAt:new Date(now).toISOString(),freshUntil:new Date((Number.isFinite(captured)?captured:now)+15*60_000).toISOString(),confidence:blockers.length?'limited':'source-backed',blockers,roster,watchlist,priorities: blockers.length?[]:priorities,roadmap,constraints:['Rank target is an aspiration; no top-5K probability or required-points cutoff is estimated.','Public picks are last-deadline selections. Undisclosed transfers and current selling prices are unavailable.','Chip history records past use, not confirmed entitlement or availability. Confirm chips in FPL.','Fixture gaps are missing coverage or possible blanks; unassigned fixtures are not silently assigned.','Reported season xG/xA are source observations; no proprietary forecast is imported.','Editorial priorities are transparent rules, not calibrated points predictions.']};
}
export function checkTransfer(plan:OfficialPlan,outId:number,inId:number,inputs:{bankTenths:number|null;saleTenths:number|null;freeTransfers:number|null;confirmed:boolean},now=Date.now()) {
  const errors=[...plan.blockers];const out=plan.roster.find(p=>p.id===outId),incoming=plan.watchlist.find(p=>p.id===inId);
  if(now>=Date.parse(plan.freshUntil)||plan.roadmap[0]?.deadline&&now>=Date.parse(plan.roadmap[0].deadline))errors.push('Snapshot expired or deadline crossed; sync again.');
  if(!out||!incoming)errors.push('Select a roster player and an official watchlist alternative.');
  if(out&&incoming&&out.position!==incoming.position)errors.push('Replacement must have the same FPL position.');
  if(out&&incoming&&plan.roster.filter(p=>p.id!==out.id&&p.clubId===incoming.clubId).length>=3)errors.push('Replacement would exceed three players per club.');
  if(!inputs.confirmed)errors.push('Confirm current bank, selling price and free transfers in FPL.');
  const bank=integer(inputs.bankTenths,0,1000),sale=integer(inputs.saleTenths,1,500),ft=integer(inputs.freeTransfers,0,5);
  if(bank===null||sale===null||ft===null)errors.push('Valid bank, selling price and free-transfer count are required.');
  const balance=bank!==null&&sale!==null&&incoming?.priceTenths!==null&&incoming?.priceTenths!==undefined?bank+sale-incoming.priceTenths:null;
  if(incoming&&incoming.priceTenths===null)errors.push('Incoming price unavailable.');if(balance!==null&&balance<0)errors.push('The move exceeds your confirmed budget.');
  return {feasible:errors.length===0,errors,bankAfterTenths:balance,hit:ft===null?null:ft===0?4:0,verdict:'Single-move feasibility only. No projected gain, transfer instruction, or multi-move/chip optimization.'};
}
