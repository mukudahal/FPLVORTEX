import { createHash } from "node:crypto";

export const FORECAST_MODEL_VERSION = "vortex-xpts-2026.27.2-math";
export interface ForecastIdentity {
  season: string;
  forecastGw: number;
  snapshotId: string;
  capturedAt: string;
  modelVersion: string;
  paramsHash: string;
  modelRunId: string;
}

/** Stable, order-independent object serialization. Invalid numeric values are forbidden. */
export function stableSerialize(input: unknown): string {
  if (input === null || typeof input === "string" || typeof input === "boolean") return JSON.stringify(input);
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new TypeError("Non-finite model parameter.");
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) return `[${input.map(stableSerialize).join(",")}]`;
  if (typeof input === "object") {
    const object = input as Record<string, unknown>;
    return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`).join(",")}}`;
  }
  throw new TypeError("Unsupported forecast parameter type.");
}

export function identifyForecast(input: {
  season: string; forecastGw: number; snapshotId: string; capturedAt: string;
  params: Record<string, unknown>; modelVersion?: string;
}): ForecastIdentity {
  if (!/^20\d\d\/\d\d$/.test(input.season) || !Number.isInteger(input.forecastGw) || input.forecastGw < 1 || input.forecastGw > 38) {
    throw new RangeError("Invalid season or gameweek.");
  }
  if (!/^[\w:-]{8,128}$/.test(input.snapshotId) || !Number.isFinite(Date.parse(input.capturedAt))) throw new TypeError("Snapshot provenance missing.");
  const modelVersion = input.modelVersion ?? FORECAST_MODEL_VERSION;
  const paramsHash = createHash("sha256").update(stableSerialize(input.params)).digest("hex");
  const runKey = stableSerialize({ season: input.season, forecastGw: input.forecastGw, snapshotId: input.snapshotId, modelVersion, paramsHash });
  const modelRunId = createHash("sha256").update(runKey).digest("hex");
  return { season: input.season, forecastGw: input.forecastGw, snapshotId: input.snapshotId, capturedAt: input.capturedAt, modelVersion, paramsHash, modelRunId };
}
