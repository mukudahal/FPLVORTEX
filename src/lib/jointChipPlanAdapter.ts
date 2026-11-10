/** Explicit save-new mapping for a fully verified joint-chip proposal.
 *
 * Importantly, Transfer Lab represents FH as one-week transfer swaps
 * plus the FH chip, then restores the permanent squad at the next GW.
 * Do not write permanent transfer actions on FH weeks.
 */
import type { StoredTransferPlan } from './transferPlansStore';
import type { JointRequest, ComparedJointPlan, JointWeek } from './jointChipPathValidation';
import type { JointChipName } from './verifiedChipInventory';

const labels: Record<JointChipName,'wc'|'fh'|'bb'|'tc'> = {
  wildcard:'wc',free_hit:'fh',bench_boost:'bb',triple_captain:'tc',
};

function samePositionPairs(
  out: readonly number[], incoming: readonly number[],
  typeById: Map<number,string>,
): Array<{out:number;in:number}> {
  if(out.length!==incoming.length) throw new RangeError('Transfer pairing is incomplete.');
  const available=[...incoming];
  return out.map(outId=>{
    const index=available.findIndex(id=>typeById.get(id)===typeById.get(outId));
    if(index<0) throw new RangeError('Joint strategy contains unmatched transfer positions.');
    return {out:outId,in:available.splice(index,1)[0]};
  });
}

export function createReviewedJointChipPlan(params:{
  request:JointRequest;
  path:ComparedJointPlan;
  id:string;
  name:string;
  createdAt:string;
  sourceProvenance?:'manager-entered-unverified'|'authenticated-current-team';
}):StoredTransferPlan {
  const {request,path,id,name,createdAt,sourceProvenance}=params;
  if(!id.trim()||!name.trim()||!Number.isFinite(Date.parse(createdAt)))
    throw new RangeError('New plan requires a valid identity, title and timestamp.');
  const byPosition=new Map(request.players.map(p=>[p.player_id,p.position]));
  const transfers:StoredTransferPlan['transfers']={};
  const lineups:StoredTransferPlan['lineups']={};
  const captains:StoredTransferPlan['captains']={};
  const chips:StoredTransferPlan['chips']={};
  const squad=request.current_team.squad_player_ids;
  if(new Set(squad).size!==15)throw new RangeError('Invalid base squad for joint plan.');
  if(path.plan.gameweeks.length!==request.settings.end_gw-request.settings.start_gw+1)
    throw new RangeError('Incomplete full-horizon joint-chip proposal.');
  for(const week of path.plan.gameweeks as JointWeek[]) {
    const outgoing=week.chip==='free_hit'?
      week.temporary_transfers_out:week.transfers_out;
    const incoming=week.chip==='free_hit'?
      week.temporary_transfers_in:week.transfers_in;
    const pairs=samePositionPairs(outgoing,incoming,byPosition);
    if(pairs.length)transfers[week.gw]=pairs;
    lineups[week.gw]=[...week.starters,...week.bench];
    captains[week.gw]={captain:week.captain,vice:week.vice_captain};
    if(week.chip)chips[week.gw]=labels[week.chip];
  }
  const saleValues:Record<number,number>={};
  for(const id of squad){
    const p=request.players.find(player=>player.player_id===id);
    if(typeof p?.selling_price!=='number'||!Number.isFinite(p.selling_price))
      throw new RangeError('Original verified selling price is missing.');
    saleValues[id]=Math.round(p.selling_price*10);
  }
  return{
    id,name,startGw:request.settings.start_gw,baseSquad:[...squad],
    baseBankTenths:Math.round(request.current_team.bank*10),
    baseFreeTransfers:request.current_team.free_transfers,
    sellingPrices:saleValues,transfers,lineups,captains,chips,
    lockedPlayerIds:[...request.settings.locked_players],
    createdAt,updatedAt:createdAt,sourceProvenance,
  };
}
