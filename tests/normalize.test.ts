import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSnapshot, type RawFplData } from '../server/normalize.ts';

const bootstrap = {
  total_players: 123456,
  events: [
    {
      id: 1,
      name: 'Gameweek 1',
      deadline_time: '2026-08-15T18:00:00Z',
      finished: true,
      data_checked: true,
      is_previous: true,
      is_current: false,
      is_next: false,
      average_entry_score: 50,
      highest_score: 100,
      most_selected: 1,
      most_captained: 1,
      top_element: 1,
      highest_scoring_entry: 999,
      chip_plays: [],
      transfers_made: 100,
      ranked_count: 100,
    },
    {
      id: 2,
      name: 'Gameweek 2',
      deadline_time: '2026-11-01T12:00:00Z',
      finished: false,
      data_checked: false,
      is_previous: false,
      is_current: true,
      is_next: false,
      average_entry_score: 0,
      highest_score: null,
      most_selected: null,
      most_captained: null,
      top_element: null,
      highest_scoring_entry: null,
      chip_plays: [],
      transfers_made: 0,
      ranked_count: 0,
    },
    {
      id: 3,
      name: 'Gameweek 3',
      deadline_time: '2026-11-08T12:00:00Z',
      finished: false,
      data_checked: false,
      is_previous: false,
      is_current: false,
      is_next: true,
      average_entry_score: 0,
      highest_score: null,
      most_selected: null,
      most_captained: null,
      top_element: null,
      highest_scoring_entry: null,
      chip_plays: [],
      transfers_made: 0,
      ranked_count: 0,
    },
  ],
  teams: [
    {
      id: 1,
      code: 3,
      name: 'Arsenal',
      short_name: 'ARS',
      position: 1,
      played: 2,
      points: 6,
      form: 'WW',
      strength: 4,
      strength_attack_home: 4,
      strength_attack_away: 4,
      strength_defence_home: 4,
      strength_defence_away: 4,
    },
  ],
  elements: [
    {
      id: 1,
      code: 101,
      first_name: 'Test',
      second_name: 'Player',
      web_name: 'Player',
      team: 1,
      element_type: 3,
      now_cost: 75,
      total_points: 40,
      event_points: 3,
      points_per_game: '5.0',
      form: '6.0',
      selected_by_percent: '12.5',
      minutes: 180,
      goals_scored: 2,
      assists: 1,
      clean_sheets: 1,
      expected_goal_involvements: '2.40',
      expected_goals_conceded: '1.20',
      status: 'a',
      chance_of_playing_next_round: null,
      news: '',
      ep_next: '5.5',
      ep_this: '5.2',
      transfers_in_event: 500,
      transfers_out_event: 100,
    },
  ],
};

const raw: RawFplData = {
  bootstrap,
  fixtures: [
    {
      id: 1,
      event: 2,
      kickoff_time: '2026-11-01T15:00:00Z',
      finished: false,
      started: false,
      minutes: 0,
      team_h: 1,
      team_a: 2,
      team_h_score: null,
      team_a_score: null,
      team_h_difficulty: 2,
      team_a_difficulty: 4,
    },
  ],
  live: { elements: [{ id: 1, stats: { total_points: 9 } }] },
};

test('normalizeSnapshot converts raw FPL payloads into the typed universe', () => {
  const snapshot = normalizeSnapshot(raw, { generatedAt: '2026-10-26T12:00:00.000Z' });
  assert.equal(snapshot.meta.currentEventId, 2);
  assert.equal(snapshot.meta.nextEventId, 3);
  assert.equal(snapshot.meta.season, '2026/27');
  assert.equal(snapshot.meta.totalPlayers, 123456);
  assert.equal(snapshot.teams[0].shortName, 'ARS');
  assert.equal(snapshot.players[0].position, 'MID');
  assert.equal(snapshot.players[0].price, 7.5);
  assert.equal(snapshot.players[0].eventPoints, 9);
  assert.equal(snapshot.players[0].xGI, 2.4);
  assert.equal(snapshot.fixtures[0].teamHDifficulty, 2);
  assert.equal(snapshot.fixtures.length, snapshot.meta.fixtureCount);
});

test('normalization attaches audit sourced from raw fields, without changing player scoring data', () => {
  const prior = normalizeSnapshot(raw, { generatedAt: '2026-10-26T12:00:00.000Z' });
  assert.equal(prior.meta.playerDataQuality?.status, 'checked');
  assert.equal(prior.meta.playerDataQuality?.source, 'official-bootstrap');
  assert.equal(prior.meta.playerDataQuality?.observedAt, '2026-10-26T12:00:00.000Z');
  assert.equal(prior.meta.playerDataQuality?.sourceUpdatedAt, null);
  assert.equal(prior.players[0].price, 7.5);
  assert.equal(prior.players[0].eventPoints, 9);

  const bad = structuredClone(raw);
  bad.bootstrap.elements[0].now_cost = null;
  bad.bootstrap.elements[0].selected_by_percent = null;
  const invalid = normalizeSnapshot(bad);
  assert.equal(invalid.meta.playerDataQuality?.status, 'incomplete');
  assert.equal(invalid.meta.playerDataQuality?.validPrices, 0);
  assert.equal(invalid.meta.playerDataQuality?.validOwnership, 0);
});
