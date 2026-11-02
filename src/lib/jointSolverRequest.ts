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
  const joint = buildJointPayload(baseline,planner,official.chips);
  return {
    entryId:official.entryId,solver:joint,
    chips:official.chips,verifiedAt:official.verifiedAt,
  };
}

/** Shared candidate-limited exact formulation; manager authorization is
 * deliberately separate. Manual data must never be cast to official. */
export function buildJointPayload(
  baseline:ReturnType<typeof buildExactMilpRequest>,
  planner:PlannerSimulationOutput,
  chips:VerifiedChipInventory,
):JointRequest {
  const ranked = baseline.players
    .filter(p => !squadIds.includes(p.player_id))
    .sort((a,b) => {
      const net = (p:typeof a) => Object.values(p.xpts_by_gw)
        .reduce((sum,value,i)=>sum+value*Math.pow(decay,i),0);
      return net(b)-net(a) || a.current_price-b.current_price || a.player_id-b.player_id;
    });
  // Empirical P0-A09 CI: the deterministic 30-player/10-GW all-chip
  // optimization obtained a primal within 5 seconds; unrestricted 40/10
  // sometimes obtained none in 10 seconds. Keep the exact *formulation*
  // but explicitly bound its candidate shortlist more tightly on 8–10 GWs.
  // All original 15 owners are ALWAYS retained. Do not invent candidates.
  const candidateLimit = planner.gws.length >= 8 ? 30 : 40;
  const owned = baseline.players.filter(p => squadIds.includes(p.player_id));
  const outsiders: typeof ranked = [];
  const selected = new Set<number>();
  // Keep positional alternatives for WC/FH legality instead of filling
  // every non-owned slot with midfielders simply because their xPts is high.
  const positionalMinimums: Array<['GK' | 'DEF' | 'MID' | 'FWD', number]> = [
    ['GK', 1], ['DEF', 3], ['MID', 3], ['FWD', 2],
  ];
  for (const [position, count] of positionalMinimums) {
    for (const candidate of ranked.filter(p => p.position === position).slice(0, count)) {
      if (!selected.has(candidate.player_id)) {
        outsiders.push(candidate);
        selected.add(candidate.player_id);
      }
    }
  }
  for (const candidate of ranked) {
    if (owned.length + outsiders.length >= candidateLimit) break;
    if (!selected.has(candidate.player_id)) {
      outsiders.push(candidate);
      selected.add(candidate.player_id);
    }
  }
  const shortlist = [...owned, ...outsiders];
  if (shortlist.length < 15 || shortlist.length > candidateLimit) {
    throw new RangeError('Joint Solver candidate shortlist is not a legal bounded subset.');
  }
  const joint:JointRequest = {
    ...baseline,
    players:shortlist,
    settings:{
      ...baseline.settings,
      solutions_requested:1,
      scoring_chip_halves:chips.scoring_chip_halves,
      squad_chip_halves:chips.squad_chip_halves,
      first_half_fh_used_gw19:chips.first_half_fh_used_gw19,
      forced_chip_uses:{},
    },
  };
  return joint;
}
