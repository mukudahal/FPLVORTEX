import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES_2026_27, advanceTransferState, transferBankAfterSale,
  validateSeasonChipPlan, validateSquad, type SquadCandidate,
} from '../src/lib/repoModel/seasonRules.ts';
import { projectedTotal } from '../src/lib/repoModel/scoring.ts';

/**
 * Official 2026/27 FPL rule regression.
 * Sources: https://www.premierleague.com/en/news/4679879/whats-happening-with-fpl-chips-in-202627
 *          https://www.premierleague.com/en/news/4679873
 * Tests validate legality, not forecast accuracy or official API transfer execution.
 */

function validSquad(): SquadCandidate[] {
  const positions = [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4];
  return positions.map((position, index) => ({
    id: index + 1, position,
    team: Math.floor(index / 3) + 1,
    priceTenths: 50,
  }));
}

test('2026/27 two chip sets, 19/20 split, five saved FTs and transfer-hit cost', () => {
  assert.equal(RULES_2026_27.season, '2026/27');
  assert.equal(RULES_2026_27.chipHalfBoundary, 19);
  assert.equal(RULES_2026_27.maxFreeTransfers, 5);
  assert.equal(RULES_2026_27.hitCost, 4);
  assert.deepEqual(RULES_2026_27.chips, ['wc', 'fh', 'bb', 'tc']);
});

test('one wildcard, free hit, bench boost and triple captain each half is legal', () => {
  const valid = [
    { gw: 2, chip: 'wc' }, { gw: 3, chip: 'bb' },
    { gw: 4, chip: 'tc' }, { gw: 5, chip: 'fh' },
    { gw: 20, chip: 'wc' }, { gw: 21, chip: 'bb' },
    { gw: 22, chip: 'tc' }, { gw: 23, chip: 'fh' },
  ] as const;
  assert.deepEqual(validateSeasonChipPlan(valid), []);
});

test('duplicate chip in same half and two chips in one GW are rejected', () => {
  const dup = validateSeasonChipPlan([{ gw: 4, chip: 'wc' }, { gw: 10, chip: 'wc' }]);
  assert.ok(dup.some(message => message.includes('already used')));
  const sharedWeek = validateSeasonChipPlan([{ gw: 5, chip: 'wc' }, { gw: 5, chip: 'bb' }]);
  assert.ok(sharedWeek.some(message => message.includes('More than one')));
});

test('free hit not permitted in GW1 or consecutive GW19/GW20 across halves', () => {
  assert.ok(validateSeasonChipPlan([{ gw: 1, chip: 'fh' }]).some(m => m.includes('GW1')));
  assert.ok(validateSeasonChipPlan([{ gw: 19, chip: 'fh' }, { gw: 20, chip: 'fh' }])
    .some(m => m.includes('consecutive')));
  assert.deepEqual(validateSeasonChipPlan([{ gw: 18, chip: 'fh' }, { gw: 20, chip: 'fh' }]), []);
});

test('a gameweek cannot be outside the 2026/27 season', () => {
  assert.ok(validateSeasonChipPlan([{ gw: 0, chip: 'bb' }]).length > 0);
  assert.ok(validateSeasonChipPlan([{ gw: 39, chip: 'tc' }]).length > 0);
});

test('WC and FH do not consume previously banked FTs or charge hits', () => {
  for (const chip of ['wc', 'fh'] as const) {
    assert.deepEqual(advanceTransferState(4, 8, chip), { freeTransfersNext: 4, hitPoints: 0 });
    assert.deepEqual(advanceTransferState(1, 12, chip), { freeTransfersNext: 1, hitPoints: 0 });
  }
});

test('normal transfers roll up to five and charge four points per excess move', () => {
  assert.deepEqual(advanceTransferState(2, 4), { freeTransfersNext: 1, hitPoints: 8 });
  assert.deepEqual(advanceTransferState(4, 0), { freeTransfersNext: 5, hitPoints: 0 });
  assert.deepEqual(advanceTransferState(5, 0), { freeTransfersNext: 5, hitPoints: 0 });
  assert.deepEqual(advanceTransferState(0, 1), { freeTransfersNext: 1, hitPoints: 4 });
  assert.throws(() => advanceTransferState(6, 0), RangeError);
});

test('selling price applies half profits rounded down, but full losses', () => {
  assert.equal(transferBankAfterSale(60, 65, 10), 72); // 6.0 -> 6.5 yields 6.2, not 6.5
  assert.equal(transferBankAfterSale(60, 61, 10), 70);
  assert.equal(transferBankAfterSale(60, 56, 10), 66);
  assert.throws(() => transferBankAfterSale(60, 65, -1), RangeError);
});

test('FPL squad checks exact position quotas, three-club limit and real budget', () => {
  const valid = validSquad();
  assert.equal(validateSquad(valid, 1000).legal, true);
  assert.equal(validateSquad(valid, 749).legal, false); // 15 * 50 tenths = 750
  assert.equal(validateSquad(valid, 750).legal, true);
  assert.ok(validateSquad(valid.slice(0, 14)).errors.some(m => m.includes('15 players')));
  const duplicate = valid.map((x, idx) => idx === 1 ? { ...x, id: valid[0].id } : x);
  assert.ok(validateSquad(duplicate).errors.some(m => m.includes('Duplicate')));
  const tooManyClub = valid.map((x, idx) => idx === 6 ? { ...x, team: 1 } : x);
  assert.ok(validateSquad(tooManyClub).errors.some(m => m.includes('maximum three')));
});

test('Triple Captain and Bench Boost add precisely one extra captain or bench value', () => {
  assert.equal(projectedTotal(40, 6, 12), 46);
  assert.equal(projectedTotal(40, 6, 12, 'tc'), 52);
  assert.equal(projectedTotal(40, 6, 12, 'bb'), 58);
});
