import type { SlimElement } from "./types";
import { estimateMinutesDistribution } from "./minutes";
import { FORMATION_LIMITS, projectedTotal, selectOptimalXI } from "./scoring";

export interface PredictedPlayer {
  element: SlimElement;
  confidence: number; // 0..100 chance of starting
}

export interface PredictedXI {
  teamId: number;
  players: PredictedPlayer[]; // 11, ordered GK -> FWD
  formation: string;
  source: "model" | "confirmed";
}

/**
 * Pluggable lineup provider interface. The default is our own model.
 * A confirmed-XI provider (e.g. a lineup API) can be plugged in here later:
 * it should return null when no confirmed lineup is published yet, in which
 * case the UI falls back to the model prediction.
 */
export interface LineupProvider {
  getLineup(teamId: number, elements: SlimElement[]): PredictedXI | null;
}

/** Start likelihood from recent starts share, minutes share and fitness flags. */
export function startConfidence(el: SlimElement, gamesPlayed: number): number {
  return Math.round(estimateMinutesDistribution(el, gamesPlayed).pStart * 100);
}

const MODEL_LIMITS = FORMATION_LIMITS;

/** Greedy best-XI: highest confidence while respecting formation limits. */
export const modelProvider: LineupProvider = {
  getLineup(teamId, elements) {
    const squad = elements
      .filter((e) => e.team === teamId && e.element_type >= 1 && e.element_type <= 4)
      .map((e) => ({ element: e, confidence: 0 }));
    if (squad.length < 11) return null;

    const gamesPlayed = Math.max(
      ...elements.filter((e) => e.team === teamId).map((e) => e.starts),
      1,
    );
    squad.forEach((p) => {
      p.confidence = startConfidence(p.element, gamesPlayed);
    });
    squad.sort((a, b) => b.confidence - a.confidence);

    const picked: PredictedPlayer[] = [];
    const count: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

    // Pass 1: fill minimums per position with best candidates
    for (const type of [1, 2, 3, 4] as const) {
      const min = MODEL_LIMITS[type][0];
      for (const p of squad) {
        if (count[type] >= min) break;
        if (p.element.element_type === type && !picked.includes(p)) {
          picked.push(p);
          count[type]++;
        }
      }
    }
    // Pass 2: fill to 11 with best remaining under maximums
    for (const p of squad) {
      if (picked.length >= 11) break;
      const t = p.element.element_type as 1 | 2 | 3 | 4;
      if (!picked.includes(p) && count[t] < MODEL_LIMITS[t][1]) {
        picked.push(p);
        count[t]++;
      }
    }
    if (picked.length < 11) return null;
    picked.sort(
      (a, b) =>
        a.element.element_type - b.element.element_type ||
        b.confidence - a.confidence,
    );
    return {
      teamId,
      players: picked,
      formation: `${count[2]}-${count[3]}-${count[4]}`,
      source: "model",
    };
  },
};

/**
 * Confirmed lineup provider stub — returns null (nothing published).
 * Swap in a real provider (API-Football, Fotmob scrape, etc.) here.
 */
export const confirmedProvider: LineupProvider = {
  getLineup() {
    return null;
  },
};

export function getBestLineup(
  teamId: number,
  elements: SlimElement[],
): PredictedXI | null {
  return (
    confirmedProvider.getLineup(teamId, elements) ??
    modelProvider.getLineup(teamId, elements)
  );
}

export interface SolvedLineup {
  starters: number[];
  bench: number[];
  captainId: number;
  viceId: number;
  xiXPts: number;
  captainXPts: number;
  benchXPts: number;
  totalXPts: number;
  formation: string;
}

/** Pure client-safe valid XI + Captain + Bench solver for a 15-man squad. */
export function solveLineupTS(
  squadIds: number[],
  elementsMap: Map<number, SlimElement>,
  gwXPts: Record<number, number>,
  benchBoost = false,
  tripleCaptain = false,
): SolvedLineup {
  const optimal = selectOptimalXI(
    squadIds,
    (id) => elementsMap.get(id)?.element_type ?? 0,
    (id) => gwXPts[id] ?? 0,
  );
  if (optimal.starters.length !== 11 || optimal.bench.length !== 4 ||
      optimal.captain === undefined || optimal.vice === undefined) {
    throw new RangeError("A complete, valid 15-player FPL squad is required to solve a lineup.");
  }
  return {
    starters: optimal.starters,
    bench: optimal.bench,
    captainId: optimal.captain,
    viceId: optimal.vice,
    xiXPts: Math.round(optimal.xi * 100) / 100,
    captainXPts: Math.round(optimal.capXp * (tripleCaptain ? 2 : 1) * 100) / 100,
    benchXPts: Math.round(optimal.benchXp * 100) / 100,
    totalXPts: projectedTotal(optimal.xi, optimal.capXp, optimal.benchXp,
      tripleCaptain ? "tc" : benchBoost ? "bb" : undefined),
    formation: optimal.formation,
  };
}
