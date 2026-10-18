import type { Player } from './model.js';

export type ForecastDistribution = {
  playerId: number;
  gameweekIndex: number;
  model: 'independent-demo-monte-carlo-v0.2';
  samples: number;
  seed: number;
  expectedPoints: number;
  p10: number;
  p50: number;
  p90: number;
  probabilityOfBlank: number;
  probabilityOfReturn: number;
};

function pseudoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}
function poisson(lambda: number, random: () => number): number {
  if (lambda <= 0) return 0;
  const cutoff = Math.exp(-lambda);
  let product = 1;
  let events = 0;
  do {
    events += 1;
    product *= random();
  } while (product > cutoff && events < 100);
  return events - 1;
}
function quantile(sorted: readonly number[], fraction: number): number {
  const index = fraction * (sorted.length - 1);
  const left = Math.floor(index);
  const right = Math.ceil(index);
  return (sorted[left] ?? 0) * (1 - (index - left)) + (sorted[right] ?? 0) * (index - left);
}
/** Independent simulation mechanics with illustrative rates, not a calibrated forecast. */
export function forecastDistribution(player: Player, gameweekIndex: number, samples = 2_000, seed = 1001): ForecastDistribution {
  if (!Number.isInteger(gameweekIndex) || gameweekIndex < 0 || gameweekIndex >= player.fixtures.length) {
    throw new RangeError('Gameweek outside player fixture horizon');
  }
  if (!Number.isInteger(samples) || samples < 100 || samples > 25_000) {
    throw new RangeError('Samples must be an integer between 100 and 25,000');
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4_294_967_295) {
    throw new RangeError('Seed must be an unsigned 32-bit integer');
  }
  const fdr = player.fixtures[gameweekIndex];
  if (!fdr || !Number.isInteger(fdr) || fdr < 1 || fdr > 5) throw new RangeError('Invalid FDR');
  if (!Number.isFinite(player.expectedMinutes) || player.expectedMinutes < 0 || player.expectedMinutes > 90 || player.xg90 < 0 || player.xa90 < 0) {
    throw new RangeError('Invalid player rates or minutes');
  }
  const random = pseudoRandom((seed ^ Math.imul(player.id, 0x9e3779b1) ^ Math.imul(gameweekIndex + 1, 0x85ebca6b)) >>> 0);
  const playProbability = player.status === 'out' ? 0 : Math.min(1, Math.max(player.expectedMinutes / 90, 0) * (player.status === 'doubt' ? 0.8 : 1));
  const playingMinutes = playProbability > 0 ? Math.min(90, player.expectedMinutes / Math.max(playProbability, 0.01)) : 0;
  const goalPoints = player.position === 'MID' ? 5 : player.position === 'DEF' || player.position === 'GKP' ? 6 : 4;
  const difficultyFactor = Math.max(0.4, 1 + (3 - fdr) * 0.12);
  const cleanSheetProbability = Math.min(0.72, Math.max(0.06, 0.36 + (3 - fdr) * 0.10));
  const outcomes: number[] = [];
  let blanks = 0;
  let returns = 0;
  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
    if (random() >= playProbability) {
      outcomes.push(0);
      blanks += 1;
      continue;
    }
    const minutes = playingMinutes;
    const share = minutes / 90;
    const goals = poisson(player.xg90 * share * difficultyFactor, random);
    const assists = poisson(player.xa90 * share * difficultyFactor, random);
    if (goals + assists > 0) returns += 1;
    let points = minutes >= 60 ? 2 : 1;
    points += goals * goalPoints + assists * 3;
    if (minutes >= 60 && random() < cleanSheetProbability) {
      if (player.position === 'MID') points += 1;
      if (player.position === 'DEF' || player.position === 'GKP') points += 4;
    }
    if (player.position === 'MID' || player.position === 'FWD') {
      points += random() < Math.min(0.35, player.form / 30) ? 1 : 0;
    }
    if (points <= 2) blanks += 1;
    outcomes.push(points);
  }
  outcomes.sort((left, right) => left - right);
  const rounded = (value: number): number => Math.round(value * 100) / 100;
  return {
    playerId: player.id, gameweekIndex, model: 'independent-demo-monte-carlo-v0.2',
    samples, seed, expectedPoints: rounded(outcomes.reduce((sum, points) => sum + points, 0) / samples),
    p10: rounded(quantile(outcomes, 0.1)), p50: rounded(quantile(outcomes, 0.5)),
    p90: rounded(quantile(outcomes, 0.9)),
    probabilityOfBlank: rounded(blanks / samples), probabilityOfReturn: rounded(returns / samples)
  };
}