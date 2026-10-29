/** Frozen reference scale for future attack/defence FDR. Never fit on the displayed GW. */
export interface HistoricalFixtureForecast {
  forecastAt: string;
  deadlineAt: string;
  goalsFor: number;
  cleanSheetProbability: number;
}
export interface FdrReference {
  version: string;
  cutoff: string;
  attack: readonly number[];
  defence: readonly number[];
}

export function fitFdrReference(history: readonly HistoricalFixtureForecast[], cutoff: string, version: string): FdrReference {
  const end = Date.parse(cutoff);
  if (!Number.isFinite(end) || !version.trim()) throw new RangeError('A valid cutoff and reference version are required.');
  const eligible = history.filter(row => {
    const forecast = Date.parse(row.forecastAt), deadline = Date.parse(row.deadlineAt);
    return Number.isFinite(forecast) && Number.isFinite(deadline) && forecast < deadline && deadline < end &&
      Number.isFinite(row.goalsFor) && row.goalsFor >= 0 && Number.isFinite(row.cleanSheetProbability) && row.cleanSheetProbability >= 0 && row.cleanSheetProbability <= 1;
  });
  if (eligible.length < 20) throw new RangeError('At least 20 eligible pre-deadline fixture forecasts are required.');
  return Object.freeze({ version, cutoff, attack: Object.freeze(eligible.map(row => row.goalsFor).sort((a, b) => a - b)), defence: Object.freeze(eligible.map(row => row.cleanSheetProbability).sort((a, b) => a - b)) });
}

/** Mid-rank handles ties without arbitrary ordering; lower FDR means better opportunity. */
export function opportunityFdr(value: number, reference: readonly number[]): number {
  if (!Number.isFinite(value) || reference.length < 20 || reference.some((v, i) => !Number.isFinite(v) || (i > 0 && v < reference[i - 1]))) throw new RangeError('Invalid value or reference.');
  let below = 0, equal = 0;
  for (const observed of reference) { if (observed < value) below++; else if (observed === value) equal++; }
  return Math.max(1, Math.min(5, 1 + 4 * (1 - (below + .5 * equal) / reference.length)));
}
