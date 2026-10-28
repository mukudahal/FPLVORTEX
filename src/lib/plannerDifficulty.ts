import type { FixtureCell } from './types';

/** A transparent, provisional matchup index, not the official FPL rating.
 * Maps the model's win probability to a 1–5 continuous difficulty scale.
 * Doubles use the mean probability of their matches; blanks have no rating.
 */
export function plannerDifficulty(cell: FixtureCell): number | null {
  if (cell.isBlank || cell.winProb == null || !Number.isFinite(cell.winProb) || cell.winProb < 0 || cell.winProb > 1) return null;
  return 1 + 4 * (1 - cell.winProb);
}

/** Average the rated gameweeks, excluding blanks and missing projections. */
export function averagePlannerDifficulty(cells: readonly FixtureCell[]): number | null {
  const ratings = cells.map(plannerDifficulty).filter((value): value is number => value !== null);
  return ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null;
}
