/**
 * One-step free-transfer shadow value, based only on actual legal candidate actions.
 *
 * A free transfer has no guaranteed intrinsic points value: it can save at most
 * one four-point transfer hit when there is a beneficial legal action. The
 * candidate action set and gross xPts gains are supplied by the caller from
 * its real forecast and budget-constrained optimizer. We compare identical
 * actions under FT and FT - 1 to avoid inventing future prices or gains.
 *
 * This diagnostic is used for beam-search PRUNING, never added to the final
 * hit-adjusted points score or Monte Carlo point totals.
 */
import { MAX_FREE_TRANSFERS, TRANSFER_HIT_COST, pointsHit } from './scoring';

export interface FtOptionCandidate {
  transfers: number;
  /** Gross change in the optimizer's forecast objective vs holding the squad. */
  grossGain: number;
}

export function marginalFtOptionValue(
  freeTransfers: number,
  candidates: readonly FtOptionCandidate[],
): number {
  if (!Number.isInteger(freeTransfers) || freeTransfers < 0 || freeTransfers > MAX_FREE_TRANSFERS) {
    throw new RangeError('Free transfers must be between 0 and 5.');
  }
  for (const candidate of candidates) {
    if (!Number.isInteger(candidate.transfers) || candidate.transfers < 0 || !Number.isFinite(candidate.grossGain)) {
      throw new RangeError('Invalid legal transfer-option candidate.');
    }
  }
  if (freeTransfers === 0 || candidates.length === 0) return 0;

  const bestNetGain = (ft: number): number => candidates.reduce((best, candidate) =>
    Math.max(best, candidate.grossGain - pointsHit(candidate.transfers, ft)), 0);

  // The value cannot exceed the points cost of one hit; the comparison is
  // of identical legal moves and does not include any imagined extra moves.
  return Math.round(Math.min(TRANSFER_HIT_COST, Math.max(0,
    bestNetGain(freeTransfers) - bestNetGain(freeTransfers - 1),
  )) * 100) / 100;
}
