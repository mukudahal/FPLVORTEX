'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../src/lib');
const { nextFreeTransfers, pointsHit, sellingPrice, projectedTotal, selectOptimalXI } = require(path.join(root, 'scoring.ts'));
const { solveLineupTS } = require(path.join(root, 'lineup.ts'));
const { bestXI } = require(path.join(root, 'planEngine.ts'));

const position = [1,1,2,2,2,2,2,3,3,3,3,3,4,4,4];
const squad = position.map((_, index) => index + 1);
const elements = new Map(squad.map((id, index) => [id, { id, element_type: position[index] }]));
const points = Object.fromEntries(squad.map((id) => [id, id / 2]));
const typeOf = (id) => elements.get(id).element_type;
const xpOf = (id) => points[id];

test('one lineup engine returns identical chosen XI across both consumers', () => {
  const chosen = selectOptimalXI(squad, typeOf, xpOf);
  const planner = bestXI(squad, typeOf, xpOf);
  const optimizer = solveLineupTS(squad, elements, points);
  assert.deepEqual(planner.starters, optimizer.starters);
  assert.deepEqual(chosen.bench, optimizer.bench);
  assert.equal(chosen.formation, optimizer.formation);
  assert.equal(planner.captain, optimizer.captainId);
  assert.equal(optimizer.totalXPts, projectedTotal(chosen.xi, chosen.capXp, chosen.benchXp));
  assert.equal(chosen.starters.length, 11);
  assert.equal(chosen.bench.length, 4);
});

test('captain, bench boost and triple captain have exactly one scoring formula', () => {
  const base = solveLineupTS(squad, elements, points);
  const bb = solveLineupTS(squad, elements, points, true);
  const tc = solveLineupTS(squad, elements, points, false, true);
  assert.equal(bb.totalXPts, Math.round((base.totalXPts + base.benchXPts) * 100) / 100);
  assert.equal(tc.totalXPts, Math.round((base.totalXPts + base.captainXPts) * 100) / 100);
});

test('free-transfer rollover and WC/FH preserve banked transfers without adding one', () => {
  assert.equal(nextFreeTransfers(2, 0), 3);
  assert.equal(nextFreeTransfers(5, 0), 5);
  assert.equal(nextFreeTransfers(2, 1), 2);
  assert.equal(nextFreeTransfers(1, 4), 1);
  assert.equal(nextFreeTransfers(2, 14, 'wc'), 2);
  assert.equal(nextFreeTransfers(4, 15, 'fh'), 4);
  assert.equal(pointsHit(4, 2), 8);
  assert.equal(pointsHit(40, 0, true), 0);
  assert.throws(() => pointsHit(-1, 0), RangeError);
});

test('selling prices use half profit rounded down to a tenth', () => {
  assert.equal(sellingPrice(75, 78), 76);
  assert.equal(sellingPrice(75, 74), 74);
  assert.equal(sellingPrice(75, 75), 75);
  assert.throws(() => sellingPrice(75.5, 78), RangeError);
});

test('invalid squads are rejected rather than returning undefined captain and invalid formation', () => {
  assert.throws(() => solveLineupTS(squad.slice(0, 14), elements, points), /valid 15-player/);
  assert.throws(() => selectOptimalXI([...squad.slice(0, 14), 1], typeOf, xpOf), /Duplicate/);
});
