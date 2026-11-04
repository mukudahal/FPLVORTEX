import { toRepoElement } from './analytics';
import { isOfficiallyUnflagged } from './transferEligibility';
import { makeFixtureForecasts, overallDifficulty, type FixtureForecast } from './fixtureForecast';
import { toRepoFixtures, toRepoTeams } from './fixtures';
import {
  applyChipToLineup,
  lineupAt,
  replay,
  sellOf,
  xpAt,
  type ChipMap,
  type LineupMap,
  type PlanCtx,
  type TransferMap,
} from './repoModel/planEngine';
import type { PlanPlayer, PlanTransfer } from './repoModel/planTypes';
import { MAX_FREE_TRANSFERS, MAX_PLAYERS_PER_CLUB, pointsHit, selectOptimalXI } from './repoModel/scoring';
import { computePlayerXPts, computePositionPriors } from './repoModel/xpts';
import type { EnrichedPlayer, EntryData, Position, Snapshot } from './types';

export const MAX_TRANSFER_PLAN_SLOTS = 10;

export interface StoredTransferPlan {
  id: string;
  name: string;
  startGw: number;
  baseSquad: number[];
  baseBankTenths: number;
  baseFreeTransfers: number;
  sellingPrices: Record<number, number>;
  transfers: TransferMap;
  lineups: LineupMap;
  captains: Record<number, { captain?: number; vice?: number }>;
  chips: ChipMap;
  /** Player IDs preserved during automatic replanning. */
  lockedPlayerIds?: number[];
  createdAt: string;
  updatedAt: string;
}

export interface VortexPlannerCache {
  gws: number[];
  xpByPlayerGw: Map<number, number[]>;
  forecasts: Map<string, FixtureForecast[]>;
  teamsById: Map<number, Snapshot['teams'][number]>;
  benchmarkOptimalXpByGw: Map<number, number>;
}

export interface NextFixtureBadgeData {
  gw: number;
  oppShort: string;
  oppName: string;
  oppCode: number | null;
  home: boolean;
  isBlank: boolean;
  isDouble: boolean;
  fdr: number | null;
  extraFixturesCount: number;
}

export function positionToTypeNum(pos: Position): 1 | 2 | 3 | 4 {
  if (pos === 'GKP') return 1;
  if (pos === 'DEF') return 2;
  if (pos === 'MID') return 3;
  return 4;
}

export function typeNumToPosition(type: number): Position {
  if (type === 1) return 'GKP';
  if (type === 2) return 'DEF';
  if (type === 3) return 'MID';
  return 'FWD';
}

export function transferPlansStorageKey(entryId?: number | null): string {
  return `vortex:transferPlans:v1:${entryId ? String(entryId) : 'template'}`;
}

/** Plan selection is scoped to the FPL entry; '__live__' explicitly opts out. */
export function selectedTransferPlanStorageKey(entryId?: number | null): string {
  return `vortex:selectedTransferPlan:v1:${entryId ? String(entryId) : 'template'}`;
}

export function readSelectedTransferPlanId(storage: Pick<Storage, 'getItem'> | null | undefined, entryId?: number | null): string | null {
  try { return storage?.getItem(selectedTransferPlanStorageKey(entryId)) ?? null; } catch { return null; }
}

export function writeSelectedTransferPlanId(storage: Pick<Storage, 'setItem'> | null | undefined, entryId: number | null | undefined, id: string): void {
  try { storage?.setItem(selectedTransferPlanStorageKey(entryId), id); } catch { /* Storage is optional. */ }
}

function isIntArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((n) => typeof n === 'number' && Number.isInteger(n) && n > 0);
}

export function sanitizeStoredPlan(raw: unknown): StoredTransferPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id.trim()) return null;
  if (typeof obj.name !== 'string') return null;
  if (typeof obj.startGw !== 'number' || !Number.isInteger(obj.startGw) || obj.startGw < 1 || obj.startGw > 38) return null;
  if (!isIntArray(obj.baseSquad) || obj.baseSquad.length !== 15 || new Set(obj.baseSquad).size !== 15) return null;

  const baseBankTenths =
    typeof obj.baseBankTenths === 'number' && Number.isFinite(obj.baseBankTenths)
      ? Math.max(0, Math.round(obj.baseBankTenths))
      : 0;
  const baseFreeTransfers =
    typeof obj.baseFreeTransfers === 'number' && Number.isFinite(obj.baseFreeTransfers)
      ? Math.max(0, Math.min(MAX_FREE_TRANSFERS, Math.round(obj.baseFreeTransfers)))
      : 1;

  const sellingPrices: Record<number, number> = {};
  if (obj.sellingPrices && typeof obj.sellingPrices === 'object') {
    for (const [k, v] of Object.entries(obj.sellingPrices as Record<string, unknown>)) {
      const id = Number(k);
      if (Number.isInteger(id) && id > 0 && typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        sellingPrices[id] = Math.round(v);
      }
    }
  }

  const transfers: TransferMap = {};
  if (obj.transfers && typeof obj.transfers === 'object') {
    for (const [gwStr, list] of Object.entries(obj.transfers as Record<string, unknown>)) {
      const gw = Number(gwStr);
      if (!Number.isInteger(gw) || gw < 1 || gw > 38 || !Array.isArray(list)) continue;
      const validMoves: PlanTransfer[] = [];
      for (const item of list) {
        if (item && typeof item === 'object') {
          const m = item as Record<string, unknown>;
          if (typeof m.out === 'number' && Number.isInteger(m.out) && typeof m.in === 'number' && Number.isInteger(m.in)) {
            validMoves.push({ out: m.out, in: m.in });
          }
        }
      }
      if (validMoves.length > 0) transfers[gw] = validMoves;
    }
  }

  const lineups: LineupMap = {};
  if (obj.lineups && typeof obj.lineups === 'object') {
    for (const [gwStr, arr] of Object.entries(obj.lineups as Record<string, unknown>)) {
      const gw = Number(gwStr);
      if (Number.isInteger(gw) && gw >= 1 && gw <= 38 && isIntArray(arr) && arr.length === 15) {
        lineups[gw] = [...arr];
      }
    }
  }

  const captains: Record<number, { captain?: number; vice?: number }> = {};
  if (obj.captains && typeof obj.captains === 'object') {
    for (const [gwStr, capObj] of Object.entries(obj.captains as Record<string, unknown>)) {
      const gw = Number(gwStr);
      if (!Number.isInteger(gw) || gw < 1 || gw > 38 || !capObj || typeof capObj !== 'object') continue;
      const rec = capObj as Record<string, unknown>;
      const captain = typeof rec.captain === 'number' && Number.isInteger(rec.captain) ? rec.captain : undefined;
      const vice = typeof rec.vice === 'number' && Number.isInteger(rec.vice) ? rec.vice : undefined;
      if (captain !== undefined || vice !== undefined) {
        captains[gw] = { captain, vice };
      }
    }
  }

  const chips: ChipMap = {};
  if (obj.chips && typeof obj.chips === 'object') {
    for (const [gwStr, c] of Object.entries(obj.chips as Record<string, unknown>)) {
      const gw = Number(gwStr);
      if (Number.isInteger(gw) && gw >= 1 && gw <= 38 && (c === 'wc' || c === 'fh' || c === 'bb' || c === 'tc')) {
        chips[gw] = c;
      }
    }
  }

  const nowIso = new Date().toISOString();
  return {
    id: obj.id,
    name: obj.name.trim() || `Transfer Plan (GW${obj.startGw}+)`,
    startGw: obj.startGw,
    baseSquad: [...obj.baseSquad],
    baseBankTenths,
    baseFreeTransfers,
    sellingPrices,
    transfers,
    lineups,
    captains,
    chips,
    lockedPlayerIds: isIntArray(obj.lockedPlayerIds) ? [...new Set(obj.lockedPlayerIds)].filter(id => (obj.baseSquad as number[]).includes(id)) : [],
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : nowIso,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : nowIso,
  };
}

export function readStoredTransferPlans(storage: Pick<Storage, 'getItem'> | null | undefined, entryId?: number | null): StoredTransferPlan[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(transferPlansStorageKey(entryId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeStoredPlan)
      .filter((item): item is StoredTransferPlan => item !== null)
      .slice(0, MAX_TRANSFER_PLAN_SLOTS);
  } catch {
    return [];
  }
}

export function writeStoredTransferPlans(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  entryId: number | null | undefined,
  plans: readonly StoredTransferPlan[],
): void {
  if (!storage) return;
  try {
    storage.setItem(transferPlansStorageKey(entryId), JSON.stringify(plans.slice(0, MAX_TRANSFER_PLAN_SLOTS)));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function upsertTransferPlan(
  existing: readonly StoredTransferPlan[],
  plan: StoredTransferPlan,
): { ok: true; plans: StoredTransferPlan[] } | { ok: false; error: string } {
  const idx = existing.findIndex((p) => p.id === plan.id);
  const updated: StoredTransferPlan = { ...plan, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    const next = [...existing];
    next[idx] = updated;
    return { ok: true, plans: next };
  }
  if (existing.length >= MAX_TRANSFER_PLAN_SLOTS) {
    return { ok: false, error: `Maximum of ${MAX_TRANSFER_PLAN_SLOTS} plan slots used. Delete a plan to create a new one.` };
  }
  return { ok: true, plans: [...existing, updated] };
}

export function deleteTransferPlan(existing: readonly StoredTransferPlan[], planId: string): StoredTransferPlan[] {
  return existing.filter((p) => p.id !== planId);
}

export function createNewTransferPlan(params: {
  snapshot: Snapshot;
  players: readonly EnrichedPlayer[];
  fallbackSquadIds: readonly number[];
  entry?: EntryData | null;
  existingPlansCount?: number;
  defaultFreeTransfers?: number;
}): StoredTransferPlan {
  const { snapshot, players, fallbackSquadIds, entry, existingPlansCount = 0, defaultFreeTransfers = 2 } = params;
  const startGw = Math.max(1, Math.min(38, snapshot.meta.nextEventId));
  const playerMap = new Map(players.map((p) => [p.id, p]));

  let baseSquad: number[];
  let initialLineup: number[] | undefined;
  let initialCaptain: { captain?: number; vice?: number } | undefined;
  const sellingPrices: Record<number, number> = {};

  if (entry && entry.picks.length === 15 && entry.picks.every((pk) => playerMap.has(pk.element))) {
    const sortedPicks = [...entry.picks].sort((a, b) => a.position - b.position);
    baseSquad = sortedPicks.map((pk) => pk.element);
    initialLineup = [...baseSquad];
    const capPick = sortedPicks.find((pk) => pk.isCaptain);
    const vicePick = sortedPicks.find((pk) => pk.isViceCaptain);
    initialCaptain = { captain: capPick?.element, vice: vicePick?.element };
    for (const pk of sortedPicks) {
      const p = playerMap.get(pk.element);
      const sellTenths =
        typeof pk.sellingPrice === 'number' && Number.isFinite(pk.sellingPrice)
          ? Math.round(pk.sellingPrice * 10)
          : p?.cost ?? 0;
      sellingPrices[pk.element] = sellTenths;
    }
  } else {
    const validFallback = fallbackSquadIds.filter((id) => playerMap.has(id));
    baseSquad = validFallback.length === 15 ? [...validFallback] : players.slice(0, 15).map((p) => p.id);
    for (const id of baseSquad) {
      sellingPrices[id] = playerMap.get(id)?.cost ?? 45;
    }
    if (baseSquad.length === 15) {
      const optimal = selectOptimalXI(
        baseSquad,
        (id) => positionToTypeNum(playerMap.get(id)?.position ?? 'MID'),
        (id) => playerMap.get(id)?.gwProjections?.[startGw] ?? playerMap.get(id)?.projection ?? 0,
      );
      initialLineup = [...optimal.starters, ...optimal.bench];
      initialCaptain = { captain: optimal.captain, vice: optimal.vice };
    }
  }

  const baseBankTenths = entry ? Math.max(0, Math.round(entry.history.bank)) : Math.max(0, 1000 - baseSquad.reduce((s, id) => s + (playerMap.get(id)?.cost ?? 0), 0));
  const baseFreeTransfers = Math.max(
    0,
    Math.min(MAX_FREE_TRANSFERS, Math.round(entry?.freeTransfers ?? defaultFreeTransfers)),
  );

  const nowIso = new Date().toISOString();
  const suffix = existingPlansCount > 0 ? ` #${existingPlansCount + 1}` : '';
  const id = `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    name: `Transfer Plan${suffix} (GW${startGw}+)`,
    startGw,
    baseSquad,
    baseBankTenths,
    baseFreeTransfers,
    sellingPrices,
    transfers: {},
    lineups: initialLineup ? { [startGw]: initialLineup } : {},
    captains: initialCaptain ? { [startGw]: initialCaptain } : {},
    chips: {},
    lockedPlayerIds: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Build shared VORTEX model xPts + FDR forecasts across all remaining gameweeks. */
export function buildVortexPlannerCache(snapshot: Snapshot, players: readonly EnrichedPlayer[]): VortexPlannerCache {
  const firstGw = Math.max(1, Math.min(38, snapshot.meta.nextEventId));
  const gws = Array.from({ length: Math.max(1, 39 - firstGw) }, (_, i) => firstGw + i);
  const repoFixtures = toRepoFixtures(snapshot.fixtures);
  const repoTeamsMap = new Map(toRepoTeams(snapshot.teams).map((t) => [t.id, t]));
  const priors = computePositionPriors(snapshot.players.map(toRepoElement));
  const completed = Math.max(1, snapshot.gameweeks.filter((gw) => gw.finished).length);

  const xpByPlayerGw = new Map<number, number[]>();
  const playerTypeMap = new Map<number, 1 | 2 | 3 | 4>();
  for (const p of players) {
    const el = toRepoElement(p);
    playerTypeMap.set(p.id, positionToTypeNum(p.position));
    const arr = gws.map((gw, idx) => {
      const precomputed = p.gwProjections?.[gw];
      const breakdown = computePlayerXPts(el, gw, repoFixtures, repoTeamsMap, completed, idx, priors);
      // Match the Solver and simulation forecast policy exactly: blanks override imported values.
      if (breakdown.fixtureCount === 0) return 0;
      return isOfficiallyUnflagged(p) && typeof precomputed === 'number' && Number.isFinite(precomputed)
        ? Math.max(0, precomputed)
        : Math.max(0, breakdown.xPts);
    });
    xpByPlayerGw.set(p.id, arr);
  }

  const forecasts = makeFixtureForecasts(snapshot, 'vortex', gws);
  const teamsById = new Map(snapshot.teams.map((t) => [t.id, t]));

  // Compute unconstrained optimal XI xPts benchmark per GW so XP / RATING % is grounded in VORTEX
  const benchmarkOptimalXpByGw = new Map<number, number>();
  gws.forEach((gw, idx) => {
    const topPool: number[] = [];
    for (const posType of [1, 2, 3, 4] as const) {
      const topForPos = players
        .filter((p) => positionToTypeNum(p.position) === posType && isOfficiallyUnflagged(p))
        .sort((a, b) => (xpByPlayerGw.get(b.id)?.[idx] ?? 0) - (xpByPlayerGw.get(a.id)?.[idx] ?? 0))
        .slice(0, posType === 1 ? 2 : 5)
        .map((p) => p.id);
      topPool.push(...topForPos);
    }
    if (topPool.length >= 11) {
      const best = selectOptimalXI(
        topPool,
        (id) => playerTypeMap.get(id) ?? 3,
        (id) => xpByPlayerGw.get(id)?.[idx] ?? 0,
      );
      benchmarkOptimalXpByGw.set(gw, Math.max(1, best.total));
    } else {
      benchmarkOptimalXpByGw.set(gw, 65);
    }
  });

  return { gws, xpByPlayerGw, forecasts, teamsById, benchmarkOptimalXpByGw };
}

export function buildPlanCtxFromCache(
  plan: StoredTransferPlan,
  players: readonly EnrichedPlayer[],
  cache: VortexPlannerCache,
): PlanCtx {
  const startIdx = Math.max(0, cache.gws.indexOf(plan.startGw));
  const planGws = cache.gws.slice(startIdx);
  const planPlayers = new Map<number, PlanPlayer>();

  for (const p of players) {
    const fullXp = cache.xpByPlayerGw.get(p.id) ?? [];
    planPlayers.set(p.id, {
      id: p.id,
      code: p.code,
      name: p.name,
      team: p.teamId,
      type: positionToTypeNum(p.position),
      cost: p.cost,
      status: p.status,
      news: p.news,
      chance: p.chance,
      owned: p.ownership,
      form: p.form,
      net: p.transfersInEvent - p.transfersOutEvent,
      pen: p.penaltiesOrder,
      fk: p.freekicksOrder,
      ck: p.cornersOrder,
      xp: fullXp.slice(startIdx),
    });
  }

  return {
    players: planPlayers,
    gws: planGws,
    baseSquad: [...plan.baseSquad],
    bank0: plan.baseBankTenths,
    sell0: { ...plan.sellingPrices },
    freeNow: plan.baseFreeTransfers,
  };
}

/** Collapse chained swaps within a single GW (A->B then B->C becomes A->C; A->B then B->A cancels). */
export function collapseGwTransfers(existing: readonly PlanTransfer[], outId: number, inId: number): PlanTransfer[] {
  if (outId === inId) return [...existing];
  const chainIdx = existing.findIndex((t) => t.in === outId);
  if (chainIdx >= 0) {
    const origOut = existing[chainIdx].out;
    if (origOut === inId) {
      return existing.filter((_, i) => i !== chainIdx);
    }
    return existing.map((t, i) => (i === chainIdx ? { out: origOut, in: inId } : t));
  }
  return [...existing.filter((t) => t.out !== outId), { out: outId, in: inId }];
}

export interface PendingSquadMetrics {
  transfersUsed: number;
  freeTransfers: number;
  hitCost: number;
  effectiveBankTenths: number;
  projectedGwXp: number;
  ratingPct: number;
}

/**
 * Computes live top-bar KPI metrics for the selected GW, immediately accounting for
 * any players clicked on the pitch into the pending "+ / Replace" state (Image 3).
 */
export function computeLiveGwMetrics(params: {
  ctx: PlanCtx;
  plan: StoredTransferPlan;
  gw: number;
  pendingOutIds: readonly number[];
  benchmarkXp: number;
}): PendingSquadMetrics {
  const { ctx, plan, gw, pendingOutIds, benchmarkXp } = params;
  const idx = Math.max(0, ctx.gws.indexOf(gw));
  const state = replay(ctx, plan.transfers, gw, plan.chips);
  const ledgerRow = state.ledger[state.ledger.length - 1];
  const chip = plan.chips[gw];
  const freeChip = chip === 'wc' || chip === 'fh';

  const committedCount = ledgerRow?.n ?? 0;
  const ftBefore = ledgerRow?.ftBefore ?? plan.baseFreeTransfers;
  const validPending = pendingOutIds.filter((id) => state.squad.includes(id));

  const transfersUsed = committedCount + validPending.length;
  const hitCost = pointsHit(transfersUsed, ftBefore, freeChip);

  const pendingSalesTenths = validPending.reduce((sum, outId) => sum + sellOf(ctx, state, outId), 0);
  const effectiveBankTenths = state.bank + pendingSalesTenths;

  const baseLineup = lineupAt(ctx, state.squad, idx, plan.lineups[gw]);
  const manualCap = plan.captains[gw];
  const captainId =
    manualCap?.captain && baseLineup.starters.includes(manualCap.captain)
      ? manualCap.captain
      : baseLineup.captain;
  const viceId =
    manualCap?.vice && baseLineup.starters.includes(manualCap.vice) && manualCap.vice !== captainId
      ? manualCap.vice
      : baseLineup.vice;

  const pendingSet = new Set(validPending);
  const activeStarters = baseLineup.starters.filter((id) => !pendingSet.has(id));
  const activeBench = baseLineup.bench.filter((id) => !pendingSet.has(id));

  const xiSum = activeStarters.reduce((sum, id) => sum + xpAt(ctx, id, idx), 0);
  const effectiveCap =
    captainId && !pendingSet.has(captainId)
      ? captainId
      : viceId && !pendingSet.has(viceId)
        ? viceId
        : undefined;
  const capXp = effectiveCap !== undefined ? xpAt(ctx, effectiveCap, idx) : 0;

  const withChip = applyChipToLineup(
    {
      ...baseLineup,
      starters: activeStarters,
      bench: activeBench,
      captain: effectiveCap,
      vice: viceId,
      xi: xiSum,
      capXp,
      total: xiSum + capXp,
    },
    chip,
    ctx,
    idx,
  );

  const projectedGwXp = withChip.total;
  const ratingPct = Math.min(99, Math.max(0, Math.round((projectedGwXp / Math.max(1, benchmarkXp)) * 100)));

  return {
    transfersUsed,
    freeTransfers: ftBefore,
    hitCost,
    effectiveBankTenths,
    projectedGwXp,
    ratingPct,
  };
}

/** Validate bringing `inId` into the squad to replace `outId` when `pendingOutIds` are currently removed. */
export function validatePendingReplacement(params: {
  ctx: PlanCtx;
  stateSquad: readonly number[];
  effectiveBankTenths: number;
  pendingOutIds: readonly number[];
  outId: number;
  inId: number;
}): string | null {
  const { ctx, stateSquad, effectiveBankTenths, pendingOutIds, outId, inId } = params;
  if (outId === inId) return null; // Restoring the same outgoing player is always valid
  const outP = ctx.players.get(outId);
  const inP = ctx.players.get(inId);
  if (!outP || !inP) return 'Unknown player.';
  if (outP.type !== inP.type) return 'Replacement must play the same position.';
  const pendingSet = new Set(pendingOutIds);
  const remainingSquad = stateSquad.filter((id) => !pendingSet.has(id));
  if (remainingSquad.includes(inId)) return `${inP.name} is already in your squad.`;

  const clubCount = remainingSquad.reduce(
    (count, id) => count + (ctx.players.get(id)?.team === inP.team ? 1 : 0),
    0,
  );
  if (clubCount >= MAX_PLAYERS_PER_CLUB) {
    return `Maximum ${MAX_PLAYERS_PER_CLUB} players per club.`;
  }

  // Reserve minimum 4.0m (40 tenths) per other open slot if multiple slots are open simultaneously
  const otherOpenSlots = Math.max(0, pendingSet.size - 1);
  const minReserveTenths = otherOpenSlots * 38;
  if (effectiveBankTenths - inP.cost < 0) {
    return `Over budget by £${((inP.cost - effectiveBankTenths) / 10).toFixed(1)}m.`;
  }
  if (otherOpenSlots > 0 && effectiveBankTenths - inP.cost < minReserveTenths) {
    return `Leaves £${((effectiveBankTenths - inP.cost) / 10).toFixed(1)}m for ${otherOpenSlots} remaining empty slot(s).`;
  }
  return null;
}

/** Returns the next `count` GW fixture badges + average VORTEX FDR from `fromGw`. */
export function getNextFixturesWithVortexFdr(
  cache: VortexPlannerCache,
  teamId: number,
  fromGw: number,
  count = 5,
): { items: NextFixtureBadgeData[]; avgFdr: number | null } {
  const gws = Array.from({ length: count }, (_, i) => fromGw + i).filter((gw) => gw <= 38);
  const ratedValues: number[] = [];

  const items: NextFixtureBadgeData[] = gws.map((gw) => {
    const fxs = cache.forecasts.get(`${teamId}:${gw}`) ?? [];
    if (fxs.length === 0) {
      return {
        gw,
        oppShort: '—',
        oppName: 'Blank',
        oppCode: null,
        home: true,
        isBlank: true,
        isDouble: false,
        fdr: null,
        extraFixturesCount: 0,
      };
    }
    const primary = fxs[0];
    const avgGwFdr = fxs.reduce((sum, f) => sum + overallDifficulty(f), 0) / fxs.length;
    for (const f of fxs) ratedValues.push(overallDifficulty(f));
    return {
      gw,
      oppShort: primary.opponent.shortName,
      oppName: primary.opponent.name,
      oppCode: primary.opponent.code,
      home: primary.home,
      isBlank: false,
      isDouble: fxs.length > 1,
      fdr: avgGwFdr,
      extraFixturesCount: fxs.length - 1,
    };
  });

  const avgFdr = ratedValues.length > 0 ? ratedValues.reduce((s, v) => s + v, 0) / ratedValues.length : null;
  return { items, avgFdr };
}

