import { seededRandom } from "./probability";

export interface FrozenForecast {
  season: string;
  gw: number;
  playerId: number;
  issuedAt: string;
  deadlineAt: string;
  modelVersion: string;
  xPts: number;
  p60?: number;
}
export interface ForecastOutcome { season: string; gw: number; playerId: number; points: number; played60?: boolean }
export interface BenchmarkOptions { seed?: number; bootstrapDraws?: number; minimumGameweeks?: number; cutoffMinutes?: number }

const forecastKey = (row: { season: string; gw: number; playerId: number }): string => `${row.season}:${row.gw}:${row.playerId}`;

function identityValid(row: { season: string; gw: number; playerId: number }): boolean {
  return typeof row.season === "string" && /^\d{4}\/\d{2}$/.test(row.season) &&
    Number.isInteger(row.gw) && row.gw >= 1 && row.gw <= 38 && Number.isInteger(row.playerId) && row.playerId > 0;
}

function freeze(rows: readonly FrozenForecast[], cutoffMinutes: number): { accepted: Map<string, FrozenForecast>; rejected: number } {
  const accepted = new Map<string, FrozenForecast>();
  let rejected = 0;
  for (const row of rows) {
    const issued = Date.parse(row.issuedAt);
    const deadline = Date.parse(row.deadlineAt);
    if (!identityValid(row) || typeof row.modelVersion !== "string" || !row.modelVersion || !Number.isFinite(row.xPts) ||
        !Number.isFinite(issued) || !Number.isFinite(deadline) || issued >= deadline || issued > deadline - cutoffMinutes * 60_000 ||
        (row.p60 !== undefined && (!Number.isFinite(row.p60) || row.p60 < 0 || row.p60 > 1))) { rejected++; continue; }
    const key = forecastKey(row);
    const previous = accepted.get(key);
    if (previous && Date.parse(previous.issuedAt) === issued && (previous.xPts !== row.xPts || previous.p60 !== row.p60)) throw new RangeError(`Conflicting frozen forecasts for ${key}.`);
    if (!previous || issued > Date.parse(previous.issuedAt)) accepted.set(key, row);
  }
  return { accepted, rejected };
}

/** Identical player/GW samples, fixed publication cutoffs, and paired gameweek-cluster resampling. */
export function compareFrozenForecasts(
  candidates: readonly FrozenForecast[], references: readonly FrozenForecast[], outcomes: readonly ForecastOutcome[], options: BenchmarkOptions = {},
) {
  const draws = options.bootstrapDraws ?? 2000;
  const minimumGameweeks = options.minimumGameweeks ?? 8;
  const cutoffMinutes = options.cutoffMinutes ?? 60;
  if (!Number.isInteger(draws) || draws < 100 || draws > 20_000 || !Number.isInteger(minimumGameweeks) || minimumGameweeks < 2 ||
      !Number.isFinite(cutoffMinutes) || cutoffMinutes < 0) throw new RangeError("Invalid benchmark configuration.");
  const candidate = freeze(candidates, cutoffMinutes);
  const reference = freeze(references, cutoffMinutes);
  const actual = new Map<string, ForecastOutcome>();
  for (const row of outcomes) {
    if (!identityValid(row) || !Number.isFinite(row.points) || (row.played60 !== undefined && typeof row.played60 !== "boolean")) throw new RangeError("Invalid benchmark outcome.");
    const key = forecastKey(row);
    const previous = actual.get(key);
    if (previous && (previous.points !== row.points || previous.played60 !== row.played60)) throw new RangeError(`Conflicting outcomes for ${key}.`);
    actual.set(key, row);
  }
  const groups = new Map<string, { count: number; candidateSquared: number; referenceSquared: number }>();
  let count = 0, candidateAbsolute = 0, referenceAbsolute = 0, candidateSquared = 0, referenceSquared = 0;
  let candidateBrier = 0, referenceBrier = 0, binaryCount = 0;
  for (const [key, forecast] of candidate.accepted) {
    const comparison = reference.accepted.get(key);
    const outcome = actual.get(key);
    if (!comparison || !outcome || Date.parse(forecast.deadlineAt) !== Date.parse(comparison.deadlineAt)) continue;
    const candidateError = forecast.xPts - outcome.points;
    const referenceError = comparison.xPts - outcome.points;
    candidateAbsolute += Math.abs(candidateError);
    referenceAbsolute += Math.abs(referenceError);
    candidateSquared += candidateError ** 2;
    referenceSquared += referenceError ** 2;
    count++;
    const groupKey = `${forecast.season}:${forecast.gw}`;
    const group = groups.get(groupKey) ?? { count: 0, candidateSquared: 0, referenceSquared: 0 };
    group.count++;
    group.candidateSquared += candidateError ** 2;
    group.referenceSquared += referenceError ** 2;
    groups.set(groupKey, group);
    if (forecast.p60 !== undefined && comparison.p60 !== undefined && outcome.played60 !== undefined) {
      candidateBrier += (forecast.p60 - Number(outcome.played60)) ** 2;
      referenceBrier += (comparison.p60 - Number(outcome.played60)) ** 2;
      binaryCount++;
    }
  }
  const sortedGroups = [...groups.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([, group]) => group);
  let interval: [number, number] | null = null;
  if (groups.size >= 2) {
    const random = seededRandom(options.seed ?? 20261024);
    const differences: number[] = [];
    for (let draw = 0; draw < draws; draw++) {
      let sampleCount = 0, candidateLoss = 0, referenceLoss = 0;
      for (let cluster = 0; cluster < sortedGroups.length; cluster++) {
        const sampled = sortedGroups[Math.floor(random() * sortedGroups.length)];
        sampleCount += sampled.count;
        candidateLoss += sampled.candidateSquared;
        referenceLoss += sampled.referenceSquared;
      }
      differences.push(Math.sqrt(candidateLoss / sampleCount) - Math.sqrt(referenceLoss / sampleCount));
    }
    differences.sort((first, second) => first - second);
    interval = [differences[Math.floor(draws * 0.025)], differences[Math.min(draws - 1, Math.floor(draws * 0.975))]];
  }
  return {
    sampleSize: count, gameweeks: groups.size, cutoffMinutes,
    candidate: { mae: count ? candidateAbsolute / count : null, rmse: count ? Math.sqrt(candidateSquared / count) : null, p60Brier: binaryCount ? candidateBrier / binaryCount : null },
    reference: { mae: count ? referenceAbsolute / count : null, rmse: count ? Math.sqrt(referenceSquared / count) : null, p60Brier: binaryCount ? referenceBrier / binaryCount : null },
    rmseDifference95: interval,
    rejectedCandidate: candidate.rejected, rejectedReference: reference.rejected,
    verdict: groups.size < minimumGameweeks || !interval ? "insufficient_data" : interval[1] < 0 ? "candidate_lower_error" : interval[0] > 0 ? "reference_lower_error" : "inconclusive",
    limitations: ["Publication timestamps and model versions must come from trusted immutable snapshots; this function cannot authenticate supplied files.", "Gameweek-cluster intervals assume gameweeks are independent and can understate season-level dependence. Winning this supplied sample is not proof of future superiority."],
  };
}
