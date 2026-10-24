'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'src/db/schema.ts'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/0002_analytics_domains.sql'), 'utf8');
const expected = [
  'app_users','manager_links','fpl_teams','fpl_players','fpl_fixtures',
  'data_snapshots','model_runs','player_projections','saved_scenarios',
  'scenario_actions','solver_runs','simulation_runs','mini_leagues',
  'league_memberships','price_events','availability_events','report_runs','audit_events',
];

test('all 18 analytics domains are in SQL and TypeScript schema exactly once', () => {
  const sqlTables = [...sql.matchAll(/^CREATE TABLE\s+(\w+)\s*\(/gm)].map((match) => match[1]);
  const drizzleTables = [...schema.matchAll(/pgTable\("(\w+)"/g)].map((match) => match[1]);
  assert.deepEqual(sqlTables, expected);
  for (const table of expected) assert.equal(drizzleTables.filter((found) => found === table).length, 1, `${table} is missing or duplicated`);
  assert.equal(new Set(sqlTables).size, expected.length);
});

test('migrations are additive, ownership keys and snapshot provenance are present', () => {
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE FROM|ALTER TABLE .* DROP)\b/i);
  assert.match(sql, /CREATE TABLE saved_scenarios \([\s\S]*user_id UUID NOT NULL REFERENCES app_users\(id\)/);
  assert.match(sql, /CREATE TABLE solver_runs \([\s\S]*user_id UUID NOT NULL REFERENCES app_users\(id\)/);
  assert.match(sql, /CREATE TABLE report_runs \([\s\S]*user_id UUID NOT NULL REFERENCES app_users\(id\)/);
  assert.match(sql, /CREATE TABLE data_snapshots \([\s\S]*content_sha256 TEXT NOT NULL/);
  assert.match(sql, /CREATE TABLE player_projections \([\s\S]*PRIMARY KEY \(model_run_id, player_id, gameweek\)/);
  assert.match(sql, /CREATE TABLE model_runs \([\s\S]*snapshot_id UUID NOT NULL REFERENCES data_snapshots\(id\)/);
});

test('all explicit foreign-key references point to known legacy or new tables', () => {
  const names = new Set(expected.concat(['api_cache','managers','saved_plans','price_snapshots','price_predictions']));
  for (const match of sql.matchAll(/REFERENCES\s+(\w+)\s*\(/g)) {
    assert.ok(names.has(match[1]), `unrecognized referenced table ${match[1]}`);
  }
});
