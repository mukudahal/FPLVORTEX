import { createHash } from "node:crypto";

export interface SnapshotFingerprint {
  source: string;
  season: string;
  gameweek: number;
  contentSha256: string;
  payload: unknown;
}

/** Stable, JSON-compatible representation: property order never changes identity. */
export function canonicalJson(payload: unknown): string {
  const value = JSON.parse(JSON.stringify(payload)) as unknown;
  const visit = (item: unknown): string => {
    if (Array.isArray(item)) return `[${item.map(visit).join(",")}]`;
    if (item !== null && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${visit(record[key])}`).join(",")}}`;
    }
    const scalar = JSON.stringify(item);
    if (scalar === undefined) throw new TypeError("Snapshot payload contains non-JSON value.");
    return scalar;
  };
  return visit(value);
}

export function fingerprintSnapshot(
  season: string,
  gameweek: number,
  source: string,
  payload: unknown,
): SnapshotFingerprint {
  if (!/^\d{4}\/\d{2}$/.test(season)) throw new RangeError("Invalid season label.");
  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    throw new RangeError("Invalid snapshot gameweek.");
  }
  if (!/^official:fpl:[a-z0-9-]{3,40}$/.test(source)) throw new RangeError("Invalid snapshot source.");
  const safePayload = JSON.parse(JSON.stringify(payload)) as unknown;
  return {
    season, gameweek, source, payload: safePayload,
    contentSha256: createHash("sha256").update(canonicalJson(safePayload)).digest("hex"),
  };
}

export function seasonForFirstDeadline(firstDeadline: string): string {
  const date = new Date(firstDeadline);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid FPL season start deadline.");
  const year = date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}
