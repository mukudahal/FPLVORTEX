import type { StoredTransferPlan } from './transferPlansStore';
import type { PlannerSimulationOutput } from './repoModel/compassPlanner';

/** Copy an inspected proposal into a NEW slot. The selected source plan is never edited. */
export function createStrategyPlan(base: StoredTransferPlan, result: PlannerSimulationOutput, id: string, createdAt: string): StoredTransferPlan {
  if (base.startGw !== result.nextGw || !result.strategy.weeks.length || result.strategy.weeks.length > 10)
    throw new RangeError('The proposal no longer matches this planning period. Calculate it again.');
  const transfers = structuredClone(base.transfers);
  const lineups = structuredClone(base.lineups);
  const captains = structuredClone(base.captains);
  const chips = structuredClone(base.chips);
  for (const week of result.strategy.weeks) {
    if (week.moves.length) transfers[week.gw] = week.moves.map(move => ({out:move.outId,in:move.inId}));
    else delete transfers[week.gw];
    lineups[week.gw] = [...week.lineup.starters,...week.lineup.bench];
    captains[week.gw] = {captain:week.lineup.captainId,vice:week.lineup.viceId};
    if (week.chip) chips[week.gw] = week.chip;
    else delete chips[week.gw];
  }
  return {...structuredClone(base),id,name:`Solver GW${base.startGw}–${result.strategy.weeks.at(-1)!.gw}`,transfers,lineups,captains,chips,createdAt,updatedAt:createdAt};
}
