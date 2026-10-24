export function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative.`);
  return value;
}

export function probability(value: number, name = "Probability"): number {
  nonNegative(value, name);
  if (value > 1) throw new RangeError(`${name} cannot exceed one.`);
  return value;
}

/** The roots-of-unity filter gives Poisson residue probabilities without truncating its tail. */
export function expectedPoissonFloor(mean: number, divisor: number): number {
  nonNegative(mean, "Poisson mean");
  if (!Number.isInteger(divisor) || divisor < 1 || divisor > 100) throw new RangeError("Invalid scoring divisor.");
  if (divisor === 1 || mean === 0) return mean;
  if (divisor === 2) return Math.max(0, mean / 2 + Math.expm1(-2 * mean) / 4);
  let expectedRemainder = 0;
  for (let remainder = 1; remainder < divisor; remainder++) {
    let residueProbability = 1;
    for (let frequency = 1; frequency < divisor; frequency++) {
      const angle = 2 * Math.PI * frequency / divisor;
      residueProbability += Math.exp(mean * (Math.cos(angle) - 1)) *
        Math.cos(mean * Math.sin(angle) - remainder * angle);
    }
    expectedRemainder += remainder * residueProbability / divisor;
  }
  return Math.max(0, (mean - expectedRemainder) / divisor);
}

export function negativeBinomialTail(mean: number, dispersion: number, threshold: number): number {
  nonNegative(mean, "Negative-binomial mean");
  if (!Number.isFinite(dispersion) || dispersion <= 0 || !Number.isInteger(threshold) || threshold < 1) {
    throw new RangeError("Invalid negative-binomial parameters.");
  }
  const success = dispersion / (dispersion + mean);
  let mass = Math.pow(success, dispersion);
  let cumulative = 0;
  for (let count = 0; count < threshold; count++) {
    cumulative += mass;
    mass *= (count + dispersion) / (count + 1) * (1 - success);
  }
  return Math.max(0, Math.min(1, 1 - cumulative));
}

export function seededRandom(seed: number): () => number {
  if (!Number.isInteger(seed)) throw new RangeError("Seed must be an integer.");
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function standardNormal(random: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(Number.MIN_VALUE, random()))) * Math.cos(2 * Math.PI * random());
}

export function gammaSample(shape: number, random: () => number): number {
  if (!Number.isFinite(shape) || shape <= 0) throw new RangeError("Gamma shape must be positive.");
  if (shape < 1) return gammaSample(shape + 1, random) * Math.pow(Math.max(random(), Number.MIN_VALUE), 1 / shape);
  const shifted = shape - 1 / 3;
  const scale = 1 / Math.sqrt(9 * shifted);
  for (;;) {
    const normal = standardNormal(random);
    const base = 1 + scale * normal;
    if (base <= 0) continue;
    const volume = base ** 3;
    const uniform = random();
    if (uniform < 1 - 0.0331 * normal ** 4 ||
        Math.log(uniform) < normal ** 2 / 2 + shifted * (1 - volume + Math.log(volume))) return shifted * volume;
  }
}

export function poissonFromUniform(uniform: number, mean: number): number {
  nonNegative(mean, "Poisson mean");
  if (!Number.isFinite(uniform) || uniform < 0 || uniform >= 1 || mean > 100) throw new RangeError("Invalid Poisson draw.");
  let count = 0;
  let mass = Math.exp(-mean);
  let cumulative = mass;
  while (uniform >= cumulative) {
    count++;
    mass *= mean / count;
    if (mass === 0 || cumulative + mass === cumulative) break;
    cumulative += mass;
  }
  return count;
}

/** Independent Poisson additivity avoids a normal approximation at large means. */
export function poissonSample(mean: number, random: () => number): number {
  nonNegative(mean, "Poisson mean");
  let total = 0;
  let remaining = mean;
  while (remaining > 0) {
    const part = Math.min(remaining, 20);
    total += poissonFromUniform(random(), part);
    remaining -= part;
  }
  return total;
}
