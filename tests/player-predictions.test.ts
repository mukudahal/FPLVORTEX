import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playerGwForecast, playerPredictionsCsv } from '../src/lib/playerPredictionExport.ts';
import type { EnrichedPlayer } from '../src/lib/types';

const player = {
  id: 10, code: 22, name: '=HYPERLINK("https://invalid.example","X")',
  team: { shortName: 'ARS' }, position: 'MID', price: 8.3, ownership: 14.2,
  projection: 6.1, gwProjections: { 10: 6.4, 11: 0, 12: 7.22 },
  horizon5Projection: 30, modelBreakdown: {
    optaXP5Gw: 29, modelXPts: 6, expectedMinutes: 85, defcon: 0.4, fiveGwEaseScore: 12,
  },
} as EnrichedPlayer;

test('selected GW forecast respects real per-GW data, zeros, and missing data', () => {
  assert.equal(playerGwForecast(player, 10, 10), 6.4);
  assert.equal(playerGwForecast(player, 11, 10), 0);
  assert.equal(playerGwForecast(player, 12, 10), 7.22);
  assert.equal(playerGwForecast(player, 13, 10), null);
  assert.equal(playerGwForecast(player, 9, 10), null);
  assert.equal(playerGwForecast({ projection: 5.5 }, 10, 10), 5.5);
  assert.equal(playerGwForecast({ projection: 5.5 }, 11, 10), null);
});

test('CSV uses selected GW, correct ownership provenance, and formula-safe quoting', () => {
  const csv = playerPredictionsCsv([player], 12, 10);
  assert.match(csv, /GW12_VORTEX_xPts/);
  assert.match(csv, /Selected_By_Pct_NOT_EO/);
  assert.match(csv, /7.22/);
  assert.ok(csv.includes('"\'=HYPERLINK(""https://invalid.example"",""X"")"'));
  assert.equal(csv.split('\r\n').filter(Boolean).length, 2);
  const unavailable = playerPredictionsCsv([player], 13, 10);
  assert.ok(unavailable.includes('"N/A"'));
  assert.match(unavailable, /"Unavailable"/);
});
