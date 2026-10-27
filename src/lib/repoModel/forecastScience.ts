import { estimateMinutesDistribution, type MinutesEvidence } from "./minutes";
import type { Fixture, SlimElement } from "./types";

export interface HistoricalPrediction {
  position: 1 | 2 | 3 | 4;
  gw: number;
  predictedAt: string;
  deadlineAt: string;
  predicted: number;
  actual: number;
  p60?: number;
  played60?: boolean;
}
export interface Calibration { sampleSize: number; group: number; scale: number; bias: number; verified: boolean; fitted?: boolean }
const clip = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(upper, value));

/** Read only frozen forecasts made before their deadline; reject hindsight leakage. */
export function eligibleHistory(history: readonly HistoricalPrediction[], throughGw: number): HistoricalPrediction[] {
  return history.filter((sample) => sample.gw < throughGw && sample.gw >= 1 && sample.gw <= 38 &&
    [1, 2, 3, 4].includes(sample.position) && Number.isFinite(sample.predicted) &&
    Number.isInteger(sample.gw) && Number.isFinite(sample.actual) && Number.isFinite(Date.parse(sample.predictedAt)) &&
    Number.isFinite(Date.parse(sample.deadlineAt)) && Date.parse(sample.predictedAt) < Date.parse(sample.deadlineAt));
}

/** Fitting is not validation: candidates remain unverified until independently evaluated. */
export function fitPointsCalibration(history: readonly HistoricalPrediction[], targetGw: number): Calibration[] {
  const samples = eligibleHistory(history, targetGw);
  return ([1, 2, 3, 4] as const).map((group) => {
    const rows = samples.filter((sample) => sample.position === group);
    const n = rows.length;
    if (n < 100) return { sampleSize: n, group, scale: 1, bias: 0, verified: false };
    const xMean = rows.reduce((sum, sample) => sum + sample.predicted, 0) / n;
    const yMean = rows.reduce((sum, sample) => sum + sample.actual, 0) / n;
    let cross = 0;
    let variance = 0;
    for (const sample of rows) {
      cross += (sample.predicted - xMean) * (sample.actual - yMean);
      variance += (sample.predicted - xMean) ** 2;
    }
    const slope = clip((cross + 20) / (variance + 20), 0.6, 1.4);
    const bias = clip(yMean - slope * xMean, -2, 2);
    return { sampleSize: n, group, scale: slope, bias, verified: false, fitted: true };
  });
}

export function calibratedPoints(rawXPts: number, calibration?: Calibration): number {
  if (!Number.isFinite(rawXPts)) throw new RangeError("Invalid raw xPts.");
  return calibration?.verified ? rawXPts * calibration.scale + calibration.bias : rawXPts;
}

export interface MinutesForecast {
  p60: number; pSub: number; pAppear: number; pStartEstimate: number;
  expectedMinutes: number; confidence: number; source: "fpl_appearance_heuristic" | "recency_weighted_minutes";
}
export function forecastMinutes(player: SlimElement, teamMatchesPlayed: number, gwOffset = 0, evidence?: MinutesEvidence): MinutesForecast {
  const distribution = estimateMinutesDistribution(player, teamMatchesPlayed, gwOffset, evidence);
  return {
    p60: distribution.p60, pSub: distribution.pSub,
    pAppear: distribution.p60 + distribution.pSub, pStartEstimate: distribution.pStart,
    expectedMinutes: distribution.expectedMinutes, confidence: distribution.confidence, source: distribution.source,
  };
}

export interface FixtureUncertainty {
  gw: number; scheduled: number; unresolved: number; opponents: number[];
  averageDifficulty: number | null; label: "blank" | "single" | "double" | "multiple";
  scheduleConfidence: "confirmed_schedule" | "pending_date" | "no_scheduled_match";
}
export function fixtureUncertainty(teamId: number, gw: number, fixtures: readonly Fixture[]): FixtureUncertainty {
  const matched = fixtures.filter((fixture) => fixture.event === gw && [fixture.team_h, fixture.team_a].includes(teamId));
  const pending = fixtures.filter((fixture) => fixture.event === null && [fixture.team_h, fixture.team_a].includes(teamId));
  const difficulties = matched.map((fixture) => fixture.team_h === teamId ? fixture.team_h_difficulty : fixture.team_a_difficulty);
  return {
    gw,
    scheduled: matched.length,
    unresolved: pending.length,
    opponents: matched.map((fixture) => fixture.team_h === teamId ? fixture.team_a : fixture.team_h),
    averageDifficulty: difficulties.length ? difficulties.reduce((sum, d) => sum + d, 0) / difficulties.length : null,
    label: matched.length === 0 ? "blank" : matched.length === 1 ? "single" : matched.length === 2 ? "double" : "multiple",
    scheduleConfidence: matched.some((fixture) => !fixture.kickoff_time) ? "pending_date" : matched.length ? "confirmed_schedule" : "no_scheduled_match",
  };
}

export interface ForecastValidation {
  sampleSize: number; mae: number | null; rmse: number | null; bias: number | null;
  p60Brier: number | null; bins: { center: number; count: number; observedRate: number }[];
  excludedAfterDeadline: number;
}
export function validateHistoricalPredictions(history: readonly HistoricalPrediction[], throughGw: number): ForecastValidation {
  const samples = eligibleHistory(history, throughGw);
  const sampleSize = samples.length;
  const abs = samples.reduce((sum, row) => sum + Math.abs(row.actual - row.predicted), 0);
  const squared = samples.reduce((sum, row) => sum + (row.actual - row.predicted) ** 2, 0);
  const bias = samples.reduce((sum, row) => sum + (row.predicted - row.actual), 0);
  const binary = samples.filter((sample) => sample.p60 !== undefined && typeof sample.played60 === "boolean" && sample.p60 >= 0 && sample.p60 <= 1);
  const p60Brier = binary.length ? binary.reduce((sum, row) => sum + ((row.p60 ?? 0) - Number(row.played60)) ** 2, 0) / binary.length : null;
  const bins = Array.from({ length: 10 }, (_, index) => {
    const inBin = binary.filter((sample) => Math.min(9, Math.floor((sample.p60 ?? 0) * 10)) === index);
    return { center: (index + 0.5) / 10, count: inBin.length, observedRate: inBin.length ? inBin.reduce((sum, sample) => sum + Number(sample.played60), 0) / inBin.length : 0 };
  });
  return {
    sampleSize, mae: sampleSize ? abs / sampleSize : null, rmse: sampleSize ? Math.sqrt(squared / sampleSize) : null,
    bias: sampleSize ? bias / sampleSize : null, p60Brier, bins,
    excludedAfterDeadline: history.filter((row) => Number.isFinite(Date.parse(row.predictedAt)) && Number.isFinite(Date.parse(row.deadlineAt)) && Date.parse(row.predictedAt) >= Date.parse(row.deadlineAt)).length,
  };
}
