import test from 'node:test';
import assert from 'node:assert/strict';
import { createLineupExpectation, gameweekAbsence } from '../src/lib/repoModel/lineupExpectation';
import { scoreLineup } from '../src/lib/repoModel/monteCarlo';
import type { PlanningChip } from '../src/lib/repoModel/scoring';

test('expected points match realised scoring across all absence scenarios and chip multipliers', () => {
  const positions = [0, 1, 2, 3, 2, 4, 2, 3, 3, 3, 4, 2, 1, 3, 2, 4];
  const lineup = {
    starters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    bench: [12, 13, 14, 15],
    captainId: 5,
    viceId: 3,
  };
  const players = positions.map((position, id) => {
    const absence = [1, 2, 4, 5, 6, 11, 12, 13, 14, 15].includes(id) ? id / 20 : 0;
    const conditionalPoints = id === 14 ? -1 : id % 6 + 1;
    return { position, absence, conditionalPoints, points: (1 - absence) * conditionalPoints };
  });
  const expected = createLineupExpectation();
  for (const chip of [undefined, 'bb', 'tc', 'fh', 'wc'] as (PlanningChip | undefined)[]) {
    let exact = 0;
    for (let mask = 0; mask < 1 << 15; mask++) {
      const played = (id: number) => !!(mask & (1 << (id - 1)));
      let probability = 1;
      for (let id = 1; id <= 15; id++) probability *= played(id) ? 1 - players[id].absence : players[id].absence;
      if (probability) exact += probability * scoreLineup(lineup, {
        played,
        pts: id => players[id].conditionalPoints,
        position: id => positions[id],
      }, chip);
    }
    assert.ok(Math.abs(exact - expected(lineup, id => players[id], chip).total) < 1e-8, String(chip));
  }
});

test('blank and double gameweeks use probability of missing every fixture', () => {
  const player = { mean: 2, p60: 0.4, pSub: 0.1, fixtures: 2, csProb: 0, cardLoss: 0, team: 1, position: 4 };
  assert.equal(gameweekAbsence(player), 0.25);
  assert.equal(gameweekAbsence({ ...player, fixtures: 0 }), 1);
});
