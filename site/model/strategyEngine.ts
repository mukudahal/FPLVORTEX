import { advanceTransferState, validateSeasonChipPlan, validateSquad, type SeasonChip, type SquadCandidate, type SeasonChipUse } from "./seasonRules";
import { sellingPrice } from "./scoring";

export interface PurchasedPlayer extends SquadCandidate { boughtAtTenths: number }
export interface TransferSwap { out: number; in: SquadCandidate }
export interface TransferLedger {
  squad: PurchasedPlayer[]; bankTenths: number; freeTransfers: number;
  gw: number; chipsUsed: SeasonChipUse[]; totalHits: number;
}
export interface TransferOutcome { valid: boolean; errors: string[]; next: TransferLedger | null; hitPoints: number }

/** Atomic changes: invalid transfers do not mutate the original squad or bank. */
export function applyTransfers(initial: TransferLedger, moves: readonly TransferSwap[], chip?: SeasonChip): TransferOutcome {
  const errors: string[] = [];
  if (initial.gw < 1 || initial.gw > 38 || !Number.isInteger(initial.bankTenths) || initial.bankTenths < 0) errors.push("Invalid starting ledger.");
  const usedChips = chip ? [...initial.chipsUsed, { gw: initial.gw, chip }] : [...initial.chipsUsed];
  errors.push(...validateSeasonChipPlan(usedChips));
  if (new Set(moves.map((move) => move.out)).size !== moves.length) errors.push("Cannot sell one player twice.");
  if (new Set(moves.map((move) => move.in.id)).size !== moves.length) errors.push("Cannot buy one player twice.");
  const outgoing = new Set(moves.map((move) => move.out));
  for (const move of moves) if (!initial.squad.some((player) => player.id === move.out)) errors.push(`Player ${move.out} is not owned.`);
  if (errors.length) return { valid: false, errors, next: null, hitPoints: 0 };
  const remaining = initial.squad.filter((player) => !outgoing.has(player.id));
  const spendableTenths = initial.bankTenths + initial.squad.filter((player) => outgoing.has(player.id)).reduce((sum, p) => sum + sellingPrice(p.boughtAtTenths, p.priceTenths), 0);
  const buys = moves.map(({ in: player }) => ({ ...player, boughtAtTenths: player.priceTenths }));
  const bankTenths = spendableTenths - buys.reduce((sum, player) => sum + player.priceTenths, 0);
  if (bankTenths < 0) errors.push(`Not enough funds: short ${-bankTenths} tenths.`);
  const squad = [...remaining, ...buys];
  const squadErrors = validateSquad(squad, Math.max(0, bankTenths) + squad.reduce((sum, player) => sum + player.priceTenths, 0));
  errors.push(...squadErrors.errors);
  if (errors.length) return { valid: false, errors, next: null, hitPoints: 0 };
  const transfer = advanceTransferState(initial.freeTransfers, moves.length, chip);
  return { valid: true, errors: [], hitPoints: transfer.hitPoints,
    next: { squad: chip === "fh" ? [...initial.squad] : squad, bankTenths: chip === "fh" ? initial.bankTenths : bankTenths, freeTransfers: transfer.freeTransfersNext, gw: initial.gw + 1,
      chipsUsed: usedChips, totalHits: initial.totalHits + transfer.hitPoints } };
}

export interface ProjectedAction {
  label: string; moves: TransferSwap[]; chip?: SeasonChip; expectedGwPoints: number;
  modelRunId: string;
}
export interface ProjectedStrategy { ledger: TransferLedger; score: number; actions: ProjectedAction[] }

/** A bounded beam search: retained states are ranked, not claimed globally optimal. */
export function searchPlanningHorizon(initial: TransferLedger, optionsAt: (state: TransferLedger) => readonly ProjectedAction[], horizon: number, beamWidth = 8): ProjectedStrategy[] {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 38 || initial.gw + horizon - 1 > 38) throw new RangeError("Invalid planning horizon.");
  if (!Number.isInteger(beamWidth) || beamWidth < 1 || beamWidth > 64) throw new RangeError("Invalid beam width.");
  let frontier: ProjectedStrategy[] = [{ ledger: initial, score: 0, actions: [] }];
  for (let offset = 0; offset < horizon; offset++) {
    const next: ProjectedStrategy[] = [];
    for (const current of frontier) {
      for (const action of optionsAt(current.ledger).slice(0, 80)) {
        if (!Number.isFinite(action.expectedGwPoints) || !action.modelRunId) continue;
        const outcome = applyTransfers(current.ledger, action.moves, action.chip);
        if (outcome.valid && outcome.next) next.push({ ledger: outcome.next, score: current.score + action.expectedGwPoints - outcome.hitPoints,
          actions: [...current.actions, action] });
      }
    }
    next.sort((left, right) => right.score - left.score || left.ledger.totalHits - right.ledger.totalHits);
    if (!next.length) return [];
    frontier = next.slice(0, beamWidth);
  }
  return frontier;
}

export interface ChipOpportunity { gw: number; chip: SeasonChip; estimatedIncrementalPoints: number; costOfFutureOption?: number }
export interface ChipRecommendation { chip: SeasonChip; gw: number; netExpectedGain: number }
/** Exact scheduling of supplied additive chip gains; interactions still require joint squad simulations. */
export function planChipOpportunities(opportunities: readonly ChipOpportunity[], previouslyUsed: readonly SeasonChipUse[] = []): ChipRecommendation[] {
  const errors = validateSeasonChipPlan(previouslyUsed);
  if (errors.length) throw new RangeError(errors.join(" "));
  const types: SeasonChip[] = ["wc", "fh", "bb", "tc"];
  const bit = (gw: number, chip: SeasonChip): number => 1 << ((gw <= 19 ? 0 : 4) + types.indexOf(chip));
  const booked = new Map(previouslyUsed.map(use => [use.gw, use.chip]));
  const initialMask = previouslyUsed.reduce((mask, use) => mask | bit(use.gw, use.chip), 0);
  type Schedule = { mask: number; previousFreeHit: boolean; score: number; selected: ChipRecommendation[] };
  let states: Schedule[] = [{ mask: initialMask, previousFreeHit: false, score: 0, selected: [] }];
  for (let gw = 1; gw <= 38; gw++) {
    const candidates = opportunities.filter(option => option.gw === gw && types.includes(option.chip) &&
      Number.isFinite(option.estimatedIncrementalPoints) && Number.isFinite(option.costOfFutureOption ?? 0));
    const next = new Map<string, Schedule>();
    const retain = (candidate: Schedule) => {
      const key = `${candidate.mask}:${Number(candidate.previousFreeHit)}`;
      if (!next.has(key) || candidate.score > (next.get(key)?.score ?? Number.NEGATIVE_INFINITY)) next.set(key, candidate);
    };
    for (const state of states) {
      retain({ ...state, previousFreeHit: booked.get(gw) === "fh" });
      if (booked.has(gw)) continue;
      for (const candidate of candidates) {
        const gain = candidate.estimatedIncrementalPoints - (candidate.costOfFutureOption ?? 0);
        if (gain <= 0 || (state.mask & bit(gw, candidate.chip)) ||
            (candidate.chip === "fh" && (gw === 1 || state.previousFreeHit || booked.get(gw + 1) === "fh"))) continue;
        retain({ mask: state.mask | bit(gw, candidate.chip), previousFreeHit: candidate.chip === "fh", score: state.score + gain,
          selected: [...state.selected, { chip: candidate.chip, gw, netExpectedGain: gain }] });
      }
    }
    states = [...next.values()];
  }
  const best = states.reduce((current, candidate) => candidate.score > current.score ? candidate : current);
  return best.selected.map(candidate => ({ ...candidate, netExpectedGain: Math.round(candidate.netExpectedGain * 100) / 100 }));
}
