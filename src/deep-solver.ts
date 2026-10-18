import { forecastVortex } from './vortex-analytics.js';
import { validateSquad, type Player, type Position, type SquadSnapshot } from './model.js';

export type Chip = 'none' | 'wildcard' | 'freehit' | 'benchboost' | 'triplecaptain';
export type WeekPlan = {
  gameweek: number; chip: Chip; transfers: {out: number; in: number}[];
  bank: number; freeTransfersNext: number; points: number; captainId: number;
  squadIds: number[]; description: string;
};
export type DeepPlan = {
  horizon: number; expectedTotal: number; baseline: number; gain: number; stages: WeekPlan[];
  approximate: true; model: 'illustrative' | 'verified-input-untrained'; explored: number;
};
type State = { ids:number[]; bank:number; freeTransfers:number; used:Set<Chip>; stages:WeekPlan[]; score:number; rank:number };
type Move = { ids:number[]; bank:number; changes:{out:number;in:number}[] };
const round=(number:number):number=>Number(number.toFixed(2));

/** Best projected formation, not a claim to reproduce FPL auto-subs / captain substitution rules. */
export function selectProjectedEleven(squad:readonly Player[], scores: ReadonlyMap<number,number>, chip: Chip = 'none'):{points:number;captainId:number;benchIds:number[]} {
  const groups = new Map<Position,Player[]>();
  for(const pos of ['GKP','DEF','MID','FWD'] as const) groups.set(pos,squad.filter(player=>player.position===pos).sort((a,b)=>(scores.get(b.id)??0)-(scores.get(a.id)??0)));
  let best = -Infinity, bestCaptain=0, bestBench:number[]=[];
  const keep = (pos:Position,count:number):Player[] => groups.get(pos)!.slice(0,count);
  for(let defenders=3;defenders<=5;defenders++)for(let midfielders=2;midfielders<=5;midfielders++){
    const forwards=10-defenders-midfielders;
    if(forwards<1||forwards>3)continue;
    const selected=[...keep('GKP',1),...keep('DEF',defenders),...keep('MID',midfielders),...keep('FWD',forwards)];
    if(selected.length!==11)continue;
    const captain=selected.reduce((best,player)=>(scores.get(player.id)??0)>(scores.get(best.id)??0)?player:best);
    const captainPoints=scores.get(captain.id)??0;
    const starterPoints=selected.reduce((sum,player)=>sum+(scores.get(player.id)??0),0);
    const bench=squad.filter(player=>!selected.some(member=>member.id===player.id));
    const points=starterPoints+captainPoints*(chip==='triplecaptain'?2:1)+(chip==='benchboost'?bench.reduce((sum,player)=>sum+(scores.get(player.id)??0),0):0);
    if(points>best){best=points;bestCaptain=captain.id;bestBench=bench.map(player=>player.id);}
  }
  if(!Number.isFinite(best))throw new Error('No valid starting eleven');
  return {points:round(best),captainId:bestCaptain,benchIds:bestBench};
}

/** Bounded beam search with candidate transfer and chip schedules, not a globally optimal MILP solution. */
export function solveDeepPlan(players:readonly Player[],squad:SquadSnapshot,startGw:number,horizon:number,beamWidth=7,availableChips:readonly Chip[]=['wildcard','freehit','benchboost','triplecaptain']):DeepPlan {
  if(!Number.isInteger(startGw)||startGw<7||startGw>16||!Number.isInteger(horizon)||horizon<1||horizon>10||startGw+horizon>17)throw new RangeError('Invalid gameweek planning range');
  if(!Number.isInteger(beamWidth)||beamWidth<1||beamWidth>20)throw new RangeError('Invalid beam width');
  if(new Set(availableChips).size!==availableChips.length||availableChips.some(chip=>!['wildcard','freehit','benchboost','triplecaptain'].includes(chip)))throw new Error('Invalid available chip list');
  if(validateSquad(players,squad.selectedIds).length)throw new Error('Invalid initial squad');
  if(!Number.isFinite(squad.bank)||squad.bank<0||squad.bank>30||!Number.isInteger(squad.freeTransfers)||squad.freeTransfers<0||squad.freeTransfers>5)throw new RangeError('Invalid financial state');
  const playerMap=new Map(players.map(player=>[player.id,player]));
  if(playerMap.size!==players.length)throw new Error('Duplicate player ID');
  const scores=new Map<string,number>();
  const scoreFor=(id:number,gw:number):number=>{
    const key=`${id}/${gw}`;
    if(!scores.has(key)){
      const player=playerMap.get(id);
      if(!player)throw new Error('Unknown player ID');
      scores.set(key,forecastVortex(player,gw-6).expectedPoints);
    }
    return scores.get(key)!;
  };
  const fixtureMap=(gw:number):Map<number,number>=>new Map(players.map(player=>[player.id,scoreFor(player.id,gw)]));
  const evaluate=(ids:readonly number[],gw:number,chip:Chip='none')=>selectProjectedEleven(ids.map(id=>playerMap.get(id)!),fixtureMap(gw),chip);
  const makeMoves=(ids:number[],bank:number,gw:number,limit=1):Move[]=>{
    const current=new Set(ids);
    const horizonEnd=startGw+horizon;
    const options: {out:number;in:number;gain:number}[]=[];
    for(const outgoingId of ids){
      const outgoing=playerMap.get(outgoingId)!;
      for(const incoming of players){
        if(current.has(incoming.id)||incoming.position!==outgoing.position||incoming.status==='out'||incoming.price>outgoing.price+bank+0.00001)continue;
        const replaced=ids.map(id=>id===outgoingId?incoming.id:id);
        if(validateSquad(players,replaced).length)continue;
        const gain=Array.from({length:horizonEnd-gw},(_,index)=>scoreFor(incoming.id,gw+index)-scoreFor(outgoingId,gw+index)).reduce((sum,value)=>sum+value,0);
        if(gain<=0)continue;
        options.push({out:outgoingId,in:incoming.id,gain});
      }
    }
    options.sort((a,b)=>b.gain-a.gain||a.out-b.out||a.in-b.in);
    return options.slice(0,limit===1?9:5).map(opt=>({ids:ids.map(id=>id===opt.out?opt.in:id),bank:round(bank+playerMap.get(opt.out)!.price-playerMap.get(opt.in)!.price),changes:[{out:opt.out,in:opt.in}]}));
  };
  const zero:State={ids:[...squad.selectedIds],bank:squad.bank,freeTransfers:squad.freeTransfers,used:new Set(),stages:[],score:0,rank:0};
  let beam:State[]=[zero],explored=0;
  const baseline=Array.from({length:horizon},(_,index)=>evaluate(zero.ids,startGw+index).points).reduce((sum,value)=>sum+value,0);
  const build=(prior:State,gw:number,chip:Chip,move:Move):State=>{
    const changes=move.changes.length;
    const playedIds=move.ids;
    const lineup=evaluate(playedIds,gw,chip);
    const transferCost=chip==='freehit'||chip==='wildcard'?0:Math.max(0,changes-prior.freeTransfers)*4;
    const points=round(lineup.points-transferCost);
    const nextFt=chip==='freehit'||chip==='wildcard'?prior.freeTransfers:Math.min(5,Math.max(0,prior.freeTransfers-changes)+1);
    const effectiveIds=chip==='freehit'?prior.ids:move.ids;
    const effectiveBank=chip==='freehit'?prior.bank:move.bank;
    const updatedUsed=new Set(prior.used);
    if(chip!=='none')updatedUsed.add(chip);
    const stage:WeekPlan={gameweek:gw,chip,transfers:move.changes,bank:round(effectiveBank),freeTransfersNext:nextFt,points,captainId:lineup.captainId,squadIds:[...playedIds],description:chip==='none'?(changes?`${changes} planned transfer${changes>1?'s':''}`:'Roll transfer'):`${chip} scenario · ${changes} tested replacement${changes!==1?'s':''}`};
    const future=gw+1<startGw+horizon?evaluate(effectiveIds,gw+1).points:0;
    return {ids:[...effectiveIds],bank:effectiveBank,freeTransfers:nextFt,used:updatedUsed,stages:[...prior.stages,stage],score:round(prior.score+points),rank:prior.score+points+future*0.22};
  };
  for(let index=0;index<horizon;index++){
    const gw=startGw+index;
    const candidates:State[]=[];
    for(const prior of beam){
      const noMove:Move={ids:[...prior.ids],bank:prior.bank,changes:[]};
      const baseMoves=[noMove,...makeMoves(prior.ids,prior.bank,gw)];
      for(const move of baseMoves){candidates.push(build(prior,gw,'none',move));explored++;}
      // Banked free transfers are preserved when a WC or FH is played.
      const canUseChip=(chip:Chip)=>availableChips.includes(chip)&&!prior.used.has(chip)&&gw!==1;
      if(canUseChip('triplecaptain')){candidates.push(build(prior,gw,'triplecaptain',noMove));explored++;}
      if(canUseChip('benchboost')){candidates.push(build(prior,gw,'benchboost',noMove));explored++;}
      // Heuristic FH/WC roster rebuilds consider up to three legal replacements; never claim unlimited optimization.
      const aggressive=[noMove];
      for(let step=0;step<3;step++){
        const latest=aggressive[aggressive.length-1]!;
        const next=makeMoves(latest.ids,latest.bank,gw,2).find(move=>!latest.changes.some(change=>change.out===move.changes[0]?.out||change.in===move.changes[0]?.in));
        if(!next)break;
        aggressive.push({ids:next.ids,bank:next.bank,changes:[...latest.changes,...next.changes]});
      }
      if(canUseChip('wildcard'))for(const move of aggressive.slice(1)){candidates.push(build(prior,gw,'wildcard',move));explored++;}
      if(canUseChip('freehit') && !(gw===20 && prior.stages.at(-1)?.chip==='freehit'))for(const move of aggressive.slice(1)){candidates.push(build(prior,gw,'freehit',move));explored++;}
    }
    candidates.sort((a,b)=>b.rank-a.rank||b.score-a.score);
    const distinct=new Map<string,State>();
    for(const candidate of candidates){
      const key=`${candidate.ids.join(',')}|${candidate.freeTransfers}|${[...candidate.used].sort().join(',')}`;
      if(!distinct.has(key))distinct.set(key,candidate);
      if(distinct.size>=beamWidth)break;
    }
    beam=[...distinct.values()];
    if(!beam.length)throw new Error('No valid planning path');
  }
  const best=[...beam].sort((a,b)=>b.score-a.score)[0]!;
  return {horizon,expectedTotal:round(best.score),baseline:round(baseline),gain:round(best.score-baseline),stages:best.stages,approximate:true,model:'illustrative',explored};
}