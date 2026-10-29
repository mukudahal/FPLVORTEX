import assert from 'node:assert/strict';
import test from 'node:test';
import { marketCoverage, marketCoverageNotice, bookmakerQuoteFreshness, fixtureQuoteNotice } from '../src/lib/marketCoverage.ts';
import { makeFixture } from './helpers.ts';
import type { FixtureMarketOdds } from '../src/lib/types.ts';

const now = new Date('2026-10-29T19:00:00.000Z');
const priced: FixtureMarketOdds = {
  provider: 'the-odds-api', bookmaker: 'Pinnacle', updatedAt: '2026-10-29T18:50:00Z',
  quoteTimeSource: 'bookmaker', retrievedAt: '2026-10-29T18:59:00Z',
  oddsHome: 2.2, oddsDraw: 3.4, oddsAway: 3.5, totalLine: 2.5,
  oddsOver: 1.91, oddsUnder: 1.93, homeWin: .4, draw: .3, awayWin: .3,
  homeXg: 1.5, awayXg: 1.1, homeCs: .33, awayCs: .22, overround1x2: 1.04,
};
const fixture = (id: number, gw: number, quote: FixtureMarketOdds | null = null) => ({
  ...makeFixture(id, gw, 1, 2), marketOdds: quote,
});

test('counts all fixtures in each of the next three GWs; 1X2 and totals are independent', () => {
  const data = [fixture(1, 9, priced), fixture(2, 9, { ...priced, totalLine: null, oddsOver: null, oddsUnder: null }),
    fixture(3, 10), fixture(4, 11, { ...priced, quoteTimeSource: 'unknown' }), fixture(5, 12, priced)];
  const report = marketCoverage(data, 9, 3, now);
  assert.equal(report.totalFixtures, 4);
  assert.equal(report.pricedFixtures, 3);
  assert.equal(report.complete1x2, 3);
  assert.equal(report.completeTotals, 2);
  assert.equal(report.completeBoth, 2);
  assert.deepEqual(report.gameweeks.map(w => w.fixtures), [2, 1, 1]);
  assert.deepEqual(report.gameweeks.map(w => w.pricedFixtures), [2, 0, 1]);
  assert.equal(report.quoteTimestampsUnknown, 1);
  assert.equal(report.completeMarketData, false);
  assert.match(marketCoverageNotice(report), /Partial or unverified market coverage/);
});

test('a full 1X2 market is not complete totals or verified live data', () => {
  const oneX2 = { ...priced, oddsOver: null, oddsUnder: null, totalLine: null };
  const data = marketCoverage([fixture(1, 9, oneX2)], 9, 1, now);
  assert.equal(data.complete1x2, 1);
  assert.equal(data.completeTotals, 0);
  assert.equal(data.completeMarketData, false);
});
test('bookmaker timestamp only is fresh; retrieval-only time is unknown', () => {
  assert.equal(bookmakerQuoteFreshness(priced, now), 'fresh');
  assert.equal(bookmakerQuoteFreshness({ ...priced, quoteTimeSource: 'unknown', updatedAt: now.toISOString() }, now), 'unknown');
  assert.equal(bookmakerQuoteFreshness({ ...priced, updatedAt: '2026-10-29T16:00:00Z' }, now), 'stale');
  assert.equal(bookmakerQuoteFreshness({ ...priced, updatedAt: 'invalid' }, now), 'unknown');
  assert.match(fixtureQuoteNotice(priced, now), /Bookmaker quote 2026-10-29/);
  assert.match(fixtureQuoteNotice({ ...priced, quoteTimeSource: 'unknown' }, now), /timestamp unknown/);
});
test('only complete markets with fresh genuine bookmaker timestamps are fully covered', () => {
  const report = marketCoverage([fixture(1, 9, priced)], 9, 1, now);
  assert.equal(report.completeMarketData, true);
  assert.equal(report.freshness, 'fresh');
  assert.equal(report.latestBookmakerQuoteAt, '2026-10-29T18:50:00.000Z');
});
test('missing prices are explicitly VORTEX rather than market estimates', () => {
  assert.match(fixtureQuoteNotice(null), /VORTEX model available separately/);
  const report = marketCoverage([fixture(1, 9, null)], 9, 1, now);
  assert.equal(report.completeMarketData, false);
  assert.equal(report.latestBookmakerQuoteAt, null);
  assert.equal(report.freshness, 'unknown');
});
test('prior GWs and finished fixtures never count toward near-term market coverage', () => {
  const f = fixture(1, 9, priced);
  f.finished = true;
  const report = marketCoverage([fixture(2, 8, priced), f, fixture(3, 10, priced)], 9, 2, now);
  assert.equal(report.totalFixtures, 1);
  assert.equal(report.pricedFixtures, 1);
});

test('three-GW incomplete market cannot become fully live from a perfect first GW', () => {
  const data = marketCoverage([fixture(1, 9, priced), fixture(2, 10), fixture(3, 11)], 9, 3, now);
  assert.equal(data.gameweeks[0].completeBoth, 1);
  assert.equal(data.completeMarketData, false);
  assert.equal(data.pricedFixtures, 1);
});
