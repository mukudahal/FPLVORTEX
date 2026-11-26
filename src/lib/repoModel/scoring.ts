/**
 * Canonical, framework-independent FPL calculations shared by planner, optimiser,
 * xPts, simulations and saved-plan replay. The active season's exceptional rules
 * will be versioned in Step 17; these are the verified 2026/27 defaults.
 */
export const FORMATION_LIMITS: Readonly<Record<number, readonly [number, number]>> = {
  1: [1, 1],
  2: [3, 5],
  3: [2, 5],
  4: [1, 3],
};
export const GOAL_POINTS: Readonly<Record<number, number>> = { 1: 10, 2: 6, 3: 5, 4: 4 };
export const CLEAN_SHEET_POINTS: Readonly<Record<number, number>> = { 1: 4, 2: 4, 3: 1, 4: 0 };
export const MAX_FREE_TRANSFERS = 5;
export const TRANSFER_HIT_COST = 4;
export const MAX_PLAYERS_PER_CLUB = 3;

export type PlanningChip = "wc" | "fh" | "bb" | "tc";

/** Return a bit mask of the ordered outfield substitutes admitted by the formation. */
export function outfieldAutoSubs(
  starterCounts: readonly number[],
  missingPositions: readonly number[],
  benchPositions: readonly number[],
  availableBench: number,
): number {
  const counts = [...starterCounts];
  const missing = [...missingPositions];
  let used = 0;
  for (let slot = 0; slot < benchPositions.length && missing.length; slot++) {
    if (!(availableBench & (1 << slot))) continue;
    const incoming = benchPositions[slot];
    const index = missing.findIndex(outgoing =>
      outgoing === incoming || counts[outgoing] > FORMATION_LIMITS[outgoing][0]);
    if (index === -1) continue;
    counts[missing[index]]--;
    counts[incoming]++;
    missing.splice(index, 1);
    used |= 1 << slot;
  }
  return used;
}

const finitePoints = (value: number): number => Number.isFinite(value) ? value : 0;
const round2 = (value: number): number => Math.round(value * 100) / 100;

export function pointsHit(transfersMade: number, freeTransfers: number, unlimited = false): number {
  if (!Number.isInteger(transfersMade) || transfersMade < 0 || !Number.isInteger(freeTransfers) || freeTransfers < 0) {
    throw new RangeError("Transfer counts must be non-negative integers.");
  }
  return unlimited ? 0 : Math.max(0, transfersMade - freeTransfers) * TRANSFER_HIT_COST;
}

/** WC/FH consume this week's allowance but preserve FTs already banked. */
export function nextFreeTransfers(freeTransfers: number, transfersMade: number, chip?: PlanningChip): number {
  if (!Number.isInteger(freeTransfers) || freeTransfers < 0 || freeTransfers > MAX_FREE_TRANSFERS ||
      !Number.isInteger(transfersMade) || transfersMade < 0) {
    throw new RangeError("Invalid free-transfer count or number of transfers.");
  }
  return chip === "wc" || chip === "fh"
    ? Math.max(1, freeTransfers)
    : Math.min(MAX_FREE_TRANSFERS, Math.max(0, freeTransfers - transfersMade) + 1);
}

export function sellingPrice(purchaseTenths: number, currentTenths: number): number {
  if (!Number.isInteger(purchaseTenths) || !Number.isInteger(currentTenths) ||
      purchaseTenths < 0 || currentTenths < 0) {
    throw new RangeError("FPL prices must be non-negative integer tenths.");
  }
  return currentTenths <= purchaseTenths
    ? currentTenths
    : purchaseTenths + Math.floor((currentTenths - purchaseTenths) / 2);
}

export interface OptimalXI {
  starters: number[];
  bench: number[];
  captain: number | undefined;
  vice: number | undefined;
  formation: string;
  xi: number;
  capXp: number;
  benchXp: number;
  total: number;
}

/** One canonical formation enumeration; upstream callers retain their public return formats. */
export function selectOptimalXI(
  ids: readonly number[],
  positionOf: (id: number) => number,
  expectedPointsOf: (id: number) => number,
): OptimalXI {
  if (new Set(ids).size !== ids.length) throw new RangeError("Duplicate player in squad.");
  const xp = (id: number): number => finitePoints(expectedPointsOf(id));
  const ranked = (position: number): number[] => ids
    .filter((id) => positionOf(id) === position)
    .sort((first, second) => xp(second) - xp(first) || first - second);
  const goalkeepers = ranked(1);
  const defenders = ranked(2);
  const midfielders = ranked(3);
  const forwards = ranked(4);

  let bestOutfield: number[] = [];
  let bestFormation = "4-4-2";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let defendersCount = 3; defendersCount <= Math.min(5, defenders.length); defendersCount++) {
    for (let midfieldersCount = 2; midfieldersCount <= Math.min(5, midfielders.length); midfieldersCount++) {
      const forwardsCount = 10 - defendersCount - midfieldersCount;
      if (forwardsCount < 1 || forwardsCount > Math.min(3, forwards.length)) continue;
      const chosen = [
        ...defenders.slice(0, defendersCount),
        ...midfielders.slice(0, midfieldersCount),
        ...forwards.slice(0, forwardsCount),
      ];
      const candidates = [...goalkeepers.slice(0, 1), ...chosen];
      const score = candidates.reduce((total, id) => total + xp(id), 0) + Math.max(...candidates.map(xp));
      if (score > bestScore) {
        bestScore = score;
        bestOutfield = chosen;
        bestFormation = `${defendersCount}-${midfieldersCount}-${forwardsCount}`;
      }
    }
  }

  const starters = goalkeepers.length ? [goalkeepers[0], ...bestOutfield] : [...bestOutfield];
  const chosen = new Set(bestOutfield);
  const bench = [
    ...(goalkeepers.length > 1 ? [goalkeepers[1]] : []),
    ...[...defenders, ...midfielders, ...forwards]
      .filter((id) => !chosen.has(id))
      .sort((first, second) => xp(second) - xp(first) || first - second),
  ];
  const ordered = [...starters].sort((first, second) => xp(second) - xp(first) || first - second);
  const captain = ordered[0];
  const vice = ordered[1];
  const xi = starters.reduce((total, id) => total + xp(id), 0);
  const capXp = captain === undefined ? 0 : xp(captain);
  const benchXp = bench.reduce((total, id) => total + xp(id), 0);
  return { starters, bench, captain, vice, formation: bestFormation, xi, capXp, benchXp, total: xi + capXp };
}

/** A fully selected lineup earns XI + one extra captain score; TC adds one more. */
export function projectedTotal(xi: number, captain: number, bench: number, chip?: PlanningChip): number {
  const base = finitePoints(xi) + finitePoints(captain);
  return round2(base + (chip === "tc" ? finitePoints(captain) : 0) +
    (chip === "bb" ? finitePoints(bench) : 0));
}
