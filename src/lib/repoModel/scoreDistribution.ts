/** Coherent independent-Poisson score distributions and an optional linear pool.
 * This is an uncalibrated baseline, not a fitted Dixon–Coles or lineup model.
 */
export interface GoalRates { home: number; away: number }
export interface ScoreDistribution {
  probabilities: number[][];
  omittedMass: number;
}
export interface ScoreForecast {
  homeXg: number;
  awayXg: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  homeCs: number;
  awayCs: number;
  homeScore2Plus: number;
  awayScore2Plus: number;
}

function poissonMasses(lambda: number): number[] {
  if (!Number.isFinite(lambda) || lambda < 0 || lambda > 30) throw new RangeError('Invalid goal rate.');
  const masses = [Math.exp(-lambda)];
  let total = masses[0];
  // Require a minimum support beyond the mean; stop only after the remaining tail is tiny.
  while (masses.length <= lambda || 1 - total > 1e-10) {
    if (masses.length > 256) throw new RangeError('Unable to calculate Poisson tail.');
    const next = masses[masses.length - 1] * lambda / masses.length;
    masses.push(next);
    total += next;
  }
  return masses;
}

export function poissonScoreDistribution(rates: GoalRates): ScoreDistribution {
  const home = poissonMasses(rates.home);
  const away = poissonMasses(rates.away);
  const probabilities = home.map(h => away.map(a => h * a));
  const mass = probabilities.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0);
  return { probabilities, omittedMass: Math.max(0, 1 - mass) };
}

/** Mix entire distributions, never independently blend probabilities and goal rates. */
export function mixScoreDistributions(a: ScoreDistribution, b: ScoreDistribution, weightB: number): ScoreDistribution {
  if (!Number.isFinite(weightB) || weightB < 0 || weightB > 1) throw new RangeError('Invalid mixture weight.');
  const height = Math.max(a.probabilities.length, b.probabilities.length);
  const width = Math.max(...a.probabilities.map(row => row.length), ...b.probabilities.map(row => row.length));
  return {
    probabilities: Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) =>
      (1 - weightB) * (a.probabilities[i]?.[j] ?? 0) + weightB * (b.probabilities[i]?.[j] ?? 0))),
    omittedMass: (1 - weightB) * a.omittedMass + weightB * b.omittedMass,
  };
}

/** All outcomes are calculated from the same score grid. */
export function summarizeScoreDistribution(distribution: ScoreDistribution): ScoreForecast {
  const out: ScoreForecast = { homeXg: 0, awayXg: 0, homeWin: 0, draw: 0, awayWin: 0, homeCs: 0, awayCs: 0, homeScore2Plus: 0, awayScore2Plus: 0 };
  distribution.probabilities.forEach((row, home) => row.forEach((p, away) => {
    out.homeXg += home * p; out.awayXg += away * p;
    if (home > away) out.homeWin += p;
    else if (home === away) out.draw += p;
    else out.awayWin += p;
    if (away === 0) out.homeCs += p;
    if (home === 0) out.awayCs += p;
    if (home >= 2) out.homeScore2Plus += p;
    if (away >= 2) out.awayScore2Plus += p;
  }));
  return out;
}

/** Use statistical rates or market-implied rates without claiming the two are calibrated. */
export function forecastFromGoalRates(homeXg: number, awayXg: number): ScoreForecast {
  return summarizeScoreDistribution(poissonScoreDistribution({ home: homeXg, away: awayXg }));
}
