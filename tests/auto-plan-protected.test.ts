import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoPlan,
  replay,
  topMoves,
  sanitize,
  TRANSFER_LAB_HORIZON,
  type PlanCtx,
  type TransferMap,
} from '../src/lib/repoModel/planEngine.ts';
import type { PlanPlayer } from '../src/lib/repoModel/planTypes.ts';

function makeContext(): PlanCtx {
  const gws = Array.from({ length: 12 }, (_, i) => i + 1);
  // A legal 2 GK / 5 DEF / 5 MID / 3 FWD base squad, plus 3 alternatives.
  const typeOf = (id: number) => id <= 2 ? 1 : id <= 7 || id === 17 ? 2 : id <= 12 || id === 16 || id === 18 ? 3 : 4;
  const players = new Map<number, PlanPlayer>();
  for (let id = 1; id <= 18; id++) {
    players.set(id, {
      id, code: id, name: 'Player ' + id, team: id, type: typeOf(id),
      cost: 50, status: 'a', news: '', chance: 100, owned: 0, form: 0,
      net: 0, pen: null, fk: null, ck: null,
      xp: Array.from({ length: 12 }, () => id === 16 ? 9 : id === 17 ? 8 : id === 18 ? 7 : 2),
    });
  }
  return {
    players,
    gws,
    baseSquad: Array.from({ length: 15 }, (_, i) => i + 1),
    bank0: 0,
    sell0: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 1, 50])),
    freeNow: 2,
  };
}

test('Director advice and Auto Plan reject flagged targets even with inflated future xPts', () => {
  for (const [status, chance] of [['i', 0], ['d', 75], ['s', null], ['u', 0], ['a', 50]] as const) {
    const ctx = makeContext();
    Object.assign(ctx.players.get(16)!, { status, chance, xp: ctx.gws.map(() => 100) });
    const advice = topMoves(ctx, replay(ctx, {}, 1), 0, 10, 30);
    assert.ok(advice.every(move => move.in !== 16), `${status}/${chance} must not be a suggested purchase`);
    const result = autoPlan(ctx, {}, { horizon: 10, allowHits: true, fromIdx: 0, minGainFree: 0.1 });
    assert.ok(Object.values(result.transfers).flat().every(move => move.in !== 16));
    // A manager's explicit saved choice stays intact, including injured assets.
    const saved = { 1: [{ out: 9, in: 16 }] };
    assert.deepEqual(sanitize(ctx, saved), saved);
  }
});

test('Auto Plan defaults to a supported 10-GW limit and never changes the saved manual path', () => {
  assert.equal(TRANSFER_LAB_HORIZON, 10);
  const ctx = makeContext();
  const manuallySaved: TransferMap = { 3: [{ out: 9, in: 18 }] };
  const pristine = JSON.stringify(manuallySaved);
  const result = autoPlan(ctx, manuallySaved, {
    horizon: TRANSFER_LAB_HORIZON, allowHits: false, fromIdx: 0, maxPerGw: 1,
    minGainFree: 0.1,
  });

  assert.equal(JSON.stringify(manuallySaved), pristine, 'input is never mutated');
  assert.deepEqual(result.transfers[3], manuallySaved[3], 'manual GW3 choice survives byte-for-byte');
  assert.ok(result.steps.every(step => step.gw >= 1 && step.gw <= 10 && step.gw !== 3));
  assert.deepEqual(sanitize(ctx, result.transfers), result.transfers, 'all suggestions and protected transfers remain legal');
  const finalSquad = replay(ctx, result.transfers, 3).squad;
  assert.ok(finalSquad.includes(18), 'later manual buy remains executable');
  assert.ok(!finalSquad.includes(9), 'later manual sale remains executable');
});

test('Auto Plan does not recommend transfers past the chosen 10-GW window', () => {
  const ctx = makeContext();
  for (const player of ctx.players.values()) {
    player.xp = Array.from({ length: 12 }, (_, i) => i === 11 && player.id === 16 ? 25 : 2);
  }
  const result = autoPlan(ctx, {}, {
    horizon: TRANSFER_LAB_HORIZON, allowHits: true, fromIdx: 0, minGainFree: 0.1,
  });
  assert.deepEqual(result.steps, [], 'GW12-only upside must not leak into a GW1-10 decision');
  assert.deepEqual(result.transfers, {});
});

test('Auto Plan protects existing transfers in the first GW and carries them into future planning', () => {
  const ctx = makeContext();
  const manuallySaved: TransferMap = { 1: [{ out: 9, in: 18 }] };
  const result = autoPlan(ctx, manuallySaved, {
    horizon: TRANSFER_LAB_HORIZON, allowHits: false, fromIdx: 0, minGainFree: 0.1,
  });
  assert.deepEqual(result.transfers[1], manuallySaved[1]);
  assert.ok(result.steps.every(step => step.gw > 1));
  assert.deepEqual(sanitize(ctx, result.transfers), result.transfers);
});

