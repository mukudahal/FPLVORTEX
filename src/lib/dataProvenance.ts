/** Shared public-safe evidence contract for the VORTEX V2 migration.
 * Stage 02 defines the rules; Stage 04 integrates them with server ingestion.
 * Never infer source/quote timestamps from generated or cached response times.
 */

export type EvidenceKind =
  | 'official-fpl'
  | 'market-odds'
  | 'verified-news'
  | 'model-forecast'
  | 'statistical-fallback';

export type EvidenceState = 'fresh' | 'stale' | 'unverified' | 'unavailable';

export type LicenseStatus = 'verified' | 'unknown' | 'restricted';

export interface EvidenceMetadata {
  kind: EvidenceKind;
  /** Human-readable publisher, provider or model name, not a credential. */
  provider: string;
  /** Time of successful fetch from the upstream source, not its publication time. */
  retrievedAt?: string | null;
  /** A verified upstream publication/update time, when actually supplied. */
  sourceUpdatedAt?: string | null;
  /** Original bookmaker quote time; required for any market-odds freshness claim. */
  quotedAt?: string | null;
  /** Model execution timestamp; required for forecast/fallback results. */
  computedAt?: string | null;
  /** Verified source link for an availability/news claim. */
  sourceUrl?: string | null;
  /** Provider rights status. Missing rights never imply a verified market feed. */
  licenseStatus?: LicenseStatus;
  /** Version of the forecast code, not an FPL source version. */
  modelVersion?: string | null;
  /** Immutable identifier for the exact model input snapshot. */
  snapshotId?: string | null;
}

export interface EvidenceAssessment {
  state: EvidenceState;
  /** Distinguish fetched/quoted/published/computed dates in rendered labels. */
  anchor: 'retrieved' | 'quoted' | 'published' | 'computed' | null;
  anchorAt: string | null;
  reason: string;
}

export interface EvidencePolicy {
  nowMs: number;
  /** Explicit policy rather than a fake universal definition of 'live'. */
  maxAgeMs: number;
  /** Allow a small local/server clock disagreement, but not future observations. */
  futureToleranceMs?: number;
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

function parseVerifiedTime(raw: string | null | undefined): number | null {
  if (!raw || !RFC3339.test(raw)) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonempty(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSourceUrl(value: string | null | undefined): boolean {
  if (!nonempty(value)) return false;
  try {
    const url = new URL(value!);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

const unavailable = (reason: string): EvidenceAssessment => ({
  state: 'unavailable', anchor: null, anchorAt: null, reason,
});
const unverified = (reason: string): EvidenceAssessment => ({
  state: 'unverified', anchor: null, anchorAt: null, reason,
});

/** Assess a source without turning cache freshness into an upstream quote time. */
export function assessEvidence(
  evidence: EvidenceMetadata,
  policy: EvidencePolicy,
): EvidenceAssessment {
  if (!Number.isFinite(policy.nowMs) || !Number.isFinite(policy.maxAgeMs) || policy.maxAgeMs < 0) {
    throw new RangeError('Evidence policy requires a finite clock and nonnegative maximum age.');
  }
  const tolerance = policy.futureToleranceMs ?? 5 * 60_000;
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError('Invalid clock tolerance.');

  if (!nonempty(evidence.provider)) return unavailable('Source provider is missing.');
  if (evidence.licenseStatus === 'restricted') {
    return unavailable('The source is restricted and must not be shown.');
  }

  let anchor: EvidenceAssessment['anchor'];
  let raw: string | null | undefined;
  switch (evidence.kind) {
    case 'official-fpl':
      if (!nonempty(evidence.retrievedAt)) return unavailable('No successful FPL retrieval timestamp.');
      anchor = 'retrieved';
      raw = evidence.retrievedAt;
      break;
    case 'market-odds':
      if (!nonempty(evidence.retrievedAt)) return unavailable('No successful odds retrieval.');
      if (evidence.licenseStatus !== 'verified') return unverified('Market redisplay rights are not verified.');
      if (!nonempty(evidence.quotedAt)) return unverified('Original bookmaker quote timestamp is missing.');
      anchor = 'quoted';
      raw = evidence.quotedAt;
      break;
    case 'verified-news':
      if (!nonempty(evidence.retrievedAt)) return unavailable('News was not retrieved.');
      if (!isSourceUrl(evidence.sourceUrl)) return unverified('Verified news source link is missing.');
      anchor = nonempty(evidence.sourceUpdatedAt) ? 'published' : 'retrieved';
      raw = anchor === 'published' ? evidence.sourceUpdatedAt : evidence.retrievedAt;
      break;
    case 'model-forecast':
    case 'statistical-fallback':
      if (!nonempty(evidence.modelVersion) || !nonempty(evidence.snapshotId)) {
        return unverified('Forecast version or source snapshot is missing.');
      }
      if (!nonempty(evidence.computedAt)) return unverified('Forecast computation timestamp is missing.');
      anchor = 'computed';
      raw = evidence.computedAt;
      break;
    default:
      return unverified('Unknown evidence class.');
  }

  const anchorMs = parseVerifiedTime(raw);
  if (anchorMs === null) return unverified('Evidence timestamp is missing or not RFC3339 with a timezone.');
  const retrieveMs = evidence.retrievedAt ? parseVerifiedTime(evidence.retrievedAt) : null;
  if (evidence.retrievedAt && retrieveMs === null) return unverified('Retrieval timestamp is invalid.');
  if (anchorMs > policy.nowMs + tolerance || (retrieveMs !== null && retrieveMs > policy.nowMs + tolerance)) {
    return unverified('Evidence timestamps are implausibly in the future.');
  }
  const age = Math.max(0, policy.nowMs - anchorMs);
  const state: EvidenceState = age > policy.maxAgeMs ? 'stale' : 'fresh';
  return {
    state,
    anchor,
    anchorAt: new Date(anchorMs).toISOString(),
    reason: state === 'fresh'
      ? 'Within the configured source-specific age policy; not a guarantee of completeness.'
      : 'Evidence exceeds the configured source-specific maximum age.',
  };
}

/** Return at most ten consecutive upcoming GWs. The authoritative season limit
 * is supplied by the caller; a missing next GW is never replaced with a guess.
 */
export function createPlanningHorizon(
  nextGw: number | null | undefined,
  seasonFinalGw: number,
  maxWeeks = 10,
): number[] {
  if (!Number.isInteger(seasonFinalGw) || seasonFinalGw < 1) {
    throw new RangeError('Season endpoint must come from a valid gameweek schedule.');
  }
  if (!Number.isInteger(maxWeeks) || maxWeeks < 1 || maxWeeks > 10) {
    throw new RangeError('VORTEX planning horizon must be between 1 and 10 weeks.');
  }
  if (nextGw === null || nextGw === undefined) return [];
  if (!Number.isInteger(nextGw) || nextGw < 1) {
    throw new RangeError('Next gameweek must be a positive integer.');
  }
  if (nextGw > seasonFinalGw) return [];
  const count = Math.min(maxWeeks, seasonFinalGw - nextGw + 1);
  return Array.from({ length: count }, (_, offset) => nextGw + offset);
}
