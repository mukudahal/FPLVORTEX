import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plannerDifficulty, averagePlannerDifficulty } from '../src/lib/plannerDifficulty';
import type { FixtureCell } from '../src/lib/types';

function cell(winProb: number | undefined, isBlank = false): FixtureCell {
  return { event: 1, difficulty: 3, fixtures: [], label: '', isBlank, isDouble: false, winProb };
}

test('planner difficulty uses win probability, not official FDR', () => {
  assert.equal(plannerDifficulty(cell(.75)), 2);
  assert.equal(plannerDifficulty(cell(.25)), 4);
  assert.equal(plannerDifficulty(cell(0)), 5);
  assert.equal(plannerDifficulty(cell(1)), 1);
  assert.equal(plannerDifficulty(cell(undefined)), null);
  assert.equal(plannerDifficulty(cell(.5, true)), null);
});

test('average excludes blank and missing gameweeks', () => {
  assert.equal(averagePlannerDifficulty([cell(.75), cell(.25), cell(.5, true), cell(undefined)]), 3);
  assert.equal(averagePlannerDifficulty([cell(undefined)]), null);
});
