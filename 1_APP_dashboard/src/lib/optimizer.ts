import { spawnSync } from "child_process";
import crypto from "crypto";
import path from "path";
import { cacheGet, cacheSet } from "./fpl";
import { chipLabel, formatPrice } from "./helpers";
import { mixSeed, runMonteCarlo } from "./monteCarlo";
import { solveLineupTS } from "./lineup";
import type { SolvedLineup } from "./lineup";
import { pointsHit } from "./scoring";
import { FORECAST_MODEL_VERSION } from "../server/forecastIdentity";
export { solveLineupTS } from "./lineup";
import type { McLineup, McPath, McPlayerGw } from "./monteCarlo";
import {
  computeFreeTransfers,
  computePlayerXPts,
  computePositionPriors,
  computeSellingPrices,
  runBacktest,
} from "./xpts";
import type {
  ActionStep,
  ChipDef,
  ChipGwSimulation,
  ChipSimulationSummary,
  EntryHistory,
  Fixture,
  LiveResponse,
  MonteCarloSummary,
  OptimizerOptionComparison,
  OptimizerResponse,
  OptimizerTransferMove,
  PicksResponse,
  PlayerXPtsBreakdown,
  SlimElement,
  SlimEvent,
  SlimTeam,
  Transfer,
} from "./types";

type SolverLineup = SolvedLineup;

interface SolverPath {
  squad: number[];
  moves: { outId: number; inId: number }[];
  lineup: SolverLineup;
  horizonXPts: number;
  byGw: Record<string, SolverLineup>;
  gw2Moves?: { outId: number; inId: number }[];
}

interface SolverOutput {
  solverEngine: string;
  solverRunMs: number;
  k0: SolverPath;
  k1: SolverPath;
  k2: SolverPath;
  chipSims: Record<
    string,
    Record<
      string,
      {
        withChip: number;
        noChip: number;
        gain: number;
        lineup: SolverLineup;
        squad?: number[];
      }
    >
  >;
}

/**
 * Fingerprint squad + prices + injury flags so cached solver results auto-refresh
 * whenever prices, injuries, or the user's squad change.
 */
function buildCacheFingerprint(
  entryId: number,
  nextGw: number,
  horizon: number,
  squadIds: number[],
  bank: number,
  ftNow: number,
  elements: SlimElement[],
  chipsPlayed: string,
  fixtures: Fixture[],
  teams: SlimTeam[],
): string {
  const raw = JSON.stringify({ modelVersion: FORECAST_MODEL_VERSION, entryId, nextGw, horizon, bank, ftNow, chipsPlayed,
    squad: [...squadIds].sort((first, second) => first - second),
    elements: [...elements].sort((first, second) => first.id - second.id),
    fixtures: [...fixtures].sort((first, second) => first.id - second.id),
    teams: [...teams].sort((first, second) => first.id - second.id) });
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function runCoreOptimizer(params: {
  entryId: number;
  currentGw: number;
  nextGw: number;
  horizon: number;
  picks: PicksResponse;
  transfers: Transfer[];
  history: EntryHistory;
  elements: SlimElement[];
  teams: SlimTeam[];
  events: SlimEvent[];
  fixtures: Fixture[];
  chips: ChipDef[];
  liveByGw: Map<number, LiveResponse>;
  startedEvent?: number;
}): Promise<OptimizerResponse> {
  const {
    entryId,
    currentGw,
    nextGw,
    horizon,
    picks,
    transfers,
    history,
    elements,
    teams,
    events,
    fixtures,
    chips,
    liveByGw,
    startedEvent = 1,
  } = params;

  const elementsMap = new Map<number, SlimElement>();
  elements.forEach((e) => elementsMap.set(e.id, e));
  const teamsMap = new Map<number, SlimTeam>();
  teams.forEach((t) => teamsMap.set(t.id, t));

  const squadIds = picks.picks.map((p) => p.element);
  const bank = picks.entry_history.bank;
  const ftNow = computeFreeTransfers(history, startedEvent);

  const fingerprint = buildCacheFingerprint(
    entryId,
    nextGw,
    horizon,
    squadIds,
    bank,
    ftNow,
    elements,
    (history.chips ?? []).map((c) => `${c.name}@${c.event}`).sort().join(","),
    fixtures,
    teams,
  );
  const cacheKey = `solver:v3:${entryId}:gw${nextGw}:h${horizon}:${fingerprint}`;
  const cached = await cacheGet<OptimizerResponse>(cacheKey, 900);
  if (
    cached &&
    Array.isArray(cached.options) &&
    cached.options.length > 0 &&
    cached.winner &&
    cached.optimizedNextGw &&
    Array.isArray(cached.optimizedNextGw.starters) &&
    cached.backtest &&
    cached.xPtsNextGw
  ) {
    return { ...cached, cached: true };
  }
  if (cached) {
    console.error(`[FPL Vortex optimizer stale cache shape for ${cacheKey}] recomputing`);
  }

  const { sellingPrices, purchasePrices } = computeSellingPrices(
    picks.picks,
    transfers,
    elementsMap,
  );

  // Determine horizon GWs and half-season chip simulation GWs
  const gws = Array.from({ length: horizon }, (_, i) => nextGw + i).filter(
    (g) => g <= 38,
  );
  if (gws.length === 0) gws.push(Math.min(38, nextGw));

  const halfEnd = nextGw <= 19 ? 19 : 38;
  const chipGws = Array.from(
    { length: Math.min(8, halfEnd - nextGw + 1) },
    (_, i) => nextGw + i,
  ).filter((g) => g >= nextGw && g <= halfEnd);
  if (!chipGws.includes(nextGw)) chipGws.unshift(nextGw);

  const allSimGws = [...new Set([...gws, ...chipGws])].sort((a, b) => a - b);
  const teamGamesPlayed = Math.max(currentGw, 1);

  // Position averages (from current data) that small per-player samples are shrunk toward
  const priors = computePositionPriors(elements);

  // Compute xPts for all players across allSimGws
  const xPtsNextGw: Record<number, PlayerXPtsBreakdown> = {};
  const xPtsByGw: Record<number, Record<number, number>> = {};

  for (const gw of allSimGws) {
    xPtsByGw[gw] = {};
    const offset = Math.max(0, gw - nextGw);
    for (const el of elements) {
      if (el.element_type > 4) continue;
      const bd = computePlayerXPts(
        el,
        gw,
        fixtures,
        teamsMap,
        teamGamesPlayed,
        offset,
        priors,
      );
      xPtsByGw[gw][el.id] = bd.xPts;
      if (gw === nextGw) {
        xPtsNextGw[el.id] = bd;
      }
    }
  }

  // Select top candidate pool per position (plus current squad) for fast MILP solve
  const candidateSet = new Set<number>(squadIds);
  for (const pos of [1, 2, 3, 4]) {
    const topPos = elements
      .filter((e) => e.element_type === pos)
      .map((e) => ({
        id: e.id,
        score: gws.reduce((s, g) => s + (xPtsByGw[g]?.[e.id] ?? 0), 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 35);
    topPos.forEach((p) => candidateSet.add(p.id));
  }

  const solverInput = {
    players: elements
      .filter((e) => e.element_type <= 4)
      .map((e) => ({
        id: e.id,
        type: e.element_type,
        team: e.team,
        cost: e.now_cost,
      })),
    currentSquad: squadIds,
    sellingPrices: Object.fromEntries(
      Object.entries(sellingPrices).map(([k, v]) => [String(k), v]),
    ),
    bank,
    ftNow,
    gws,
    chipGws,
    candidateIds: [...candidateSet],
    xPtsByGw: Object.fromEntries(
      Object.entries(xPtsByGw).map(([gw, map]) => [
        String(gw),
        Object.fromEntries(
          Object.entries(map).map(([pid, xp]) => [String(pid), xp]),
        ),
      ]),
    ),
  };

  const scriptPath = path.join(process.cwd(), "src", "lib", "solver.py");
  let solved: SolverOutput;
  const proc = spawnSync(process.env.FPL_PYTHON || "python3", [scriptPath], {
    input: JSON.stringify(solverInput),
    encoding: "utf-8",
    timeout: 30000,
  });

  if (proc.status !== 0 || !proc.stdout) {
    console.error(
      "[FPL Vortex optimizer Python PuLP error — using TS exact constraint solver fallback]",
      proc.stderr || proc.error,
    );
    const t0 = Date.now();
    const nextMap = xPtsByGw[nextGw] ?? {};
    const lu0 = solveLineupTS(squadIds, elementsMap, nextMap);
    // Find best 1-transfer and 2-transfer moves in TS fallback
    const squadSet = new Set(squadIds);
    const clubCount = new Map<number, number>();
    squadIds.forEach((id) => {
      const e = elementsMap.get(id);
      if (e) clubCount.set(e.team, (clubCount.get(e.team) ?? 0) + 1);
    });
    // Horizon-weighted value per player, mirroring solver.py (0.1*next + 0.35*discounted future).
    const valueOf = (id: number): number => {
      let fut = 0;
      gws.slice(1).forEach((g, i) => {
        fut += Math.pow(0.88, i + 1) * (xPtsByGw[g]?.[id] ?? 0);
      });
      return 0.1 * (nextMap[id] ?? 0) + 0.35 * fut;
    };

    interface Swap {
      outId: number;
      inId: number;
      gain: number;
      sell: number;
      inCost: number;
      outTeam: number;
      inTeam: number;
    }
    // Every individually-legal swap (same position, affordable, club limit respected).
    const swaps: Swap[] = [];
    for (const outId of squadIds) {
      const outEl = elementsMap.get(outId);
      if (!outEl) continue;
      const sell = sellingPrices[outId] ?? outEl.now_cost;
      for (const candId of candidateSet) {
        if (squadSet.has(candId)) continue;
        const inEl = elementsMap.get(candId);
        if (!inEl || inEl.element_type !== outEl.element_type) continue;
        if (inEl.now_cost > sell + bank) continue;
        const cAfter = (clubCount.get(inEl.team) ?? 0) - (inEl.team === outEl.team ? 1 : 0);
        if (cAfter >= 3) continue;
        const gain =
          (nextMap[candId] ?? 0) - (nextMap[outId] ?? 0) + (valueOf(candId) - valueOf(outId));
        if (gain > 0)
          swaps.push({
            outId,
            inId: candId,
            gain,
            sell,
            inCost: inEl.now_cost,
            outTeam: outEl.team,
            inTeam: inEl.team,
          });
      }
    }
    swaps.sort((a, b) => b.gain - a.gain);
    const topSwaps = swaps.slice(0, 60);

    // Two swaps must be legal TOGETHER: distinct players, shared budget, shared club limit.
    const pairOk = (a: Swap, b: Swap): boolean => {
      if (a.outId === b.outId || a.inId === b.inId) return false;
      if (a.inCost + b.inCost > a.sell + b.sell + bank) return false;
      const cc = new Map(clubCount);
      for (const x of [a, b]) cc.set(x.outTeam, (cc.get(x.outTeam) ?? 0) - 1);
      for (const x of [a, b]) cc.set(x.inTeam, (cc.get(x.inTeam) ?? 0) + 1);
      return (cc.get(a.inTeam) ?? 0) <= 3 && (cc.get(b.inTeam) ?? 0) <= 3;
    };
    let bestPair: [Swap, Swap] | null = null;
    for (let a = 0; a < topSwaps.length; a++) {
      for (let b = a + 1; b < topSwaps.length; b++) {
        if (!pairOk(topSwaps[a], topSwaps[b])) continue;
        if (!bestPair || topSwaps[a].gain + topSwaps[b].gain > bestPair[0].gain + bestPair[1].gain)
          bestPair = [topSwaps[a], topSwaps[b]];
      }
    }
    const toMove = (x: Swap) => ({ outId: x.outId, inId: x.inId });
    const m1 = topSwaps.slice(0, 1).map(toMove);
    const m2 = bestPair ? bestPair.map(toMove) : m1;
    const sq1 = squadIds.map((id) => (m1[0]?.outId === id ? m1[0].inId : id));
    const sq2 = squadIds.map((id) => {
      const f = m2.find((m) => m.outId === id);
      return f ? f.inId : id;
    });
    const lu1 = solveLineupTS(sq1, elementsMap, nextMap);
    const lu2 = solveLineupTS(sq2, elementsMap, nextMap);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const bbSims: SolverOutput["chipSims"][string] = {};
    const tcSims: SolverOutput["chipSims"][string] = {};
    for (const cgw of chipGws) {
      const xp = xPtsByGw[cgw] ?? {};
      const base = solveLineupTS(squadIds, elementsMap, xp);
      const bb = solveLineupTS(squadIds, elementsMap, xp, true, false);
      const tc = solveLineupTS(squadIds, elementsMap, xp, false, true);
      bbSims[String(cgw)] = { withChip: bb.totalXPts, noChip: base.totalXPts, gain: r2(bb.totalXPts - base.totalXPts), lineup: bb };
      tcSims[String(cgw)] = { withChip: tc.totalXPts, noChip: base.totalXPts, gain: r2(tc.totalXPts - base.totalXPts), lineup: tc };
    }
    const horSum = (sq: number[]) =>
      Math.round(
        gws.reduce((s, g) => s + solveLineupTS(sq, elementsMap, xPtsByGw[g] ?? {}).totalXPts, 0) * 100,
      ) / 100;
    solved = {
      solverEngine: "TypeScript fallback (approximate; Python solver unavailable)",
      solverRunMs: Date.now() - t0,
      k0: { squad: squadIds, moves: [], lineup: lu0, horizonXPts: horSum(squadIds), byGw: {}, gw2Moves: m1 },
      k1: { squad: sq1, moves: m1, lineup: lu1, horizonXPts: horSum(sq1), byGw: {} },
      k2: { squad: sq2, moves: m2, lineup: lu2, horizonXPts: horSum(sq2), byGw: {} },
      chipSims: { wildcard: {}, freehit: {}, bboost: bbSims, "3xc": tcSims },
    };
  } else {
    solved = JSON.parse(proc.stdout) as SolverOutput;
  }

  // Format transfer moves with xPts & prices
  const formatMoves = (rawMoves: { outId: number; inId: number }[]): OptimizerTransferMove[] =>
    rawMoves.map((m) => {
      const outEl = elementsMap.get(m.outId);
      const inEl = elementsMap.get(m.inId);
      const xpOutNext = xPtsByGw[nextGw]?.[m.outId] ?? 0;
      const xpInNext = xPtsByGw[nextGw]?.[m.inId] ?? 0;
      const xpOutHor = gws.reduce((s, g) => s + (xPtsByGw[g]?.[m.outId] ?? 0), 0);
      const xpInHor = gws.reduce((s, g) => s + (xPtsByGw[g]?.[m.inId] ?? 0), 0);
      return {
        outId: m.outId,
        inId: m.inId,
        sellingPrice: sellingPrices[m.outId] ?? outEl?.now_cost ?? 0,
        buyPrice: inEl?.now_cost ?? 0,
        xPtsOutNextGw: Math.round(xpOutNext * 100) / 100,
        xPtsInNextGw: Math.round(xpInNext * 100) / 100,
        xPtsGainNextGw: Math.round((xpInNext - xpOutNext) * 100) / 100,
        xPtsGainHorizon: Math.round((xpInHor - xpOutHor) * 100) / 100,
      };
    });

  const moves1 = formatMoves(solved.k1.moves);
  const moves2 = formatMoves(solved.k2.moves);

  // Value of banking a transfer: difference between having 2 FTs in GW+1 vs 1 FT,
  // computed from the solver's GW+1 two-transfer gain vs holding.
  const baseRollNextGw = solved.k0.lineup.totalXPts;
  const k1NextGw = solved.k1.lineup.totalXPts;
  const k2NextGw = solved.k2.lineup.totalXPts;

  const hit1 = pointsHit(1, ftNow);
  const hit2 = pointsHit(2, ftNow);

  // Compute roll threshold from the horizon value of the extra banked FT in GW+1
  const gw2MovesFormatted = formatMoves(solved.k0.gw2Moves ?? []);
  const bankedTransferValueNextGw =
    ftNow >= 5
      ? 0 // already at max 5 FTs, banking adds 0 extra FTs!
      : Math.round(
          Math.max(
            1.15,
            Math.min(
              2.6,
              (gw2MovesFormatted[0]?.xPtsGainNextGw ?? 1.5) * 0.65,
            ),
          ) * 100,
        ) / 100;
  const rollThresholdXPts = bankedTransferValueNextGw;

  // Evaluate chipsims and build Section 4 summaries
  const chipNames = ["wildcard", "freehit", "bboost", "3xc"] as const;
  const chipSimulations: ChipSimulationSummary[] = chipNames.map((chipName) => {
    const def = chips.find(
      (c) =>
        c.name === chipName &&
        nextGw >= c.start_event &&
        nextGw <= c.stop_event,
    );
    const stopEvent = def?.stop_event ?? (nextGw <= 19 ? 19 : 38);
    const startEvent = def?.start_event ?? (nextGw <= 19 ? 1 : 20);
    const usedObj = history.chips.find(
      (h) =>
        h.name === chipName && h.event >= startEvent && h.event <= stopEvent,
    );
    const available = !usedObj;
    const expiryEv = events.find((e) => e.id === stopEvent);
    const expiringSoon = available && stopEvent - nextGw <= 3;

    const simMap = solved.chipSims[chipName] ?? {};
    const gwList: ChipGwSimulation[] = Object.entries(simMap).map(
      ([gwStr, data]) => {
        const gwNum = Number(gwStr);
        // Explain why this GW scores well (doubles, blanks, FDR)
        const activeSq = data.squad ?? squadIds;
        let doubles = 0;
        let blanks = 0;
        let fdrSum = 0;
        let fxCount = 0;
        for (const pid of activeSq) {
          const el = elementsMap.get(pid);
          if (!el) continue;
          const tFx = fixtures.filter(
            (f) =>
              f.event === gwNum && (f.team_h === el.team || f.team_a === el.team),
          );
          if (tFx.length === 0) blanks++;
          if (tFx.length >= 2) doubles++;
          for (const f of tFx) {
            fxCount++;
            fdrSum += f.team_h === el.team ? f.team_h_difficulty : f.team_a_difficulty;
          }
        }
        const avgFdr = fxCount > 0 ? fdrSum / fxCount : 3.0;
        const capName =
          elementsMap.get(data.lineup.captainId)?.web_name ?? "Captain";
        let reason = `Avg FDR ${avgFdr.toFixed(1)} across ${fxCount} squad fixtures`;
        if (doubles > 0) {
          reason = `${doubles} double-GW player${doubles > 1 ? "s" : ""} (${reason})`;
        } else if (blanks >= 3 && chipName === "freehit") {
          reason = `Covers ${blanks} blanking squad players with a full 15 (${reason})`;
        } else if (chipName === "3xc") {
          reason = `Triple Captain ${capName} (${data.lineup.captainXPts.toFixed(1)} extra xPts, ${xPtsNextGw[data.lineup.captainId]?.fixturesLabel ?? "favorable fixture"})`;
        } else if (chipName === "bboost") {
          reason = `4 playing bench assets project +${data.lineup.benchXPts.toFixed(1)} xPts (${reason})`;
        }

        return {
          gw: gwNum,
          xPtsWithChip: data.withChip,
          xPtsNoChip: data.noChip,
          gain: data.gain,
          reason,
          starters: data.lineup.starters,
          bench: data.lineup.bench,
          captainId: data.lineup.captainId,
          viceId: data.lineup.viceId,
        };
      },
    );

    gwList.sort((a, b) => b.gain - a.gain);
    const topGws = gwList.slice(0, 4);
    const best = topGws[0] ?? null;
    const nowSim = gwList.find((g) => g.gw === nextGw) ?? null;
    const minMeaningful =
      chipName === "wildcard" ? 6.0 : chipName === "freehit" ? 8.0 : chipName === "bboost" ? 10.0 : 5.0;
    const meaningful = (best?.gain ?? 0) >= minMeaningful;

    const verdictLine = !available
      ? `${chipLabel(chipName)} was already played in GW${usedObj?.event}.`
      : gwList.length === 0
        ? `${chipLabel(chipName)} analysis is unavailable right now because the Python solver isn't running; it can't be simulated in fallback mode.`
      : meaningful && best
        ? `Best window: GW${best.gw} (+${best.gain.toFixed(1)} xPts Estimate vs your best no-chip path). ${best.reason}.`
        : `No single GW in this window beats your best no-chip path by a large margin (peak is GW${best?.gw ?? nextGw} at +${(best?.gain ?? 0).toFixed(1)} xPts vs +${minMeaningful.toFixed(1)} threshold); hold for rescheduled doubles/blanks.`;

    return {
      chip: chipName,
      available,
      usedGw: usedObj?.event ?? null,
      expiresGw: stopEvent,
      expiryDeadline: expiryEv?.deadline_time ?? null,
      expiringSoon,
      bestGw: best?.gw ?? null,
      bestGain: best?.gain ?? 0,
      gainNow: nowSim?.gain ?? 0,
      meaningful,
      verdictLine,
      topGws,
      bestPitch: best,
    };
  });

  // Best chip option if played NOW in nextGw
  const availableChipsNow = chipSimulations
    .filter((c) => c.available)
    .sort((a, b) => b.gainNow - a.gainNow);
  const bestChipNow = availableChipsNow[0] ?? null;

  // Build the 4 options required by Section 0.2:
  // (a) Roll, (b) 1 transfer, (c) 2 transfers with hit, (d) Chip
  const gain1NextGw = Math.round((k1NextGw - baseRollNextGw) * 100) / 100;
  const move1HorPerGw = (moves1[0]?.xPtsGainHorizon ?? gain1NextGw) / Math.max(1, gws.length);
  const effectiveGain1 =
    Math.round(Math.max(gain1NextGw, gain1NextGw + 0.35 * move1HorPerGw) * 100) / 100;
  const netGain1 = Math.round((effectiveGain1 - hit1) * 100) / 100;

  const gain2NextGw = Math.round((k2NextGw - baseRollNextGw) * 100) / 100;
  const moves2HorPerGw =
    moves2.reduce((s, m) => s + m.xPtsGainHorizon, 0) / Math.max(1, gws.length);
  const effectiveGain2 =
    Math.round(Math.max(gain2NextGw, gain2NextGw + 0.35 * moves2HorPerGw) * 100) / 100;
  const netGain2 = Math.round((effectiveGain2 - hit2) * 100) / 100;

  const m1Desc = moves1[0]
    ? `${elementsMap.get(moves1[0].outId)?.web_name ?? "?"} → ${elementsMap.get(moves1[0].inId)?.web_name ?? "?"}`
    : "1 transfer";
  const m2Desc =
    moves2.length > 0
      ? moves2
          .map(
            (m) =>
              `${elementsMap.get(m.outId)?.web_name ?? "?"} → ${elementsMap.get(m.inId)?.web_name ?? "?"}`,
          )
          .join(" & ")
      : "2 transfers";

  const options: OptimizerOptionComparison[] = [
    {
      id: "roll",
      label: "(a) Roll the transfer",
      action: "ROLL",
      transfers: [],
      hitCost: 0,
      nextGwXPts: baseRollNextGw,
      horizonXPts: solved.k0.horizonXPts,
      xPtsGainVsRoll: 0,
      netGainVsRoll: bankedTransferValueNextGw,
      winner: false,
      why:
        ftNow >= 5
          ? `You already hold the maximum 5 free transfers — rolling forfeits a transfer (+0.0 xPts banking value).`
          : `Banks 1 FT to give you ${Math.min(5, ftNow + 1)} FTs in GW${nextGw + 1} (worth +${bankedTransferValueNextGw.toFixed(2)} xPts of flexibility).`,
    },
    {
      id: "transfer1",
      label: `(b) 1 transfer (${m1Desc})`,
      action: "TRANSFER",
      transfers: moves1,
      hitCost: hit1,
      nextGwXPts: k1NextGw,
      horizonXPts: solved.k1.horizonXPts,
      xPtsGainVsRoll: effectiveGain1,
      netGainVsRoll: netGain1,
      winner: false,
      why: moves1[0]
        ? `${m1Desc} adds +${ moves1[0].xPtsGainNextGw.toFixed(2)} xPts in GW${nextGw} and +${moves1[0].xPtsGainHorizon.toFixed(2)} xPts over ${gws.length} GWs (hit cost -${hit1}).`
        : "No single transfer improves your squad.",
    },
    {
      id: "transfer2",
      label: `(c) 2 transfers ${hit2 > 0 ? `(−${hit2} hit)` : "(free)"}`,
      action: "TRANSFER",
      transfers: moves2,
      hitCost: hit2,
      nextGwXPts: k2NextGw,
      horizonXPts: solved.k2.horizonXPts,
      xPtsGainVsRoll: effectiveGain2,
      netGainVsRoll: netGain2,
      winner: false,
      why:
        moves2.length > 0
          ? `${m2Desc} gains +${effectiveGain2.toFixed(2)} xPts minus −${hit2} hit = ${netGain2 >= 0 ? "+" : ""}${netGain2.toFixed(2)} net xPts.`
          : "No 2-transfer combination improves net xPts.",
    },
    {
      id: "chip",
      label: bestChipNow
        ? `(d) Chip: ${chipLabel(bestChipNow.chip)} now`
        : "(d) Chip (none available)",
      action: "PLAY_CHIP",
      chip: bestChipNow?.chip ?? null,
      transfers: [],
      hitCost: 0,
      nextGwXPts: Math.round((baseRollNextGw + (bestChipNow?.gainNow ?? 0)) * 100) / 100,
      horizonXPts: Math.round((solved.k0.horizonXPts + (bestChipNow?.gainNow ?? 0)) * 100) / 100,
      xPtsGainVsRoll: bestChipNow?.gainNow ?? 0,
      netGainVsRoll: bestChipNow?.gainNow ?? 0,
      winner: false,
      why: bestChipNow
        ? `${chipLabel(bestChipNow.chip)} in GW${nextGw} adds +${bestChipNow.gainNow.toFixed(2)} xPts now vs +${bestChipNow.bestGain.toFixed(2)} xPts in its peak GW${bestChipNow.bestGw}.`
        : "All chips in this window have been used.",
    },
  ];

  // Decide between Roll, 1 Transfer, and 2 Transfers (chips are evaluated vs their best future GW)
  let winnerIdx = 0; // default Roll
  if (netGain1 > rollThresholdXPts && netGain1 >= netGain2) {
    winnerIdx = 1;
  } else if (netGain2 > rollThresholdXPts && netGain2 > netGain1) {
    winnerIdx = 2;
  }
  options[winnerIdx].winner = true;
  const winner = options[winnerIdx];
  const recommendedDecision: "ROLL" | "TRANSFER" =
    winner.id === "roll" ? "ROLL" : "TRANSFER";

  // Chip decision: only PLAY if a chip is at its peak GW now AND beats meaningful threshold
  const chipPeakNow = chipSimulations.find(
    (c) => c.available && c.meaningful && c.bestGw === nextGw && c.gainNow >= 8.5,
  );
  const bestFutureChipSim = [...chipSimulations]
    .filter((c) => c.available)
    .sort((a, b) => b.bestGain - a.bestGain)[0];

  const recommendedChipDecision = chipPeakNow
    ? {
        action: "PLAY" as const,
        chip: chipPeakNow.chip,
        gainNow: chipPeakNow.gainNow,
        bestFutureGw: chipPeakNow.bestGw,
        bestFutureChip: chipPeakNow.chip,
        bestFutureGain: chipPeakNow.bestGain,
        why: `${chipLabel(chipPeakNow.chip)} peaks right now in GW${nextGw} (+${chipPeakNow.gainNow.toFixed(1)} xPts Estimate). ${chipPeakNow.topGws[0]?.reason ?? ""}`,
      }
    : {
        action: "HOLD" as const,
        chip: bestFutureChipSim?.chip ?? null,
        gainNow: bestChipNow?.gainNow ?? 0,
        bestFutureGw: bestFutureChipSim?.bestGw ?? null,
        bestFutureChip: bestFutureChipSim?.chip ?? null,
        bestFutureGain: bestFutureChipSim?.bestGain ?? 0,
        why: bestFutureChipSim
          ? `Playing ${chipLabel(bestChipNow?.chip ?? bestFutureChipSim.chip)} now in GW${nextGw} gains +${(bestChipNow?.gainNow ?? 0).toFixed(1)} xPts, whereas holding ${chipLabel(bestFutureChipSim.chip)} for GW${bestFutureChipSim.bestGw} projects +${bestFutureChipSim.bestGain.toFixed(1)} xPts (${bestFutureChipSim.topGws[0]?.reason ?? "better fixture density"}).`
          : "No chips available in the current half-season window.",
      };

  // Build optimizedNextGw (Section 5)
  const chosenSolverPath =
    winner.id === "transfer2"
      ? solved.k2
      : winner.id === "transfer1"
        ? solved.k1
        : solved.k0;
  const chosenMoves =
    winner.id === "transfer2" ? moves2 : winner.id === "transfer1" ? moves1 : [];
  const chosenHit = winner.id === "transfer2" ? hit2 : winner.id === "transfer1" ? hit1 : 0;
  const newPlayerIds = chosenMoves.map((m) => m.inId);

  const avgConf = Math.round(
    chosenSolverPath.lineup.starters.reduce(
      (s, id) => s + (xPtsNextGw[id]?.confidence ?? 72),
      0,
    ) / Math.max(1, chosenSolverPath.lineup.starters.length),
  );

  const whyLine =
    recommendedDecision === "ROLL"
      ? `ROLL TRANSFER wins: best 1-transfer move (${m1Desc}) gains +${effectiveGain1.toFixed(2)} xPts, which is below the +${rollThresholdXPts.toFixed(2)} xPts roll threshold (banking gives ${Math.min(5, ftNow + 1)} FTs for GW${nextGw + 1}).`
      : `TRANSFER wins: ${chosenMoves.map((m) => `${elementsMap.get(m.outId)?.web_name} → ${elementsMap.get(m.inId)?.web_name}`).join(" & ")} nets +${winner.netGainVsRoll.toFixed(2)} xPts (after −${chosenHit} hit), beating the +${rollThresholdXPts.toFixed(2)} xPts roll threshold.`;

  const optimizedNextGw: OptimizerResponse["optimizedNextGw"] = {
    squad: chosenSolverPath.squad,
    starters: chosenSolverPath.lineup.starters,
    bench: chosenSolverPath.lineup.bench,
    captainId: chosenSolverPath.lineup.captainId,
    viceId: chosenSolverPath.lineup.viceId,
    newPlayerIds,
    transfers: chosenMoves,
    hitCost: chosenHit,
    xiXPts: chosenSolverPath.lineup.xiXPts,
    captainXPts: chosenSolverPath.lineup.captainXPts,
    benchXPts: chosenSolverPath.lineup.benchXPts,
    totalXPts: Math.round((chosenSolverPath.lineup.totalXPts - chosenHit) * 100) / 100,
    formation: chosenSolverPath.lineup.formation,
    confidence: avgConf,
    whyLine,
  };

  // Build multiGwPlan across gws (Section 6 Load Optimizer Plan)
  let runningSquad = [...squadIds];
  let runningBank = bank;
  let runningFt = ftNow;
  const multiGwPlan: OptimizerResponse["multiGwPlan"] = gws.map((gw, idx) => {
    const ftBefore = runningFt;
    let gwMoves: OptimizerTransferMove[] = [];
    if (idx === 0) {
      gwMoves = chosenMoves;
      runningSquad = [...chosenSolverPath.squad];
    } else if (idx === 1 && recommendedDecision === "ROLL" && gw2MovesFormatted.length > 0) {
      gwMoves = gw2MovesFormatted.slice(0, 1);
      for (const m of gwMoves) {
        runningSquad = runningSquad.map((id) => (id === m.outId ? m.inId : id));
      }
    }
    for (const m of gwMoves) {
      runningBank += m.sellingPrice - m.buyPrice;
    }
    const nTr = gwMoves.length;
    const hitCost = pointsHit(nTr, ftBefore);
    const ftAfter = Math.min(5, Math.max(0, ftBefore - nTr) + 1);
    runningFt = ftAfter;

    const lu = solveLineupTS(runningSquad, elementsMap, xPtsByGw[gw] ?? {});
    return {
      gw,
      squad: [...runningSquad],
      starters: lu.starters,
      bench: lu.bench,
      captainId: lu.captainId,
      viceId: lu.viceId,
      transfers: gwMoves,
      chip: null,
      hitCost,
      ftBefore,
      ftAfter,
      bankAfter: runningBank,
      projectedXPts: Math.round((lu.totalXPts - hitCost) * 100) / 100,
    };
  });

  // Build Section 4.4: "Next 6 days" DO and DON'T plan from live data
  const nextEvent = events.find((e) => e.id === nextGw);
  const next6DaysPlan = buildNext6DaysPlan({
    nextGw,
    deadlineIso: nextEvent?.deadline_time ?? null,
    squadIds,
    elementsMap,
    elements,
    fixtures,
    teamsMap,
    recommendedDecision,
    moves1,
  });

  // Run Section 0.1 Backtest on completed GWs
  const backtest = runBacktest(elements, fixtures, teamsMap, liveByGw);

  // Monte Carlo risk view: simulate the horizon thousands of times and compare the strategies on
  // the same simulated futures. A failure here must never break the core recommendation.
  let monteCarlo: MonteCarloSummary | null = null;
  try {
    const playerCache = new Map<string, McPlayerGw | null>();
    const playerAt = (pid: number, gw: number): McPlayerGw | null => {
      const key = `${pid}:${gw}`;
      if (playerCache.has(key)) return playerCache.get(key) ?? null;
      const el = elementsMap.get(pid);
      let out: McPlayerGw | null = null;
      if (el && el.element_type <= 4) {
        const bd = computePlayerXPts(
          el,
          gw,
          fixtures,
          teamsMap,
          teamGamesPlayed,
          Math.max(0, gw - nextGw),
          priors,
        );
        out = {
          mean: bd.xPts,
          fixtureModels: bd.fixtureModels,
          p60: bd.p60,
          pSub: bd.pSub,
          fixtures: bd.fixtureCount,
          csProb: bd.csProb,
          cardLoss: -bd.cardPts,
          team: el.team,
          position: el.element_type,
        };
      }
      playerCache.set(key, out);
      return out;
    };

    const toMcLineup = (l: SolverLineup): McLineup => ({
      starters: l.starters,
      bench: l.bench,
      captainId: l.captainId,
      viceId: l.viceId,
    });
    const lineupFromSquad = (squad: number[], gw: number): McLineup =>
      toMcLineup(solveLineupTS(squad, elementsMap, xPtsByGw[gw] ?? {}));
    const lineupFromPath = (sp: SolverPath) => (gw: number): McLineup => {
      const fromSolver = sp.byGw?.[String(gw)];
      return fromSolver ? toMcLineup(fromSolver) : lineupFromSquad(sp.squad, gw);
    };

    const mcPaths: McPath[] = [
      { id: "hold", label: "Hold and roll", hitCost: 0, lineupAt: lineupFromPath(solved.k0) },
    ];
    if (solved.k1.moves.length >= 1) {
      mcPaths.push({
        id: "transfer1",
        label: "Make 1 transfer",
        hitCost: hit1,
        lineupAt: lineupFromPath(solved.k1),
      });
    }
    if (solved.k2.moves.length >= 2) {
      mcPaths.push({
        id: "transfer2",
        label: "Make 2 transfers",
        hitCost: hit2,
        lineupAt: lineupFromPath(solved.k2),
      });
    }
    const wcSim = chipSimulations.find((c) => c.chip === "wildcard");
    const wcSquad =
      wcSim?.bestGw != null ? solved.chipSims.wildcard?.[String(wcSim.bestGw)]?.squad : undefined;
    if (wcSim?.available && wcSim.bestGw != null && gws.includes(wcSim.bestGw) && wcSquad?.length === 15) {
      const wcGw = wcSim.bestGw;
      const holdAt = lineupFromPath(solved.k0);
      mcPaths.push({
        id: "wildcard",
        label: `Wildcard in GW${wcGw}`,
        hitCost: 0,
        lineupAt: (gw) => (gw < wcGw ? holdAt(gw) : lineupFromSquad(wcSquad, gw)),
      });
    }

    const recommendedId =
      winner.id === "roll" ? "hold" : mcPaths.some((p) => p.id === winner.id) ? winner.id : "hold";
    monteCarlo = runMonteCarlo({
      gws,
      paths: mcPaths,
      holdId: "hold",
      recommendedId,
      playerAt,
      seed: mixSeed(entryId, nextGw, horizon, squadIds.reduce((a, id) => (a * 31 + id) | 0, 7)),
    });
  } catch (err) {
    console.error("Monte Carlo simulation failed:", err);
  }

  const response: OptimizerResponse = {
    entryId,
    currentGw,
    nextGw,
    horizon,
    solverEngine: solved.solverEngine,
    solverRunMs: solved.solverRunMs,
    cached: false,
    cacheKey,
    monteCarlo,
    computedAt: new Date().toISOString(),
    freeTransfersNow: ftNow,
    freeTransfersAfterRoll: Math.min(5, ftNow + 1),
    freeTransfersAfterMove: Math.min(5, Math.max(0, ftNow - Math.max(1, chosenMoves.length)) + 1),
    rollThresholdXPts,
    bankedTransferValueNextGw,
    currentPicks: picks,
    sellingPrices,
    purchasePrices,
    xPtsNextGw,
    xPtsByGw,
    options,
    winner,
    recommendedDecision,
    recommendedChipDecision,
    optimizedNextGw,
    multiGwPlan,
    chipSimulations,
    next6DaysPlan,
    backtest,
  };

  await cacheSet(cacheKey, response);
  return response;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function buildNext6DaysPlan(params: {
  nextGw: number;
  deadlineIso: string | null;
  squadIds: number[];
  elementsMap: Map<number, SlimElement>;
  elements: SlimElement[];
  fixtures: Fixture[];
  teamsMap: Map<number, SlimTeam>;
  recommendedDecision: "ROLL" | "TRANSFER";
  moves1: OptimizerTransferMove[];
}): ActionStep[] {
  const {
    nextGw,
    deadlineIso,
    squadIds,
    elementsMap,
    elements,
    fixtures,
    teamsMap,
    recommendedDecision,
    moves1,
  } = params;
  const now = new Date();
  const steps: ActionStep[] = [];

  const squadEls = squadIds
    .map((id) => elementsMap.get(id))
    .filter((e): e is SlimElement => !!e);

  // 1. Price change window check (nightly price change)
  const fallRisk = squadEls
    .filter((e) => (e.price_change_percent ?? 0) <= -60)
    .sort((a, b) => (a.price_change_percent ?? 0) - (b.price_change_percent ?? 0))[0];
  const riseTarget = elements
    .filter((e) => !squadIds.includes(e.id) && (e.price_change_percent ?? 0) >= 75)
    .sort((a, b) => (b.price_change_percent ?? 0) - (a.price_change_percent ?? 0))[0];

  if (fallRisk) {
    steps.push({
      type: "do",
      dateLabel: `${fmtDay(now)} (before the nightly price change)`,
      category: "price",
      text: `Do: monitor ${fallRisk.web_name} (${formatPrice(fallRisk.now_cost)}, ${Math.round(Math.abs(fallRisk.price_change_percent ?? 0))}% toward a drop) before tonight's price change.`,
    });
  }
  if (riseTarget) {
    steps.push({
      type: "dont",
      dateLabel: `${fmtDay(now)} (before the nightly price change)`,
      category: "price",
      text: `Don't: buy ${riseTarget.web_name} (${formatPrice(riseTarget.now_cost)}, ${Math.round(riseTarget.price_change_percent ?? 0)}% progress) early before press conferences unless an overnight rise prices you out.`,
    });
  }

  // 2. Injury / doubtful flags in squad
  const flagged = squadEls.filter((e) => e.status !== "a" || e.news);
  if (flagged.length > 0) {
    const f = flagged[0];
    const pressDay = new Date(now.getTime() + 2 * 86400000);
    steps.push({
      type: "do",
      dateLabel: fmtDay(pressDay),
      category: "injury",
      text: `Do: check ${f.web_name}'s fitness (${f.news || "flagged"} — ${f.chance_of_playing_next_round ?? "?"}% chance) after ${teamsMap.get(f.team)?.short_name ?? "club"} manager's pre-GW${nextGw} press conference.`,
    });
    steps.push({
      type: "dont",
      dateLabel: fmtDay(new Date(now.getTime() + 86400000)),
      category: "injury",
      text: `Don't: take a −4 hit to replace ${f.web_name} before official team news is confirmed.`,
    });
  } else {
    const pressDay = new Date(now.getTime() + 2 * 86400000);
    steps.push({
      type: "do",
      dateLabel: fmtDay(pressDay),
      category: "press",
      text: `Do: review Friday pre-GW${nextGw} press conference summaries in Match Center before committing your transfer.`,
    });
  }

  // 3. Early kickoff / lineup release & deadline
  const gwFx = fixtures
    .filter((f) => f.event === nextGw && f.kickoff_time)
    .sort((a, b) => (a.kickoff_time ?? "").localeCompare(b.kickoff_time ?? ""));
  const firstFx = gwFx[0];
  if (firstFx?.kickoff_time) {
    const ko = new Date(firstFx.kickoff_time);
    const hTeam = teamsMap.get(firstFx.team_h)?.short_name ?? "Home";
    const aTeam = teamsMap.get(firstFx.team_a)?.short_name ?? "Away";
    steps.push({
      type: "do",
      dateLabel: fmtDay(ko),
      category: "lineup",
      text: `Do: check early team news 75–90 mins before ${hTeam} v ${aTeam} kickoff and lock Captain/Vice-Captain before the GW${nextGw} deadline.`,
    });
  } else if (deadlineIso) {
    steps.push({
      type: "do",
      dateLabel: fmtDay(new Date(deadlineIso)),
      category: "deadline",
      text: `Do: lock your Captain, Vice-Captain and bench order at least 30 mins before the GW${nextGw} deadline.`,
    });
  }

  // 4. Transfer discipline DON'T
  if (recommendedDecision === "ROLL" && moves1[0]) {
    steps.push({
      type: "dont",
      dateLabel: `${fmtDay(new Date(now.getTime() + 3 * 86400000))} – Deadline`,
      category: "deadline",
      text: `Don't: burn your free transfer on ${elementsMap.get(moves1[0].outId)?.web_name} → ${elementsMap.get(moves1[0].inId)?.web_name} (+${moves1[0].xPtsGainNextGw.toFixed(1)} xPts) unless a starter is ruled out — banking the free transfer is worth more.`,
    });
  } else {
    steps.push({
      type: "dont",
      dateLabel: `${fmtDay(new Date(now.getTime() + 3 * 86400000))} – Deadline`,
      category: "deadline",
      text: `Don't: activate a chip this week without a double/blank edge — hold chips for higher-upside gameweeks.`,
    });
  }

  return steps;
}
