/** Retrospective decision replay. Never emits or backdates a recommendation archive. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { evaluateForecastArchive } from './evaluate-forecast-archive';
import { reconcilePublicFinances } from './verify-personal-state';
import { enrichPlayers, toRepoElement } from '../src/lib/analytics';
import { toRepoFixtures, toRepoTeams } from '../src/lib/fixtures';
import { positionToType, solveLineupTS } from '../src/lib/repoModel/fplReviewSimulator';
import { runPlannerSimulation } from '../src/lib/repoModel/compassPlanner';
import { scoreLineup } from '../src/lib/repoModel/monteCarlo';
import { productionModelVersion } from '../server/forecastArchive';
import type { Snapshot } from '../src/lib/types';

const [root,version,dir,entryText]=process.argv.slice(2);
if (!root||!version||!dir||!/^\d+$/.test(entryText)) throw new Error('Supply archive, model version, public outcome directory and entry ID.');
const read=async<T>(file:string):Promise<T>=>JSON.parse(await readFile(join(dir,file+'.json'),'utf8'));
type FinanceArgs=Parameters<typeof reconcilePublicFinances>;
const profile=await read<{id:number;started_event:number}>('entry-profile');
if (profile.id!==Number(entryText) || version!==await productionModelVersion()) throw new Error('Unmatched manager or model version.');
const history=await read<FinanceArgs[4]>('entry-history');
const transfers=await read<FinanceArgs[5]>('entry-transfers');
const initial=await read<FinanceArgs[2]>('entry-gw'+profile.started_event);
const weeks=(await evaluateForecastArchive(root,version)).selected;
const dates=[];
for (const w of weeks) {
  const f=JSON.parse(gunzipSync(await readFile(w.file)).toString()) as {snapshot:Snapshot; predictions:{playerId:number;gameweeks:{gw:number;points:number|null}[]}[]};
  const snapshot=f.snapshot,prior=snapshot.meta.currentEventId;
  if (w.gw!==prior+1 || prior<profile.started_event) continue;
  const picks=await read<FinanceArgs[2]>('entry-gw'+prior);
  if (picks.active_chip==='freehit') {dates.push({gw:w.gw,reason:'Previous public squad temporary. Permanent opening state unknown.'});continue;}
  const preHistory={current:history.current.filter(g=>g.event<=prior),chips:history.chips?.filter(c=>c.event<=prior)};
  const ledger=transfers.filter(t=>t.event<=prior && Date.parse(t.time)<Date.parse(w.computedAt));
  // All features below come from the pre-deadline snapshot and earlier public deadlines.
  const state=reconcilePublicFinances(snapshot,profile.started_event,picks,initial,preHistory,ledger);
  const squad=picks.picks.map(p=>p.element),players=enrichPlayers(snapshot,'balanced');
  const nodes=new Map(players.map(p=>[p.id,{id:p.id,type:positionToType(p.position),name:p.name,team:p.teamId,cost:p.cost}]));
  const result=runPlannerSimulation({players,currentSquadIds:squad,bankTenths:state.bank,freeTransfersNow:state.freeTransfers,
    sellingPrices:state.prices,chipsUsed:state.chipsUsed,chipHistoryKnown:!!state.chipsUsed,localForecastsOnly:true,maxNormalMoves:3,draws:100,
    nextGw:w.gw,horizon:5,horizonOnly:true,repoTeams:toRepoTeams(snapshot.teams),repoFixtures:toRepoFixtures(snapshot.fixtures),
    repoElements:snapshot.players.map(toRepoElement),forecastAsOf:w.computedAt,completedEvents:snapshot.gameweeks.filter(g=>g.finished).length});
  const mean=result.forecastByGw[w.gw];
  for(const p of f.predictions){
    const original=p.gameweeks.find(g=>g.gw===w.gw)?.points;
    if(original!=null && Math.abs(original-mean[p.playerId])>.011) throw new Error('Frozen primary means do not reconcile.');
  }
  const hold=solveLineupTS(squad,nodes,mean);
  const officialMean=Object.fromEntries(snapshot.players.map(p=>[p.id,p.epNext]));
  const official=solveLineupTS(squad,nodes,officialMean);
  const advice=result.strategy.weeks[0],noChip=result.transferWeeks[0];
  const finished=await read<{elements:{id:number;stats:{total_points:number;played:boolean}}[]}>(w.season.replace('/','-')+'-gw'+w.gw);
  const scores=new Map(finished.elements.map(p=>[p.id,p.stats]));
  const facts={pts:(id:number)=>scores.get(id)!.total_points,played:(id:number)=>scores.get(id)!.played,position:(id:number)=>nodes.get(id)!.type};
  for(const id of new Set([...squad,...noChip.squad,...advice.squad])){
    const s=scores.get(id);if(!s||typeof s.played!=='boolean'||!Number.isInteger(s.total_points))throw new Error('Incomplete realised outcome.');
  }
  const capScore=(l:typeof hold)=>facts.played(l.captainId)?facts.pts(l.captainId):facts.played(l.viceId)?facts.pts(l.viceId):0;
  const held=scoreLineup(hold,facts),actual=scoreLineup(advice.lineup,facts,advice.chip)-advice.hitCost;
  const actualNoChip=scoreLineup(noChip.lineup,facts)-noChip.hitCost;
  dates.push({season:w.season,gw:w.gw,inputId:w.inputId,forecastInputAt:w.computedAt,priorPublicPicksGw:prior,
    squad,bank:state.bank,freeTransfers:state.freeTransfers,
    captainOnFixedSquad:{vortex:hold.captainId,vortexRealised:capScore(hold),officialBaseline:official.captainId,officialRealised:capScore(official),
      exPostBestPlayedHolding:Math.max(...squad.filter(facts.played).map(facts.pts))},
    selectedChip:advice.chip??null,transfers:advice.moves,hit:advice.hitCost,expectedNet:advice.netXPts,
    realisedJointAdvice:actual,realisedHold:held,realisedNoChipTransfer:actualNoChip,transferVsHold:actualNoChip-held,jointVsHold:actual-held,
    sameXIScoringChipEffect:advice.chip==='bb'||advice.chip==='tc'?actual-(scoreLineup(advice.lineup,facts)-advice.hitCost):null});
}
console.log(JSON.stringify({entryId:profile.id,modelVersion:version,computedAt:new Date().toISOString(),dates,
  limitations:['Policies were reconstructed after the events. These are counterfactuals on the previous published squad, never records of advice the manager received.',
    'Outcome and public manager history were downloaded later and may include official corrections. Each week starts from the real preceding deadline and is evaluated independently; do not compound these into a five-week path.',
    'Chip effects require eligible played chips. A horizon-clipped five-week decision replay need not match a longer chip expiry search. Effective ownership, future rival decisions and rank effects are not identified.']},null,2));
