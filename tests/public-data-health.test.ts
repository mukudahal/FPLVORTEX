import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicDataHealth, summarizeOfficialFplHealth } from '../src/lib/publicDataHealth.ts';
import type { Fixture, FixtureMarketOdds, SnapshotMeta } from '../src/lib/types.ts';

const now = Date.parse('2026-10-30T20:00:00Z');
const stamp = '2026-10-30T19:53:00Z';

function meta(overrides: Partial<SnapshotMeta> = {}): SnapshotMeta {
  return {
    source: 'live', generatedAt: stamp, servedAt: stamp,
    season: '2026/27', currentEventId: 9, nextEventId: 10,
    isLive: false, refreshSeconds: 600, totalPlayers: 650,
    fixtureCount: 380, upstreamOk: true, stale: false, version: 1,
    exampleEntryId: null, exampleLeagueId: 314, ...overrides,
  };
}

function quote(overrides: Partial<FixtureMarketOdds> = {}): FixtureMarketOdds {
  return {
    provider: 'the-odds-api', bookmaker: 'licensed book',
    updatedAt: '2026-10-30T19:50:00Z', quoteTimeSource: 'bookmaker',
    retrievedAt: '2026-10-30T19:59:00Z', oddsHome: 1.8,
    oddsDraw: 3.4, oddsAway: 4.5, homeWin: .53, draw: .25,
    awayWin: .22, homeXg: 1.8, awayXg: 1.1, homeCs: .3,
    awayCs: .15, overround1x2: 1.02, ...overrides,
  };
}

function fixture(id: number, odds: FixtureMarketOdds | null): Fixture {
  return {
    id, event: 10, kickoffTime: '2026-11-01T15:00:00Z',
    finished: false, started: false, minutes: 0, teamH: 1,
    teamA: 2, teamHScore: null, teamAScore: null,
    teamHDifficulty: 3, teamADifficulty: 3, marketOdds: odds,
  };
}

test('recent upstream successful FPL retrieval qualifies; servedAt cannot reset age', () => {
  const observed = summarizeOfficialFplHealth(meta(), now);
  assert.equal(observed.state, 'fresh');
  assert.equal(observed.anchor, 'retrieved');
  const wrong = summarizeOfficialFplHealth(meta({
    generatedAt: '2026-10-30T15:00:00Z',
    servedAt: '2026-10-30T19:59:59Z',
  }), now);
  assert.equal(wrong.state, 'stale');
  assert.equal(wrong.retrievedAt, '2026-10-30T15:00:00.000Z');
});

test('mirrored deployment and offline snapshot are not verified live upstream', () => {
  assert.equal(summarizeOfficialFplHealth(meta({
    source: 'cache', upstreamOk: false, mirroredFrom: 'https://snapshot.example/',
  }), now).state, 'unverified');
  assert.equal(summarizeOfficialFplHealth(meta({
    source: 'snapshot', upstreamOk: false, stale: true,
  }), now).state, 'stale');
  assert.equal(summarizeOfficialFplHealth(meta({
    source: 'live', upstreamOk: true, stale: true,
  }), now).state, 'stale');
});

test('market defaults to unverified until redisplay license is explicitly verified', () => {
  const report = buildPublicDataHealth({ meta: meta(), fixtures: [fixture(1, quote())] }, now);
  assert.equal(report.officialFpl.state, 'fresh');
  assert.equal(report.market.state, 'unverified');
  assert.equal(report.market.matchedFixtures, 1);
  assert.equal(report.market.freshVerifiedFixtures, 0);
  assert.equal(report.market.rightsVerified, false);
  assert.equal(report.model.calibration, 'unverified');
});

test('licensed fresh quote with genuine bookmaker time covers a gameweek', () => {
  const report = buildPublicDataHealth({
    meta: meta(), fixtures: [fixture(1, quote()), fixture(2, quote())],
  }, now, { marketRedisplayRightsVerified: true });
  assert.equal(report.market.state, 'fresh');
  assert.equal(report.market.freshVerifiedFixtures, 2);
  assert.equal(report.market.sourceLabel, 'bookmaker-quoted');
});

test('old bookmaker quote stays stale even if retrieved one minute ago', () => {
  const report = buildPublicDataHealth({ meta: meta(),
    fixtures: [fixture(1, quote({ updatedAt: '2026-10-30T17:00:00Z' }))],
  }, now, { marketRedisplayRightsVerified: true });
  assert.equal(report.market.state, 'stale');
  assert.equal(report.market.staleVerifiedFixtures, 1);
  assert.equal(report.market.anchor, 'quoted');
});

test('missing bookmaker quote time, unknown quote and partial fixture coverage never show live', () => {
  for (const item of [
    quote({ quoteTimeSource: 'unknown' }),
    quote({ updatedAt: '' }),
    quote({ retrievedAt: '' }),
  ]) {
    const report = buildPublicDataHealth({ meta: meta(), fixtures: [fixture(1, item)] },
      now, { marketRedisplayRightsVerified: true });
    assert.notEqual(report.market.state, 'fresh');
  }
  const partial = buildPublicDataHealth({
    meta: meta(), fixtures: [fixture(1, quote()), fixture(2, null)],
  }, now, { marketRedisplayRightsVerified: true });
  assert.equal(partial.market.state, 'unverified');
  assert.equal(partial.market.matchedFixtures, 1);
  assert.equal(partial.market.fixtures, 2);
});

test('no upcoming verified fixtures or quotes have no invented market probabilities', () => {
  const nothing = buildPublicDataHealth({ meta: meta(), fixtures: [] }, now);
  assert.equal(nothing.market.state, 'unavailable');
  assert.equal(nothing.market.fixtures, 0);
  const unavailable = buildPublicDataHealth({ meta: meta(), fixtures: [fixture(1, null)] }, now);
  assert.equal(unavailable.market.state, 'unavailable');
  assert.equal(unavailable.market.anchorAt, null);
});

test('future or malformed official source timestamp must not count as fresh', () => {
  assert.equal(summarizeOfficialFplHealth(meta({ generatedAt: 'tomorrow' }), now).state, 'unverified');
  assert.equal(summarizeOfficialFplHealth(meta({
    generatedAt: '2026-10-30T20:20:00Z', servedAt: '2026-10-30T19:59:00Z',
  }), now).state, 'unverified');
  assert.throws(() => buildPublicDataHealth({ meta: meta(), fixtures: [] }, Number.NaN), RangeError);
});

test('health report cannot expose keys, private account fields or unlicensed raw odds', () => {
  const report = buildPublicDataHealth({ meta: meta(), fixtures: [fixture(1, quote())] }, now);
  assert.ok(!('apiKey' in report.market));
  assert.ok(!('bookmaker' in report.market));
  assert.ok(!('rawMarketData' in report));
});
