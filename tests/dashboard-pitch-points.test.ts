import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashboardPitchPoints } from '../src/lib/dashboardPitchPoints.ts';

const base = {
  selectedGw: 10, entryGw: 10, currentGw: 10, nextGw: 11,
  eventPoints: 5, projectedPoints: 8.25, multiplier: 1,
};

test('Dashboard records actual GW points, including zero, and doubles only the captain', () => {
  assert.deepEqual(dashboardPitchPoints(base), { text: '5', label: 'PTS', source: 'recorded' });
  assert.deepEqual(dashboardPitchPoints({ ...base, multiplier: 2 }), { text: '10', label: 'PTS', source: 'recorded' });
  assert.deepEqual(dashboardPitchPoints({ ...base, eventPoints: 0 }), { text: '0', label: 'PTS', source: 'recorded' });
});

test('future gameweeks are explicitly xPts, not recorded results', () => {
  assert.deepEqual(dashboardPitchPoints({ ...base, selectedGw: 11, multiplier: 2 }), {
    text: '16.5', label: 'xPts', source: 'projected',
  });
});

test('historical nonmatching GW, missing event points and unavailable forecasts do not invent a score', () => {
  const unavailable = { text: '—', label: 'N/A', source: 'unavailable' };
  assert.deepEqual(dashboardPitchPoints({ ...base, selectedGw: 9 }), unavailable);
  assert.deepEqual(dashboardPitchPoints({ ...base, eventPoints: null }), unavailable);
  assert.deepEqual(dashboardPitchPoints({ ...base, selectedGw: 11, projectedPoints: null }), unavailable);
  assert.deepEqual(dashboardPitchPoints({ ...base, selectedGw: 11, projectedPoints: Number.NaN }), unavailable);
  assert.deepEqual(dashboardPitchPoints({ ...base, selectedGw: -1 }), unavailable);
});
