import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPlayerData, auditNormalizedPlayers, playerDataQualityNotice } from '../src/lib/playerDataQuality.ts';
import { makePlayer, makeTeam } from './helpers.ts';

const observed = '2026-10-29T12:00:00Z';
const team = [{ id: 1 }];
const player = {
  id: 100, team: 1, now_cost: 57, selected_by_percent: '0.0',
  status: 'a', chance_of_playing_next_round: null,
  news: '', news_added: null,
};

test('official raw player rows validate positive IDs, zero ownership and optional absent news', () => {
  const audit = auditPlayerData([player], team, observed);
  assert.equal(audit.status, 'checked');
  assert.equal(audit.playerCount, 1);
  assert.equal(audit.validPrices, 1);
  assert.equal(audit.validOwnership, 1);
  assert.equal(audit.newsItems, 0);
  assert.equal(audit.undatedNewsItems, 0);
  assert.equal(audit.sourceUpdatedAt, null);
  assert.match(playerDataQualityNotice(audit), /upstream per-field update time: unknown/);
});

test('duplicate IDs and club references are flagged without editing player values', () => {
  const audit = auditPlayerData([player, { ...player, team: 999 }], team, observed);
  assert.equal(audit.status, 'incomplete');
  assert.equal(audit.validIds, 2);
  assert.equal(audit.uniqueIds, 1);
  assert.equal(audit.validTeamRefs, 1);
});

test('missing prices and ownership are not silently treated as valid zeroes', () => {
  const audit = auditPlayerData([{ ...player, now_cost: undefined, selected_by_percent: null }], team, observed);
  assert.equal(audit.status, 'incomplete');
  assert.equal(audit.validPrices, 0);
  assert.equal(audit.validOwnership, 0);
});

test('invalid ownership, status and chance are counted as incomplete', () => {
  const audit = auditPlayerData([{ ...player, selected_by_percent: '101', status: '?', chance_of_playing_next_round: 120 }], team, observed);
  assert.equal(audit.status, 'incomplete');
  assert.equal(audit.validOwnership, 0);
  assert.equal(audit.validStatuses, 0);
  assert.equal(audit.validChanceValues, 0);
});

test('injury news without source timestamps is disclosed, not assumed fresh', () => {
  const audit = auditPlayerData([{ ...player, news: 'Minor injury', news_added: null }], team, observed);
  assert.equal(audit.status, 'checked');
  assert.equal(audit.newsItems, 1);
  assert.equal(audit.undatedNewsItems, 1);
  assert.match(playerDataQualityNotice(audit), /undated 1/);
});
test('invalid/future news timestamps are counted, valid dates report the latest', () => {
  const audit = auditPlayerData([
    { ...player, id: 1, news: 'Injured', news_added: '2026-10-27T05:00:00Z' },
    { ...player, id: 2, news: 'Suspended', news_added: '2026-11-01T05:00:00Z' },
    { ...player, id: 3, news: 'Unknown date', news_added: 'not-a-date' },
  ], team, observed);
  assert.equal(audit.datedNewsItems, 1);
  assert.equal(audit.invalidNewsDates, 2);
  assert.equal(audit.latestNewsAddedAt, '2026-10-27T05:00:00.000Z');
});

test('normalized snapshot audits never claim raw field coverage is verified', () => {
  const audit = auditNormalizedPlayers([makePlayer(1)], [makeTeam(1)], observed);
  assert.equal(audit.status, 'unverified');
  assert.match(playerDataQualityNotice(audit), /original FPL fields cannot be verified/);
  assert.equal(audit.playerCount, 1);
  assert.match(playerDataQualityNotice(undefined), /audit unavailable/);
});
