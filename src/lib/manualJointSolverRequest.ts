/** Joint MILP request assembled from explicitly MANAGER-ENTERED team facts.
 *
 * This is NOT official FPL account verification. The server must validate
 * the exact same manual declaration against a NEW live official snapshot
 * before executing, and must never upgrade its provenance to authenticated.
 */
import type { EnrichedPlayer, Snapshot } from './types';
import type { PlannerSimulationOutput } from './repoModel/compassPlanner';
import { buildExactMilpRequest } from './exactMilpBridge';
import { buildJointPayload } from './jointSolverRequest';
import { validateManualJointTeam, type ManualJointTeamInput } from './manualJointTeam';
import type { JointRequest } from './jointChipPathValidation';
import type { ValidatedManualJointTeam } from './manualJointTeam';

export interface ManualJointSolverRequest {
  inputProvenance:'manager-entered-unverified';
  manual:ManualJointTeamInput;
  validated:ValidatedManualJointTeam;
  solver:JointRequest;
}

export function buildManualJointSolverRequest(options:{
  manual:ManualJointTeamInput;
  snapshot:Snapshot;
  players:EnrichedPlayer[];
  planner:PlannerSimulationOutput;
  lockedIds:number[];
  decay:number;
  now?:Date;
}):ManualJointSolverRequest {
  const {manual,snapshot,players,planner,lockedIds,decay}=options;
  const validated=validateManualJointTeam(manual,snapshot,planner.gws.length,options.now);
  const baseline=buildExactMilpRequest({
    snapshot,players,planner,
    squadIds:validated.squadIds,
    bankTenths:validated.bankTenths,
    freeTransfers:validated.freeTransfers,
    sellingPrices:validated.sellingPricesTenths,
    lockedIds,decay,
  });
  const solver=buildJointPayload(baseline,planner,validated.chips);
  if(solver.current_team.current_gameweek!==validated.gameweek)
    throw new RangeError('Manually entered GW is inconsistent with the model horizon.');
  return {
    inputProvenance:'manager-entered-unverified',manual,
    validated,solver,
  };
}
