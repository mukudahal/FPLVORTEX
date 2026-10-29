import type { ForecastValidation } from "./forecastScience";

/** Signals changes worth investigating; never auto-retrain from a single bad week. */
export interface DriftAssessment { status: "insufficient_data" | "healthy" | "investigate"; reasons: string[]; differences: { mae: number | null; p60Brier: number | null } }
export function assessModelDrift(baseline: ForecastValidation, recent: ForecastValidation): DriftAssessment {
  const maediff = baseline.mae !== null && recent.mae !== null ? recent.mae - baseline.mae : null;
  const brierdiff = baseline.p60Brier !== null && recent.p60Brier !== null ? recent.p60Brier - baseline.p60Brier : null;
  if (baseline.sampleSize < 200 || recent.sampleSize < 100 || maediff === null) return {
    status: "insufficient_data", reasons: ["Need at least 200 baseline and 100 recent pre-deadline observations."],
    differences: { mae: maediff, p60Brier: brierdiff },
  };
  const reasons: string[] = [];
  if (baseline.mae !== null && maediff > Math.max(0.75, baseline.mae * 0.2)) reasons.push("Observed points error increased materially.");
  if (brierdiff !== null && brierdiff > 0.05) reasons.push("Minutes-probability Brier score worsened.");
  if (recent.bias !== null && Math.abs(recent.bias) > 1.5) reasons.push("Recent xPts have large directional bias.");
  return { status: reasons.length ? "investigate" : "healthy", reasons, differences: { mae: maediff, p60Brier: brierdiff } };
}
