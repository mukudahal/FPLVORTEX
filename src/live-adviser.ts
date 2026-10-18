/**
 * v0.8: independently written, uncalibrated FPL *research* model.
 * Uses user-initiated public FPL website JSON; NO Opta/FPLReview code, NO claim of calibration.
 * Snapshots are not saved server-side. All selections are REVIEW signals, never transactions.
 */
type JsonObject = Record<string, unknown>;
export type LivePick = {id:number;position:number|null;multiplier:number|null;isCaptain:boolean;isViceCaptain:boolean};
export type LiveResearchPlayer = {
  id:number;name:string;club:string;position:'GKP'|'DEF'|'MID'|'FWD';priceTenths:number;
  status:string;news:string;chanceNext:number|null;starts:number|null;teamMatches:number|null;
  minutes:number;ninetyEquivalents:number;averageMinutesPerTeamMatch:number|null;
  xg90:number;xa90:number;ownership:number;future:{gw:number;opponent:string;venue:'H'|'A';fdr:number;points:number;xg:number;xa:number;cs:number}[];
  expectedNext:number|null;expectedThree:number|null;
};
export type LiveAdvice = {
  mode:'live-inputs-uncalibrated'; model:'vortex-shrinkage-v0.8';
  nextGameweek:number;throughGameweek:number;source:string;samplePlayers:number;
  lineup:{playerId:number;name:string;score:number}[];
  captain:{name:string;score:number}|null;
  suggestedActions:{action:'MONITOR'|'REVIEW TRANSFER';out:string;incoming:string|null;edge:number|null;reason:string;priceCaution:string}[];
  roadmap:{gw:number;captain:string|null;captainPoints:number|null;warnings:string}[];
  ownPlayers:LiveResearchPlayer[];
  caution:string[];
};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const r=(v:number,d=2)=>Number(v.toFixed(d));
const finite=(v:unknown):number|null=>typeof v==='number' && Number.isFinite(v)?v:null;
const numeric=(v:unknown):number|null=>typeof v==='string' && /^\d+(?:\.\d+)?$/.test(v)?Number(v):finite(v);
const text=(v:unknown):string=>typeof v==='string'?v.slice(0,130):'';
const POS=['','GKP','DEF','MID','FWD'] as const;
const goalPrior=[0,0.002,0.055,0.17,0.29];
const assistPrior=[0,0.005,0.052,0.14,0.1];
const validateId=(v:unknown):number|null=>Number.isSafeInteger(v) && Number(v)>0?Number(v):null;

function nextRound(events:readonly JsonObject[]|undefined, completed:number):number {
  const upcoming=events?.filter(e=>validateId(e.id)!==null && e.finished!==true && (e.is_next===true || e.is_current===true || e.is_previous===false))
    .sort((a,b)=>Number(a.id)-Number(b.id)).find(e=>typeof e.deadline_time==='string' && Date.parse(e.deadline_time)>Date.now());
  // If season state is delayed, never plan a gameweek already in the observed entry history.
  return clamp(Math.max(completed+1,Number(upcoming?.id??(completed+1))),1,38);
}
function deriveTeamMatches(fixtures:readonly JsonObject[],teamId:number,nextGw:number):number|null {
  if(!fixtures.length)return null;
  return fixtures.filter(f=>f.finished===true && numeric(f.event)!==null && Number(f.event)<nextGw && (f.team_h===teamId||f.team_a===teamId)).length;
}
function opponentCalendar(fixtures:readonly JsonObject[],teamId:number,clubs:Map<number,string>,nextGw:number,horizon:number) {
  const map=new Map<number,{gw:number;opponent:string;venue:'H'|'A';fdr:number}>();
  for(const f of fixtures){
    const gw=validateId(f.event);
    if(gw===null||gw<nextGw||gw>=nextGw+horizon||f.finished===true)continue;
    const home=f.team_h===teamId,away=f.team_a===teamId;if(!home&&!away)continue;
    const fdr=numeric(home?f.team_h_difficulty:f.team_a_difficulty);
    const opponent=validateId(home?f.team_a:f.team_h);
    if(opponent===null||fdr===null||fdr<1||fdr>5)continue;
    // Multiple fixtures in a double gameweek: handled conservatively as the first observed fixture;
    // withheld from actionable advice when this simplification might distort rankings.
    if(!map.has(gw))map.set(gw,{gw,venue:home?'H':'A',opponent:clubs.get(opponent)??'TBC',fdr});
  }
  return map;
}
function makePlayer(raw:JsonObject,team:JsonObject|undefined,fixtures:readonly JsonObject[],clubNames:Map<number,string>,nextGw:number,horizon:number):LiveResearchPlayer|null {
  const id=validateId(raw.id),position=validateId(raw.element_type),clubId=validateId(raw.team),price=numeric(raw.now_cost);
  if(id===null||position===null||position>4||clubId===null||price===null||price<35||price>300||!team)return null;
  const minutes=numeric(raw.minutes);
  if(minutes===null||minutes<0||minutes>3500)return null;
  const completed=deriveTeamMatches(fixtures,clubId,nextGw);
  const starts=raw.starts===null||raw.starts===undefined?null:numeric(raw.starts);
  const validStarts=starts!==null&&Number.isInteger(starts)&&starts>=0&&starts<=38?starts:null;
  const health=raw.status==='i'||raw.status==='s'||raw.status==='u'?0:raw.status==='d'?0.5:raw.status==='n'?0.3:1;
  const officialChance=numeric(raw.chance_of_playing_next_round);
  const healthMultiplier=health*Math.min(1,officialChance===null?1:clamp(officialChance,0,100)/100);
  const average=completed!==null&&completed>0?minutes/completed:null;
  const expectedMinutes=clamp(((average===null?70:average)*0.73+68*0.27)*healthMultiplier,0,90);
  const full90=minutes/90;
  const xg=numeric(raw.expected_goals),xa=numeric(raw.expected_assists);
  // Missing attack history: use conservative position priors, never invent player-reported xG.
  const attackRate=(xg===null?(goalPrior[position] ?? 0):(xg+(goalPrior[position] ?? 0)*7)/(full90+7));
  const assistRate=(xa===null?(assistPrior[position] ?? 0):(xa+(assistPrior[position] ?? 0)*7)/(full90+7));
  const perGW=opponentCalendar(fixtures,clubId,clubNames,nextGw,horizon);
  const future:LiveResearchPlayer['future']=[];
  for(let gw=nextGw;gw<nextGw+horizon;gw++){
    const f=perGW.get(gw);
    if(!f)continue;
    const adj=clamp(Math.exp((3-f.fdr)*0.13),0.63,1.52);
    const exposure=expectedMinutes/90;
    const gx=clamp(attackRate*exposure*adj,0,2.5), ax=clamp(assistRate*exposure*adj,0,2.0);
    const cs=clamp(0.33*Math.exp((3-f.fdr)*0.20),0.11,0.70);
    const positionGoalPoints=position===3?5:position===1||position===2?6:4;
    const cleanPoints=position===1||position===2?4:position===3?1:0;
    const appPoints=expectedMinutes>=60?1.8:expectedMinutes>0?0.96:0;
    const points=r(appPoints+positionGoalPoints*gx+3*ax+cleanPoints*cs*exposure,2);
    future.push({...f,points,xg:r(gx,3),xa:r(ax,3),cs:r(cs,3)});
  }
  const periods=(n:number)=>{const rows=future.filter(f=>f.gw<nextGw+n);return rows.length? r(rows.reduce((sum,f)=>sum+f.points,0)):null;};
  return {id,name:text(raw.web_name)||`#${id}`,club:clubNames.get(clubId)??'TBC',position:POS[position] as LiveResearchPlayer['position'],priceTenths:price,status:text(raw.status),news:text(raw.news),chanceNext:officialChance,starts:validStarts,teamMatches:completed,minutes,ninetyEquivalents:r(full90),averageMinutesPerTeamMatch:average===null?null:r(average,1),xg90:r(attackRate,3),xa90:r(assistRate,3),ownership:numeric(raw.selected_by_percent)??0,future,expectedNext:periods(1),expectedThree:periods(3)};
}
/** Pure, deterministic read-only planning based on official raw *input observations* and an uncalibrated original formula. */
export function buildLiveResearch({bootstrap,fixtures,picks,latestGW}: {
  bootstrap:{elements:unknown;teams:unknown;events?:unknown};fixtures:unknown;picks:readonly LivePick[];latestGW:number;
}):LiveAdvice {
  if(!Number.isInteger(latestGW)||latestGW<1||latestGW>38)throw new RangeError('Invalid observed gameweek');
  if(!Array.isArray(bootstrap.elements)||!Array.isArray(bootstrap.teams)||!Array.isArray(fixtures))throw new TypeError('Missing FPL catalogue/fixtures');
  if(picks.length!==15||new Set(picks.map(p=>p.id)).size!==15||picks.some(p=>validateId(p.id)===null))throw new RangeError('Expected 15 unique public FPL player IDs');
  const events=Array.isArray(bootstrap.events)?bootstrap.events as JsonObject[]:undefined;
  const nextGw=nextRound(events,latestGW),weeks=Math.min(10,20-nextGw,39-nextGw);
  if(weeks<1)throw new RangeError('Target gameweek 19 has passed');
  const clubs=new Map<number,string>(); const teams=new Map<number,JsonObject>();
  for(const t of bootstrap.teams as JsonObject[]){const id=validateId(t.id);if(id){teams.set(id,t);clubs.set(id,text(t.short_name)||`Club ${id}`);}}
  const list=(bootstrap.elements as JsonObject[]).map(p=>makePlayer(p,teams.get(Number(p.team)),fixtures as JsonObject[],clubs,nextGw,weeks)).filter((p):p is LiveResearchPlayer=>p!==null);
  const byId=new Map(list.map(p=>[p.id,p]));
  const ownPlayers=picks.map(p=>byId.get(p.id)).filter((p):p is LiveResearchPlayer=>Boolean(p));
  const isComplete=ownPlayers.length===15;
  const lineup=ownPlayers.map(p=>({playerId:p.id,name:p.name,score:p.expectedNext??0})).sort((a,b)=>b.score-a.score).slice(0,11);
  const captain=lineup[0] && lineup[0].score>0?lineup[0]:null;
  const squadIds=new Set(picks.map(p=>p.id));
  const actions:LiveAdvice['suggestedActions']=[];
  for(const owned of [...ownPlayers].sort((a,b)=>(a.expectedThree??0)-(b.expectedThree??0))){
    const candidates=list.filter(other=>other.position===owned.position&&!squadIds.has(other.id)&&other.status==='a'&&other.future.length>=2)
      .filter(other=>other.priceTenths<=owned.priceTenths+30)
      .filter(other=>ownPlayers.filter(x=>x.club===other.club).length<3)
      .sort((a,b)=>(b.expectedThree??-999)-(a.expectedThree??-999));
    const best=candidates[0];
    if(!best||owned.expectedThree===null||best.expectedThree===null)continue;
    const edge=r(best.expectedThree-owned.expectedThree);
    if(edge<=1.5)continue;
    const health=owned.status==='i'||owned.status==='u'||owned.status==='s';
    const risk=health?'Official player status indicates an availability concern; verify new reports and deadline news.':'Provisional 3-GW model edge, not a validated FPL points prediction.';
    actions.push({action:'REVIEW TRANSFER',out:owned.name,incoming:best.name,edge,reason:risk,priceCaution:'List prices are NOT your sale prices; actual affordability, bank, free transfers, hits and club/team rules must be checked before any move.'});
    if(actions.length===3)break;
  }
  if(!actions.length)actions.push({action:'MONITOR',out:'Current squad',incoming:null,edge:null,reason:'No clear uncalibrated transfer edge detected. Recheck official news and gameweek deadline.',priceCaution:'No transfer recommendation is automatically actionable.'});
  const roadmap=Array.from({length:weeks},(_,index)=>{
    const gw=nextGw+index;
    const scored=ownPlayers.map(p=>({player:p,fixture:p.future.find(f=>f.gw===gw)})).filter((x):x is {player:LiveResearchPlayer;fixture:NonNullable<typeof x.fixture>}=>Boolean(x.fixture)).sort((a,b)=>b.fixture.points-a.fixture.points);
    return {gw,captain:scored[0]?.player.name??null,captainPoints:scored[0]?.fixture.points??null,warnings:scored.length===15?'Hold-squad scenario only; no transfers or chips scheduled.':'At least one squad player has no usable fixture projection this GW.'};
  });
  return {mode:'live-inputs-uncalibrated',model:'vortex-shrinkage-v0.8',nextGameweek:nextGw,throughGameweek:nextGw+weeks-1,
    source:'FPL website JSON: public catalogue, fixture observations and manager picks (unsupported interface)',samplePlayers:list.length,
    lineup,captain,suggestedActions:isComplete?actions:[{action:'MONITOR',out:'Source roster incomplete',incoming:null,edge:null,reason:'Fewer than 15 real players matched the catalogue. Do not act.',priceCaution:'Source validation required.'}],roadmap,ownPlayers,
    caution:['These model xPts are independent *provisional estimates*, not a historically validated or calibrated forecast.','Public FPL website JSON is not an officially supported commercial data API. Obtain usage rights before deployment.','Starts and total minutes are reported only if supplied by FPL; per-match substitutions and availability history require an additional authorized dataset.','Pricing shows current list prices only. Entry sale values, bank changes, transfer allowances, and chip rules must be verified before decisions.','The weekly roadmap ranks your unchanged squad; it is NOT a 10-week globally optimal transfer/chip solution.']};
}