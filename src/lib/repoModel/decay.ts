/** Version 1 decay primitives. Multipliers are provisional, not calibrated forecasts. */
export const HISTORICAL_DECAY = 0.85;
export const FUTURE_DECAY = 0.85;
export const HISTORY_WINDOW = 12;
export const PRIOR_MINUTES = 450;
export const MIN_RECENT_MINUTES = 180;

export interface MatchObservation {
  fixtureId: number;
  gw: number;
  /** True only when the fixture has been verified as finished. */
  finished: boolean;
  minutes: number | null;
  /** The requested match-level statistic; null means unavailable, not zero. */
  value: number | null;
}

function validMultiplier(value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) throw new RangeError('Decay multiplier must be greater than 0 and at most 1.');
}

/** Weighted per-90 rate over completed fixtures, retaining each fixture in a double GW. */
export function historicalRate90(
  matches: readonly MatchObservation[], referenceGw: number,
  decay = HISTORICAL_DECAY, window = HISTORY_WINDOW,
): { rate: number | null; weightedMinutes: number; lowSample: boolean } {
  validMultiplier(decay);
  if (!Number.isInteger(referenceGw) || referenceGw < 1 || !Number.isInteger(window) || window < 1) throw new RangeError('Invalid reference gameweek or window.');
  let weightedMinutes = 0;
  let weightedValue = 0;
  const seen = new Set<number>();
  for (const match of matches) {
    if (!match.finished || !Number.isInteger(match.fixtureId) || match.fixtureId <= 0 || !Number.isInteger(match.gw)) continue;
    const age = referenceGw - match.gw;
    if (age < 0 || age >= window || match.minutes == null || !Number.isFinite(match.minutes) || match.minutes <= 0 || match.value == null || !Number.isFinite(match.value) || match.value < 0) continue;
    if (seen.has(match.fixtureId)) throw new RangeError('Duplicate fixture observation.');
    seen.add(match.fixtureId);
    const weight = decay ** age;
    weightedMinutes += weight * match.minutes;
    weightedValue += weight * match.value;
  }
  return { rate: weightedMinutes ? 90 * weightedValue / weightedMinutes : null, weightedMinutes, lowSample: weightedMinutes < MIN_RECENT_MINUTES };
}

/** Shrink a recent rate towards an independently supplied prior. */
export function stabilizeRate(recentRate: number | null, weightedMinutes: number, priorRate: number, priorMinutes = PRIOR_MINUTES): number {
  if (!Number.isFinite(weightedMinutes) || weightedMinutes < 0 || !Number.isFinite(priorRate) || priorRate < 0 || !Number.isFinite(priorMinutes) || priorMinutes <= 0 || (recentRate !== null && (!Number.isFinite(recentRate) || recentRate < 0))) throw new RangeError('Invalid rate or minutes.');
  if (recentRate === null || weightedMinutes === 0) return priorRate;
  return (weightedMinutes * recentRate + priorMinutes * priorRate) / (weightedMinutes + priorMinutes);
}

/** Planning score, not a forecast of actual total points. A blank GW still occupies a slot. */
export function futureGwScore(points: readonly number[], decay = FUTURE_DECAY): number {
  validMultiplier(decay);
  return points.reduce((sum, value, index) => {
    if (!Number.isFinite(value)) throw new RangeError('Projected points must be finite.');
    return sum + value * decay ** index;
  }, 0);
}
