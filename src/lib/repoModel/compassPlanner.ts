/**
 * Independent multi-week planning model inspired by public FPL Compass workflows.
 * Uses FPL VORTEX forecasts and scoring; no Compass code or private model inputs.
 */
import type { EnrichedPlayer } from '../types';
import type { StoredTransferPlan } from '../transferPlansStore';
import type { FplReviewSimInput, FplReviewSimOutput, LineupSolution, SolverPlayerNode } from './fplReviewSimulator';
import { positionToType, solveLineupTS, solveFullSquadTS } from './fplReviewSimulator';
import type { ChipGwSimulation, ChipSimulationSummary, OptimizerOptionComparison, OptimizerTransferMove } from './dashboardTypes';
import { computePlayerXPts, computePositionPriors } from './xpts';
import { runMonteCarlo, mixSeed, type McPath, type McPlayerGw } from './monteCarlo';
import { nextFreeTransfers, pointsHit, type PlanningChip } from './scoring';
import { createLineupExpectation, gameweekAbsence } from './lineupExpectation';
import { marginalFtOptionValue } from './marginalFtOption';
import { expectedFixturePoints } from './playerModel';
import { isEligibleNewTransferTarget } from '../transferEligibility';
import { forecastMean, importedForecastPolicy } from '../forecastPolicy';
import { validateSeasonChipPlan, validateSquad, type SeasonChipUse } from './seasonRules';

const r2 = (n: number) => Math.round(n * 100) / 100;
const CHIP_NAMES = { wc: 'wildcard', fh: 'freehit', bb: 'bboost', tc: '3xc' } as const;
const CHIP_LABELS = { wc: 'Wildcard', fh: 'Free Hit', bb: 'Bench Boost', tc: 'Triple Captain' } as const;
const CHIPS: PlanningChip[] = ['wc', 'fh', 'bb', 'tc'];

export interface PlannerSimulationInput extends FplReviewSimInput {
  beamWidth?: number;
  maxNormalMoves?: 2 | 3;
  localForecastsOnly?: boolean;
  captaincyViceFallback?: boolean;
  openingTransferGuard?: { freeMoveNetGain: number; hitNetGain: number };
  availabilityOverrides?: ReadonlyArray<{ playerId: number; throughGw: number; status: 'a' | 'd' | 'u'; chance: number }>;
  lockedIds?: number[];
  /** Optional personal rules for normal goalkeeper transfers. Chip rebuilds retain their own rules. */
  goalkeeperTransfers?: { replaceableId?: number; incomingIds: readonly number[] };
  /** Explicit what-if schedule; never written into the saved manual plan. */
  requestedChips?: SeasonChipUse[];
  chipPolicy?: 'auto' | 'manual';
  /** Product solver limits the search and diagnostics to the selected next 1–10 GWs. */
  horizonOnly?: boolean;
  /** Authoritative browser-saved decisions. They are constraints, not overwritable suggestions. */
  manualPlan?: Pick<StoredTransferPlan, 'id' | 'name' | 'startGw' | 'transfers' | 'lineups' | 'captains' | 'chips'>;
  /** Hits already committed by manual scenario transfers, charged once in the first GW. */
  initialHitCost?: number;
  initialFreeTransfersBeforeScenario?: number;
  decay?: number;
  startedEvent?: number;
  /** Unknown history disables chip recommendations for a loaded manager. */
  chipHistoryKnown?: boolean;
  /** Snapshot provenance is shown in assumptions, never upgraded to live. */
  dataNotice?: string;
  /** CSV filename date, not a verified provider timestamp. Undefined means no dated import is identified. */
  importedProjectionFileDate?: string | null;
  /** Freeze the import-age policy for reproducible snapshot replays. */
  forecastAsOf?: string;
  /** Official completed-event count; a future GW alone does not add played matches. */
  completedEvents?: number;
}

export interface StrategyWeek {
  gw: number;
  squad: number[];
  lineup: LineupSolution;
  chip?: PlanningChip;
  moves: Array<{ outId: number; inId: number }>;
  ftBefore: number;
  ftAfter: number;
  bankAfter: number;
  sellingPricesAfter: Record<number, number>;
  sellingPricesBefore: Record<number, number>;
  hitCost: number;
  netXPts: number;
}

/** Complete, feasible continuations for playing the joint planner's nominated chip now vs retaining it. */
export interface ChipTimingComparison {
  chip: PlanningChip;
  playNow: { planningScore: number; expectedPoints: number; schedule: SeasonChipUse[]; weeks: StrategyWeek[] };
  defer: { planningScore: number; expectedPoints: number; schedule: SeasonChipUse[]; weeks: StrategyWeek[] };
  /** Positive means playing now has the higher discounted planning objective. */
  gainPlayNow: number;
  preferred: 'PLAY_NOW' | 'DEFER';
}

export interface PlannerSimulationOutput extends FplReviewSimOutput {
  /** Already-computed best no-chip transfer path; chips are saved. */
  transferWeeks: StrategyWeek[];
  strategy: {
    weeks: StrategyWeek[];
    schedule: SeasonChipUse[];
    expectedPoints: number;
    baselinePoints: number;
    holdPoints: number;
    gain: number;
    planningScore: number;
    horizon: number[];
    search: string;
    chipTiming: ChipTimingComparison | null;
    openingTransferDecision?: { rolled: boolean; gain: number; minimumGain: number; immediateHit: number;
      rollingXPts: number; movingXPts: number; comparedGameweeks: number };
  };
  forecastByGw: Record<number, Record<number, number>>;
  lineupBaselinesByGw: Record<number, { fixedHold: LineupSolution; rollThisWeek: LineupSolution; sameSquadNoChip: LineupSolution }>;
  warnings: string[];
  sourcePlan?: { id: string; name: string; committedGameweeks: number; lockedPlayers: number };
}

interface SearchState {
  squad: number[];
  bank: number;
  /** Selling values follow ownership; sold and re-bought players lose the old basis. */
  sell: Record<number, number>;
  ft: number;
  uses: SeasonChipUse[];
  weeks: StrategyWeek[];
  score: number;
  total: number;
}

interface Action {
  squad: number[];
  bank: number;
  sell: Record<number, number>;
  moves: Array<{ outId: number; inId: number }>;
}

export function runPlannerSimulation(input: PlannerSimulationInput, onProgress?: (stage: string) => void): PlannerSimulationOutput {
  onProgress?.('Planning paths');
  const { nextGw } = input;
  const beamWidth = input.beamWidth ?? 6;
  const maxNormalMoves = input.maxNormalMoves ?? 2;
  if (!Number.isInteger(beamWidth) || beamWidth < 1 || beamWidth > 24 || ![2,3].includes(maxNormalMoves)) throw new RangeError('Invalid search limits.');
  const moveCounts = maxNormalMoves === 3 ? [1,2,3] : [1,2];
  const searchDescription = 'Bounded beam with '+beamWidth+' retained states, shortlisted batches of up to '+maxNormalMoves+' normal transfers and full WC/FH rebuilds.';
  const manualPlan = input.manualPlan;
  if (manualPlan && manualPlan.startGw !== nextGw) throw new RangeError(`Saved plan starts in GW${manualPlan.startGw}, but current forecasts start in GW${nextGw}. Rebase or create a new plan before simulating.`);
  if (!Number.isInteger(nextGw) || nextGw < 1 || nextGw > 38) throw new RangeError('Choose an upcoming gameweek from 1 to 38.');
  const completedEvents = input.completedEvents ?? nextGw - 1;
  if (!Number.isInteger(completedEvents) || completedEvents < 0 || completedEvents > 38) throw new RangeError('Invalid completed-event count.');
  if (!Number.isInteger(input.bankTenths) || input.bankTenths < 0) throw new RangeError('Squad exceeds the available budget. Reset or undo a transfer.');
  if (!Number.isInteger(input.freeTransfersNow) || input.freeTransfersNow < 0 || input.freeTransfersNow > 5) throw new RangeError('Free transfers must be between 0 and 5.');
  if (!Number.isFinite(input.initialHitCost ?? 0) || (input.initialHitCost ?? 0) < 0) throw new RangeError('Invalid committed transfer hit.');
  const horizon = Math.max(1, Math.min(10, Math.round(input.horizon ?? 5)));
  const decay = input.decay ?? 0.85;
  if (!Number.isFinite(decay) || decay < 0.5 || decay > 1) throw new RangeError('Decay must be between 0.5 and 1.');
  const gws = Array.from({ length: Math.min(horizon, 39 - nextGw) }, (_, i) => nextGw + i);
  const halfEnd = nextGw <= 19 ? 19 : 38;
  const chipHalfGws = Array.from({ length: (input.horizonOnly ? Math.min(halfEnd, gws.at(-1)!) : halfEnd) - nextGw + 1 }, (_, i) => nextGw + i);
  // Chip search spans the remaining half, including expiry; simulation uses the chosen horizon.
  const allGws = [...new Set([...gws, ...chipHalfGws])].sort((a, b) => a - b);
  const byId = new Map<number, SolverPlayerNode>();
  const playerMap = new Map(input.players.map(p => [p.id, p]));
  const availabilityOverrides = new Map(input.availabilityOverrides?.map(item => [item.playerId, item]));
  const availabilityAt = (id: number, gw: number) => {
    const item = availabilityOverrides.get(id);
    return item && gw <= item.throughGw ? item : undefined;
  };
  const canBuy = (p: EnrichedPlayer, gw: number) => {
    const override = availabilityAt(p.id, gw);
    return isEligibleNewTransferTarget(override
      ? { ...p, status: override.status, chance: override.chance, availability: override.chance / 100 }
      : p);
  };
  for (const p of input.players) byId.set(p.id, { id: p.id, type: positionToType(p.position), team: p.teamId, cost: p.cost, name: p.name });
  const initialSquad = input.currentSquadIds.map(id => {
    const p = byId.get(id);
    if (!p) throw new RangeError('Load a complete squad before simulating.');
    return { id, team: p.team, position: p.type, priceTenths: p.cost };
  });
  const legality = validateSquad(initialSquad, initialSquad.reduce((s, p) => s + p.priceTenths, input.bankTenths));
  if (!legality.legal) throw new RangeError(legality.errors.join(' '));
  const locked = new Set(input.lockedIds ?? []);
  if ([...locked].some(id => !input.currentSquadIds.includes(id))) throw new RangeError('Only squad players can be locked.');
  const knownHistory = input.chipHistoryKnown ?? input.chipsUsed !== undefined;
  const history: SeasonChipUse[] = (input.chipsUsed ?? []).flatMap(use => {
    const chip = CHIPS.find(c => CHIP_NAMES[c] === use.name || c === use.name);
    return chip && use.event < nextGw ? [{ gw: use.event, chip }] : [];
  });
  const requested = input.requestedChips ?? [];
  if (requested.some(use => !gws.includes(use.gw))) throw new RangeError('Manual chip gameweeks must be inside the selected planning horizon.');
  const chipAt = (gw: number) => manualPlan?.chips[gw] ?? requested.find(use => use.gw === gw)?.chip;
  if (requested.some(use => manualPlan?.chips[use.gw] && manualPlan.chips[use.gw] !== use.chip))
    throw new RangeError('The manual chip check conflicts with a saved chip commitment. Edit your saved plan first.');
  const warnings: string[] = [];
  if (!knownHistory) warnings.push('Chip history is unavailable. Refresh the team to enable chip recommendations.');
  if (input.dataNotice) warnings.push(input.dataNotice);
  // Do not optimize on a historical imported mean as though it were current.
  // A missing/invalid date for an explicitly identified import fails closed to
  // the independently computed fixture model; undated synthetic test scenarios
  // remain supported when no imported file is identified.
  const forecastAsOf = input.forecastAsOf === undefined ? new Date() : new Date(input.forecastAsOf);
  const { age: importedAge, allowed: allowImportedMeans } = importedForecastPolicy(input.importedProjectionFileDate, forecastAsOf);
  if (importedAge && importedAge.status !== 'recent') {
    warnings.push(importedAge.status === 'stale'
      ? `Imported xPts/xMins dated ${input.importedProjectionFileDate} (${importedAge.ageDays} days old) are excluded from transfer and chip recommendations. Using local fixture-based VORTEX estimates; these have not been historically calibrated.`
      : 'Imported xPts/xMins have no verifiable recent date and are excluded from transfer and chip recommendations. Using local fixture-based VORTEX estimates; these have not been historically calibrated.');
  }
  if (manualPlan) warnings.push(`Using saved plan “${manualPlan.name}”. Its manual transfers, lineup, captain and chip selections are constraints. Auto suggestions do not change your saved plan.`);
  warnings.push('Forecasts assume the published fixture schedule and fixed player prices; future postponements, injuries and price changes are unknown.');
  warnings.push('New transfers exclude players currently flagged doubtful, injured, suspended or unavailable by official FPL. Existing owned players remain in your squad unless legally transferred out.');

  const teams = new Map(input.repoTeams.map(t => [t.id, t]));
  const elements = new Map(input.repoElements.map(e => [e.id, e]));
  const priors = computePositionPriors(input.repoElements);
  const models = new Map<string, ReturnType<typeof computePlayerXPts>>();
  const forecastByGw: Record<number, Record<number, number>> = {};
  for (const gw of allGws) {
    const values: Record<number, number> = {};
    for (const p of input.players) {
      const el = elements.get(p.id);
      if (!el) throw new RangeError('Player forecast inputs are incomplete. Refresh the data.');
      const override = availabilityAt(p.id, gw);
      const forecastElement = override ? {
        ...el, status: override.status, chance_of_playing_next_round: override.chance,
      } : el;
      const bd = computePlayerXPts(forecastElement, gw, input.repoFixtures, teams, Math.max(1, completedEvents), gw - nextGw, priors);
      models.set(`${p.id}:${gw}`, bd);
      const imported = p.gwProjections?.[gw];
      // Fixture blanks override imported projections. Zero is a legitimate imported forecast.
      if (!Number.isFinite(bd.xPts)) throw new RangeError(`Non-finite GW${gw} forecast for player ${p.id}; refresh the data before optimizing.`);
      // An imported forecast may predate a new official injury/doubt/suspension.
      // Current FPL availability always wins; the local model already adjusts minutes.
      values[p.id] = forecastMean(override ?? p, bd, imported, allowImportedMeans && !input.localForecastsOnly);
    }
    forecastByGw[gw] = values;
  }

  const playerExpectations = new Map<number, Map<number, {
    distribution: McPlayerGw; position: number; points: number; absence: number;
  }>>();
  const playerExpectation = (id: number, gw: number) => {
    let week = playerExpectations.get(gw);
    if (!week) {
      week = new Map();
      playerExpectations.set(gw, week);
    }
    let forecast = week.get(id);
    if (forecast) return forecast;
    const el = elements.get(id)!, bd = models.get(`${id}:${gw}`)!;
    const mean = forecastByGw[gw][id];
    const componentMean = bd.fixtureModels?.reduce((sum, model) =>
      sum + Object.values(expectedFixturePoints(model)).reduce((s, n) => s + n, 0), 0);
    const useComponents = componentMean !== undefined && Math.abs(mean - componentMean) <= 0.011;
    const distribution: McPlayerGw = {
      mean, fixtureModels: useComponents ? bd.fixtureModels : undefined,
      p60: mean === 0 ? 0 : bd.p60, pSub: mean === 0 ? 0 : bd.pSub, fixtures: bd.fixtureCount,
      csProb: bd.csProb, cardLoss: Math.max(0, -bd.cardPts), team: el.team, position: el.element_type,
    };
    const absence = gameweekAbsence(distribution);
    forecast = { distribution, position: el.element_type, absence,
      points: useComponents ? componentMean : absence === 1 ? 0 : mean };
    week.set(id, forecast);
    return forecast;
  };
  const expectedLineup = createLineupExpectation();
  const scoreExpected = (selection: LineupSolution, gw: number, chip?: PlanningChip): LineupSolution => {
    const points = expectedLineup(selection, id => playerExpectation(id, gw), chip);
    return { ...selection, xiXPts: r2(points.xiPoints), captainXPts: r2(points.captainPoints),
      benchXPts: r2(points.benchPoints), autosubXPts: r2(points.autosubs), totalXPts: r2(points.total) };
  };

  const lineupCache = new Map<string, LineupSolution>();
  const lineup = (sq: number[], gw: number, chip?: PlanningChip): LineupSolution => {
    const key = `${gw}:${chip === 'bb' || chip === 'tc' ? chip : ''}:${[...sq].sort((a, b) => a - b).join(',')}`;
    let value = lineupCache.get(key);
    if (!value) {
      value = scoreExpected(solveLineupTS(sq, byId, forecastByGw[gw]), gw, chip);
      lineupCache.set(key, value);
    }
    return value;
  };
  const squadValue = (sq: number[], gw: number, benchWeight = 0): number => {
    let total = 0;
    // Shared objective for transfers and rebuilds; no arbitrary current-week projection reuse.
    for (let offset = 0; offset < 3 && forecastByGw[gw + offset]; offset++) {
      const l = lineup(sq, gw + offset);
      total += Math.pow(decay, offset) * (l.totalXPts + benchWeight * l.benchXPts);
    }
    return total;
  };
  const initialSell: Record<number, number> = {};
  for (const id of input.currentSquadIds) initialSell[id] = input.sellingPrices?.[id] ?? byId.get(id)!.cost;
  if (Object.values(initialSell).some(n => !Number.isInteger(n) || n < 0)) throw new RangeError('Invalid player selling price.');
  const totalSellBudgetTenths = input.bankTenths + Object.values(initialSell).reduce((a, b) => a + b, 0);
  const initial: SearchState = { squad: [...input.currentSquadIds], bank: input.bankTenths, sell: initialSell, ft: input.freeTransfersNow, uses: [], weeks: [], score: 0, total: 0 };

  const pools = new Map<number, number[]>();
  for (const gw of allGws) {
    const pool = new Set(input.currentSquadIds);
    for (const type of [1, 2, 3, 4]) {
      const eligible = input.players.filter(p => positionToType(p.position) === type && canBuy(p, gw));
      const value = (p: EnrichedPlayer) => [0, 1, 2].reduce((sum, o) => sum + Math.pow(decay, o) * (forecastByGw[gw + o]?.[p.id] ?? 0), 0);
      eligible.sort((a, b) => value(b) - value(a) || a.id - b.id).slice(0, 14).forEach(p => pool.add(p.id));
      eligible.sort((a, b) => a.cost - b.cost || value(b) - value(a)).slice(0, 4).forEach(p => pool.add(p.id));
    }
    pools.set(gw, [...pool]);
  }

  const goalkeeperTransfers = input.goalkeeperTransfers;
  const actionCache = new Map<string, Action[]>();
  const actionsAt = (state: SearchState, gw: number): Action[] => {
    const key = `${gw}:${state.ft}:${state.bank}:${[...state.squad].sort((a, b) => a - b).map(id => id + '=' + state.sell[id]).join(',')}`;
    const cached = actionCache.get(key);
    if (cached) return cached;
    const hold: Action = { squad: state.squad, bank: state.bank, sell: state.sell, moves: [] };
    const current = new Set(state.squad);
    const swaps: Array<{ outId: number; inId: number; delta: number; gain: number }> = [];
    for (const outId of state.squad) {
      if (locked.has(outId)) continue;
      const out = byId.get(outId)!;
      if (out.type === 1 && goalkeeperTransfers && outId !== goalkeeperTransfers.replaceableId) continue;
      const candidates = out.type === 1 && goalkeeperTransfers ? goalkeeperTransfers.incomingIds : pools.get(gw) ?? [];
      for (const inId of candidates) {
        const inc = byId.get(inId)!;
        if (!inc || current.has(inId) || inc.type !== out.type || !canBuy(playerMap.get(inId)!, gw)) continue;
        const gain = [0, 1, 2].reduce((sum, o) => sum + Math.pow(decay, o) * ((forecastByGw[gw + o]?.[inId] ?? 0) - (forecastByGw[gw + o]?.[outId] ?? 0)), 0);
        swaps.push({ outId, inId, delta: state.sell[outId] - inc.cost, gain });
      }
    }
    const makeAction = (moves: typeof swaps): Action | null => {
      const bank = state.bank + moves.reduce((sum, m) => sum + m.delta, 0);
      if (bank < 0) return null;
      const sq = state.squad.map(id => moves.find(m => m.outId === id)?.inId ?? id);
      const counts = new Map<number, number>();
      for (const id of sq) { const team = byId.get(id)!.team; counts.set(team, (counts.get(team) ?? 0) + 1); }
      if ([...counts.values()].some(n => n > 3)) return null;
      const sell = { ...state.sell };
      for (const m of moves) { delete sell[m.outId]; sell[m.inId] = byId.get(m.inId)!.cost; }
      return { squad: sq, bank, sell, moves: moves.map(({ outId, inId }) => ({ outId, inId })) };
    };
    const ranked: Array<{ action: Action; value: number }> = [];
    const add = (action: Action | null) => {
      if (action) ranked.push({ action, value: squadValue(action.squad, gw) - pointsHit(action.moves.length, state.ft) });
    };
    // Evaluate shortlisted singles and coupled pairs, including selling a scorer to fund a bigger upgrade.
    swaps.sort((a, b) => b.gain - a.gain || a.inId - b.inId);
    for (const swap of [...new Set([...swaps.slice(0, 36), ...[...swaps].sort((a, b) => b.delta - a.delta || b.gain - a.gain).slice(0, 8)])]) add(makeAction([swap]));
    swaps.sort((a, b) => b.gain - a.gain || a.inId - b.inId);
    const pairPool = [...new Set([...swaps.slice(0, 12), ...[...swaps].sort((a, b) => b.delta - a.delta || b.gain - a.gain).slice(0, 4)])];
    for (let a = 0; a < pairPool.length; a++) for (let b = a + 1; b < pairPool.length; b++) {
      const first = pairPool[a], second = pairPool[b];
      if (first.outId === second.outId || first.inId === second.inId) continue;
      add(makeAction([first, second]));
      if (maxNormalMoves === 3) {
        for (const third of pairPool.slice(b+1)) {
          if ([first.outId,second.outId].includes(third.outId) || [first.inId,second.inId].includes(third.inId)) continue;
          add(makeAction([first,second,third]));
        }
      }
    }
    ranked.sort((a, b) => b.value - a.value || a.action.moves.length - b.action.moves.length);
    // Preserve a roll branch and both 1/2-transfer branches even when short-term totals are close.
    const result: Action[] = [hold];
    for (const n of moveCounts) result.push(...ranked.filter(a => a.action.moves.length === n).slice(0, 2).map(a => a.action));
    actionCache.set(key, result);
    return result;
  };

  /** Fixed manual transfers are applied as one budget-balanced FPL transfer batch. */
  const committedAction = (state: SearchState, gw: number): Action | null => {
    const moves = manualPlan?.transfers[gw] ?? [];
    if (!moves.length) return null;
    const outIds = moves.map(move => move.out);
    const inIds = moves.map(move => move.in);
    if (new Set(outIds).size !== moves.length || new Set(inIds).size !== moves.length ||
        outIds.some(id => !state.squad.includes(id) || locked.has(id)) ||
        inIds.some(id => !byId.has(id) || (state.squad.includes(id) && !outIds.includes(id)))) return null;
    if (moves.some(move => byId.get(move.out)?.type !== byId.get(move.in)?.type)) return null;
    const nextSquad = state.squad.map(id => {
      const match = moves.find(move => move.out === id);
      return match ? match.in : id;
    });
    if (new Set(nextSquad).size !== 15) return null;
    const nextBank = state.bank + moves.reduce((sum, move) => sum + state.sell[move.out] - byId.get(move.in)!.cost, 0);
    if (nextBank < 0) return null;
    const clubs = new Map<number, number>();
    for (const id of nextSquad) {
      const team = byId.get(id)!.team;
      clubs.set(team, (clubs.get(team) ?? 0) + 1);
    }
    if ([...clubs.values()].some(count => count > 3)) return null;
    const sell = { ...state.sell };
    for (const move of moves) delete sell[move.out];
    for (const move of moves) sell[move.in] = byId.get(move.in)!.cost;
    return {
      squad: nextSquad, bank: nextBank, sell,
      moves: moves.map(move => ({ outId: move.out, inId: move.in })),
    };
  };

  /**
   * Marginal value of the last banked FT from real next-GW candidate actions.
   * The same legal actions are scored at FT and FT-1; only avoided hit costs
   * differ. This is a pruning heuristic, NOT bonus expected points.
   */
  const bankedFtOptionAt = (state: SearchState, gw: number): number => {
    if (!forecastByGw[gw] || state.ft === 0) return 0;
    const fixedChip = chipAt(gw);
    if (fixedChip === 'wc' || fixedChip === 'fh') return 0;
    const fixedMoves = manualPlan?.transfers[gw]?.length ?? 0;
    if (fixedMoves === 0 && state.ft > 2) return 0; // normal candidate shortlist has at most two moves
    const actions = fixedMoves > 0
      ? [committedAction(state, gw)].filter((action): action is Action => action !== null)
      : actionsAt(state, gw);
    if (!actions.length) return 0;
    const holdValue = squadValue(state.squad, gw);
    return marginalFtOptionValue(state.ft, actions.map(action => ({
      transfers: action.moves.length,
      grossGain: squadValue(action.squad, gw) - holdValue,
    })));
  };

  /** Validate manual XI/captain selections against the chosen strategy's actual squad. */
  const committedLineup = (squad: number[], gw: number, chip?: PlanningChip): LineupSolution => {
    const automatic = lineup(squad, gw, chip);
    const orderInput = manualPlan?.lineups[gw];
    const captains = manualPlan?.captains[gw];
    if (!orderInput && !captains) return automatic;
    const values = forecastByGw[gw];
    let order = [...automatic.starters, ...automatic.bench];
    if (orderInput) {
      if (orderInput.length !== 15 || new Set(orderInput).size !== 15) throw new RangeError(`Saved GW${gw} lineup is incomplete.`);
      const arrivals = squad.filter(id => !orderInput.includes(id));
      order = orderInput.map(id => {
        if (squad.includes(id)) return id;
        const candidate = arrivals.findIndex(inId => byId.get(inId)?.type === byId.get(id)?.type);
        return candidate < 0 ? -1 : arrivals.splice(candidate, 1)[0];
      });
      const starters = order.slice(0, 11);
      const counts = [1, 2, 3, 4].map(t => starters.filter(id => byId.get(id)?.type === t).length);
      if (order.includes(-1) || new Set(order).size !== 15 || order.some(id => !squad.includes(id)) ||
          counts[0] !== 1 || counts[1] < 3 || counts[1] > 5 || counts[2] < 2 || counts[2] > 5 ||
          counts[3] < 1 || counts[3] > 3 || byId.get(order[11])?.type !== 1)
        throw new RangeError(`Saved GW${gw} lineup conflicts with the squad or formation.`);
    }
    const starters = order.slice(0, 11), bench = order.slice(11);
    const ranked = [...starters].sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0));
    const captainId = captains?.captain ?? ranked[0];
    const viceId = captains?.vice ?? ranked.find(id => id !== captainId) ?? captainId;
    if (!starters.includes(captainId) || !starters.includes(viceId) || captainId === viceId)
      throw new RangeError(`Saved GW${gw} captain or vice-captain is not in the starting XI.`);
    return scoreExpected({
      ...automatic,
      starters, bench, captainId, viceId,
      formation: [2, 3, 4].map(t => starters.filter(id => byId.get(id)?.type === t).length).join('-'),
    }, gw, chip);
  };

  const rebuildCache = new Map<string, Action | null>();
  const rebuild = (state: SearchState, gw: number, chip: 'wc' | 'fh'): Action | null => {
    const budget = state.bank + state.squad.reduce((sum, id) => sum + state.sell[id], 0);
    const key = `${gw}:${chip}:${budget}:${state.squad.map(id => id + '=' + state.sell[id]).sort().join(',')}`;
    if (rebuildCache.has(key)) return rebuildCache.get(key)!;
    const candidates = [...new Set([...(pools.get(gw) ?? []), ...state.squad, ...locked])]
      .filter(id => state.squad.includes(id) || canBuy(playerMap.get(id)!, gw));
    // Keeping a player costs their sale value in the liquidation budget, not the
    // market price of buying them again. The difference is not spendable cash.
    const rebuildNodes = new Map([...byId].map(([id, player]) => [id, {
      ...player, cost: state.sell[id] ?? player.cost,
    }]));
    const weights: Record<number, number> = {};
    for (const id of candidates) weights[id] = chip === 'wc' ? [1, 2].reduce((s, o) => s + Math.pow(decay, o) * (forecastByGw[gw + o]?.[id] ?? 0), 0) : 0;
    const seeded = solveFullSquadTS(candidates, rebuildNodes, budget, forecastByGw[gw], weights, locked);
    // The existing squad is always a feasible seed, including when the greedy
    // construction gets stuck behind a club limit.
    let sq: number[] = seeded ?? [...state.squad];
    // Refine the actual XI/captain objective; WC also values a playable bench for later BB.
    const objective = (ids: number[]) => chip === 'wc' ? squadValue(ids, gw, 0.15) : lineup(ids, gw).totalXPts;
    let best = objective(sq);
    if (objective(state.squad) > best) { sq = [...state.squad]; best = objective(sq); }
    for (let pass = 0; pass < 2; pass++) for (const inc of candidates) {
      if (sq.includes(inc) || !canBuy(playerMap.get(inc)!, gw)) continue;
      const p = byId.get(inc)!;
      for (const out of sq) {
        if (locked.has(out) || byId.get(out)!.type !== p.type) continue;
        const trial = sq.map(id => id === out ? inc : id);
        if (trial.reduce((s, id) => s + rebuildNodes.get(id)!.cost, 0) > budget || trial.filter(id => byId.get(id)!.team === p.team).length > 3) continue;
        const value = objective(trial);
        if (value > best + 0.01) { sq = trial; best = value; break; }
      }
    }
    const sell = Object.fromEntries(sq.map(id => [id, byId.get(id)!.cost]));
    // Unchanged holdings retain their selling basis after a Wildcard.
    for (const id of sq) if (state.squad.includes(id)) sell[id] = state.sell[id];
    const spent = sq.reduce((s, id) => s + rebuildNodes.get(id)!.cost, 0);
    const incoming = sq.filter(id => !state.squad.includes(id));
    const moves = state.squad.filter(id => !sq!.includes(id)).map(outId => {
      const index = incoming.findIndex(id => byId.get(id)!.type === byId.get(outId)!.type);
      return { outId, inId: incoming.splice(index, 1)[0] };
    });
    const action = { squad: sq, sell, bank: budget - spent, moves };
    rebuildCache.set(key, action);
    return action;
  };
  const reservedChipUses: SeasonChipUse[] = Object.entries(manualPlan?.chips ?? {}).map(([gw, chip]) => ({ gw: Number(gw), chip }));
  for (const use of requested) {
    if (!reservedChipUses.some(saved => saved.gw === use.gw && saved.chip === use.chip)) reservedChipUses.push(use);
  }
  const manualChipErrors = validateSeasonChipPlan([...history, ...reservedChipUses]);
  if (manualChipErrors.length) throw new RangeError(`Saved chip schedule is illegal: ${manualChipErrors.join(' ')}`);
  if (reservedChipUses.length && !knownHistory) throw new RangeError('Refresh the official manager chip history before simulating saved chip commitments.');
  const available = (state: SearchState, gw: number, chip: PlanningChip): boolean => knownHistory &&
    !((chip === 'wc' || chip === 'fh') && gw === (input.startedEvent ?? 1)) &&
    validateSeasonChipPlan([...history, ...state.uses, { gw, chip }, ...reservedChipUses.filter(use => use.gw > gw)]).length === 0;

  const advance = (state: SearchState, action: Action, gw: number, chip?: PlanningChip): SearchState => {
    const hitCost = pointsHit(action.moves.length, state.ft, chip === 'wc' || chip === 'fh') + (gw === nextGw && chip !== 'wc' && chip !== 'fh' ? input.initialHitCost ?? 0 : 0);
    const lu = manualPlan ? committedLineup(action.squad, gw, chip) : lineup(action.squad, gw, chip);
    const ftBefore = gw === nextGw && (chip === 'wc' || chip === 'fh') ? input.initialFreeTransfersBeforeScenario ?? state.ft : state.ft;
    const ftAfter = nextFreeTransfers(ftBefore, action.moves.length, chip);
    const uses = chip ? [...state.uses, { gw, chip }] : state.uses;
    const week: StrategyWeek = { gw, squad: action.squad, lineup: lu, chip, moves: action.moves, ftBefore, ftAfter, bankAfter: action.bank, sellingPricesAfter: action.sell, sellingPricesBefore: { ...state.sell }, hitCost, netXPts: r2(lu.totalXPts - hitCost) };
    return { squad: chip === 'fh' ? state.squad : action.squad, bank: chip === 'fh' ? state.bank : action.bank, sell: chip === 'fh' ? state.sell : action.sell, ft: ftAfter, uses, weeks: [...state.weeks, week], score: state.score + Math.pow(decay, gw - nextGw) * week.netXPts, total: state.total + week.netXPts };
  };
  const searchGws = allGws;
  const search = (withChips: boolean, firstMoves?: number, firstChipPolicy?: { chip: PlanningChip; mode: 'play' | 'defer' }, noOpeningChip = false): SearchState => {
    let beam: SearchState[] = [initial];
    for (const gw of searchGws) {
      const expanded: SearchState[] = [];
      for (const state of beam) {
        const hasCommittedMoves = (manualPlan?.transfers[gw]?.length ?? 0) > 0;
        const committed = hasCommittedMoves ? committedAction(state, gw) : null;
        if (hasCommittedMoves && !committed) continue; // Skip branches that invalidate a later saved transfer.
        const actions = (committed ? [committed] : actionsAt(state, gw))
          .filter(a => gw !== nextGw || firstMoves === undefined || a.moves.length === firstMoves);
        const fixedChip = chipAt(gw);
        const chipPolicy = gw === nextGw ? firstChipPolicy : undefined;
        const allowedFirstChip = (chip: PlanningChip) => !(gw === nextGw && noOpeningChip) && (!chipPolicy || (chipPolicy.mode === 'play' ? chip === chipPolicy.chip : chip !== chipPolicy.chip));
        const add = (action: Action, chip?: PlanningChip) => {
          try { expanded.push(advance(state, action, gw, chip)); }
          catch (error) {
            // A speculative solver branch may be incompatible with a manually locked
            // lineup/captain. Reject only that branch, never mutate the user's plan.
            if (!(manualPlan && error instanceof RangeError)) throw error;
          }
        };
        if (fixedChip) {
          if (!available(state, gw, fixedChip) || !allowedFirstChip(fixedChip)) continue;
          // A manually timed WC/FH must still rebuild the squad, just as automatic timing does.
          if ((fixedChip === 'wc' || fixedChip === 'fh') && !hasCommittedMoves) {
            const built = rebuild(state, gw, fixedChip);
            if (built) add(built, fixedChip);
          }
          for (const action of actions) add(action, fixedChip);
          continue;
        }
        for (const action of actions) {
          if (chipPolicy?.mode !== 'play') add(action);
          if (withChips && input.chipPolicy !== 'manual') for (const chip of ['bb', 'tc'] as const)
            if (allowedFirstChip(chip) && available(state, gw, chip)) add(action, chip);
        }
        if (withChips && input.chipPolicy !== 'manual' && !hasCommittedMoves) for (const chip of ['wc', 'fh'] as const)
          if (allowedFirstChip(chip) && available(state, gw, chip)) {
            const built = rebuild(state, gw, chip);
            if (built) add(built, chip);
          }
      }
      if (!expanded.length) {
        if (manualPlan) throw new RangeError(`Saved plan “${manualPlan.name}” is incompatible with the current squad, prices, player locks, captain selections or chips at GW${gw}. Open and correct the plan; nothing has been overwritten.`);
        return initial;
      }
      // Distinct ownership/selling bases, chip inventories and FTs are separate states.
      const keyOf = (s: SearchState) => `${s.bank}:${s.ft}:${s.squad.map(id => id + '=' + s.sell[id]).sort().join(',')}:${s.uses.map(u => (u.gw <= 19 ? 1 : 2) + u.chip).sort().join(',')}:${s.uses.at(-1)?.chip === 'fh' && s.uses.at(-1)?.gw === gw ? gw : 0}`;
      const unique = new Map<string, SearchState>();
      const estimates = new Map<SearchState, number>();
      const estimate = (s: SearchState) => {
        const cached = estimates.get(s);
        if (cached !== undefined) return cached;
        const remaining = searchGws.filter(g => g > gw).reduce((sum, g) => sum + Math.pow(decay, g - nextGw) * lineup(s.squad, g).totalXPts, 0);
        // Remaining chip value helps prevent premature use; no hard-coded play-now threshold.
        const optionValue = withChips ? (['bb', 'tc'] as const).reduce((sum, c) => {
          const gains = searchGws.filter(g => g > gw && available(s, g, c)).map(g => {
            const l = lineup(s.squad, g);
            return Math.pow(decay, g - nextGw) * (lineup(s.squad, g, c).totalXPts - l.totalXPts);
          });
          return sum + Math.max(0, ...gains);
        }, 0) : 0;
        // Value FT flexibility from *feasible* next-week actions. The cap is
        // one avoided four-point hit; it affects pruning only, not final xPts.
        const nextDecisionGw = gw + 1;
        const ftOption = forecastByGw[nextDecisionGw]
          ? Math.pow(decay, nextDecisionGw - nextGw) * bankedFtOptionAt(s, nextDecisionGw)
          : 0;
        const result = s.score + remaining + optionValue + ftOption;
        estimates.set(s, result);
        return result;
      };
      expanded.sort((a, b) => estimate(b) - estimate(a) || a.uses.length - b.uses.length || b.ft - a.ft);
      for (const state of expanded) { const key = keyOf(state); if (!unique.has(key)) unique.set(key, state); }
      beam = [...unique.values()].slice(0, beamWidth);
    }
    return beam.sort((a, b) => b.score - a.score || a.uses.length - b.uses.length)[0] ?? initial;
  };

  /** Exact saved-manual scenario (zero auto-added transfers or chips) for paired MC. */
  const savedManualState: SearchState | null = manualPlan ? (() => {
    let state = initial;
    for (const gw of allGws) {
      const hasMoves = (manualPlan.transfers[gw]?.length ?? 0) > 0;
      const action = hasMoves ? committedAction(state, gw) : {
        squad: state.squad, bank: state.bank, sell: state.sell, moves: [],
      };
      if (!action) throw new RangeError(`GW${gw} manual transfers are not legal on the saved path.`);
      const chip = manualPlan.chips[gw];
      if (chip && !available(state, gw, chip)) throw new RangeError(`GW${gw} saved chip is not available.`);
      state = advance(state, action, gw, chip);
    }
    return state;
  })() : null;

  const variants = manualPlan || requested.length ? [search(false)] : [0, ...moveCounts].map(n => search(false, n));
  const baseline = [...variants].filter(s => s.weeks.length).sort((a, b) => b.score - a.score)[0];
  if (!baseline) throw new RangeError('No legal transfer plan found.');
  const searched = knownHistory ? search(true) : baseline;
  if (requested.length && !knownHistory) throw new RangeError('Verify chip history before checking a manual chip schedule.');
  // The available no-chip plan is always a candidate: chips cannot force a worse recommendation.
  let best = searched.score > baseline.score + 0.01 ? searched : baseline;
  let chipTiming: ChipTimingComparison | null = null;
  const nominatedChip = best.uses.find(use => use.gw <= halfEnd)?.chip;
  // Compare TWO complete, feasible paths with the same inputs. One commits the
  // nominated chip in the current GW; the other forbids only that chip in the
  // current GW but permits it later. Other chips and transfers stay jointly
  // optimized. Never override a saved manager chip or transfer commitment.
  if (knownHistory && !manualPlan && !requested.length && input.chipPolicy !== 'manual' && nominatedChip && available(initial, nextGw, nominatedChip)) {
    const now = search(true, undefined, { chip: nominatedChip, mode: 'play' });
    const later = search(true, undefined, { chip: nominatedChip, mode: 'defer' });
    if (now.weeks.length === searchGws.length && now.weeks[0]?.chip === nominatedChip &&
        later.weeks.length === searchGws.length && later.weeks[0]?.chip !== nominatedChip) {
      if (now.score > best.score + 0.01) best = now;
      if (later.score > best.score + 0.01) best = later;
      const planView = (state: SearchState) => ({
        planningScore: r2(state.score), expectedPoints: r2(state.total),
        schedule: state.uses, weeks: state.weeks,
      });
      chipTiming = {
        chip: nominatedChip, playNow: planView(now), defer: planView(later),
        gainPlayNow: r2(now.score - later.score),
        preferred: now.score > later.score + 0.01 ? 'PLAY_NOW' : 'DEFER',
      };
    }
  }
  let openingTransferDecision: PlannerSimulationOutput['strategy']['openingTransferDecision'];
  let openingPaths: { move: SearchState; roll: SearchState } | undefined;
  const guard = input.openingTransferGuard;
  if (guard && !manualPlan && !requested.length && best.weeks[0]?.moves.length && !best.weeks[0].chip) {
    const canUseChip = searchGws.some(gw => CHIPS.some(chip => available(initial, gw, chip)));
    const rolling = canUseChip ? search(true, 0, undefined, true) : variants[0];
    const total = (state: SearchState) => r2(state.weeks.slice(0, gws.length).reduce((sum, week) => sum + week.netXPts, 0));
    if (rolling.weeks.length === best.weeks.length && !rolling.weeks[0]?.moves.length) {
      const movingXPts = total(best), rollingXPts = total(rolling);
      const immediateHit = best.weeks[0].hitCost;
      const minimumGain = immediateHit > 0 ? guard.hitNetGain : guard.freeMoveNetGain;
      const gain = r2(movingXPts - rollingXPts);
      const rolled = gain < minimumGain;
      openingTransferDecision = { rolled, gain, minimumGain, immediateHit, rollingXPts, movingXPts, comparedGameweeks: gws.length };
      openingPaths = {move:best,roll:rolling};
      if (rolled) { best = rolling; chipTiming = null; }
    }
  }
  const holdWeeks = allGws.map(gw => ({ gw, lineup: lineup(initial.squad, gw) }));
  const moveDetail = (m: { outId: number; inId: number }): OptimizerTransferMove => ({
    ...m, sellingPrice: initialSell[m.outId], buyPrice: byId.get(m.inId)!.cost,
    xPtsOutNextGw: forecastByGw[nextGw][m.outId], xPtsInNextGw: forecastByGw[nextGw][m.inId],
    xPtsGainNextGw: r2(forecastByGw[nextGw][m.inId] - forecastByGw[nextGw][m.outId]),
    xPtsGainHorizon: r2(gws.reduce((s, gw) => s + forecastByGw[gw][m.inId] - forecastByGw[gw][m.outId], 0)),
  });
  const first0 = variants[0].weeks[0]!;
  const firstOf = (n: number) => variants[n]?.weeks[0] ?? first0;
  const optionIds = ['roll', 'transfer1', 'transfer2', 'transfer3'] as const;
  const winnerIndex = variants.indexOf(baseline);
  const horizonTotal = (state: SearchState) => r2(state.weeks.filter(w => gws.includes(w.gw)).reduce((s, w) => s + w.netXPts, 0));
  const options: OptimizerOptionComparison[] = variants.map((state, i) => {
    const first = firstOf(i), moves = first.moves.map(moveDetail), feasible = i === 0 || moves.length === i;
    return { id: optionIds[i], feasible, label: manualPlan ? 'Saved decisions + uncommitted solver suggestions' : i === 0 ? `Roll (${initial.ft} → ${first.ftAfter} FT)` : feasible ? `${i} move${i === 1 ? '' : 's'}: ${moves.map(m => playerMap.get(m.outId)!.name + ' → ' + playerMap.get(m.inId)!.name).join(', ')}` : `No legal ${i}-move path`, action: (manualPlan ? first.moves.length === 0 : i === 0) ? 'ROLL' : 'TRANSFER', transfers: moves, hitCost: first.hitCost, nextGwXPts: first.netXPts, horizonXPts: feasible ? horizonTotal(state) : horizonTotal(variants[0]), xPtsGainVsRoll: r2(first.lineup.totalXPts - first0.lineup.totalXPts), netGainVsRoll: r2(first.netXPts - first0.netXPts), winner: i === winnerIndex, why: feasible ? `Week-by-week bank and FT replay; ${gws.length}-GW total includes all transfer hits. Ranked by ${Math.round(decay * 100)}% weekly decay through GW${allGws.at(-1)}.` : 'Budget, club or locked-player constraints prevent this path.' };
  });
  const winner = options[winnerIndex];

  // Chip valuations compare complete, feasible continuation paths on one common horizon.
  const matrix: FplReviewSimOutput['chipMatrixByGw'] = [];
  const chipRaw: Record<PlanningChip, ChipGwSimulation[]> = { wc: [], fh: [], bb: [], tc: [] };
  for (const gw of chipHalfGws) {
    const week = baseline.weeks.find(w => w.gw === gw)!;
    const index = baseline.weeks.indexOf(week);
    const before = index === 0 ? initial : (() => {
      const previous = baseline.weeks[index - 1];
      return { ...initial, squad: previous.squad, sell: previous.sellingPricesAfter, bank: previous.bankAfter, ft: previous.ftAfter };
    })();
    const gains: Record<PlanningChip, number> = { wc: 0, fh: 0, bb: 0, tc: 0 };
    for (const chip of CHIPS) {
      if (!available(initial, gw, chip)) continue;
      const action = chip === 'wc' || chip === 'fh' ? rebuild(before, gw, chip) : { squad: week.squad, bank: week.bankAfter, sell: before.sell, moves: week.moves };
      if (!action) continue;
      const lu = lineup(action.squad, gw, chip);
      const base = week.lineup;
      // WC window matches the published label: three weeks, clipped to season end.
      const wcGws = allGws.filter(g => g >= gw && g < gw + 3);
      const withChip = chip === 'wc' ? wcGws.reduce((s, g) => s + lineup(action.squad, g).totalXPts, 0) : lu.totalXPts;
      const withoutChip = chip === 'wc' ? wcGws.reduce((s, g) => s + lineup(before.squad, g).totalXPts, 0) : base.totalXPts;
      const gain = r2(withChip - withoutChip + (chip === 'fh' ? week.hitCost : 0));
      gains[chip] = gain;
      chipRaw[chip].push({ gw, xPtsWithChip: r2(withChip), xPtsNoChip: r2(withoutChip), gain, reason: chip === 'wc' ? 'Three-week rebuild versus keeping the pre-Wildcard squad; approximate diagnostic, not additive to other chip values.' : `${CHIP_LABELS[chip]} versus the no-chip transfer plan in GW${gw}.`, starters: lu.starters, bench: lu.bench, captainId: lu.captainId, viceId: lu.viceId });
    }
    matrix.push({ gw, baseXPts: week.lineup.totalXPts, wildcardGain: gains.wc, freehitGain: gains.fh, bboostGain: gains.bb, tripleCapGain: gains.tc });
  }
  const chipSimulations: ChipSimulationSummary[] = CHIPS.map(chip => {
    const used = history.find(u => u.chip === chip && (u.gw <= 19) === (nextGw <= 19));
    const sims = chipRaw[chip].sort((a, b) => b.gain - a.gain || a.gw - b.gw);
    const peak = sims[0] ?? null;
    const planned = best.uses.find(u => u.chip === chip && u.gw <= halfEnd);
    const canUse = knownHistory && !used;
    const verdictLine = !knownHistory ? 'Refresh your team to verify chip availability.' : used ? `Already used in GW${used.gw}.` : planned ? `Joint plan: ${CHIP_LABELS[chip]} in GW${planned.gw}. Individual peak values are diagnostic; the plan resolves chip clashes and squad changes.` : `Hold within this search; expires GW${halfEnd}. Recheck when fixtures or minutes change.`;
    return { chip: CHIP_NAMES[chip], available: canUse, usedGw: used?.gw ?? null, expiresGw: halfEnd, expiryDeadline: null, expiringSoon: halfEnd - nextGw <= 2, bestGw: peak?.gw ?? null, bestGain: peak?.gain ?? 0, gainNow: sims.find(s => s.gw === nextGw)?.gain ?? 0, meaningful: canUse && (peak?.gain ?? 0) > 0, verdictLine, topGws: sims.slice(0, 5), bestPitch: peak };
  });

  const pathFor = (id: string, label: string, state: SearchState): McPath => ({
    id, label, hitCost: 0,
    hitAt: gw => state.weeks.find(w => w.gw === gw)?.hitCost ?? 0,
    lineupAt: gw => state.weeks.find(w => w.gw === gw)?.lineup ?? null,
    chipAt: gw => state.weeks.find(w => w.gw === gw)?.chip,
  });
  const paths: McPath[] = [
    { id: 'roll', label: 'Hold squad · no future transfers or chips', hitCost: 0, hitAt: gw => gw === nextGw ? input.initialHitCost ?? 0 : 0, lineupAt: gw => holdWeeks.find(w => w.gw === gw)?.lineup ?? null },
    ...(savedManualState ? [pathFor('saved_manual', `Saved manual: ${manualPlan!.name} (no additional recommendations)`, savedManualState)] : []),
    pathFor('transfer_plan', manualPlan ? 'Saved plan + legal solver transfer suggestions' : 'Best transfer path · chips saved', baseline),
    ...variants.filter(s => s !== baseline && s.weeks.length).map((s, i) => pathFor(`alternative_${i}`, `Alternative · ${s.weeks[0].moves.length} move(s) now`, s)),
    ...(openingPaths ? [
      pathFor('opening_move', 'Move now and reoptimise', openingPaths.move),
      pathFor('opening_roll', 'Roll now and reoptimise', openingPaths.roll),
    ] : []),
    pathFor('chip_strategy', openingTransferDecision?.rolled ? 'Selected strategy · roll first' : 'Joint transfer + chip strategy', best),
  ];
  const seed = mixSeed(nextGw, ...[...initial.squad].sort((a, b) => a - b), initial.ft, initial.bank);
  onProgress?.('Sampling outcomes');
  const monteCarlo = runMonteCarlo({ gws, paths, holdId: 'roll', referenceId: openingPaths ? 'opening_roll' : manualPlan ? 'saved_manual' : 'transfer_plan', recommendedId: best === baseline ? 'transfer_plan' : 'chip_strategy', captaincyViceFallback: input.captaincyViceFallback, playerAt: (id, gw) =>
    elements.has(id) && models.has(`${id}:${gw}`) ? playerExpectation(id, gw).distribution : null, draws: input.draws ?? 3000, seed });
  monteCarlo.assumptions.push(
    'Independent FPL VORTEX model inspired by public Compass planner features. No claim of matching its private predictions or solver.',
    searchDescription,
    `Transfer and chip decisions use ${Math.round(decay * 100)}% weekly decay; displayed totals and Monte Carlo points are undiscounted. Chip planning continues through GW${halfEnd}; distributions cover GW${gws[0]}–GW${gws.at(-1)} only.`,
    'Win versus hold is a paired model probability of scoring more points than keeping this squad. It is not a probability of a green arrow or a predicted overall rank.',
    'Simulation reports unmodified forecast points. Auto-Build risk profiles change squad selection; ownership is not a measured field-score or rank distribution.',
    'Expected lineup points include legal autosubs and vice-captain fallback under the same appearance assumptions as the simulation.',
    'Imported means use an aggregate distribution when they differ from fixture-component forecasts. Tail probabilities remain uncalibrated.',
    'The next-GW free-transfer option is a model-based marginal hit-avoidance estimate from shortlisted legal moves. It is used only in beam pruning, not added to xPts or simulation totals.',
    'Chip timing comparison: a bounded heuristic compares complete legal play-now and defer-now continuation paths for the joint planner\'s nominated chip. Reported planning-score differences are discounted model values, not guaranteed points or globally optimal schedules.',
    ...(manualPlan ? ['The saved-manual Monte Carlo path honours committed transfers, chips, captaincy, formation, selling prices and transfer hits. Solver and chip alternatives remain unapplied.', 'Saved-plan and optimized-path comparisons use common paired gameweek samples; the model has not been historically calibrated.'] : []),
    ...warnings,
  );
  const firstChip = best.uses.find(u => u.gw <= halfEnd);
  const chipDecision = firstChip ? chipSimulations.find(c => c.chip === CHIP_NAMES[firstChip.chip]) : undefined;
  // Show the estimated value of the extra FT available next GW after rolling.
  // At GW38 or at the selected horizon's end there is no next-GW option.
  const rolledFtState: SearchState = { ...initial, ft: nextFreeTransfers(initial.ft, 0) };
  const bankedTransferValueNextGw = gws.includes(nextGw + 1)
    ? r2(decay * bankedFtOptionAt(rolledFtState, nextGw + 1)) : 0;
  const lineupBaselinesByGw: PlannerSimulationOutput['lineupBaselinesByGw'] = {};
  let permanentSquad = initial.squad;
  for (const week of best.weeks) {
    lineupBaselinesByGw[week.gw] = {
      fixedHold: lineup(initial.squad, week.gw),
      rollThisWeek: lineup(permanentSquad, week.gw),
      sameSquadNoChip: lineup(week.squad, week.gw),
    };
    if (week.chip !== 'fh') permanentSquad = week.squad;
  }
  return {
    nextGw, gws, chipHalfGws, freeTransfersNow: initial.ft, freeTransfersAfterRoll: nextFreeTransfers(initial.ft, 0),
    bankTenths: initial.bank, totalSellBudgetTenths, bankedTransferValueNextGw,
    options, winner, recommendedDecision: openingTransferDecision?.rolled || winner.action === 'ROLL' ? 'ROLL' : 'TRANSFER',
    recommendedChipDecision: { action: firstChip?.gw === nextGw ? 'PLAY' : 'HOLD', chip: firstChip?.gw === nextGw ? CHIP_NAMES[firstChip.chip] : null, gainNow: firstChip?.gw === nextGw ? chipDecision?.gainNow ?? 0 : 0, bestFutureGw: firstChip?.gw ?? null, bestFutureChip: firstChip ? CHIP_NAMES[firstChip.chip] : null, bestFutureGain: chipDecision?.bestGain ?? 0, why: firstChip ? `Joint plan: ${CHIP_LABELS[firstChip.chip]} in GW${firstChip.gw}; re-evaluate before the deadline.` : 'Keep chips available and re-evaluate when data changes.' },
    lineup0: first0.lineup, lineup1: firstOf(1).lineup, lineup2: firstOf(2).lineup,
    squad0: first0.squad, squad1: firstOf(1).squad, squad2: firstOf(2).squad,
    chipSimulations, chipMatrixByGw: matrix,
    multiGwRollout: best.weeks.filter(w => gws.includes(w.gw)).map(w => ({ gw: w.gw, lineup: w.lineup, ftAvailable: w.ftBefore })),
    monteCarlo, forecastByGw, lineupBaselinesByGw, warnings, transferWeeks: baseline.weeks,
    sourcePlan: manualPlan ? { id: manualPlan.id, name: manualPlan.name,
      committedGameweeks: new Set([...Object.keys(manualPlan.transfers), ...Object.keys(manualPlan.lineups), ...Object.keys(manualPlan.captains), ...Object.keys(manualPlan.chips)]).size,
      lockedPlayers: locked.size } : undefined,
    strategy: { weeks: best.weeks, schedule: best.uses, expectedPoints: r2(best.total), baselinePoints: r2(baseline.total), holdPoints: r2(holdWeeks.reduce((sum,week) => sum + week.lineup.totalXPts, 0) - (input.initialHitCost ?? 0)), gain: r2(best.total - baseline.total), planningScore: r2(best.score), horizon: allGws, chipTiming, openingTransferDecision, search: manualPlan ? 'Saved decisions fixed. '+searchDescription : searchDescription },
  };
}


