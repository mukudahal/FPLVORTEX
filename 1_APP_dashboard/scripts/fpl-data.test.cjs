'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseBootstrap, normalizeBootstrap, normalizePlayer, parseFixtures } = require('../src/lib/fplNormalize.ts');

const sampleBootstrap = {
  events: [{ id: 8, name: 'Gameweek 8', deadline_time: '2026-10-23T12:30:00Z', is_next: true }],
  teams: [{ id: 1, code: 4, name: 'Arsenal', short_name: 'ARS', strength: 4 }],
  elements: [{ id: 101, code: 999, web_name: 'Example', team: 1, element_type: 3, now_cost: 83,
    goals_scored: '5', expected_goals_per_90: '0.45', selected_by_percent: '20.3' }],
  chips: [], total_players: 1000,
};

test('single canonical bootstrap transformation preserves IDs and normalizes numeric model features', () => {
  const raw = parseBootstrap(sampleBootstrap);
  const slim = normalizeBootstrap(raw);
  assert.equal(slim.nextEvent, 8);
  assert.equal(slim.total_players, 1000);
  assert.equal(slim.elements[0].goals_scored, 5);
  assert.equal(slim.elements[0].expected_goals_per_90, 0.45);
  assert.equal(slim.elements[0].team, 1);
  assert.equal(slim.elements[0].price_change_percent, null);
  assert.equal(slim.teams[0].short_name, 'ARS');
});

test('reject invalid bootstrap data instead of letting it reach model calculations', () => {
  for (const candidate of [null, {}, { ...sampleBootstrap, elements: [] }, { ...sampleBootstrap, events: [{}] },
    { ...sampleBootstrap, elements: [{ id: 8, web_name: 'X', now_cost: '??' }] }]) {
    assert.throws(() => parseBootstrap(candidate), /Invalid upstream bootstrap/);
  }
});

test('normalization turns non-finite numbers into zero or null', () => {
  const normalized = normalizePlayer({ ...sampleBootstrap.elements[0], expected_goals_per_90: 'x', minutes: Infinity, price_change_percent: 'x' });
  assert.equal(normalized.expected_goals_per_90, 0);
  assert.equal(normalized.minutes, 0);
  assert.equal(normalized.price_change_percent, null);
});

test('fixture ingestion handles blank-gameweek fixtures and rejects invalid team IDs', () => {
  const fixture = { id: 83, team_h: 1, team_a: 2, event: null, finished: false, kickoff_time: null };
  assert.equal(parseFixtures([fixture])[0].event, null);
  assert.throws(() => parseFixtures([{ ...fixture, team_h: -2 }]), /Invalid upstream fixtures/);
  assert.throws(() => parseFixtures({ error: 'oops' }), /Invalid upstream fixtures/);
});

test('FPL routes and planner share the canonical server adapter, not per-page raw mappings', () => {
  const root = path.resolve(__dirname, '..');
  const routes = [
    'fpl/bootstrap/route.ts', 'fpl/fixtures/route.ts', 'fpl/entry/[id]/route.ts',
    'fpl/entry/[id]/picks/[gw]/route.ts', 'fpl/entry/[id]/transfers/route.ts',
    'fpl/element/[id]/route.ts', 'fpl/league/[id]/route.ts', 'fpl/live/[gw]/route.ts',
    'plan/[id]/route.ts', 'cron/refresh/route.ts',
  ];
  for (const relative of routes) {
    const body = fs.readFileSync(path.join(root, 'src/app/api', relative), 'utf8');
    assert.match(body, /@\/server\/fplData/, `${relative} missing canonical source`);
    assert.doesNotMatch(body, /fplFetch\s*</, `${relative} duplicates raw API fetching`);
  }
});
