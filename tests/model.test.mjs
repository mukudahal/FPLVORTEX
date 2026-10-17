import test from 'node:test';
import assert from 'node:assert/strict';
import {
  csvForPlayers, demoPlayers, fixtureDifficulty, initialSquad,
  optimizeOneTransfer, parseSquad, projectPlayer, projectedHorizon, validateSquad
} from '../dist/js/model.js';

test('seed squad respects formation and three-per-club rule', () => {
  assert.deepEqual(validateSquad(demoPlayers, initialSquad.selectedIds), []);
});
test('projection has sensible positive finite components', () => {
  for (const player of demoPlayers) {
    const projection = projectPlayer(player, 0);
    assert.equal(Number.isFinite(projection.expectedPoints), true);
    assert.ok(projection.expectedPoints >= 0);
  }
});
test('invalid gameweek index cannot silently use undefined difficulty', () => {
  assert.throws(() => projectPlayer(demoPlayers[0], -1), RangeError);
  assert.throws(() => projectPlayer(demoPlayers[0], 6), RangeError);
});
test('injury status reduces projection', () => {
  const base = demoPlayers[0];
  assert.ok(projectPlayer({...base,status:'out'},0).expectedPoints < projectPlayer(base,0).expectedPoints);
});
test('fixture difficulty categories are stable', () => {
  assert.equal(fixtureDifficulty(2),'easy');
  assert.equal(fixtureDifficulty(3),'medium');
  assert.equal(fixtureDifficulty(5),'hard');
});
test('invalid squad rejects duplicate and oversize club', () => {
  const duplicated = [...initialSquad.selectedIds];
  duplicated[0] = duplicated[1];
  assert.ok(validateSquad(demoPlayers,duplicated).length > 0);
  const extraArsenal = [...initialSquad.selectedIds];
  extraArsenal[extraArsenal.indexOf(13)] = 14;
  assert.ok(validateSquad(demoPlayers,extraArsenal).includes('Maximum three players per club'));
});
test('local squad read rejects malformed persisted values', () => {
  assert.deepEqual(parseSquad('{oops'),initialSquad);
  assert.deepEqual(parseSquad(JSON.stringify({...initialSquad,bank:-1})),initialSquad);
});
test('single-transfer candidates are budget and club legal', () => {
  const recommendations = optimizeOneTransfer(demoPlayers,initialSquad,5);
  assert.ok(recommendations.length > 0);
  for (const recommendation of recommendations) {
    assert.equal(recommendation.incoming.position,recommendation.outgoing.position);
    assert.ok(recommendation.incoming.price <= recommendation.outgoing.price + initialSquad.bank + 1e-8);
    assert.ok(!initialSquad.selectedIds.includes(recommendation.incoming.id));
    const swapped = initialSquad.selectedIds.map(id=>id===recommendation.outgoing.id?recommendation.incoming.id:id);
    assert.deepEqual(validateSquad(demoPlayers,swapped),[]);
  }
});
test('extra transfers incur a four-point hit', () => {
  const free = optimizeOneTransfer(demoPlayers,initialSquad,5);
  const hit = optimizeOneTransfer(demoPlayers,{...initialSquad,freeTransfers:0},5);
  const pair = free[0];
  const corresponding = hit.find(item=>item.outgoing.id===pair.outgoing.id && item.incoming.id===pair.incoming.id);
  assert.equal(pair.netGain - corresponding.netGain,4);
});
test('horizon validation guards partial projections', () => {
  assert.throws(() => projectedHorizon(demoPlayers[0],7), RangeError);
});
test('CSV quotes strings and preserves selected horizon', () => {
  const csv = csvForPlayers(demoPlayers.slice(0,2),3);
  assert.match(csv,/"Player","Club"/);
  assert.equal(csv.trim().split('\n').length,3);
});