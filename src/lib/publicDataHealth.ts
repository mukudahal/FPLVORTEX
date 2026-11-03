import { assessEvidence, type EvidenceState, type EvidenceAssessment } from './dataProvenance';
import type { Snapshot, SnapshotMeta, FixtureMarketOdds } from './types';

/** Safe summary for public UI and monitoring. Never contains API keys, raw feeds or private squads. */
export interface PublicSourceHealth {
  state: EvidenceState;
  anchorAt: string | null;
  anchor: EvidenceAssessment['anchor'];
  reason: string;
}

export interface PublicDataHealth {
  checkedAt: string;
  officialFpl: PublicSourceHealth & {
    connection: 'direct' | 'cached' | 'mirrored' | 'offline';
    /** A retrieval timestamp, not the upstream's asserted publication time. */
    retrievedAt: string | null;
  };
  market: PublicSourceHealth & {
    gameweek: number | null;
    fixtures: number;
    matchedFixtures: number;
    freshVerifiedFixtures: number;
    staleVerifiedFixtures: number;
    /** A quote without licensed publication rights and exact bookmaker time. */
    unverifiedFixtures: number;
    rightsVerified: boolean;
    sourceLabel: 'bookmaker-quoted' | 'provisional-coverage' | 'unavailable';
  };
  model: {
    label: 'Provisional model predictions';
    calibration: 'unverified';
  };
}

export { DATA_FRESHNESS_POLICY } from './freshnessPolicy';
import { DATA_FRESHNESS_POLICY } from './freshnessPolicy';

function nonemptyTimestamp(value: string | null | undefined): string | null {
  return value?.trim() ? value : null;
}

export function summarizeOfficialFplHealth(
  meta: SnapshotMeta,
  nowMs: number,
): PublicDataHealth['officialFpl'] {
  const connection: PublicDataHealth['officialFpl']['connection'] =
    meta.mirroredFrom ? 'mirrored'
    : meta.source === 'offline' || meta.source === 'snapshot' ? 'offline'
    : meta.source === 'live' ? 'direct'
    : 'cached';

  const found = assessEvidence({
    kind: 'official-fpl',
    provider: 'Fantasy Premier League API',
    retrievedAt: nonemptyTimestamp(meta.generatedAt),
  }, {
    nowMs, maxAgeMs: meta.isLive
      ? DATA_FRESHNESS_POLICY.fplLiveMs
      : DATA_FRESHNESS_POLICY.fplStandardMs,
  });

  // Only a real, still-healthy upstream pull may claim a fresh official feed.
  // A mirrored deployment, local fallback or cached response after upstream
  // failure must display an explicit uncertainty/stale state even if served now.
  let state: EvidenceState = found.state;
  let reason = found.reason;
  if (meta.stale) {
    state = found.state === 'unavailable' ? 'unavailable' : 'stale';
    reason = 'Server reports the snapshot is stale; last successful retrieval may be old.';
  } else if (!meta.upstreamOk) {
    state = found.state === 'stale' ? 'stale' : 'unverified';
    reason = 'A cached or mirrored snapshot does not verify a current upstream FPL connection.';
  }

  return {
    state,
    connection,
    anchor: found.anchor,
    anchorAt: found.anchorAt,
    retrievedAt: found.anchorAt,
    reason,
  };
}

function assessMarketFixture(quote: FixtureMarketOdds, rightsVerified: boolean, nowMs: number) {
  return assessEvidence({
    kind: 'market-odds',
    provider: quote.provider,
    licenseStatus: rightsVerified ? 'verified' : 'unknown',
    retrievedAt: quote.retrievedAt ?? null,
    quotedAt: quote.quoteTimeSource === 'bookmaker' ? quote.updatedAt : null,
  }, { nowMs, maxAgeMs: DATA_FRESHNESS_POLICY.bookmakerQuoteMs });
}

/**
 * Returns only a verified market state if every upcoming fixture carries a
 * legitimately time-stamped, licensed, non-expired quote. Partial / unknown
 * coverage is unverified, not a fabricated '100% live market' badge.
 */
export function buildPublicDataHealth(
  snapshot: Pick<Snapshot, 'meta' | 'fixtures'>,
  nowMs: number = Date.now(),
  options: { marketRedisplayRightsVerified?: boolean } = {},
): PublicDataHealth {
  if (!Number.isFinite(nowMs)) throw new RangeError('A finite clock is required.');
  const officialFpl = summarizeOfficialFplHealth(snapshot.meta, nowMs);
  const next = Number.isInteger(snapshot.meta.nextEventId) && snapshot.meta.nextEventId > 0
    ? snapshot.meta.nextEventId : null;
  const upcoming = next === null
    ? [] : snapshot.fixtures.filter(f => f.event === next && !f.finished);

  const rightsVerified = options.marketRedisplayRightsVerified === true;
  const matched = upcoming.filter(f => Boolean(f.marketOdds));
  const assessed = matched.map(f => assessMarketFixture(f.marketOdds!, rightsVerified, nowMs));
  const good = assessed.filter(item => item.state === 'fresh');
  const stale = assessed.filter(item => item.state === 'stale');
  const invalid = assessed.filter(item => item.state === 'unverified' || item.state === 'unavailable');
  const allFresh = upcoming.length > 0 && good.length === upcoming.length;
  const state: EvidenceState = upcoming.length === 0 || matched.length === 0 ? 'unavailable'
    : allFresh ? 'fresh'
    : stale.length > 0 && invalid.length === 0 && matched.length === upcoming.length ? 'stale'
    : 'unverified';
  const genuineTimes = assessed.filter(item => item.anchor === 'quoted' && item.anchorAt)
    .map(item => item.anchorAt!).sort();
  const recentQuote = genuineTimes.at(-1) ?? null;

  return {
    checkedAt: new Date(nowMs).toISOString(),
    officialFpl,
    market: {
      state,
      anchor: recentQuote ? 'quoted' : null,
      anchorAt: recentQuote,
      reason: state === 'fresh'
        ? 'All next-GW fixtures have licensed, bookmaker-time-stamped quotes within policy.'
        : !upcoming.length ? 'Next-gameweek fixtures not available.'
        : !matched.length ? 'No bookmaker odds matched the next gameweek.'
        : !rightsVerified ? 'Market data redistribution rights are not verified.'
        : 'At least one fixture has missing, stale or unverified bookmaker quotes.',
      gameweek: next,
      fixtures: upcoming.length,
      matchedFixtures: matched.length,
      freshVerifiedFixtures: good.length,
      staleVerifiedFixtures: stale.length,
      unverifiedFixtures: invalid.length,
      rightsVerified,
      sourceLabel: allFresh ? 'bookmaker-quoted' : matched.length ? 'provisional-coverage' : 'unavailable',
    },
    model: {
      label: 'Provisional model predictions',
      calibration: 'unverified',
    },
  };
}

