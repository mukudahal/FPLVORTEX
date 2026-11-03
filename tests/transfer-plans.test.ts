import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EntryData, Snapshot } from '../src/lib/types.ts';
import { enrichPlayers, toRepoElement } from '../src/lib/analytics.ts';
import { buildFixtureMatrix } from '../src/lib/fixtures.ts';
import { optimizeSquad } from '../src/lib/optimize.ts';
import { replay } from '../src/lib/repoModel/planEngine.ts';
import { TransferPlanModal } from '../src/components/TransferPlanModal.tsx';
import { FixtureMatrix } from '../src/components/FixtureMatrix.tsx';
import { PlayerGraphicModal } from '../src/components/PlayerGraphicModal.tsx';
import { VORTEX_FILL_COLORS } from '../src/lib/fixtureForecast.ts';
import {
  buildPlanCtxFromCache,
  buildVortexPlannerCache,
  collapseGwTransfers,
  computeLiveGwMetrics,
  createNewTransferPlan,
  deleteTransferPlan,
  getNextFixturesWithVortexFdr,
  MAX_TRANSFER_PLAN_SLOTS,
  upsertTransferPlan,
  validatePendingReplacement,
  type StoredTransferPlan,
} from '../src/lib/transferPlansStore.ts';

async function loadPlannerSetup() {
  const snapshot = JSON.parse(await readFile('public/data/fpl-snapshot.json', 'utf8')) as Snapshot;
  const players = enrichPlayers(snapshot, 'balanced');
  const optimal = optimizeSquad(players, { budget: 100, lockedIds: [], excludedIds: [] });
  const fallbackSquadIds = optimal.squad.map((p) => p.id);
  const cache = buildVortexPlannerCache(snapshot, players);
  const plan = createNewTransferPlan({
    snapshot,
    players,
    fallbackSquadIds,
    entry: null,
  });
  const ctx = buildPlanCtxFromCache(plan, players, cache);
  return { snapshot, players, fallbackSquadIds, cache, plan, ctx };
}

test('Fix 1: 10-slot plan store creates, updates, caps at 10 slots, deletes cleanly, and renders Transfer plans popup UI', async () => {
  const { snapshot, players, fallbackSquadIds } = await loadPlannerSetup();
  let slots: StoredTransferPlan[] = [];

  for (let i = 0; i < MAX_TRANSFER_PLAN_SLOTS; i++) {
    const plan = createNewTransferPlan({
      snapshot,
      players,
      fallbackSquadIds,
      entry: null,
      existingPlansCount: i,
    });
    const res = upsertTransferPlan(slots, plan);
    assert.equal(res.ok, true);
    if (res.ok) slots = res.plans;
  }

  assert.equal(slots.length, 10);
  assert.match(slots[0].name, /^Transfer Plan \(GW\d+\+\)$/);
  assert.equal(slots[0].baseSquad.length, 15);

  const extra = createNewTransferPlan({
    snapshot,
    players,
    fallbackSquadIds,
    entry: null,
    existingPlansCount: 10,
  });
  const capped = upsertTransferPlan(slots, extra);
  assert.equal(capped.ok, false);

  const afterDelete = deleteTransferPlan(slots, slots[0].id);
  assert.equal(afterDelete.length, 9);

  // Verify Fix 1 popup markup with linked Team ID
  const mockEntry = {
    id: 1037666,
    name: 'VORTEX XI',
    playerName: 'Manager',
    summaryOverallPoints: 500,
    summaryOverallRank: 12000,
    summaryEventPoints: 64,
    summaryEventRank: 80000,
    currentEvent: snapshot.meta.currentEventId,
    freeTransfers: 2,
    picks: [],
    chips: [],
    leagues: [],
    history: { event: snapshot.meta.currentEventId ?? 1, points: 64, totalPoints: 500, overallRank: 12000, bank: 15, value: 1005, eventTransfers: 0, eventTransfersCost: 0 },
  } as unknown as EntryData;

  const html = renderToStaticMarkup(
    React.createElement(TransferPlanModal, {
      open: true,
      onClose: () => {},
      snapshot,
      players,
      fallbackSquadIds,
      entry: mockEntry,
      onToast: () => {},
    }),
  );
  assert.match(html, /FPL VORTEX/);
  assert.match(html, /Team ID 1037666/);
  assert.match(html, /Transfer plans/);
  assert.match(html, /0 of 10 plan slots used/);
  assert.match(html, /New/);
  assert.match(html, /Create your first plan/);
  assert.doesNotMatch(html, /planfpl/i);
});

test('Fix 2: Transfer Plan workspace renders VORTEX pitch, KPI boxes, high-xPts table, and NEXT 5 VORTEX FDR cells', async () => {
  const { snapshot, players, fallbackSquadIds, cache, plan } = await loadPlannerSetup();
  const startGw = cache.gws[0];
  assert.ok(cache.gws.length >= 5);

  const topMid = [...players]
    .filter((p) => p.position === 'MID')
    .sort((a, b) => (cache.xpByPlayerGw.get(b.id)?.[0] ?? 0) - (cache.xpByPlayerGw.get(a.id)?.[0] ?? 0))[0];

  assert.ok(topMid);
  assert.ok((cache.xpByPlayerGw.get(topMid.id)?.[0] ?? 0) > 0);

  const next5 = getNextFixturesWithVortexFdr(cache, topMid.teamId, startGw, 5);
  assert.equal(next5.items.length, 5);
  assert.equal(next5.items[0].gw, startGw);
  assert.equal(next5.items[4].gw, snapshot.meta.nextEventId + 4);

  const editorHtml = renderToStaticMarkup(
    React.createElement(TransferPlanModal, {
      open: true,
      onClose: () => {},
      snapshot,
      players,
      fallbackSquadIds,
      entry: null,
      onToast: () => {},
      initialActivePlan: plan,
    }),
  );

  assert.match(editorHtml, /Save &amp; Exit/);
  assert.match(editorHtml, /Transfer Plan \(GW\d+\+\)/);
  assert.match(editorHtml, /TRANSFERS/);
  assert.match(editorHtml, /COST/);
  assert.match(editorHtml, /BANK/);
  assert.match(editorHtml, /XP \/ RATING/);
  assert.match(editorHtml, /FPL VORTEX/);
  assert.match(editorHtml, /NEXT 5/);
  assert.doesNotMatch(editorHtml, /planfpl/i);
  assert.equal((editorHtml.match(/class="vx-tp-pitch-card(?![_-])/g) ?? []).length, 15);
  // 35 default rows * 5 upcoming fixtures = 175 Next-5 fixture chips
  assert.equal((editorHtml.match(/class="vx-tp-next5-chip(?![_-])/g) ?? []).length, 35 * 5);
});

test('Fix 3: Clicking a pitch player renders + / Replace slot, updates live KPIs, and filters right table by position', async () => {
  const { snapshot, players, fallbackSquadIds, cache, plan, ctx } = await loadPlannerSetup();
  const gw = cache.gws[0];
  const benchmarkXp = cache.benchmarkOptimalXpByGw.get(gw) ?? 65;
  const state = replay(ctx, plan.transfers, gw, plan.chips);

  const baseMetrics = computeLiveGwMetrics({
    ctx,
    plan,
    gw,
    pendingOutIds: [],
    benchmarkXp,
  });

  const outgoingMidId = state.squad.find((id) => ctx.players.get(id)?.type === 3)!;
  const outgoingMidName = players.find((p) => p.id === outgoingMidId)!.name;
  const pendingMetrics = computeLiveGwMetrics({
    ctx,
    plan,
    gw,
    pendingOutIds: [outgoingMidId],
    benchmarkXp,
  });

  assert.equal(pendingMetrics.transfersUsed, baseMetrics.transfersUsed + 1);
  assert.ok(pendingMetrics.effectiveBankTenths > baseMetrics.effectiveBankTenths);
  assert.ok(pendingMetrics.projectedGwXp <= baseMetrics.projectedGwXp);

  // Verify SSR of View 3 (+ / PlayerName / Replace slot on pitch + Mid filter active)
  const replaceHtml = renderToStaticMarkup(
    React.createElement(TransferPlanModal, {
      open: true,
      onClose: () => {},
      snapshot,
      players,
      fallbackSquadIds,
      entry: null,
      onToast: () => {},
      initialActivePlan: plan,
      initialPendingOutIds: [outgoingMidId],
      initialPosFilter: 'MID',
    }),
  );
  assert.equal((replaceHtml.match(/class="vx-tp-replace-slot(?![_-])/g) ?? []).length, 1);
  assert.equal((replaceHtml.match(/class="vx-tp-pitch-card(?![_-])/g) ?? []).length, 14);
  assert.match(replaceHtml, new RegExp(outgoingMidName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(replaceHtml, />Replace<\/small>/);

  const squadSet = new Set(state.squad);
  const candidate = [...players]
    .filter(
      (p) =>
        p.position === 'MID' &&
        !squadSet.has(p.id) &&
        p.cost <= pendingMetrics.effectiveBankTenths &&
        state.squad.filter((id) => id !== outgoingMidId && ctx.players.get(id)?.team === p.teamId).length < 3,
    )
    .sort((a, b) => (cache.xpByPlayerGw.get(b.id)?.[0] ?? 0) - (cache.xpByPlayerGw.get(a.id)?.[0] ?? 0))[0];

  assert.ok(candidate);
  assert.equal(
    validatePendingReplacement({
      ctx,
      stateSquad: state.squad,
      effectiveBankTenths: pendingMetrics.effectiveBankTenths,
      pendingOutIds: [outgoingMidId],
      outId: outgoingMidId,
      inId: candidate.id,
    }),
    null,
  );

  const collapsed = collapseGwTransfers([{ out: outgoingMidId, in: candidate.id }], candidate.id, outgoingMidId);
  assert.deepEqual(collapsed, []);
});

test('Fix 4: Rendered FixtureMatrix and PlayerGraphicModal apply 4-band fills with White text on Red and Black text on others', async () => {
  const { snapshot, players } = await loadPlannerSetup();
  const fixtureRows = buildFixtureMatrix(snapshot.teams, snapshot.fixtures, snapshot.meta.nextEventId, 6, snapshot.players.map(toRepoElement), snapshot.historicalTeamModel?.strengths);
  const matrixHtml = renderToStaticMarkup(
    React.createElement(FixtureMatrix, {
      snapshot,
      fixtureRows,
      players,
      onToast: () => {},
    }),
  );

  // Every red background must pair with #ffffff text; every green/cyan/orange background must pair with #000000 text
  const redStyles = matrixHtml.match(new RegExp(`background:${VORTEX_FILL_COLORS.red};color:#[0-9a-fA-F]{6}`, 'g')) ?? [];
  for (const s of redStyles) {
    assert.equal(s.toLowerCase(), `background:${VORTEX_FILL_COLORS.red};color:#ffffff`);
  }

  for (const nonRed of [VORTEX_FILL_COLORS.green, VORTEX_FILL_COLORS.cyan, VORTEX_FILL_COLORS.orange]) {
    const matches = matrixHtml.match(new RegExp(`background:${nonRed};color:#[0-9a-fA-F]{6}`, 'g')) ?? [];
    for (const s of matches) {
      assert.equal(s.toLowerCase(), `background:${nonRed};color:#000000`);
    }
  }

  const cardHtml = renderToStaticMarkup(
    React.createElement(PlayerGraphicModal, {
      player: players[0],
      snapshot,
      teams: snapshot.teams,
      fixtureRows,
      onClose: () => {},
    }),
  );
  assert.match(cardHtml, new RegExp(`background:${VORTEX_FILL_COLORS.red};color:#ffffff`));
  assert.match(cardHtml, new RegExp(`background:${VORTEX_FILL_COLORS.green};color:#000000`));
});


test('Manual Plan is inline, image-led, solver-free and places shared FDR below recommendations', async () => {
  const { snapshot, players, fallbackSquadIds, plan } = await loadPlannerSetup();
  const before = JSON.stringify(plan);
  const html = renderToStaticMarkup(React.createElement(TransferPlanModal, {
    embedded: true, open: true, onClose: () => {}, snapshot, players, fallbackSquadIds,
    initialActivePlan: plan, onToast: () => {},
  }));
  assert.match(html, /aria-label="Manual Plan"/);
  assert.doesNotMatch(html, /role="dialog"|Run VORTEX Solver|Auto-pick|10-Gameweek transfer MILP/);
  assert.equal((html.match(/data-tp-pitch-player=/g) ?? []).length, 15);
  assert.equal((html.match(/aria-label="Transfer out /g) ?? []).length, 15);
  assert.match(html, /Assistant Manager/);
  assert.match(html, /Director of Football/);
  assert.ok(html.indexOf('Director of Football') < html.indexOf('aria-label="Fixture difficulty table"'));
  assert.equal(JSON.stringify(plan), before, 'Opening Plan must not mutate an existing saved scenario');
});

test('a simultaneous legal batch survives an intermediate club-count conflict', async () => {
  const {validateTransferBatch,sanitize,validateTransfer}=await import('../src/lib/repoModel/planEngine.ts');
  const {ctx}=await loadPlannerSetup();
  const defenders=ctx.baseSquad.filter(id=>ctx.players.get(id)!.type===2);
  const first=defenders[0],second=defenders[1];
  const remaining=ctx.baseSquad.filter(id=>id!==first && id!==second);
  const modified={...ctx,bank0:1000,players:new Map(ctx.players)};
  // Freeze two full clubs with a defender leaving each. Either incoming alone
  // would breach the three-player quota; the simultaneous final squad is legal.
  for(const id of ctx.baseSquad) modified.players.set(id,{...ctx.players.get(id)!,team:10+ctx.baseSquad.indexOf(id)});
  for(const id of [first,...remaining.slice(0,2)]) modified.players.set(id,{...modified.players.get(id)!,team:1});
  for(const id of [second,...remaining.slice(2,4)]) modified.players.set(id,{...modified.players.get(id)!,team:2});
  const fakeA=999901,fakeB=999902;
  modified.players.set(fakeA,{...modified.players.get(first)!,id:fakeA,team:2});
  modified.players.set(fakeB,{...modified.players.get(second)!,id:fakeB,team:1});
  const batch=[{out:first,in:fakeA},{out:second,in:fakeB}];
  const state=replay(modified,{},ctx.gws[0]);
  assert.equal(validateTransfer(modified,state,first,fakeA),'Max 3 players from one club.');
  assert.equal(validateTransferBatch(modified,state,batch),null);
  assert.deepEqual(sanitize(modified,{[ctx.gws[0]]:batch})[ctx.gws[0]],batch);
  assert.ok(replay(modified,{[ctx.gws[0]]:batch},ctx.gws[0]).squad.includes(fakeB));
});
