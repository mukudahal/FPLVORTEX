/** Read-only request assembler for the independent WC/FH/BB/TC MILP.
 *
 * Candidate projections come from the SAME freshness-gated live VORTEX
 * planner, not from a private analytics vendor. Manager history, bank and
 * acquisition prices come only from a fresh verified official FPL entry.
 */
import { buildExactMilpRequest } from './exactMilpBridge';
import type { EntryData, EnrichedPlayer, Snapshot } from './types';
import type { PlannerSimulationOutput } from './repoModel/compassPlanner';
import type { JointRequest } from './jointChipPathValidation';
import { verifiedJointManagerState } from './verifiedJointManagerState';
import type { VerifiedChipInventory } from './verifiedChipInventory';

export interface JointSolverRequest {
  entryId: number;
  solver: JointRequest;
  chips: VerifiedChipInventory;
  verifiedAt: string;
}

export function buildJointSolverRequest(params: {
  entry: EntryData;
  snapshot: Snapshot;
  players: EnrichedPlayer[];
  planner: PlannerSimulationOutput;
  squadIds: number[];
  bankTenths: number;
  freeTransfers: number;
  sellingPrices: Record<number, number>;
  lockedIds: number[];
  decay: number;
  now?: Date;
}): JointSolverRequest {
  const {entry, snapshot, players, planner, squadIds, bankTenths, freeTransfers,
    sellingPrices, lockedIds, decay} = params;
  const official = verifiedJointManagerState(entry,squadIds,snapshot.meta.nextEventId,params.now);
  if (official.bankTenths !== bankTenths ||
      official.freeTransfersNow !== freeTransfers ||
      squadIds.some(id => official.sellingPricesTenths[id] !== sellingPrices[id])) {
    throw new RangeError('Planner cash/FT/ownership values differ from the verified official FPL entry.');
  }
  const baseline = buildExactMilpRequest({
    snapshot,players,planner,squadIds,bankTenths,freeTransfers,sellingPrices,lockedIds,decay,
  });
  const ranked = baseline.players
    .filter(p => !squadIds.includes(p.player_id))
    .sort((a,b) => {
      const net = (p:typeof a) => Object.values(p.xpts_by_gw)
        .reduce((sum,value,i)=>sum+value*Math.pow(decay,i),0);
      return net(b)-net(a) || a.current_price-b.current_price || a.player_id-b.player_id;
    });
  // The Python joint research CLI caps candidate count at 40. The entire
  // original squad is always retained, even if low-forecast or unavailable.
  const shortlist = [
    ...baseline.players.filter(p => squadIds.includes(p.player_id)),
    ...ranked.slice(0,25),
  ];
  if (shortlist.length !== 40) {
    // Fewer than 40 is legitimate; never create filler fake players.
    if (shortlist.length < 15) throw new RangeError('Joint solver has no legal starting squad.');
  }
  const joint:JointRequest = {
    ...baseline,
    players:shortlist,
    settings:{
      ...baseline.settings,
      solutions_requested:1,
      scoring_chip_halves:official.chips.scoring_chip_halves,
      squad_chip_halves:official.chips.squad_chip_halves,
      first_half_fh_used_gw19:official.chips.first_half_fh_used_gw19,
      forced_chip_uses:{},
    },
  };
  return {
    entryId:official.entryId,solver:joint,
    chips:official.chips,verifiedAt:official.verifiedAt,
  };
}
