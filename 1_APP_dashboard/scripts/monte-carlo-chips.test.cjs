'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreLineup, runMonteCarlo } = require('../src/lib/monteCarlo.ts');

test('chip simulation triple-captains actual playing vice and counts whole bench once', () => {
  const lineup = { starters: [1,3,4,5,6,7,8,9,10,11,12], bench: [2,13,14,15], captainId: 3, viceId: 4 };
  const pos = {1:1,2:1,3:2,4:2,5:2,6:3,7:3,8:3,9:3,10:3,11:4,12:4,13:2,14:4,15:2};
  const outcome = { position: (id) => pos[id], played: (id) => id !== 3, pts: (id) => id === 4 ? 8 : 2 };
  const normal = scoreLineup(lineup, outcome);
  assert.equal(scoreLineup(lineup, outcome, 'tc'), normal + 8);
  assert.ok(scoreLineup(lineup, outcome, 'bb') > 0);
});

test('Monte Carlo rejects malformed horizons before sampling', () => {
  assert.throws(() => runMonteCarlo({ gws: [0], paths: [], holdId: 'hold', recommendedId: 'hold', playerAt: () => null, seed: 1, draws: 100 }), /gameweek/);
});
