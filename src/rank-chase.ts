import { solveDeepPlan, type Chip, type DeepPlan, type WeekPlan } from './deep-solver.js';
import { validateSquad, type Player, type SquadSnapshot } from './model.js';

export const TARGET_RANK = 5000;
export const TARGET_GW = 19;
export const AVAILABLE_CHIPS = ['wildcard','freehit','benchboost','triplecaptain'] as const;
export type StrategyRisk = 'conservative'|'balanced'|'aggressive';
export type RankChaseProfile = {
  entryId: number|null; overallRank: number|null; overallPoints: number|null;
  hypotheticalGw19Points: number|null; risk: StrategyRisk; availableChips: Chip[];
};
export const blankRankChaseProfile: RankChaseProfile = {
  entryId:null, overallRank:null, overallPoints:null, hypotheticalGw19Points:null,
  risk:'balanced', availableChips:[]
};
export function parseRankChaseProfile(raw: unknown): RankChaseProfile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {...blankRankChaseProfile,availableChips:[]};
  const value=raw as Record<string,unknown>;
  const optionalInt=(number:unknown,max:number):number|null=>typeof number==='number'&&Number.isSafeInteger(number)&&number>=0&&number<=max?number:null;
  const chips=Array.isArray(value.availableChips)
    ? AVAILABLE_CHIPS.filter(chip=>(value.availableChips as unknown[]).includes(chip))
    : [];
  return {
    entryId:optionalInt(value.entryId,999999999)||null,
    overallRank:optionalInt(value.overallRank,20000000)||null,
    overallPoints:optionalInt(value.overallPoints,5000),
    hypotheticalGw19Points:optionalInt(value.hypotheticalGw19Points,5000),
    risk:['conservative','balanced','aggressive'].includes(String(value.risk))?value.risk as StrategyRisk:'balanced',
    availableChips:chips
  };
}
export type AdviceAction='HOLD / ROLL'|'TRANSFER SCENARIO'|'CHIP SCENARIO'|'MONITOR';
export type RankChaseAdvice={
  plan:DeepPlan; first:WeekPlan; action:AdviceAction; description:string;
  planningUntilGW:number; remainingToTarget:number; targetGW:number; targetRank:number;
  rankGap:number|null; hypotheticalPointsPerWeek:number|null;
  riskThreshold:number; warnings:string[];
};
/**
 * Deterministic, explicitly illustrative planning. This is NOT a probability of reaching a rank:
 * rank-point conversion needs authenticated current standings and historical distributions.
 * Search covers at most GW7–GW16 until we have rights-cleared player forecasts beyond GW16.
 */
export function buildRankChaseAdvice(players:readonly Player[],squad:SquadSnapshot,currentGW:number,profile:RankChaseProfile):RankChaseAdvice {
  if (!Number.isInteger(currentGW)||currentGW<7||currentGW>16) throw new RangeError('Illustrative player horizon only covers GW7–GW16');
  if(validateSquad(players,squad.selectedIds).length)throw new Error('Enter a valid 15-player squad before planning');
  const weeks=Math.min(10,17-currentGW,TARGET_GW-currentGW+1);
  const plan=solveDeepPlan(players,squad,currentGW,weeks,7,profile.availableChips);
  const first=plan.stages[0]!;
  const threshold:Record<StrategyRisk,number>={conservative:4,balanced:2,aggressive:0.8};
  const riskThreshold=threshold[profile.risk];
  const weekOneUpside=plan.gain;
  let action:AdviceAction='MONITOR';
  if(first.chip!=='none')action='CHIP SCENARIO';
  else if(first.transfers.length)action='TRANSFER SCENARIO';
  else action='HOLD / ROLL';
  if (weekOneUpside<riskThreshold && action!=='HOLD / ROLL') action='MONITOR';
  const description=action==='MONITOR'
    ? `This ${profile.risk} strategy requires a ${riskThreshold.toFixed(1)}-point simulated advantage before taking the modeled move seriously; do not act on an unverified marginal edge.`
    : action==='HOLD / ROLL'
    ? 'The bounded search currently prefers saving the transfer. Reassess when team news and deadline data are available.'
    : action==='CHIP SCENARIO'
      ? `The model tests ${first.chip} in GW${first.gameweek}; confirm actual chip availability and this season's deadline rules before acting.`
      : `The illustrative solver tests ${first.transfers.length} transfer in GW${first.gameweek}. Check expected minutes, injuries, price changes and team sheets before acting.`;
  const gaps=profile.overallRank===null?null:Math.max(0,profile.overallRank-TARGET_RANK);
  const remaining=TARGET_GW-currentGW+1;
  const required=profile.hypotheticalGw19Points!==null&&profile.overallPoints!==null
    ? Math.max(0,(profile.hypotheticalGw19Points-profile.overallPoints)/remaining):null;
  const warnings=[
    'Illustrative player projections; not verified live FPL recommendations. Rank/score can be entered or fetched on demand, but player projections and simulated squad are not live FPL synced.',
    'No statistical probability of reaching the top 5,000 can be given without real rank/points distributions and a validated player model.',
    'Model prices are not verified purchase/sale values; chip, auto-sub and transfer rules still require production verification.'
  ];
  if(plan.stages.at(-1)!.gameweek<TARGET_GW)warnings.push(`The player projection feed ends at GW${plan.stages.at(-1)!.gameweek}; the route to GW19 requires updated forecasts and weekly re-optimization.`);
  if(weekOneUpside<riskThreshold)warnings.push(`The simulated route gains only ${weekOneUpside.toFixed(1)} points over a hold-only baseline; your ${profile.risk} threshold is ${riskThreshold.toFixed(1)} points for a meaningful *review signal*, not a guarantee.`);
  return {plan,first,action,description,planningUntilGW:plan.stages.at(-1)!.gameweek,remainingToTarget:remaining,targetGW:TARGET_GW,targetRank:TARGET_RANK,rankGap:gaps,hypotheticalPointsPerWeek:required,riskThreshold,warnings};
}