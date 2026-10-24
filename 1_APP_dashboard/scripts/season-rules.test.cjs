'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSeasonChipPlan, validateSquad, advanceTransferState, transferBankAfterSale } = require('../src/lib/seasonRules.ts');

test('2026/27 chips reset after GW19, cannot stack, no consecutive FH across halves', () => {
  assert.deepEqual(validateSeasonChipPlan([{ gw: 18, chip: 'wc' }, { gw: 20, chip: 'wc' }]), []);
  assert.match(validateSeasonChipPlan([{ gw: 19, chip: 'fh' }, { gw: 20, chip: 'fh' }]).join(','), /consecutive/);
  assert.match(validateSeasonChipPlan([{ gw: 10, chip: 'tc' }, { gw: 11, chip: 'tc' }]).join(','), /already used/);
  assert.match(validateSeasonChipPlan([{ gw: 1, chip: 'fh' }]).join(','), /GW1/);
  assert.match(validateSeasonChipPlan([{ gw: 7, chip: 'wc' }, { gw: 7, chip: 'tc' }]).join(','), /one chip/);
});

test('squad salary and formation checks reject 4 same-team players', () => {
  const squad = [1,1,2,2,2,2,2,3,3,3,3,3,4,4,4].map((position, index) => ({ id: index+1, position, team: index % 5 + 1, priceTenths: 50 }));
  assert.equal(validateSquad(squad).legal, true);
  const clubOverload = squad.map((p, index) => index < 4 ? { ...p, team: 1 } : p);
  assert.match(validateSquad(clubOverload).errors.join(' '), /maximum three/);
  assert.match(validateSquad(squad, 500).errors.join(' '), /budget/);
});

test('FT rollover and selling price preserve integer-tenth accounting', () => {
  assert.deepEqual(advanceTransferState(2, 4), { freeTransfersNext: 1, hitPoints: 8 });
  assert.deepEqual(advanceTransferState(2, 15, 'wc'), { freeTransfersNext: 2, hitPoints: 0 });
  assert.equal(transferBankAfterSale(75, 78, 4), 80);
});
