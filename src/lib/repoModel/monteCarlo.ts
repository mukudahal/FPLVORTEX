/** Paired, fixture-component simulations. Distribution parameters remain unvalidated assumptions. */
import { expectedPoissonFloor, gammaSample as gammaUnit, poissonSample as poisson, poissonFromUniform as goalsFromUniform, seededRandom as mulberry32, standardNormal as normal } from "./probability";
import { expectedFixturePoints, sampleFixturePoints, validateFixtureModel, type PlayerFixtureModel } from "./playerModel";
import { CLEAN_SHEET_POINTS, type PlanningChip } from "./scoring";

import type {
  McBand,
  McCaptainRisk,
  McPathSummary,
  MonteCarloSummary,
} from "./types";

export const MC_DRAWS = 3000;

/** Distribution assumptions, not fitted or independently validated calibration. */
export const MC_CAL = {
  eventValue: { 1: 2.6, 2: 2.6, 3: 2.6, 4: 2.6 } as Record<number, number>,
  eventDispersion: 2,
  subReturnShare: 24 / 85,
  teamSigma: 0.3,
  probSlope: 1,
};

export interface McPlayerGw {
  fixtureModels?: PlayerFixtureModel[];
  /** Expected points for the gameweek (the model's xPts, including blanks and doubles). */
  mean: number;
  /** Per fixture: probability of playing 60+ minutes. */
  p60: number;
  /** Per fixture: probability of a shorter appearance. */
  pSub: number;
  /** Fixtures in the gameweek (0 blank, 1 normal, 2 double). */
  fixtures: number;
  /** Average clean-sheet probability per fixture (GK/DEF/MID). */
  csProb: number;
  /** Expected points lost to cards in the gameweek (zero or positive). */
  cardLoss: number;
  team: number;
  /** 1 GK, 2 DEF, 3 MID, 4 FWD */
  position: number;
}

export interface McLineup {
  starters: number[];
  /** Bench order: backup goalkeeper first, then outfield subs by priority. */
  bench: number[];
  captainId: number;
  viceId: number;
}

export interface McPath {
  id: string;
  label: string;
  hitCost: number;
  /** Additional per-gameweek hits for a sequential plan; deducted in that week only. */
  hitAt?: (gw: number) => number;
  lineupAt: (gw: number) => McLineup | null;
  chipAt?: (gw: number) => PlanningChip | undefined;
}

export interface McOptions {
  calibrationSlope?: number;
  /** Include captaincy outcomes after applying the vice-captain on the same draw. */
  captaincyViceFallback?: boolean;
  gws: number[];
  paths: McPath[];
  holdId: string;
  recommendedId: string;
  /** Additional paired comparison, e.g. chips versus the best no-chip plan. */
  referenceId?: string;
  playerAt: (pid: number, gw: number) => McPlayerGw | null;
  draws?: number;
  seed: number;
}

/* ---------------------------- random numbers ---------------------------- */

/** Mix integers into one well-spread 32-bit seed. */
export function mixSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const x of parts) {
    h ^= x | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** Random draws shared by every player of one team in one gameweek. */
export interface McTeamNoise {
  /** Lognormal factor (mean 1) on event rates: a good attacking day lifts teammates together. */
  shock: Float32Array;
  /** Uniforms that decide the team's goals conceded in each fixture (shared by GK, DEF, MID). */
  conc: Float64Array[];
}

export function makeTeamNoise(
  seed: number,
  team: number,
  gw: number,
  draws: number,
  fixtures: number,
): McTeamNoise {
  const rng = mulberry32(mixSeed(seed, team, gw, 7));
  const sg = MC_CAL.teamSigma;
  const shock = new Float32Array(draws);
  for (let i = 0; i < draws; i++) shock[i] = Math.exp(sg * normal(rng) - (sg * sg) / 2);
  const conc: Float64Array[] = [];
  for (let f = 0; f < Math.max(1, fixtures); f++) {
    const u = new Float64Array(draws);
    for (let i = 0; i < draws; i++) u[i] = rng();
    conc.push(u);
  }
  return { shock, conc };
}

const CS_POINTS = CLEAN_SHEET_POINTS;

/**
 * Sample points for ONE player-gameweek: `played` flags and `pts` (0 when absent).
 *
 * Per fixture: pick a minutes state (60+, short appearance, absent). An appearance earns 2 or 1
 * points. A 60+ appearance also earns the clean-sheet points (or loses a point per two goals
 * conceded) decided by the team's shared goals-conceded draw. Cards cost a point at the model's
 * own rate. The rest of the expected points arrive as random attacking/bonus events, with their
 * rate chosen to match the supplied mean; legacy inputs remain an aggregate approximation.
 * Exposed so calibration tests can use exactly the production sampler.
 */
export function samplePlayerGw(
  p: McPlayerGw | null,
  noise: McTeamNoise | null,
  draws: number,
  seed: number,
): { pts: Float32Array; played: Uint8Array } {
  const pts = new Float32Array(draws);
  const played = new Uint8Array(draws);
  if (!p) return { pts, played };
  if (!Number.isInteger(draws) || draws < 1 || !Number.isInteger(p.fixtures) || p.fixtures < 0 || p.fixtures > 8 ||
      !Number.isFinite(p.mean) || ![1, 2, 3, 4].includes(p.position) || !Number.isFinite(p.p60) ||
      !Number.isFinite(p.pSub) || p.p60 < 0 || p.pSub < 0 || p.p60 + p.pSub > 1 + 1e-12 ||
      !Number.isFinite(p.csProb) || p.csProb < 0 || p.csProb > 1 || !Number.isFinite(p.cardLoss) || p.cardLoss < 0) throw new RangeError("Invalid player distribution.");
  if (p.fixtures === 0) return { pts, played };
  if (p.fixtureModels) {
    if (p.fixtureModels.length !== p.fixtures || new Set(p.fixtureModels.map(model => model.fixtureId)).size !== p.fixtures) throw new RangeError("Fixture model count mismatch.");
    for (const model of p.fixtureModels) validateFixtureModel(model);
    const modelMean = p.fixtureModels.reduce((sum, model) => sum + Object.values(expectedFixturePoints(model)).reduce((total, points) => total + points, 0), 0);
    if (Math.abs(modelMean - p.mean) > 0.011) throw new RangeError("Simulation and xPts use inconsistent fixture models.");
    const random = mulberry32(seed);
    for (let draw = 0; draw < draws; draw++) {
      for (let fixture = 0; fixture < p.fixtureModels.length; fixture++) {
        const result = sampleFixturePoints(p.fixtureModels[fixture], random, noise?.conc[fixture]?.[draw] ?? random(), noise?.shock[draw] ?? 1);
        pts[draw] += result.points;
        if (result.appeared) played[draw] = 1;
      }
    }
    return { pts, played };
  }

  const modelP60 = Math.min(1, Math.max(0, p.p60));
  const modelPSub = Math.min(1 - modelP60, Math.max(0, p.pSub));
  const pApp = modelP60 + modelPSub;
  if (pApp === 0) return { pts, played };

  const { eventDispersion, subReturnShare } = MC_CAL;
  const eventValue = MC_CAL.eventValue[p.position] ?? 2.6;

  const p60 = modelP60;
  const pSub = modelPSub;

  const fx = p.fixtures;
  const perFixture = p.mean / fx;
  const csValue = CS_POINTS[p.position] ?? 0;
  const csProb = csValue > 0 ? Math.min(1, Math.max(1e-8, p.csProb)) : 0;
  const lambdaC = csProb > 0 ? -Math.log(csProb) : 0;
  const gcPenalised = p.position <= 2;
  // Expected defensive points of a 60+ appearance (clean sheet minus goals-conceded penalty).
  const defMean = csProb > 0 ? csValue * csProb - (gcPenalised ? expectedPoissonFloor(lambdaC, 2) : 0) : 0;
  // Card rate per appearance that reproduces the model's expected card loss.
  const cardLossPerFixture = Math.max(0, p.cardLoss) / fx;
  const pCard = Math.min(1, cardLossPerFixture / pApp);

  // What is left for random events once appearance, defence and cards are accounted for.
  const residual = perFixture - (2 * p60 + pSub) - p60 * defMean + pCard * pApp;
  const rFull = residual / (p60 + subReturnShare * pSub);
  const rSub = subReturnShare * rFull;

  const rng = mulberry32(seed);
  for (let i = 0; i < draws; i++) {
    let total = 0;
    let appeared = false;
    for (let f = 0; f < fx; f++) {
      const u = rng();
      const state = u < p60 ? 2 : u < p60 + pSub ? 1 : 0;
      if (state === 0) continue;
      appeared = true;
      total += state === 2 ? 2 : 1;

      if (state === 2 && csProb > 0) {
        const uc = noise ? noise.conc[Math.min(f, noise.conc.length - 1)][i] : rng();
        const g = goalsFromUniform(uc, lambdaC);
        if (g === 0) total += csValue;
        else if (gcPenalised) total -= Math.floor(g / 2);
      }
      if (rng() < pCard) total -= 1;

      const rate = state === 2 ? rFull : rSub;
      let lambda = (Math.abs(rate) / eventValue) * (noise ? noise.shock[i] : 1);
      lambda *= gammaUnit(eventDispersion, rng) / eventDispersion; // overdispersed event counts
      const n = poisson(lambda, rng);
      for (let event = 0; event < n; event++) total += Math.sign(rate) * (Math.floor(eventValue) + Number(rng() < eventValue % 1));
    }
    if (appeared) {
      played[i] = 1;
      pts[i] = total;
    }
  }
  return { pts, played };
}

/* ------------------------------ lineup scoring ------------------------------ */

export interface McOutcome {
  pts: (pid: number) => number;
  played: (pid: number) => boolean;
  position: (pid: number) => number;
}

/**
 * Points a lineup scores on one realised outcome: starters who played, a backup goalkeeper if the
 * starter did not, formation-valid automatic substitutions in bench order, and the captain's
 * doubling (falling back to the vice-captain if the captain did not play).
 */
export function scoreLineup(l: McLineup, o: McOutcome, chip?: PlanningChip): number {
  if (chip === "bb") {
    const all = new Set([...l.starters, ...l.bench]);
    let total = [...all].reduce((sum, id) => sum + (o.played(id) ? o.pts(id) : 0), 0);
    if (o.played(l.captainId)) total += o.pts(l.captainId);
    else if (o.played(l.viceId)) total += o.pts(l.viceId);
    return total;
  }
  let total = 0;

  const gkStarter = l.starters.find((id) => o.position(id) === 1);
  const benchGk = l.bench.find((id) => o.position(id) === 1);
  const outfield = l.starters.filter((id) => o.position(id) !== 1);

  if (gkStarter !== undefined) {
    if (o.played(gkStarter)) total += o.pts(gkStarter);
    else if (benchGk !== undefined && o.played(benchGk)) total += o.pts(benchGk);
  }

  const counts: Record<number, number> = { 2: 0, 3: 0, 4: 0 };
  const missing: number[] = [];
  for (const id of outfield) {
    counts[o.position(id)] = (counts[o.position(id)] ?? 0) + 1;
    if (o.played(id)) total += o.pts(id);
    else missing.push(id);
  }

  if (missing.length > 0) {
    for (const sub of l.bench) {
      if (missing.length === 0) break;
      const subPos = o.position(sub);
      if (subPos === 1 || !o.played(sub)) continue;
      for (let m = 0; m < missing.length; m++) {
        const outPos = o.position(missing[m]);
        const after = { ...counts };
        after[outPos] -= 1;
        after[subPos] += 1;
        if (after[2] >= 3 && after[3] >= 2 && after[4] >= 1) {
          counts[outPos] -= 1;
          counts[subPos] += 1;
          missing.splice(m, 1);
          total += o.pts(sub);
          break;
        }
      }
    }
  }

  const captain = o.played(l.captainId) ? l.captainId : o.played(l.viceId) ? l.viceId : null;
  if (captain !== null) total += o.pts(captain) * (chip === "tc" ? 2 : 1);

  return total;
}

/* -------------------------------- summaries -------------------------------- */

function sortedCopy(a: ArrayLike<number>): Float64Array {
  const out = Float64Array.from(a as ArrayLike<number>);
  out.sort();
  return out;
}

function quantile(sorted: Float64Array, q: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  return sorted[Math.min(n - 1, Math.max(0, Math.floor(q * n)))];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Optional externally validated calibration; identity is the default and preserves endpoints. */
export function calibrateProbability(value: number, slope = 1): number {
  if (!Number.isFinite(value) || value < 0 || value > 1 || !Number.isFinite(slope) || slope <= 0) throw new RangeError("Invalid probability calibration.");
  if (value === 0 || value === 1) return value;
  return 1 / (1 + Math.exp(-Math.log(value / (1 - value)) * slope));
}

function band(gw: number, a: ArrayLike<number>): McBand {
  const s = sortedCopy(a);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i];
  return { gw, mean: r2(sum / a.length), p10: r2(quantile(s, 0.1)), p90: r2(quantile(s, 0.9)) };
}

/* --------------------------------- main run --------------------------------- */

export function runMonteCarlo(opts: McOptions): MonteCarloSummary {
  const draws = opts.draws ?? MC_DRAWS;
  if (!Number.isInteger(draws) || draws < 100 || draws > 30000) throw new RangeError("Draws must be between 100 and 30000.");
  if (!Number.isInteger(opts.seed)) throw new RangeError("Seed must be an integer.");
  if (opts.gws.length < 1 || opts.gws.length > 38 || new Set(opts.gws).size !== opts.gws.length || opts.gws.some((gw) => !Number.isInteger(gw) || gw < 1 || gw > 38)) throw new RangeError("Invalid gameweek horizon.");
  if (!opts.paths.length || new Set(opts.paths.map((path) => path.id)).size !== opts.paths.length) throw new RangeError("Invalid or duplicate scenario identifiers.");
  if (!opts.paths.some((path) => path.id === opts.holdId)) throw new RangeError("Missing hold scenario.");
  if (opts.referenceId && !opts.paths.some(path => path.id === opts.referenceId)) throw new RangeError('Missing reference scenario.');
  if (opts.gws.some((gw, index) => index > 0 && gw <= opts.gws[index - 1])) throw new RangeError("Gameweeks must be chronological.");
  if (!opts.paths.some(path => path.id === opts.recommendedId) || opts.paths.some(path => !Number.isFinite(path.hitCost) || path.hitCost < 0)) throw new RangeError("Invalid recommended path or hit cost.");
  calibrateProbability(0.5, opts.calibrationSlope ?? 1);
  const { gws, paths, playerAt, seed } = opts;

  const playerCache = new Map<string, { pts: Float32Array; played: Uint8Array }>();
  const noiseCache = new Map<string, McTeamNoise>();
  const infoCache = new Map<string, McPlayerGw | null>();

  const info = (pid: number, gw: number): McPlayerGw | null => {
    const key = `${pid}:${gw}`;
    if (!infoCache.has(key)) infoCache.set(key, playerAt(pid, gw));
    return infoCache.get(key) ?? null;
  };

  const teamNoise = (team: number, gw: number, fixtures: number): McTeamNoise => {
    const key = `${team}:${gw}:${fixtures}`;
    let n = noiseCache.get(key);
    if (!n) {
      n = makeTeamNoise(seed, team, gw, draws, fixtures);
      noiseCache.set(key, n);
    }
    return n;
  };

  const player = (pid: number, gw: number) => {
    const key = `${pid}:${gw}`;
    let d = playerCache.get(key);
    if (!d) {
      const p = info(pid, gw);
      d = samplePlayerGw(p, p ? teamNoise(p.team, gw, p.fixtures) : null, draws, mixSeed(seed, pid, gw, 3));
      playerCache.set(key, d);
    }
    return d;
  };

  // Per path and gameweek: simulated points of the lineup, draw by draw.
  const perGw = new Map<string, Float64Array[]>(); // path id -> [gw index] -> draws
  const totals = new Map<string, Float64Array>();

  for (const path of paths) {
    const series: Float64Array[] = [];
    const total = new Float64Array(draws).fill(-path.hitCost);
    for (const gw of gws) {
      const weeklyHit = path.hitAt?.(gw) ?? 0;
      if (!Number.isFinite(weeklyHit) || weeklyHit < 0) throw new RangeError('Invalid weekly transfer hit.');
      const arr = new Float64Array(draws).fill(-weeklyHit);
      const lineup = path.lineupAt(gw);
      if (lineup) {
        const ids = [...lineup.starters, ...lineup.bench];
        const sims = new Map(ids.map((id) => [id, player(id, gw)]));
        const pos = new Map(ids.map((id) => [id, info(id, gw)?.position ?? 0]));
        for (let i = 0; i < draws; i++) {
          arr[i] = scoreLineup(lineup, {
            pts: (id) => sims.get(id)?.pts[i] ?? 0,
            played: (id) => (sims.get(id)?.played[i] ?? 0) === 1,
            position: (id) => pos.get(id) ?? 0,
          }, path.chipAt?.(gw)) - weeklyHit;
          total[i] += arr[i];
        }
      }
      if (!lineup && weeklyHit) for (let i = 0; i < draws; i++) total[i] -= weeklyHit;
      series.push(arr);
    }
    perGw.set(path.id, series);
    totals.set(path.id, total);
  }

  const hold = totals.get(opts.holdId);
  const holdSeries = perGw.get(opts.holdId);

  const summaries: McPathSummary[] = paths.map((path) => {
    const total = totals.get(path.id) as Float64Array;
    const sorted = sortedCopy(total);
    let sum = 0;
    for (let i = 0; i < draws; i++) sum += total[i];
    const mean = sum / draws;
    let sq = 0;
    for (let i = 0; i < draws; i++) sq += (total[i] - mean) ** 2;

    let deltaMean: number | null = null;
    let deltaP10: number | null = null;
    let deltaP90: number | null = null;
    let probBeatsHold: number | null = null;
    let probBeatsHoldRaw: number | null = null;
    let probDrawsHold: number | null = null;
    let probLosesHold: number | null = null;
    let expectedDownsideVsHold: number | null = null;
    let expectedUpsideVsHold: number | null = null;
    let cumDelta: McBand[] | null = null;

    if (path.id !== opts.holdId && hold && holdSeries) {
      const delta = new Float64Array(draws);
      let wins = 0;
      let ties = 0;
      for (let i = 0; i < draws; i++) {
        delta[i] = total[i] - hold[i];
        if (delta[i] > 1e-9) wins += 1;
        else if (Math.abs(delta[i]) <= 1e-9) ties++;
      }
      const ds = sortedCopy(delta);
      deltaMean = r2(delta.reduce((a, b) => a + b, 0) / draws);
      deltaP10 = r2(quantile(ds, 0.1));
      deltaP90 = r2(quantile(ds, 0.9));
      probBeatsHoldRaw = Math.round((wins / draws) * 1000) / 1000;
      probBeatsHold = Math.round(calibrateProbability(wins / draws, opts.calibrationSlope ?? 1) * 1000) / 1000;

      probDrawsHold = ties / draws;
      probLosesHold = (draws - wins - ties) / draws;
      expectedDownsideVsHold = r2(delta.reduce((sum, d) => sum + Math.max(0, -d), 0) / draws);
      expectedUpsideVsHold = r2(delta.reduce((sum, d) => sum + Math.max(0, d), 0) / draws);
      const mine = perGw.get(path.id) as Float64Array[];
      const running = new Float64Array(draws).fill((paths.find(candidate => candidate.id === opts.holdId)?.hitCost ?? 0) - path.hitCost);
      cumDelta = gws.map((gw, j) => {
        for (let i = 0; i < draws; i++) running[i] += mine[j][i] - holdSeries[j][i];
        return band(gw, running);
      });
    }

    const reference = opts.referenceId ? totals.get(opts.referenceId) : undefined;
    const vsReference = reference && path.id !== opts.referenceId ? (() => {
      const delta = Float64Array.from(total, (value, i) => value - reference[i]);
      const sortedDelta = sortedCopy(delta);
      const average = delta.reduce((sum, value) => sum + value, 0) / draws;
      let wins = 0, ties = 0, squared = 0;
      for (const value of delta) {
        if (value > 1e-9) wins++;
        else if (Math.abs(value) <= 1e-9) ties++;
        squared += (value - average) ** 2;
      }
      const probability = wins / draws;
      const z = 1.959963984540054;
      const denominator = 1 + z * z / draws;
      const center = (probability + z * z / (2 * draws)) / denominator;
      const radius = z * Math.sqrt(probability * (1 - probability) / draws + z * z / (4 * draws * draws)) / denominator;
      return {
        referenceId: opts.referenceId!, deltaMean: r2(average),
        deltaP10: r2(quantile(sortedDelta, 0.1)), deltaP90: r2(quantile(sortedDelta, 0.9)),
        probWin: probability, probTie: ties / draws, probLoss: (draws - wins - ties) / draws,
        winProbability95: [Math.max(0, center - radius), Math.min(1, center + radius)] as [number, number],
        meanStandardError: Math.sqrt(squared / (draws - 1) / draws),
      };
    })() : undefined;

    return {
      id: path.id,
      label: path.label,
      hitCost: path.hitCost,
      mean: r2(mean),
      median: r2(quantile(sorted, 0.5)),
      sd: r2(Math.sqrt(sq / draws)),
      p10: r2(quantile(sorted, 0.1)),
      p25: r2(quantile(sorted, 0.25)),
      p75: r2(quantile(sorted, 0.75)),
      p90: r2(quantile(sorted, 0.9)),
      deltaMean,
      deltaP10,
      deltaP90,
      probBeatsHold,
      probBeatsHoldRaw,
      probDrawsHold, probLosesHold, expectedDownsideVsHold, expectedUpsideVsHold,
      perGw: gws.map((gw, j) => band(gw, (perGw.get(path.id) as Float64Array[])[j])),
      cumDelta,
      ...(vsReference ? { vsReference } : {}),
    };
  });

  const captainsByGw: Record<number, McCaptainRisk[]> = {};
  const recPath = paths.find((p) => p.id === opts.recommendedId) ?? paths[0];
  for (const gw of gws) {
    const captains: McCaptainRisk[] = [];
    captainsByGw[gw] = captains;
    const lu = recPath.lineupAt(gw);
    if (!lu) continue;
    const ranked = [...lu.starters]
      .sort((a, b) => (info(b, gw)?.mean ?? 0) - (info(a, gw)?.mean ?? 0));
    const pick = player(lu.captainId, gw).pts;
    for (const id of ranked) {
      const { pts, played } = player(id, gw);
      // If the current vice is promoted, swap the armbands. Otherwise keep the current vice.
      const viceId = id === lu.viceId ? lu.captainId : lu.viceId;
      const vice = opts.captaincyViceFallback && viceId !== id ? player(viceId, gw) : null;
      const withVice = vice ? new Float64Array(draws) : null;
      let pairTotal = 0, pairBlank = 0, pairHaul = 0, viceActivated = 0;
      const s = sortedCopy(pts);
      let sum = 0, blank = 0, haul = 0, beats = 0;
      for (let i = 0; i < draws; i++) {
        sum += pts[i];
        if (pts[i] <= 2) blank += 1;
        if (pts[i] >= 9) haul += 1;
        if (pts[i] > pick[i]) beats += 1;
        if (withVice && vice) {
          const usedVice = played[i] === 0 && vice.played[i] === 1;
          const points = played[i] === 1 ? pts[i] : usedVice ? vice.pts[i] : 0;
          withVice[i] = points;
          pairTotal += points;
          pairBlank += Number(points <= 2);
          pairHaul += Number(points >= 9);
          viceActivated += Number(usedVice);
        }
      }
      withVice?.sort();
      captains.push({
        id,
        ...(withVice ? { withVice: {
          viceId, mean: r2(pairTotal / draws), p10: r2(quantile(withVice, 0.1)),
          p90: r2(quantile(withVice, 0.9)), pBlank: Math.round(pairBlank / draws * 1000) / 1000,
          pHaul: Math.round(pairHaul / draws * 1000) / 1000,
          pViceActive: Math.round(viceActivated / draws * 1000) / 1000,
        } } : {}),
        mean: r2(sum / draws),
        p10: r2(quantile(s, 0.1)),
        p90: r2(quantile(s, 0.9)),
        pBlank: Math.round((blank / draws) * 1000) / 1000,
        pHaul: Math.round((haul / draws) * 1000) / 1000,
        pBeatsPick: id === lu.captainId ? null : Math.round((beats / draws) * 1000) / 1000,
        isPick: id === lu.captainId,
      });
    }
  }

  return {
    draws,
    horizon: gws.length,
    gws,
    seed,
    recommendedPathId: opts.recommendedId,
    paths: summaries,
    captains: (captainsByGw[gws[0]] ?? []).slice(0, 4),
    captainsByGw,
    assumptions: [
      "Each player's minutes use the model's own probabilities, clean sheets come from a goals-conceded draw shared by a team's defenders, cards use the model's rate, and other points arrive as random events. Distribution assumptions have not been independently calibrated.",
      "Teammates share a team-and-gameweek factor, so a strong attacking day lifts several of your players together.",
      "Lineups are picked in advance from expected points, then scored with automatic substitutions and the vice-captain fallback.",
      "Strategies reuse the same player draws. Shared team shocks approximate dependence; this is not a full match-scoreline simulator. Mean forecasts and tail calibration require held-out validation.",
    ],
  };
}

