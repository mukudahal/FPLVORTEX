/**
 * Squad Lineup, Full-Squad ILP & Transfer Adapter
 * Powered directly by `1_APP_dashboard/src/lib/optimizer.ts` + `1_APP_dashboard/src/lib/solver.py`
 * (`solveLineupTS`, `solveFullSquadTS`, `solveKTransfersExactTS`) and `site/model/seasonRules.ts` (`RULES_2026_27`).
 */
import type {
  EnrichedPlayer,
  Position,
  RiskProfile,
  SquadPlayer,
  SquadResult,
  TransferSuggestion,
} from './types';
import { clamp, round } from './format';
import {
  positionToType,
  solveFullSquadTS,
  solveKTransfersExactTS,
  solveLineupTS,
  type SolverPlayerNode,
} from './repoModel/fplReviewSimulator';
import { RULES_2026_27 } from './repoModel/seasonRules';
import { isEligibleNewTransferTarget } from './transferEligibility';

export const POSITION_QUOTAS: Record<Position, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
export const DEFAULT_BUDGET_TENTHS = RULES_2026_27.maxBudgetTenths; // 1000 (£100.0m)
export const MAX_PLAYERS_PER_CLUB = RULES_2026_27.maxPerClub; // 3

export interface OptimizeOptions {
  budget?: number;
  profile?: RiskProfile;
  lockedIds?: number[];
  excludedIds?: number[];
  beamWidth?: number;
  poolSize?: number;
}

function toSolverMap(players: EnrichedPlayer[]): Map<number, SolverPlayerNode> {
  const byId = new Map<number, SolverPlayerNode>();
  for (const p of players) {
    byId.set(p.id, {
      id: p.id,
      type: positionToType(p.position),
      team: p.teamId,
      cost: p.cost,
      name: p.name,
    });
  }
  return byId;
}

export function evaluateSquad(players: EnrichedPlayer[], _profile: RiskProfile = 'balanced'): SquadResult {
  if (players.length < 11) throw new Error('A squad needs at least eleven players.');
  const byId = toSolverMap(players);
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const gwXPts: Record<number, number> = {};
  for (const p of players) gwXPts[p.id] = p.projection;

  const lu = solveLineupTS(
    players.map((p) => p.id),
    byId,
    gwXPts,
  );
  const starterSet = new Set(lu.starters);
  const squad: SquadPlayer[] = players.map((player) => ({
    ...player,
    isStarter: starterSet.has(player.id),
    isCaptain: player.id === lu.captainId,
    isViceCaptain: player.id === lu.viceId,
    multiplier: player.id === lu.captainId ? 2 : starterSet.has(player.id) ? 1 : 0,
  }));

  const starters = lu.starters
    .map((id) => squad.find((p) => p.id === id))
    .filter((p): p is SquadPlayer => Boolean(p));
  const bench = lu.bench
    .map((id) => squad.find((p) => p.id === id))
    .filter((p): p is SquadPlayer => Boolean(p));
  const captain = squad.find((p) => p.isCaptain) ?? starters[0] ?? squad[0];
  const viceCaptain = squad.find((p) => p.isViceCaptain) ?? starters[1] ?? captain;

  const costTenths = squad.reduce((sum, p) => sum + p.cost, 0);
  const horizon5Points = round(
    starters.reduce((sum, p) => sum + p.horizon5Projection * (p.isCaptain ? 2 : 1), 0),
    1,
  );
  const averageConfidence = round(
    squad.reduce((sum, p) => sum + p.confidence, 0) / Math.max(1, squad.length),
    2,
  );

  // Preserve deterministic order inside positions for display
  void playerMap;
  return {
    squad,
    starters,
    bench,
    captain,
    viceCaptain,
    formation: lu.formation,
    cost: round(costTenths / 10, 1),
    projectedPoints: round(lu.totalXPts + lu.benchXPts * 0.08, 1),
    horizon5Points,
    averageOwnership: round(squad.reduce((sum, p) => sum + p.ownership, 0) / Math.max(1, squad.length), 1),
    averageConfidence,
    riskScore: round(clamp(1 - averageConfidence, 0, 1), 2),
    generatedAt: new Date().toISOString(),
  };
}

export function optimizeSquad(players: EnrichedPlayer[], options: OptimizeOptions = {}): SquadResult {
  // Older callers use £m (100), while the solver uses exact £0.1m units
  // (1000). A full 15-player FPL squad cannot legally have a £20m budget.
  const rawBudget = options.budget ?? DEFAULT_BUDGET_TENTHS;
  if (!Number.isFinite(rawBudget) || rawBudget <= 0) throw new RangeError('Invalid budget.');
  const budget = rawBudget <= 200 ? Math.round(rawBudget * 10) : Math.round(rawBudget);
  const profile = options.profile ?? 'balanced';
  const lockedIds = new Set(options.lockedIds ?? []);
  const excludedIds = new Set(options.excludedIds ?? []);

  const byId = toSolverMap(players);
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const gwXPts: Record<number, number> = {};
  const horizonWeights: Record<number, number> = {};

  for (const p of players) {
    gwXPts[p.id] = p.projection;
    // Exact discounted horizon objective from `1_APP_dashboard/src/lib/solver.py`:
    // 0.1 * next + 0.35 * discounted_future
    const futureSum = Math.max(0, p.horizon5Projection - p.projection);
    horizonWeights[p.id] = 0.1 * p.projection + 0.35 * futureSum * 0.78;
  }

  const candidateIds = players
    .filter(p => (!excludedIds.has(p.id) || lockedIds.has(p.id)) &&
      (isEligibleNewTransferTarget(p) || lockedIds.has(p.id)))
    .map(p => p.id);

  const solvedIds = solveFullSquadTS(candidateIds, byId, budget, gwXPts, horizonWeights, lockedIds);
  if (solvedIds && solvedIds.length === 15) {
    const solvedPlayers = solvedIds
      .map((id) => playerMap.get(id))
      .filter((p): p is EnrichedPlayer => Boolean(p));
    if (solvedPlayers.length === 15) {
      return evaluateSquad(solvedPlayers, profile);
    }
  }

  // Fail closed; never construct an illegal/overbudget squad or silently buy an
  // injury-flagged player to fill a positional quota.
  throw new RangeError('No legal squad fits the budget, player locks and currently unflagged transfer pool. Review your selections.');
}

export function recommendTransfers(
  currentPlayers: EnrichedPlayer[],
  allPlayers: EnrichedPlayer[],
  options: OptimizeOptions & { bankTenths?: number } = {},
): TransferSuggestion[] {
  const byId = toSolverMap(allPlayers);
  const playerMap = new Map(allPlayers.map((p) => [p.id, p]));
  const squadIds = currentPlayers.map((p) => p.id);
  const squadSet = new Set(squadIds);
  const squadCost = currentPlayers.reduce((sum, p) => sum + p.cost, 0);
  const bankTenths = options.bankTenths ?? Math.max(0, DEFAULT_BUDGET_TENTHS - squadCost);

  const nextGwXPts: Record<number, number> = {};
  const horizonWeights: Record<number, number> = {};
  const sellingPrices: Record<number, number> = {};
  for (const p of allPlayers) {
    nextGwXPts[p.id] = p.projection;
    horizonWeights[p.id] = 0.1 * p.projection + 0.35 * Math.max(0, p.horizon5Projection - p.projection) * 0.78;
  }
  for (const p of currentPlayers) {
    sellingPrices[p.id] = p.cost;
  }

  const baseLu = solveLineupTS(squadIds, byId, nextGwXPts);
  const clubCounts = new Map<number, number>();
  for (const p of currentPlayers) {
    clubCounts.set(p.teamId, (clubCounts.get(p.teamId) ?? 0) + 1);
  }

  const suggestions: TransferSuggestion[] = [];
  for (const outgoing of currentPlayers) {
    const maxBuy = bankTenths + (sellingPrices[outgoing.id] ?? outgoing.cost);
    const candidates = allPlayers
      .filter((cand) => {
        if (cand.position !== outgoing.position || squadSet.has(cand.id) || !isEligibleNewTransferTarget(cand)) return false;
        if (cand.cost > maxBuy) return false;
        const clubAfter = (clubCounts.get(cand.teamId) ?? 0) - (cand.teamId === outgoing.teamId ? 1 : 0);
        return clubAfter < MAX_PLAYERS_PER_CLUB;
      })
      .sort((a, b) => b.projection + horizonWeights[b.id] - (a.projection + horizonWeights[a.id]))
      .slice(0, 6);

    for (const incoming of candidates) {
      const trialSquad = squadIds.map((id) => (id === outgoing.id ? incoming.id : id));
      const trialLu = solveLineupTS(trialSquad, byId, nextGwXPts);
      const xiGain = round(trialLu.totalXPts - baseLu.totalXPts, 2);
      const rawGain = round(incoming.projection - outgoing.projection, 2);
      const effectiveGain = Math.max(xiGain, rawGain);
      const horizonGain = round(incoming.horizon5Projection - outgoing.horizon5Projection, 2);
      if (effectiveGain <= 0.15 && horizonGain <= 0.8) continue;
      suggestions.push({
        out: outgoing,
        incoming,
        gain: effectiveGain,
        horizonGain,
        costChange: round((incoming.cost - outgoing.cost) / 10, 1),
        reason: `+${effectiveGain.toFixed(2)} GW xPts (${horizonGain >= 0 ? '+' : ''}${horizonGain.toFixed(1)} over 5 GWs) · ${incoming.modelBreakdown.fiveGwEaseScore} fixture ease score.`,
      });
    }
  }

  // Ensure exact solver's #1 single move is always surfaced first
  const exact1 = solveKTransfersExactTS(
    squadIds,
    allPlayers.filter(p => squadSet.has(p.id) || isEligibleNewTransferTarget(p)).map(p => p.id),
    byId,
    sellingPrices,
    bankTenths,
    1,
    nextGwXPts,
    horizonWeights,
  );
  if (exact1.moves[0]) {
    const outP = playerMap.get(exact1.moves[0].outId);
    const inP = playerMap.get(exact1.moves[0].inId);
    if (outP && inP && !suggestions.some((s) => s.out.id === outP.id && s.incoming.id === inP.id)) {
      const lu1 = solveLineupTS(exact1.squad, byId, nextGwXPts);
      suggestions.unshift({
        out: outP,
        incoming: inP,
        gain: round(lu1.totalXPts - baseLu.totalXPts, 2),
        horizonGain: round(inP.horizon5Projection - outP.horizon5Projection, 2),
        costChange: round((inP.cost - outP.cost) / 10, 1),
        reason: `Exact solver optimal 1-FT move (+${(lu1.totalXPts - baseLu.totalXPts).toFixed(2)} XI xPts).`,
      });
    }
  }

  const seenIn = new Set<number>();
  return suggestions
    .sort((a, b) => b.gain + (b.horizonGain ?? 0) * 0.25 - (a.gain + (a.horizonGain ?? 0) * 0.25))
    .filter((s) => {
      if (seenIn.has(s.incoming.id)) return false;
      seenIn.add(s.incoming.id);
      return true;
    })
    .slice(0, 6);
}

export function formationRisk(result: SquadResult): string {
  const risk = clamp(result.riskScore, 0, 1);
  if (risk < 0.24) return 'Low minutes variance';
  if (risk < 0.4) return 'Balanced minutes & ceiling';
  return 'High-ceiling differential variance';
}
