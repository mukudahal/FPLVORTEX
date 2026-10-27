import type {
  EnrichedPlayer,
  Position,
  RiskProfile,
  SquadPlayer,
  SquadResult,
  TransferSuggestion,
} from './types';
import { clamp, round } from './format';

export const POSITION_QUOTAS: Record<Position, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
export const DEFAULT_BUDGET_TENTHS = 1000;
export const MAX_PLAYERS_PER_CLUB = 3;

const FORMATIONS: Array<[number, number, number]> = [
  [3, 5, 2],
  [3, 4, 3],
  [4, 4, 2],
  [4, 3, 3],
  [4, 5, 1],
  [5, 3, 2],
  [5, 4, 1],
  [5, 2, 3],
  [3, 5, 2],
  [4, 2, 4],
];

export interface OptimizeOptions {
  budget?: number;
  profile?: RiskProfile;
  lockedIds?: number[];
  excludedIds?: number[];
  beamWidth?: number;
  poolSize?: number;
}

interface Candidate {
  player: EnrichedPlayer;
  index: number;
  score: number;
}

interface BeamState {
  ids: number[];
  costs: number;
  score: number;
  teamCounts: Uint8Array;
  cursor: number;
}

function profileScore(player: EnrichedPlayer, profile: RiskProfile): number {
  switch (profile) {
    case 'safe':
      return player.projection * 0.92 + player.confidence * 0.55 + (player.ownership / 100) * 0.32;
    case 'differential':
      return player.projection * 1.03 + player.leverage * 0.8 - (player.ownership / 100) * 0.15;
    case 'upside':
      return player.projection * 1.05 + player.roleScore * 0.22 + Math.max(0, player.momentum) * 0.18;
    default:
      return player.projection + player.confidence * 0.12;
  }
}

function buildCandidatePool(
  players: EnrichedPlayer[],
  position: Position,
  profile: RiskProfile,
  poolSize: number,
  lockedIds: Set<number>,
  excludedIds: Set<number>,
): Candidate[] {
  const eligible = players.filter((player) => {
    if (player.position !== position || player.cost <= 0) return false;
    if (excludedIds.has(player.id) && !lockedIds.has(player.id)) return false;
    return player.availability >= 0.08;
  });
  const ranked = eligible
    .map((player) => ({ player, score: profileScore(player, profile) }))
    .sort((a, b) => b.score - a.score || a.player.cost - b.player.cost);
  const selected = ranked.slice(0, poolSize);
  const cheapest = [...eligible].sort((a, b) => a.cost - b.cost).slice(0, 4);
  const locked = eligible.filter((player) => lockedIds.has(player.id));
  const unique = new Map<number, EnrichedPlayer>();
  for (const item of [...selected.map((item) => item.player), ...cheapest, ...locked]) {
    unique.set(item.id, item);
  }
  return [...unique.values()]
    .map((player, index) => ({ player, index, score: profileScore(player, profile) }))
    .sort((a, b) => b.score - a.score || a.player.cost - b.player.cost)
    .map((item, index) => ({ ...item, index }));
}

function initialState(locked: EnrichedPlayer[]): BeamState {
  const teamCounts = new Uint8Array(32);
  let costs = 0;
  let score = 0;
  const ids: number[] = [];
  for (const player of locked) {
    if (ids.includes(player.id)) continue;
    ids.push(player.id);
    costs += player.cost;
    score += player.projection;
    if (player.teamId >= 0 && player.teamId < teamCounts.length) teamCounts[player.teamId] += 1;
  }
  return { ids, costs, score, teamCounts, cursor: -1 };
}

function minRemainingCost(
  pools: Array<{ position: Position; needed: number; candidates: Candidate[] }>,
  groupIndex: number,
): number {
  let total = 0;
  for (let index = groupIndex; index < pools.length; index += 1) {
    const pool = pools[index];
    if (!pool || pool.needed <= 0) continue;
    const costs = pool.candidates.map((candidate) => candidate.player.cost).sort((a, b) => a - b);
    if (costs.length < pool.needed) return Number.POSITIVE_INFINITY;
    total += costs.slice(0, pool.needed).reduce((sum, cost) => sum + cost, 0);
  }
  return total;
}

function expandBeam(
  states: BeamState[],
  pool: Candidate[],
  needed: number,
  budget: number,
  beamWidth: number,
  remainingCostAfterGroup: number,
): BeamState[] {
  let current = states;
  for (let slot = 0; slot < needed; slot += 1) {
    const next: BeamState[] = [];
    for (const state of current) {
      for (const candidate of pool) {
        if (candidate.index <= state.cursor) continue;
        const { player } = candidate;
        if (state.ids.includes(player.id)) continue;
        const clubCount = state.teamCounts[player.teamId] ?? 0;
        if (clubCount >= MAX_PLAYERS_PER_CLUB) continue;
        const newCost = state.costs + player.cost;
        if (newCost > budget) continue;
        const slotsAfterThis = needed - slot - 1;
        const cheapestInGroup = pool
          .filter((item) => item.index > candidate.index)
          .slice(0, slotsAfterThis)
          .reduce((sum, item) => sum + item.player.cost, 0);
        if (newCost + cheapestInGroup + remainingCostAfterGroup > budget) continue;
        const teamCounts = new Uint8Array(state.teamCounts);
        teamCounts[player.teamId] = clubCount + 1;
        next.push({
          ids: [...state.ids, player.id],
          costs: newCost,
          score: state.score + candidate.score,
          teamCounts,
          cursor: candidate.index,
        });
      }
    }
    if (!next.length) return [];
    next.sort((a, b) => b.score - a.score || a.costs - b.costs);
    current = next.slice(0, beamWidth);
  }
  return current.map((state) => ({ ...state, cursor: -1 }));
}

function cheapestFallback(players: EnrichedPlayer[], locked: EnrichedPlayer[]): EnrichedPlayer[] {
  const squad = [...locked];
  const index = new Map(players.map((player) => [player.id, player]));
  for (const [position, quota] of Object.entries(POSITION_QUOTAS) as Array<[Position, number]>) {
    const have = squad.filter((player) => player.position === position).length;
    const candidates = players
      .filter((player) => player.position === position && !squad.some((item) => item.id === player.id))
      .sort((a, b) => a.cost - b.cost || b.projection - a.projection);
    for (const player of candidates.slice(0, quota - have)) squad.push(player);
  }
  for (const id of squad.map((player) => player.id)) {
    if (!index.has(id)) return squad;
  }
  return squad.slice(0, 15);
}

export function evaluateSquad(players: EnrichedPlayer[], profile: RiskProfile = 'balanced'): SquadResult {
  if (players.length < 11) throw new Error('A squad needs at least eleven players.');
  const sorted = [...players].sort((a, b) => a.position.localeCompare(b.position) || a.cost - b.cost);
  const projectionRank = (player: EnrichedPlayer) => profileScore(player, profile);
  const goalkeepers = sorted.filter((player) => player.position === 'GKP').sort((a, b) => projectionRank(b) - projectionRank(a));
  const defenders = sorted.filter((player) => player.position === 'DEF').sort((a, b) => projectionRank(b) - projectionRank(a));
  const midfielders = sorted.filter((player) => player.position === 'MID').sort((a, b) => projectionRank(b) - projectionRank(a));
  const forwards = sorted.filter((player) => player.position === 'FWD').sort((a, b) => projectionRank(b) - projectionRank(a));
  const preferredGk = goalkeepers[0];
  if (!preferredGk) throw new Error('A squad needs a goalkeeper.');

  let best: { starters: EnrichedPlayer[]; formation: string; score: number } | null = null;
  for (const [defCount, midCount, fwdCount] of FORMATIONS) {
    if (defenders.length < defCount || midfielders.length < midCount || forwards.length < fwdCount) continue;
    const starters = [
      preferredGk,
      ...defenders.slice(0, defCount),
      ...midfielders.slice(0, midCount),
      ...forwards.slice(0, fwdCount),
    ];
    const starterIds = new Set(starters.map((player) => player.id));
    const bench = sorted.filter((player) => !starterIds.has(player.id));
    const rankedStarters = [...starters].sort((a, b) => b.projection - a.projection);
    const captain = rankedStarters[0];
    const score =
      starters.reduce((sum, player) => sum + player.projection, 0) +
      captain.projection +
      bench.reduce((sum, player) => sum + player.projection, 0) * 0.075;
    if (!best || score > best.score) {
      best = { starters, formation: `${defCount}-${midCount}-${fwdCount}`, score };
    }
  }
  if (!best) throw new Error('No valid formation could be built.');

  const starterIds = new Set(best.starters.map((player) => player.id));
  const rankedStarters = [...best.starters].sort((a, b) => b.projection - a.projection);
  const captain = rankedStarters[0];
  const viceCaptain = rankedStarters[1] ?? rankedStarters[0];
  const squad: SquadPlayer[] = sorted.map((player) => ({
    ...player,
    isStarter: starterIds.has(player.id),
    isCaptain: player.id === captain.id,
    isViceCaptain: player.id === viceCaptain.id,
    multiplier: player.id === captain.id ? 2 : starterIds.has(player.id) ? 1 : 0,
  }));
  const starters = squad.filter((player) => player.isStarter);
  const bench = squad.filter((player) => !player.isStarter);
  const costTenths = squad.reduce((sum, player) => sum + player.cost, 0);
  const projectedPoints = best.score;
  return {
    squad,
    starters,
    bench,
    captain: squad.find((player) => player.isCaptain) ?? squad[0],
    viceCaptain: squad.find((player) => player.isViceCaptain) ?? squad[1] ?? squad[0],
    formation: best.formation,
    cost: round(costTenths / 10, 1),
    projectedPoints: round(projectedPoints, 1),
    averageOwnership: round(squad.reduce((sum, player) => sum + player.ownership, 0) / squad.length, 1),
    averageConfidence: round(squad.reduce((sum, player) => sum + player.confidence, 0) / squad.length, 2),
    riskScore: round(1 - squad.reduce((sum, player) => sum + player.confidence, 0) / squad.length, 2),
    generatedAt: new Date().toISOString(),
  };
}

export function optimizeSquad(players: EnrichedPlayer[], options: OptimizeOptions = {}): SquadResult {
  const budget = options.budget ?? DEFAULT_BUDGET_TENTHS;
  const profile = options.profile ?? 'balanced';
  const beamWidth = options.beamWidth ?? 520;
  const poolSize = options.poolSize ?? 22;
  const lockedIds = new Set(options.lockedIds ?? []);
  const excludedIds = new Set(options.excludedIds ?? []);
  const playerIndex = new Map(players.map((player) => [player.id, player]));
  const locked = [...lockedIds]
    .map((id) => playerIndex.get(id))
    .filter((player): player is EnrichedPlayer => Boolean(player));

  const groupSpecs = (Object.keys(POSITION_QUOTAS) as Position[]).map((position) => {
    const need = Math.max(0, POSITION_QUOTAS[position] - locked.filter((player) => player.position === position).length);
    return {
      position,
      needed: need,
      candidates: buildCandidatePool(players, position, profile, poolSize, lockedIds, excludedIds),
    };
  });

  let states = [initialState(locked)];
  for (let groupIndex = 0; groupIndex < groupSpecs.length; groupIndex += 1) {
    const group = groupSpecs[groupIndex];
    if (group.needed === 0) continue;
    const remaining = minRemainingCost(groupSpecs, groupIndex + 1);
    states = expandBeam(states, group.candidates, group.needed, budget, beamWidth, remaining);
    if (!states.length) break;
  }

  let bestResult: SquadResult | null = null;
  for (const state of states.slice(0, 120)) {
    const squadPlayers = state.ids
      .map((id) => playerIndex.get(id))
      .filter((player): player is EnrichedPlayer => Boolean(player));
    if (squadPlayers.length !== 15) continue;
    try {
      const result = evaluateSquad(squadPlayers, profile);
      if (!bestResult || result.projectedPoints > bestResult.projectedPoints) bestResult = result;
    } catch {
      // Ignore malformed beam states.
    }
  }
  if (bestResult) return bestResult;

  const fallback = cheapestFallback(players, locked);
  return evaluateSquad(fallback, profile);
}

export function recommendTransfers(
  currentPlayers: EnrichedPlayer[],
  allPlayers: EnrichedPlayer[],
  options: OptimizeOptions = {},
): TransferSuggestion[] {
  const profile = options.profile ?? 'balanced';
  const squadCost = currentPlayers.reduce((sum, player) => sum + player.cost, 0);
  const squadIds = new Set(currentPlayers.map((player) => player.id));
  const clubCounts = new Map<number, number>();
  for (const player of currentPlayers) clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);
  const suggestions: TransferSuggestion[] = [];

  for (const outgoing of currentPlayers) {
    const budgetAfterSale = DEFAULT_BUDGET_TENTHS - squadCost + outgoing.cost;
    const candidates = allPlayers
      .filter((player) => {
        if (player.position !== outgoing.position || squadIds.has(player.id)) return false;
        const clubCount = (clubCounts.get(player.teamId) ?? 0) - (player.teamId === outgoing.teamId ? 1 : 0);
        return clubCount < MAX_PLAYERS_PER_CLUB && player.cost <= budgetAfterSale;
      })
      .sort((a, b) => profileScore(b, profile) - profileScore(a, profile))
      .slice(0, 8);
    for (const incoming of candidates) {
      const gain = round(profileScore(incoming, profile) - profileScore(outgoing, profile), 2);
      if (gain <= 0.15) continue;
      const costChange = round((incoming.cost - outgoing.cost) / 10, 1);
      const reasonParts = [
        gain >= 2 ? 'Large projected-point upgrade' : 'Projected-point upgrade',
        incoming.fixtureScore < outgoing.fixtureScore ? 'better fixture run' : 'stronger current role',
      ];
      if (incoming.ownership < 15) reasonParts.push('low ownership');
      suggestions.push({
        out: outgoing,
        incoming,
        gain,
        costChange,
        reason: `${reasonParts[0]} with ${reasonParts[1]}${reasonParts[2] ? ` and ${reasonParts[2]}` : ''}.`,
      });
    }
  }
  const seenIncoming = new Set<number>();
  return suggestions
    .sort((a, b) => b.gain - a.gain || a.costChange - b.costChange)
    .filter((suggestion) => {
      if (seenIncoming.has(suggestion.incoming.id)) return false;
      seenIncoming.add(suggestion.incoming.id);
      return true;
    })
    .slice(0, 5);
}

export function formationRisk(result: SquadResult): string {
  const risk = clamp(result.riskScore, 0, 1);
  if (risk < 0.24) return 'Low variance';
  if (risk < 0.4) return 'Controlled variance';
  return 'High-upside variance';
}
