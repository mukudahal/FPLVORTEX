import type { Fixture, FixtureMarketOdds } from './types';

export interface MarketGwCoverage {
  gw: number;
  fixtures: number;
  pricedFixtures: number;
  complete1x2: number;
  completeTotals: number;
  completeBoth: number;
  bookmakerTimestamped: number;
  quoteTimestampsUnknown: number;
}

export interface MarketCoverageReport {
  gameweeks: MarketGwCoverage[];
  totalFixtures: number;
  pricedFixtures: number;
  complete1x2: number;
  completeTotals: number;
  completeBoth: number;
  bookmakerTimestamped: number;
  freshBookmakerQuotes: number;
  staleBookmakerQuotes: number;
  quoteTimestampsUnknown: number;
  latestBookmakerQuoteAt: string | null;
  freshness: 'fresh' | 'stale' | 'unknown' | 'mixed';
  /** This is coverage only: no odds are filled in for missing fixtures. */
  completeMarketData: boolean;
}

const validOdd = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 1.01 && v < 250;
const validTime = (v: unknown): number | null => {
  if (typeof v !== 'string' || !v.trim()) return null;
  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? parsed : null;
};

export function hasComplete1x2(odds: FixtureMarketOdds | null | undefined): boolean {
  return !!odds && validOdd(odds.oddsHome) && validOdd(odds.oddsDraw) && validOdd(odds.oddsAway);
}

export function hasCompleteTotals(odds: FixtureMarketOdds | null | undefined): boolean {
  return !!odds &&
    typeof odds.totalLine === 'number' && Number.isFinite(odds.totalLine) &&
    odds.totalLine > 0 && validOdd(odds.oddsOver) && validOdd(odds.oddsUnder);
}

/** A provider quote timestamp, not a download/cache refresh time. */
export function bookmakerQuoteFreshness(
  odds: FixtureMarketOdds | null | undefined,
  now: Date = new Date(),
): 'fresh' | 'stale' | 'unknown' {
  if (!odds || odds.quoteTimeSource !== 'bookmaker') return 'unknown';
  const timestamp = validTime(odds.updatedAt);
  const age = timestamp === null ? Number.NaN : now.getTime() - timestamp;
  if (!Number.isFinite(age) || age < 0 || age > 365 * 24 * 60 * 60_000) return 'unknown';
  return age <= 60 * 60_000 ? 'fresh' : 'stale';
}

export function marketCoverage(
  fixtures: readonly Fixture[], firstGw: number, weeks = 3, now: Date = new Date(),
): MarketCoverageReport {
  const gws = Array.from({ length: Math.max(0, Math.min(weeks, 38 - firstGw + 1)) }, (_, i) => firstGw + i);
  const windowFixtures = fixtures.filter(f => gws.includes(f.event) && !f.finished);
  const counts = (subset: readonly Fixture[]) => ({
    fixtures: subset.length,
    pricedFixtures: subset.filter(f => !!f.marketOdds).length,
    complete1x2: subset.filter(f => hasComplete1x2(f.marketOdds)).length,
    completeTotals: subset.filter(f => hasCompleteTotals(f.marketOdds)).length,
    completeBoth: subset.filter(f => hasComplete1x2(f.marketOdds) && hasCompleteTotals(f.marketOdds)).length,
    bookmakerTimestamped: subset.filter(f => f.marketOdds?.quoteTimeSource === 'bookmaker' &&
      bookmakerQuoteFreshness(f.marketOdds, now) !== 'unknown').length,
    quoteTimestampsUnknown: subset.filter(f => f.marketOdds &&
      bookmakerQuoteFreshness(f.marketOdds, now) === 'unknown').length,
  });
  const totals = counts(windowFixtures);
  const quoteItems = windowFixtures.map(f => f.marketOdds).filter((o): o is FixtureMarketOdds => Boolean(o));
  const fresh = quoteItems.filter(o => bookmakerQuoteFreshness(o, now) === 'fresh').length;
  const stale = quoteItems.filter(o => bookmakerQuoteFreshness(o, now) === 'stale').length;
  const timestamps = quoteItems
    .filter(o => bookmakerQuoteFreshness(o, now) !== 'unknown')
    .map(o => new Date(o.updatedAt).toISOString());
  const freshness = !quoteItems.length || (!fresh && !stale) ? 'unknown'
    : fresh && stale || totals.quoteTimestampsUnknown ? 'mixed'
      : fresh ? 'fresh' : 'stale';
  return {
    gameweeks: gws.map(gw => ({ gw, ...counts(windowFixtures.filter(f => f.event === gw)) })),
    totalFixtures: totals.fixtures,
    ...Object.fromEntries(Object.entries(totals).filter(([k]) => k !== 'fixtures')),
    freshBookmakerQuotes: fresh,
    staleBookmakerQuotes: stale,
    latestBookmakerQuoteAt: timestamps.sort().at(-1) ?? null,
    freshness,
    completeMarketData: totals.fixtures > 0 &&
      totals.completeBoth === totals.fixtures &&
      fresh === totals.fixtures,
  } as MarketCoverageReport;
}

export function marketCoverageNotice(coverage: MarketCoverageReport): string {
  const { completeBoth, totalFixtures, complete1x2, completeTotals, pricedFixtures, quoteTimestampsUnknown, freshBookmakerQuotes, staleBookmakerQuotes } = coverage;
  const label = coverage.completeMarketData ? 'Fully covered, timestamped market' : 'Partial or unverified market coverage';
  return `${label}: ${pricedFixtures}/${totalFixtures} fixtures priced · 1X2 ${complete1x2}/${totalFixtures} · over/under ${completeTotals}/${totalFixtures} · both ${completeBoth}/${totalFixtures}. Bookmaker quotes: fresh ${freshBookmakerQuotes}, stale ${staleBookmakerQuotes}, timestamp unknown ${quoteTimestampsUnknown}. Latest verified bookmaker quote: ${coverage.latestBookmakerQuoteAt ?? 'unknown'}. Retrieval times are not quote times.`;
}

export function fixtureQuoteNotice(odds: FixtureMarketOdds | null | undefined, now: Date = new Date()): string {
  if (!odds) return 'No market quote — VORTEX model available separately; not market data.';
  const source = odds.quoteTimeSource === 'bookmaker'
    ? `Bookmaker quote ${odds.updatedAt || 'unknown'} (${bookmakerQuoteFreshness(odds, now)})`
    : 'Bookmaker quote timestamp unknown';
  return `${odds.bookmaker} · ${source} · feed retrieved: ${odds.retrievedAt || 'unknown'} · 1X2 ${hasComplete1x2(odds) ? 'complete' : 'incomplete'} · totals ${hasCompleteTotals(odds) ? 'complete' : 'missing'}.`;
}
