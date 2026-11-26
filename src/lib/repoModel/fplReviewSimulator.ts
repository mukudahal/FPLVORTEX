/**
 * FPLReview-Grade Multi-GW Transfer, Chip EV Matrix & Paired Monte Carlo Simulator
 * Ported directly from `1_APP_dashboard/src/lib/optimizer.ts`, `1_APP_dashboard/src/lib/solver.py`,
 * and `site/model/monteCarlo.ts` in `mukudahal/FPLVORTEX`.
 */
import type { EnrichedPlayer, Position } from '../types';
import type {
  ChipGwSimulation,
  ChipSimulationSummary,
  OptimizerOptionComparison,
  OptimizerTransferMove,
} from './dashboardTypes';
import { clamp } from '../format';
import { selectOptimalXI } from './scoring';
import { runMonteCarlo, MC_DRAWS, mixSeed, type McPath, type McPlayerGw } from './monteCarlo';
import { computePlayerXPts, computePositionPriors } from './xpts';
import type { Fixture as RepoFixture, MonteCarloSummary, SlimElement, SlimTeam } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface SolverPlayerNode {
  id: number;
  type: 1 | 2 | 3 | 4;
  team: number;
  cost: number; // tenths of £m
  name: string;
}

export interface LineupSolution {
  starters: number[];
  bench: number[];
  captainId: number;
  viceId: number;
  xiXPts: number;
  autosubXPts?: number;
  captainXPts: number;
  benchXPts: number;
  totalXPts: number;
  formation: string;
}

export function positionToType(pos: Position): 1 | 2 | 3 | 4 {
  if (pos === 'GKP') return 1;
  if (pos === 'DEF') return 2;
  if (pos === 'MID') return 3;
  return 4;
}

/**
 * Exact lineup solver from `1_APP_dashboard/src/lib/optimizer.ts` (`solveLineupTS`)
 * and `1_APP_dashboard/src/lib/solver.py` (`solve_lineup_from_squad`).
 */
export function solveLineupTS(
  squadIds: number[],
  byId: Map<number, SolverPlayerNode>,
  gwXPts: Record<number, number>,
  benchBoost = false,
  tripleCaptain = false,
): LineupSolution {
  const lu = selectOptimalXI(squadIds, id => byId.get(id)?.type ?? 0, id => gwXPts[id] ?? 0);
  const captainId = lu.captain ?? 0;
  const capExtra = lu.capXp * (tripleCaptain ? 2 : 1);
  return {
    starters: lu.starters, bench: lu.bench, captainId, viceId: lu.vice ?? captainId,
    xiXPts: round2(lu.xi), captainXPts: round2(capExtra), benchXPts: round2(lu.benchXp),
    totalXPts: round2(lu.xi + capExtra + (benchBoost ? lu.benchXp : 0)), formation: lu.formation,
  };
}

function squadObjective(
  squadIds: number[],
  byId: Map<number, SolverPlayerNode>,
  nextGwXPts: Record<number, number>,
  horizonWeights: Record<number, number>,
): number {
  const lu = solveLineupTS(squadIds, byId, nextGwXPts);
  const horizonSum = squadIds.reduce((acc, id) => acc + (horizonWeights[id] ?? 0), 0);
  return lu.totalXPts + horizonSum;
}

/**
 * Shortlisted 0/1/2-transfer search ported from `1_APP_dashboard/src/lib/solver.py` (`solve_k_transfers_exact`).
 */
export function solveKTransfersExactTS(
  currentSquad: number[],
  candidateIds: number[],
  byId: Map<number, SolverPlayerNode>,
  sellingPrices: Record<number, number>,
  bank: number,
  k: 0 | 1 | 2,
  nextGwXPts: Record<number, number>,
  horizonWeights: Record<number, number>,
): { squad: number[]; moves: Array<{ outId: number; inId: number }> } {
  if (k === 0) {
    return { squad: [...currentSquad], moves: [] };
  }

  const currentSet = new Set(currentSquad);
  const candsByType: Record<1 | 2 | 3 | 4, number[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const cid of candidateIds) {
    if (currentSet.has(cid)) continue;
    const node = byId.get(cid);
    if (node) candsByType[node.type].push(cid);
  }
  for (const t of [1, 2, 3, 4] as const) {
    candsByType[t].sort(
      (a, b) =>
        (nextGwXPts[b] ?? 0) + (horizonWeights[b] ?? 0) - ((nextGwXPts[a] ?? 0) + (horizonWeights[a] ?? 0)),
    );
    candsByType[t] = candsByType[t].slice(0, 35);
  }

  const clubCounts = new Map<number, number>();
  for (const pid of currentSquad) {
    const team = byId.get(pid)?.team ?? 0;
    clubCounts.set(team, (clubCounts.get(team) ?? 0) + 1);
  }

  let bestObj = -1e9;
  let bestSquad = [...currentSquad];
  let bestMoves: Array<{ outId: number; inId: number }> = [];

  if (k === 1) {
    for (const outId of currentSquad) {
      const outNode = byId.get(outId);
      if (!outNode) continue;
      const sellP = sellingPrices[outId] ?? outNode.cost;
      const maxBuy = bank + sellP;
      for (const inId of candsByType[outNode.type]) {
        const inNode = byId.get(inId);
        if (!inNode || inNode.cost > maxBuy) continue;
        if (inNode.team !== outNode.team && (clubCounts.get(inNode.team) ?? 0) >= 3) continue;
        const candSq = currentSquad.map((p) => (p === outId ? inId : p));
        const obj = squadObjective(candSq, byId, nextGwXPts, horizonWeights);
        if (obj > bestObj) {
          bestObj = obj;
          bestSquad = candSq;
          bestMoves = [{ outId, inId }];
        }
      }
    }
    return { squad: bestSquad, moves: bestMoves };
  }

  // k === 2: exact top-28 swap-pair enumeration from solver.py
  const singleSwaps: Array<{ gain: number; outId: number; inId: number; netBankDelta: number }> = [];
  for (const outId of currentSquad) {
    const outNode = byId.get(outId);
    if (!outNode) continue;
    const sellP = sellingPrices[outId] ?? outNode.cost;
    const outVal = (nextGwXPts[outId] ?? 0) + (horizonWeights[outId] ?? 0);
    for (const inId of candsByType[outNode.type].slice(0, 20)) {
      const inNode = byId.get(inId);
      if (!inNode) continue;
      const inVal = (nextGwXPts[inId] ?? 0) + (horizonWeights[inId] ?? 0);
      if (inVal <= outVal) continue;
      singleSwaps.push({
        gain: inVal - outVal,
        outId,
        inId,
        netBankDelta: sellP - inNode.cost,
      });
    }
  }
  singleSwaps.sort((a, b) => b.gain - a.gain);
  const topSwaps = singleSwaps.slice(0, 28);

  for (let i = 0; i < topSwaps.length; i += 1) {
    const s1 = topSwaps[i];
    for (let j = i + 1; j < topSwaps.length; j += 1) {
      const s2 = topSwaps[j];
      if (s1.outId === s2.outId || s1.inId === s2.inId) continue;
      if (bank + s1.netBankDelta + s2.netBankDelta < 0) continue;
      const candSq = currentSquad.map((p) => (p === s1.outId ? s1.inId : p === s2.outId ? s2.inId : p));
      const t1 = byId.get(s1.inId)?.team ?? 0;
      const t2 = byId.get(s2.inId)?.team ?? 0;
      if (candSq.filter((p) => byId.get(p)?.team === t1).length > 3) continue;
      if (candSq.filter((p) => byId.get(p)?.team === t2).length > 3) continue;
      const obj = squadObjective(candSq, byId, nextGwXPts, horizonWeights);
      if (obj > bestObj) {
        bestObj = obj;
        bestSquad = candSq;
        bestMoves = [
          { outId: s1.outId, inId: s1.inId },
          { outId: s2.outId, inId: s2.inId },
        ];
      }
    }
  }

  return { squad: bestSquad, moves: bestMoves };
}

/**
 * Constrained 15-player greedy construction + local swap refinement adapted
 * from `1_APP_dashboard/src/lib/solver.py` (`solve_full_squad`).
 */
export function solveFullSquadTS(
  candidateIds: number[],
  byId: Map<number, SolverPlayerNode>,
  totalBudgetTenths: number,
  gwXPts: Record<number, number>,
  horizonWeights: Record<number, number> = {},
  lockedIds: Set<number> = new Set(),
): number[] | null {
  const reqByPos: Record<1 | 2 | 3 | 4, number> = { 1: 2, 2: 5, 3: 5, 4: 3 };
  const squad: number[] = [];
  const clubCnt = new Map<number, number>();

  for (const lid of lockedIds) {
    const node = byId.get(lid);
    if (!node) continue;
    const posCnt = squad.filter((id) => byId.get(id)?.type === node.type).length;
    if (posCnt >= reqByPos[node.type]) continue;
    if ((clubCnt.get(node.team) ?? 0) >= 3) continue;
    squad.push(lid);
    clubCnt.set(node.team, (clubCnt.get(node.team) ?? 0) + 1);
  }

  const byPos: Record<1 | 2 | 3 | 4, number[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const cid of candidateIds) {
    const node = byId.get(cid);
    if (node && !squad.includes(cid)) byPos[node.type].push(cid);
  }

  // Cheapest valid 15 first so feasibility is guaranteed under tight budgets
  for (const t of [1, 2, 3, 4] as const) {
    const cheap = [...byPos[t]].sort(
      (a, b) => (byId.get(a)?.cost ?? 999) - (byId.get(b)?.cost ?? 999) || (gwXPts[b] ?? 0) - (gwXPts[a] ?? 0),
    );
    for (const pid of cheap) {
      if (squad.filter((id) => byId.get(id)?.type === t).length >= reqByPos[t]) break;
      const club = byId.get(pid)?.team ?? 0;
      if ((clubCnt.get(club) ?? 0) >= 3) continue;
      squad.push(pid);
      clubCnt.set(club, (clubCnt.get(club) ?? 0) + 1);
    }
  }

  if (squad.length < 15) return null;

  let spent = squad.reduce((sum, id) => sum + (byId.get(id)?.cost ?? 0), 0);
  if (spent > totalBudgetTenths) return null;

  const valOf = (id: number) => (gwXPts[id] ?? 0) + (horizonWeights[id] ?? 0);
  const allRanked = [...candidateIds].sort((a, b) => valOf(b) - valOf(a));

  // Two upgrade passes for optimal local convergence
  for (let pass = 0; pass < 2; pass += 1) {
    for (const cand of allRanked) {
      if (squad.includes(cand)) continue;
      const candNode = byId.get(cand);
      if (!candNode) continue;
      const cVal = valOf(cand);
      const samePos = squad
        .filter((id) => !lockedIds.has(id) && byId.get(id)?.type === candNode.type)
        .sort((a, b) => valOf(a) - valOf(b));
      for (const cur of samePos) {
        const curNode = byId.get(cur);
        if (!curNode || cVal <= valOf(cur)) continue;
        const newSpent = spent - curNode.cost + candNode.cost;
        if (newSpent > totalBudgetTenths) continue;
        if (candNode.team !== curNode.team && (clubCnt.get(candNode.team) ?? 0) >= 3) continue;
        const idx = squad.indexOf(cur);
        squad[idx] = cand;
        spent = newSpent;
        clubCnt.set(curNode.team, (clubCnt.get(curNode.team) ?? 1) - 1);
        clubCnt.set(candNode.team, (clubCnt.get(candNode.team) ?? 0) + 1);
        break;
      }
    }
  }

  return squad;
}

export interface FplReviewSimInput {
  players: EnrichedPlayer[];
  currentSquadIds: number[];
  bankTenths: number; // e.g. 4 = £0.4m
  freeTransfersNow: number; // 1..5
  nextGw: number;
  horizon?: number; // default 6
  chipsUsed?: Array<{ name: string; event: number }>;
  repoFixtures: RepoFixture[];
  repoTeams: SlimTeam[];
  repoElements: SlimElement[];
  sellingPrices?: Record<number, number>;
  draws?: number;
}

export interface FplReviewSimOutput {
  nextGw: number;
  gws: number[];
  chipHalfGws: number[];
  freeTransfersNow: number;
  freeTransfersAfterRoll: number;
  bankTenths: number;
  totalSellBudgetTenths: number;
  bankedTransferValueNextGw: number;
  options: OptimizerOptionComparison[];
  winner: OptimizerOptionComparison;
  recommendedDecision: 'ROLL' | 'TRANSFER';
  recommendedChipDecision: {
    action: 'PLAY' | 'HOLD';
    chip: string | null;
    gainNow: number;
    bestFutureGw: number | null;
    bestFutureChip: string | null;
    bestFutureGain: number;
    why: string;
  };
  lineup0: LineupSolution;
  lineup1: LineupSolution;
  lineup2: LineupSolution;
  squad0: number[];
  squad1: number[];
  squad2: number[];
  chipSimulations: ChipSimulationSummary[];
  /** GW-by-GW EV matrix for Wildcard, Free Hit, Bench Boost, Triple Captain (FPLReview style) */
  chipMatrixByGw: Array<{
    gw: number;
    baseXPts: number;
    wildcardGain: number;
    freehitGain: number;
    bboostGain: number;
    tripleCapGain: number;
  }>;
  multiGwRollout: Array<{
    gw: number;
    lineup: LineupSolution;
    ftAvailable: number;
  }>;
  monteCarlo: MonteCarloSummary;
}

export function runFplReviewSimulation(input: FplReviewSimInput): FplReviewSimOutput {
  const horizon = clamp(input.horizon ?? 6, 3, 10);
  const nextGw = input.nextGw;
  const gws = Array.from({ length: horizon }, (_, idx) => nextGw + idx).filter((gw) => gw <= 38);
  const inFirstHalf = nextGw <= 19;
  const halfEnd = inFirstHalf ? Math.min(19, nextGw + 9) : Math.min(38, nextGw + 9);
  const chipHalfGws = Array.from({ length: Math.max(1, halfEnd - nextGw + 1) }, (_, idx) => nextGw + idx);

  const byId = new Map<number, SolverPlayerNode>();
  const playerMap = new Map<number, EnrichedPlayer>();
  for (const p of input.players) {
    byId.set(p.id, {
      id: p.id,
      type: positionToType(p.position),
      team: p.teamId,
      cost: p.cost,
      name: p.name,
    });
    playerMap.set(p.id, p);
  }

  // Build xPtsByGw across all simulated GWs (using repo CSV GW projections when present, else repo model xPts)
  const allSimGws = [...new Set([...gws, ...chipHalfGws])].sort((a, b) => a - b);
  const xPtsByGw: Record<number, Record<number, number>> = {};
  for (const gw of allSimGws) {
    const map: Record<number, number> = {};
    for (const p of input.players) {
      map[p.id] = p.gwProjections?.[gw] ?? p.projection;
    }
    xPtsByGw[gw] = map;
  }

  const nextGwXPts = xPtsByGw[nextGw] ?? {};
  const horizonWeights: Record<number, number> = {};
  for (const p of input.players) {
    let fut = 0;
    for (let i = 1; i < gws.length; i += 1) {
      fut += Math.pow(0.88, i) * (xPtsByGw[gws[i]]?.[p.id] ?? 0);
    }
    horizonWeights[p.id] = 0.1 * (nextGwXPts[p.id] ?? 0) + 0.35 * fut;
  }

  const sellingPrices: Record<number, number> = {};
  for (const id of input.currentSquadIds) {
    sellingPrices[id] = input.sellingPrices?.[id] ?? byId.get(id)?.cost ?? 45;
  }

  // Shortlist top candidates per position plus all current squad players
  const candidateSet = new Set<number>(input.currentSquadIds);
  for (const pos of ['GKP', 'DEF', 'MID', 'FWD'] as const) {
    input.players
      .filter((p) => p.position === pos && p.availability >= 0.4)
      .sort((a, b) => (nextGwXPts[b.id] ?? 0) + (horizonWeights[b.id] ?? 0) - ((nextGwXPts[a.id] ?? 0) + (horizonWeights[a.id] ?? 0)))
      .slice(0, pos === 'GKP' ? 20 : 45)
      .forEach((p) => candidateSet.add(p.id));
  }
  const candidateIds = [...candidateSet];

  const { squad: squad0 } = solveKTransfersExactTS(
    input.currentSquadIds,
    candidateIds,
    byId,
    sellingPrices,
    input.bankTenths,
    0,
    nextGwXPts,
    horizonWeights,
  );
  const { squad: squad1, moves: rawMoves1 } = solveKTransfersExactTS(
    input.currentSquadIds,
    candidateIds,
    byId,
    sellingPrices,
    input.bankTenths,
    1,
    nextGwXPts,
    horizonWeights,
  );
  const { squad: squad2, moves: rawMoves2 } = solveKTransfersExactTS(
    input.currentSquadIds,
    candidateIds,
    byId,
    sellingPrices,
    input.bankTenths,
    2,
    nextGwXPts,
    horizonWeights,
  );

  const lineup0 = solveLineupTS(squad0, byId, nextGwXPts);
  const lineup1 = solveLineupTS(squad1, byId, nextGwXPts);
  const lineup2 = solveLineupTS(squad2, byId, nextGwXPts);

  const evalHorizon = (sq: number[]) =>
    round2(gws.reduce((acc, gw) => acc + solveLineupTS(sq, byId, xPtsByGw[gw] ?? {}).totalXPts, 0));

  const hor0 = evalHorizon(squad0);
  const hor1 = evalHorizon(squad1);
  const hor2 = evalHorizon(squad2);

  // Value of banking FT (ported from 1_APP_dashboard/src/lib/optimizer.ts lines 259-268)
  const gw2 = gws[1] ?? nextGw;
  const gw2XPts = xPtsByGw[gw2] ?? nextGwXPts;
  const { squad: rollGw2Squad } = solveKTransfersExactTS(
    squad0,
    candidateIds,
    byId,
    sellingPrices,
    input.bankTenths,
    1,
    gw2XPts,
    {},
  );
  const gw2BaseLu = solveLineupTS(squad0, byId, gw2XPts);
  const gw2RollLu = solveLineupTS(rollGw2Squad, byId, gw2XPts);
  const gw2Gain = Math.max(0, gw2RollLu.totalXPts - gw2BaseLu.totalXPts);

  const ftNow = clamp(input.freeTransfersNow, 1, 5);
  const ftAfterRoll = Math.min(5, ftNow + 1);
  const bankedTransferValueNextGw = ftNow >= 5 ? 0 : round2(clamp(gw2Gain * 0.65, 1.15, 2.6));

  const buildMoveDetail = (m: { outId: number; inId: number }): OptimizerTransferMove => {
    const outNext = nextGwXPts[m.outId] ?? 0;
    const inNext = nextGwXPts[m.inId] ?? 0;
    const outHor = gws.reduce((acc, gw) => acc + (xPtsByGw[gw]?.[m.outId] ?? 0), 0);
    const inHor = gws.reduce((acc, gw) => acc + (xPtsByGw[gw]?.[m.inId] ?? 0), 0);
    return {
      outId: m.outId,
      inId: m.inId,
      sellingPrice: sellingPrices[m.outId] ?? byId.get(m.outId)?.cost ?? 0,
      buyPrice: byId.get(m.inId)?.cost ?? 0,
      xPtsOutNextGw: round2(outNext),
      xPtsInNextGw: round2(inNext),
      xPtsGainNextGw: round2(inNext - outNext),
      xPtsGainHorizon: round2(inHor - outHor),
    };
  };

  const moves1 = rawMoves1.map(buildMoveDetail);
  const moves2 = rawMoves2.map(buildMoveDetail);

  const hit1 = ftNow >= 1 ? 0 : 4;
  const hit2 = Math.max(0, 2 - ftNow) * 4;

  const gain1NextGw = round2(lineup1.totalXPts - lineup0.totalXPts - hit1);
  const gain2NextGw = round2(lineup2.totalXPts - lineup0.totalXPts - hit2);

  const move1HorPerGw = (hor1 - hor0) / Math.max(1, gws.length);
  const effectiveGain1 = round2(Math.max(gain1NextGw, gain1NextGw + 0.35 * move1HorPerGw));
  const shouldRollOver1 = moves1.length === 0 || effectiveGain1 < bankedTransferValueNextGw;
  const net2Beats1 = moves2.length === 2 && gain2NextGw > gain1NextGw + 1.0 && gain2NextGw > bankedTransferValueNextGw;

  let winnerId: 'roll' | 'transfer1' | 'transfer2' = 'roll';
  if (net2Beats1) winnerId = 'transfer2';
  else if (!shouldRollOver1) winnerId = 'transfer1';

  const options: OptimizerOptionComparison[] = [
    {
      id: 'roll',
      label: `Roll transfer (${ftNow} → ${ftAfterRoll} FT)`,
      action: 'ROLL',
      transfers: [],
      hitCost: 0,
      nextGwXPts: lineup0.totalXPts,
      horizonXPts: hor0,
      xPtsGainVsRoll: 0,
      netGainVsRoll: 0,
      winner: winnerId === 'roll',
      why:
        ftNow >= 5
          ? 'At 5 FT cap — rolling forfeits an extra transfer.'
          : `Carries ${ftAfterRoll} FTs into GW${nextGw + 1} (banked FT EV +${bankedTransferValueNextGw.toFixed(2)} xPts).`,
    },
    {
      id: 'transfer1',
      label:
        moves1.length > 0
          ? `1 FT: ${playerMap.get(moves1[0].outId)?.name ?? '?'} → ${playerMap.get(moves1[0].inId)?.name ?? '?'}`
          : '1 transfer (none improves XI)',
      action: 'TRANSFER',
      transfers: moves1,
      hitCost: hit1,
      nextGwXPts: round2(lineup1.totalXPts - hit1),
      horizonXPts: round2(hor1 - hit1),
      xPtsGainVsRoll: round2(lineup1.totalXPts - lineup0.totalXPts),
      netGainVsRoll: gain1NextGw,
      winner: winnerId === 'transfer1',
      why:
        moves1.length > 0
          ? `${gain1NextGw >= 0 ? '+' : ''}${gain1NextGw.toFixed(2)} net xPts in GW${nextGw} (${(hor1 - hor0 >= 0 ? '+' : '') + (hor1 - hor0).toFixed(1)} over ${gws.length} GWs).`
          : 'Current 15 already maximizes expected XI.',
    },
    {
      id: 'transfer2',
      label:
        moves2.length === 2
          ? `2 Moves${hit2 > 0 ? ` (−${hit2})` : ' (2 FT)'}: ${moves2.map((m) => `${playerMap.get(m.outId)?.name}→${playerMap.get(m.inId)?.name}`).join(', ')}`
          : '2 transfers',
      action: 'TRANSFER',
      transfers: moves2,
      hitCost: hit2,
      nextGwXPts: round2(lineup2.totalXPts - hit2),
      horizonXPts: round2(hor2 - hit2),
      xPtsGainVsRoll: round2(lineup2.totalXPts - lineup0.totalXPts),
      netGainVsRoll: gain2NextGw,
      winner: winnerId === 'transfer2',
      why:
        moves2.length === 2
          ? `Net ${gain2NextGw >= 0 ? '+' : ''}${gain2NextGw.toFixed(2)} xPts after ${hit2 > 0 ? `−${hit2} hit` : 'using 2 FTs'}.`
          : 'No 2-player swap improves on single move.',
    },
  ];

  // Half-season chip simulation across chipHalfGws (Wildcard, Free Hit, Bench Boost, Triple Captain)
  const totalSellBudgetTenths =
    input.bankTenths + input.currentSquadIds.reduce((sum, id) => sum + (sellingPrices[id] ?? byId.get(id)?.cost ?? 0), 0);

  const bestTransferSquadAt = (gw: number) => {
    const ftAvail = Math.min(5, ftNow + Math.max(0, gw - nextGw));
    const k = (Math.max(1, Math.min(2, ftAvail)) as 1 | 2);
    return solveKTransfersExactTS(
      input.currentSquadIds,
      candidateIds,
      byId,
      sellingPrices,
      input.bankTenths,
      k,
      xPtsByGw[gw] ?? {},
      {},
    ).squad;
  };

  const chipRaw: Record<'wildcard' | 'freehit' | 'bboost' | '3xc', ChipGwSimulation[]> = {
    wildcard: [],
    freehit: [],
    bboost: [],
    '3xc': [],
  };

  const chipMatrixByGw: FplReviewSimOutput['chipMatrixByGw'] = [];
  let peakWcSquad: number[] | null = null;
  let peakWcGain = -1e9;
  let peakWcGw = nextGw;

  for (let idx = 0; idx < chipHalfGws.length; idx += 1) {
    const cgw = chipHalfGws[idx];
    const cgwXPts = xPtsByGw[cgw] ?? {};
    const baseLu = solveLineupTS(input.currentSquadIds, byId, cgwXPts);
    const bbLu = solveLineupTS(input.currentSquadIds, byId, cgwXPts, true, false);
    const tcLu = solveLineupTS(input.currentSquadIds, byId, cgwXPts, false, true);

    const bbGain = round2(bbLu.totalXPts - baseLu.totalXPts);
    const tcGain = round2(tcLu.totalXPts - baseLu.totalXPts);

    chipRaw.bboost.push({
      gw: cgw,
      xPtsWithChip: bbLu.totalXPts,
      xPtsNoChip: baseLu.totalXPts,
      gain: bbGain,
      reason: `Bench adds +${bbGain.toFixed(1)} xPts in GW${cgw}`,
      starters: bbLu.starters,
      bench: bbLu.bench,
      captainId: bbLu.captainId,
      viceId: bbLu.viceId,
    });

    chipRaw['3xc'].push({
      gw: cgw,
      xPtsWithChip: tcLu.totalXPts,
      xPtsNoChip: baseLu.totalXPts,
      gain: tcGain,
      reason: `3× ${playerMap.get(tcLu.captainId)?.name ?? 'Captain'} adds +${tcGain.toFixed(1)} xPts in GW${cgw}`,
      starters: tcLu.starters,
      bench: tcLu.bench,
      captainId: tcLu.captainId,
      viceId: tcLu.viceId,
    });

    // Free Hit optimal 15 for single GW vs realistic free-transfer squad
    const fhSquad = solveFullSquadTS(candidateIds, byId, totalSellBudgetTenths, cgwXPts);
    let fhGain = 0;
    if (fhSquad) {
      const fhLu = solveLineupTS(fhSquad, byId, cgwXPts);
      const fhBaseLu = solveLineupTS(bestTransferSquadAt(cgw), byId, cgwXPts);
      fhGain = round2(fhLu.totalXPts - fhBaseLu.totalXPts);
      chipRaw.freehit.push({
        gw: cgw,
        xPtsWithChip: fhLu.totalXPts,
        xPtsNoChip: fhBaseLu.totalXPts,
        gain: fhGain,
        reason: `Optimal 1-week Free Hit XI vs FT baseline in GW${cgw}`,
        starters: fhLu.starters,
        bench: fhLu.bench,
        captainId: fhLu.captainId,
        viceId: fhLu.viceId,
      });
    }

    // Wildcard optimal 15 over 3-GW sub-horizon vs realistic free-transfer squad
    const remGws = chipHalfGws.slice(idx, idx + 4);
    const wcHw: Record<number, number> = {};
    for (const cid of candidateIds) {
      let sum = 0;
      for (let j = 1; j < remGws.length; j += 1) {
        sum += Math.pow(0.88, j) * (xPtsByGw[remGws[j]]?.[cid] ?? 0);
      }
      wcHw[cid] = sum * 0.55;
    }
    const wcSquad = solveFullSquadTS(candidateIds, byId, totalSellBudgetTenths, cgwXPts, wcHw);
    let wcGain = 0;
    if (wcSquad) {
      const wcLu = solveLineupTS(wcSquad, byId, cgwXPts);
      const subGws = remGws.slice(0, 3);
      const wcSub = subGws.reduce((s, g) => s + solveLineupTS(wcSquad, byId, xPtsByGw[g] ?? {}).totalXPts, 0);
      const baseSq = bestTransferSquadAt(cgw);
      const baseSub = subGws.reduce((s, g) => s + solveLineupTS(baseSq, byId, xPtsByGw[g] ?? {}).totalXPts, 0);
      wcGain = round2(wcSub - baseSub);
      if (wcGain > peakWcGain) {
        peakWcGain = wcGain;
        peakWcSquad = wcSquad;
        peakWcGw = cgw;
      }
      chipRaw.wildcard.push({
        gw: cgw,
        xPtsWithChip: round2(wcSub),
        xPtsNoChip: round2(baseSub),
        gain: wcGain,
        reason: `3-GW restructured squad gain from GW${cgw}`,
        starters: wcLu.starters,
        bench: wcLu.bench,
        captainId: wcLu.captainId,
        viceId: wcLu.viceId,
      });
    }

    chipMatrixByGw.push({
      gw: cgw,
      baseXPts: baseLu.totalXPts,
      wildcardGain: wcGain,
      freehitGain: fhGain,
      bboostGain: bbGain,
      tripleCapGain: tcGain,
    });
  }

  const usedChips = input.chipsUsed ?? [];
  const minMeaningful: Record<'wildcard' | 'freehit' | 'bboost' | '3xc', number> = {
    wildcard: 6.0,
    freehit: 8.0,
    bboost: 10.0,
    '3xc': 5.0,
  };
  const chipLabels: Record<string, string> = {
    wildcard: 'Wildcard',
    freehit: 'Free Hit',
    bboost: 'Bench Boost',
    '3xc': 'Triple Captain',
  };

  const chipSimulations: ChipSimulationSummary[] = (['wildcard', 'freehit', 'bboost', '3xc'] as const).map((chipName) => {
    const usedThisHalf = usedChips.find(
      (c) => c.name === chipName && (inFirstHalf ? c.event <= 19 : c.event >= 20),
    );
    const available = !usedThisHalf;
    const expiresGw = inFirstHalf ? 19 : 38;
    const sims = [...chipRaw[chipName]].sort((a, b) => b.gain - a.gain);
    const best = sims[0] ?? null;
    const nowSim = chipRaw[chipName].find((s) => s.gw === nextGw) ?? null;
    const gainNow = nowSim?.gain ?? 0;
    const bestGain = best?.gain ?? 0;
    const meaningful = available && bestGain >= minMeaningful[chipName];
    const expiringSoon = available && expiresGw - nextGw <= 2;

    let verdictLine = `${chipLabels[chipName]} already used in GW${usedThisHalf?.event ?? '?'}.`;
    if (available) {
      if (expiringSoon && best) {
        verdictLine = `Expires GW${expiresGw} — deploy ${chipLabels[chipName]} in GW${best.gw} (+${best.gain.toFixed(1)} xPts).`;
      } else if (meaningful && best?.gw === nextGw) {
        verdictLine = `Peak window is GW${nextGw} (+${gainNow.toFixed(1)} xPts vs FT baseline).`;
      } else if (meaningful && best) {
        verdictLine = `Hold ${chipLabels[chipName]} for GW${best.gw} (+${best.gain.toFixed(1)} xPts vs +${gainNow.toFixed(1)} now).`;
      } else {
        verdictLine = `Hold ${chipLabels[chipName]} — max projected swing +${bestGain.toFixed(1)} xPts is below ${minMeaningful[chipName].toFixed(0)}-pt threshold.`;
      }
    }

    return {
      chip: chipName,
      available,
      usedGw: usedThisHalf?.event ?? null,
      expiresGw,
      expiryDeadline: null,
      expiringSoon,
      bestGw: best?.gw ?? null,
      bestGain,
      gainNow,
      meaningful,
      verdictLine,
      topGws: sims.slice(0, 5),
      bestPitch: best,
    };
  });

  const availChips = chipSimulations.filter((c) => c.available && c.meaningful);
  const bestOverallChip = [...availChips].sort((a, b) => b.bestGain - a.bestGain)[0] ?? null;
  const playChipNow = bestOverallChip && bestOverallChip.bestGw === nextGw && bestOverallChip.gainNow >= 8.5;

  const recommendedChipDecision = {
    action: (playChipNow ? 'PLAY' : 'HOLD') as 'PLAY' | 'HOLD',
    chip: playChipNow ? bestOverallChip.chip : null,
    gainNow: playChipNow ? bestOverallChip.gainNow : 0,
    bestFutureGw: bestOverallChip?.bestGw ?? null,
    bestFutureChip: bestOverallChip?.chip ?? null,
    bestFutureGain: bestOverallChip?.bestGain ?? 0,
    why: playChipNow
      ? `GW${nextGw} is the half-season peak for ${chipLabels[bestOverallChip.chip]} (+${bestOverallChip.gainNow.toFixed(1)} xPts).`
      : bestOverallChip
        ? `Hold chips in GW${nextGw} — strongest edge is ${chipLabels[bestOverallChip.chip]} in GW${bestOverallChip.bestGw} (+${bestOverallChip.bestGain.toFixed(1)} xPts).`
        : `Hold all chips in GW${nextGw} for double/blank gameweeks.`,
  };

  const winner = options.find((o) => o.winner) ?? options[0];
  const activeSquad = winner.id === 'transfer2' ? squad2 : winner.id === 'transfer1' ? squad1 : squad0;
  const multiGwRollout = gws.map((gw, idx) => ({
    gw,
    lineup: solveLineupTS(activeSquad, byId, xPtsByGw[gw] ?? {}),
    ftAvailable: Math.min(5, (winner.id === 'roll' ? ftAfterRoll : Math.max(1, ftNow - winner.transfers.length + 1)) + Math.max(0, idx - 1)),
  }));

  // Build McPlayerGw cache via repo's computePlayerXPts + run paired Monte Carlo (`site/model/monteCarlo.ts`)
  const completedGws = Math.max(1, nextGw - 1);
  const teamsMap = new Map(input.repoTeams.map((t) => [t.id, t]));
  const elementMap = new Map(input.repoElements.map((e) => [e.id, e]));
  const priors = computePositionPriors(input.repoElements);
  const mcPlayerCache = new Map<string, McPlayerGw>();

  const playerAt = (pid: number, gw: number): McPlayerGw | null => {
    const key = `${pid}:${gw}`;
    const cached = mcPlayerCache.get(key);
    if (cached) return cached;
    const el = elementMap.get(pid);
    if (!el) return null;
    const bd = computePlayerXPts(
      el,
      gw,
      input.repoFixtures,
      teamsMap,
      completedGws,
      Math.max(0, gw - nextGw),
      priors,
    );
    const csvMean = xPtsByGw[gw]?.[pid];
    const hasCsv = csvMean !== undefined && csvMean > 0;
    const mean = hasCsv ? csvMean : bd.xPts;
    const useFixtureModels = bd.fixtureModels && Math.abs(mean - bd.xPts) <= 0.01 ? bd.fixtureModels : undefined;
    const built: McPlayerGw = {
      fixtureModels: useFixtureModels,
      mean,
      p60: bd.p60,
      pSub: bd.pSub,
      fixtures: bd.fixtureCount,
      csProb: bd.csProb,
      cardLoss: Math.max(0, -bd.cardPts),
      team: el.team,
      position: el.element_type,
    };
    mcPlayerCache.set(key, built);
    return built;
  };

  const buildLineupFn = (squadForGw: (gw: number) => number[]) => {
    const lineupCache = new Map<number, { starters: number[]; bench: number[]; captainId: number; viceId: number }>();
    return (gw: number) => {
      const hit = lineupCache.get(gw);
      if (hit) return hit;
      const sq = squadForGw(gw);
      const lu = solveLineupTS(sq, byId, xPtsByGw[gw] ?? {});
      const out = {
        starters: lu.starters,
        bench: lu.bench,
        captainId: lu.captainId,
        viceId: lu.viceId,
      };
      lineupCache.set(gw, out);
      return out;
    };
  };

  const mcPaths: McPath[] = [
    {
      id: 'roll',
      label: `Hold / Roll (${ftNow}→${ftAfterRoll} FT)`,
      hitCost: 0,
      lineupAt: buildLineupFn(() => squad0),
    },
    ...(moves1.length > 0
      ? [
          {
            id: 'transfer1',
            label: options[1].label,
            hitCost: hit1,
            lineupAt: buildLineupFn(() => squad1),
          },
        ]
      : []),
    ...(moves2.length === 2
      ? [
          {
            id: 'transfer2',
            label: options[2].label,
            hitCost: hit2,
            lineupAt: buildLineupFn(() => squad2),
          },
        ]
      : []),
    ...(peakWcSquad
      ? [
          {
            id: 'wildcard_peak',
            label: `Wildcard Peak (GW${peakWcGw})`,
            hitCost: 0,
            lineupAt: buildLineupFn((gw: number) => (gw >= peakWcGw ? peakWcSquad! : squad0)),
            chipAt: (gw: number) => (gw === peakWcGw ? 'wc' : undefined),
          },
        ]
      : []),
  ];

  const monteCarlo = runMonteCarlo({
    gws,
    paths: mcPaths,
    holdId: 'roll',
    recommendedId: winner.id,
    playerAt,
    draws: input.draws ?? MC_DRAWS,
    seed: mixSeed(nextGw, squad0[0] ?? 1, ftNow, input.bankTenths),
  });

  return {
    nextGw,
    gws,
    chipHalfGws,
    freeTransfersNow: ftNow,
    freeTransfersAfterRoll: ftAfterRoll,
    bankTenths: input.bankTenths,
    totalSellBudgetTenths,
    bankedTransferValueNextGw,
    options,
    winner,
    recommendedDecision: winner.action === 'ROLL' ? 'ROLL' : 'TRANSFER',
    recommendedChipDecision,
    lineup0,
    lineup1,
    lineup2,
    squad0,
    squad1,
    squad2,
    chipSimulations,
    chipMatrixByGw,
    multiGwRollout,
    monteCarlo,
  };
}
