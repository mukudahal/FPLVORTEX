import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  DataSource,
  EntryData,
  EntryHistory,
  EntryPick,
  LeagueData,
  Snapshot,
} from '../src/lib/types.ts';
import { clamp, numberValue } from '../src/lib/format.ts';
import {
  computeDynamicFreeTransfers,
  resolveSquadPurchaseAndSellingPrices,
  type RawEntryHistoryPayload,
} from '../src/lib/freeTransfers.ts';
import { enrichPlayers } from '../src/lib/analytics.ts';
import { optimizeSquad } from '../src/lib/optimize.ts';
import { fetchFplJson, UpstreamHttpError } from './http.ts';
import { normalizeSnapshot, type RawFplData } from './normalize.ts';
import { enrichFixturesWithLiveOdds } from './odds.ts';
import {
  CONFIGURED_REPO_ENTRY_ID,
  CONFIGURED_REPO_ENTRY_NAME,
  enrichSnapshotWithRepoData,
  REPO_SEASON_RULES_2026_27,
} from './repoData.ts';

type RawRecord = Record<string, any>;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  updatedAt: string;
}

interface OfflineLeagueFallback {
  entries?: Record<string, { root: RawRecord; picks: RawRecord; history?: RawEntryHistoryPayload | null }>;
  leagues?: Record<string, RawRecord>;
}

const cache = new Map<string, CacheEntry<unknown>>();
let lastGoodSnapshot: Snapshot | null = null;
let snapshotInFlight: Promise<Snapshot> | null = null;
let offlineLeagueFallbackCache: OfflineLeagueFallback | null = null;

const SNAPSHOT_PATH = process.env.VORTEX_SNAPSHOT_PATH ?? 'public/data/fpl-snapshot.json';
const LEAGUE_FALLBACK_PATH = process.env.VORTEX_LEAGUE_FALLBACK_PATH ?? 'public/data/fpl-league-fallback.json';
const STATIC_TTL = (Number.parseInt(process.env.FPL_CACHE_STATIC_SECONDS ?? '600', 10) || 600) * 1000;
const LIVE_TTL = (Number.parseInt(process.env.FPL_CACHE_LIVE_SECONDS ?? '45', 10) || 45) * 1000;
const PROFILE_TTL = (Number.parseInt(process.env.FPL_CACHE_PROFILE_SECONDS ?? '180', 10) || 180) * 1000;
const MIRROR_FRESH_MS = (Number.parseInt(process.env.VORTEX_MIRROR_FRESH_MINUTES ?? '180', 10) || 180) * 60_000;

function readCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.value;
}

function writeCache<T>(key: string, value: T, ttlMs: number): T {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs, updatedAt: new Date().toISOString() });
  return value;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * A snapshot mirrored from a published deployment (`scripts/mirror-upstream.ts`) is already
 * upstream-enriched (official FPL payload + bookmaker odds). While it is still inside the
 * freshness window we serve it as healthy cached data instead of flagging an offline fallback.
 */
function mirroredSnapshotState(raw: Snapshot): { source: DataSource; upstreamOk: boolean; stale: boolean } {
  const generatedAt = Date.parse(raw.meta.generatedAt ?? '');
  const fresh = Boolean(raw.meta.mirroredFrom) && Number.isFinite(generatedAt) && Date.now() - generatedAt < MIRROR_FRESH_MS;
  return fresh ? { source: 'cache', upstreamOk: true, stale: false } : { source: 'snapshot', upstreamOk: false, stale: true };
}

async function loadOfflineSnapshot(): Promise<Snapshot> {
  const file = path.resolve(process.cwd(), SNAPSHOT_PATH);
  const raw = JSON.parse(await readFile(file, 'utf8')) as Snapshot;
  const mirroredState = mirroredSnapshotState(raw);
  const markedOffline: Snapshot = {
    ...raw,
    meta: {
      ...raw.meta,
      source: mirroredState.source,
      servedAt: new Date().toISOString(),
      upstreamOk: mirroredState.upstreamOk,
      stale: mirroredState.stale,
      refreshSeconds: 120,
    },
  };
  const enrichedRepo = await enrichSnapshotWithRepoData(markedOffline);
  const { fixtures: oddsFixtures, oddsMeta } = await enrichFixturesWithLiveOdds(
    enrichedRepo.teams,
    enrichedRepo.fixtures,
    enrichedRepo.meta.nextEventId,
    false,
  );
  return {
    ...enrichedRepo,
    fixtures: oddsFixtures,
    meta: {
      ...enrichedRepo.meta,
      oddsMeta,
    },
  };
}

async function loadOfflineLeagueFallback(): Promise<OfflineLeagueFallback> {
  if (offlineLeagueFallbackCache) return offlineLeagueFallbackCache;
  try {
    const file = path.resolve(process.cwd(), LEAGUE_FALLBACK_PATH);
    offlineLeagueFallbackCache = JSON.parse(await readFile(file, 'utf8')) as OfflineLeagueFallback;
    return offlineLeagueFallbackCache;
  } catch {
    return { entries: {}, leagues: {} };
  }
}

function currentEventFromBootstrap(bootstrap: RawRecord): number {
  const events = Array.isArray(bootstrap.events) ? bootstrap.events : [];
  const current = events.find((event: RawRecord) => event.is_current) ?? events.find((event: RawRecord) => !event.finished);
  return numberValue(current?.id, numberValue(events.at(-1)?.id, 1));
}

async function fetchRawSnapshot(): Promise<RawFplData> {
  const [bootstrap, fixtures] = await Promise.all([
    fetchFplJson<RawRecord>('/bootstrap-static/', { retries: 1 }),
    fetchFplJson<RawRecord[]>('/fixtures/', { retries: 1 }),
  ]);
  const eventId = currentEventFromBootstrap(bootstrap);
  let live: RawRecord | null = null;
  try {
    live = await fetchFplJson<RawRecord>(`/event/${eventId}/live/`, { retries: 1, timeoutMs: 5000 });
  } catch {
    // Live points are an enhancement; bootstrap and fixtures are enough to run the model.
  }
  return { bootstrap, fixtures, live };
}

function markSnapshot(snapshot: Snapshot, source: DataSource, stale: boolean, upstreamOk: boolean): Snapshot {
  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      source,
      servedAt: new Date().toISOString(),
      stale,
      upstreamOk,
      refreshSeconds: stale ? 120 : snapshot.meta.refreshSeconds,
    },
  };
}

export async function getSnapshot(force = false): Promise<Snapshot> {
  const cacheKey = 'snapshot';
  if (!force) {
    const cached = readCache<Snapshot>(cacheKey);
    if (cached) return markSnapshot(cached, cached.meta.source === 'snapshot' ? 'snapshot' : 'cache', cached.meta.stale, cached.meta.upstreamOk);
  }
  if (snapshotInFlight) return snapshotInFlight;
  snapshotInFlight = (async () => {
    try {
      const raw = await fetchRawSnapshot();
      const normalized = normalizeSnapshot(raw, { source: 'live', upstreamOk: true, stale: false });
      const repoEnriched = await enrichSnapshotWithRepoData(normalized);
      const { fixtures: oddsFixtures, oddsMeta } = await enrichFixturesWithLiveOdds(
        repoEnriched.teams,
        repoEnriched.fixtures,
        repoEnriched.meta.nextEventId,
        force,
      );
      const fresh: Snapshot = {
        ...repoEnriched,
        fixtures: oddsFixtures,
        meta: {
          ...repoEnriched.meta,
          oddsMeta,
        },
      };
      lastGoodSnapshot = fresh;
      const ttl = fresh.meta.isLive ? LIVE_TTL : STATIC_TTL;
      writeCache(cacheKey, fresh, ttl);
      return fresh;
    } catch (error) {
      console.warn('[fpl] live refresh failed:', error instanceof Error ? error.message : error);
      const fallback = lastGoodSnapshot ? markSnapshot(lastGoodSnapshot, 'cache', true, false) : await loadOfflineSnapshot();
      writeCache(cacheKey, fallback, 120_000);
      return fallback;
    } finally {
      snapshotInFlight = null;
    }
  })();
  return snapshotInFlight;
}

function normalizeEntry(
  root: RawRecord,
  picks: RawRecord,
  snapshot: Snapshot,
  enriched: ReturnType<typeof enrichPlayers>,
  source: DataSource,
  historyPayload?: RawEntryHistoryPayload | null,
  postLockTransfersUsed = 0,
  latestTransferInCostByElement?: Map<number, number>,
): EntryData {
  const history: EntryHistory = {
    event: numberValue(picks.entry_history?.event, snapshot.meta.currentEventId),
    points: numberValue(picks.entry_history?.points),
    totalPoints: numberValue(picks.entry_history?.total_points),
    rank: numberValue(picks.entry_history?.rank),
    overallRank: numberValue(picks.entry_history?.overall_rank),
    bank: numberValue(picks.entry_history?.bank),
    value: numberValue(picks.entry_history?.value),
    eventTransfers: numberValue(picks.entry_history?.event_transfers),
    eventTransfersCost: numberValue(picks.entry_history?.event_transfers_cost),
    pointsOnBench: numberValue(picks.entry_history?.points_on_bench),
  };
  const playerIndex = new Map(enriched.map((player) => [player.id, player]));
  const normalizedPicks: EntryPick[] = (Array.isArray(picks.picks) ? picks.picks : []).map((pick: RawRecord) => {
    const element = numberValue(pick.element);
    const matchedPlayer = playerIndex.get(element);
    const prices = matchedPlayer
      ? resolveSquadPurchaseAndSellingPrices(
          matchedPlayer,
          pick.purchase_price,
          pick.selling_price,
          latestTransferInCostByElement?.get(element),
        )
      : undefined;
    return {
      element,
      position: numberValue(pick.position),
      multiplier: numberValue(pick.multiplier),
      isCaptain: Boolean(pick.is_captain),
      isViceCaptain: Boolean(pick.is_vice_captain),
      ...(prices ?? {}),
    };
  });
  const players = normalizedPicks
    .map((pick) => playerIndex.get(pick.element))
    .filter((player): player is (typeof enriched)[number] => Boolean(player));
  const projectedPoints = normalizedPicks.reduce((sum, pick) => {
    const player = playerIndex.get(pick.element);
    if (!player) return sum;
    const multiplier = pick.isCaptain ? 2 : pick.multiplier > 0 ? 1 : 0;
    return sum + player.projection * multiplier;
  }, 0);
  const startedEvent = numberValue(root.started_event, 1);
  const activeChip = picks.active_chip ? stringValue(picks.active_chip) : null;
  const freeTransfers = computeDynamicFreeTransfers({
    startedEvent,
    explicitFreeTransfers: root.free_transfers,
    historyPayload,
    singleGwEventTransfers: history.eventTransfers,
    singleGwActiveChip: activeChip,
    postLockTransfersUsed,
  });
  return {
    id: numberValue(root.id),
    name: `${stringValue(root.player_first_name)} ${stringValue(root.player_last_name)}`.trim(),
    teamName: stringValue(root.name, CONFIGURED_REPO_ENTRY_NAME),
    region: stringValue(root.player_region_name, 'Worldwide'),
    startedEvent,
    favouriteTeamId: root.favourite_team === null || root.favourite_team === undefined ? null : numberValue(root.favourite_team),
    overallRank: root.summary_overall_rank === null ? null : numberValue(root.summary_overall_rank),
    overallPoints: root.summary_overall_points === null ? null : numberValue(root.summary_overall_points),
    freeTransfers,
    currentEvent: history.event,
    activeChip,
    history,
    picks: normalizedPicks,
    players,
    projectedPoints: Math.round(projectedPoints * 10) / 10,
    squadValue: history.value / 10,
    source,
    generatedAt: new Date().toISOString(),
  };
}

function buildOfflineSyntheticEntry(
  numericId: number,
  snapshot: Snapshot,
  enriched: ReturnType<typeof enrichPlayers>,
): EntryData {
  const isRepoManager = CONFIGURED_REPO_ENTRY_ID !== null && numericId === CONFIGURED_REPO_ENTRY_ID;
  const profiles = ['balanced', 'safe', 'differential', 'upside'] as const;
  const profile = isRepoManager ? 'balanced' : profiles[numericId % profiles.length];
  const optimized = optimizeSquad(enriched, { budget: 1000, profile });
  const ordered = [...optimized.starters, ...optimized.bench];
  const picks: EntryPick[] = ordered.map((player, index) => {
    const prices = resolveSquadPurchaseAndSellingPrices(player);
    return {
      element: player.id,
      position: index + 1,
      multiplier: player.isCaptain ? 2 : index < 11 ? 1 : 0,
      isCaptain: player.isCaptain,
      isViceCaptain: player.isViceCaptain,
      purchasePrice: prices.purchasePrice,
      sellingPrice: prices.sellingPrice,
    };
  });
  const eventPoints = ordered.reduce((sum, player, index) => {
    const mult = player.isCaptain ? 2 : index < 11 ? 1 : 0;
    return sum + player.eventPoints * mult;
  }, 0);
  const benchPoints = optimized.bench.reduce((sum, player) => sum + player.eventPoints, 0);
  const valueTenths = Math.round(optimized.cost * 10);
  const bankTenths = Math.max(0, 1000 - valueTenths);
  const totalPoints = Math.max(eventPoints, Math.round(eventPoints * Math.max(1, snapshot.meta.currentEventId * 0.72)));
  const overallRank = isRepoManager ? 237000 : 45000 + ((numericId * 7919) % 420000);
  return {
    id: numericId,
    name: isRepoManager ? 'Muku Dahal' : `Manager #${numericId}`,
    teamName: isRepoManager ? CONFIGURED_REPO_ENTRY_NAME : `Offline Squad #${numericId}`,
    region: 'Offline snapshot',
    startedEvent: 1,
    favouriteTeamId: 1,
    overallRank,
    overallPoints: totalPoints,
    freeTransfers: computeDynamicFreeTransfers({ startedEvent: 1, singleGwEventTransfers: 0 }),
    currentEvent: snapshot.meta.currentEventId,
    activeChip: null,
    history: {
      event: snapshot.meta.currentEventId,
      points: eventPoints,
      totalPoints,
      rank: Math.max(1000, Math.round(overallRank * 0.85)),
      overallRank,
      bank: bankTenths,
      value: valueTenths,
      eventTransfers: 0,
      eventTransfersCost: 0,
      pointsOnBench: benchPoints,
    },
    picks,
    players: ordered,
    projectedPoints: optimized.projectedPoints,
    squadValue: optimized.cost,
    source: 'snapshot',
    generatedAt: new Date().toISOString(),
  };
}

function normalizeLeaguePayload(raw: RawRecord, id: string, source: DataSource): LeagueData {
  return {
    id: numberValue(raw.league?.id, numberValue(id)),
    name: stringValue(raw.league?.name, `League ${id}`),
    created: raw.league?.created ? stringValue(raw.league.created) : null,
    closed: Boolean(raw.league?.closed),
    standings: (Array.isArray(raw.standings?.results) ? raw.standings.results : []).map((row: RawRecord) => ({
      rank: numberValue(row.rank),
      lastRank: numberValue(row.last_rank),
      entry: numberValue(row.entry),
      playerName: stringValue(row.player_name),
      entryName: stringValue(row.entry_name),
      eventTotal: numberValue(row.event_total),
      total: numberValue(row.total),
    })),
    source,
    generatedAt: new Date().toISOString(),
  };
}

export interface GetEntryOptions {
  force?: boolean;
  gameweek?: number;
}

export async function getEntry(id: string, options?: GetEntryOptions): Promise<EntryData> {
  const requestedGw =
    options?.gameweek && Number.isFinite(options.gameweek) && options.gameweek >= 1 && options.gameweek <= 38
      ? Math.round(options.gameweek)
      : undefined;
  const cacheKey = requestedGw ? `entry:${id}:gw:${requestedGw}` : `entry:${id}`;
  if (!options?.force) {
    const cached = readCache<EntryData>(cacheKey);
    if (cached) {
      return {
        ...cached,
        source: cached.source === 'snapshot' ? 'snapshot' : 'cache',
        generatedAt: new Date().toISOString(),
      };
    }
  }
  const snapshot = await getSnapshot(Boolean(options?.force));
  const enriched = enrichPlayers(snapshot, 'balanced');
  try {
    const root = await fetchFplJson<RawRecord>(`/entry/${id}/`, { retries: 1 });
    const latestLockedGw = clamp(
      numberValue(root.current_event, snapshot.meta.currentEventId),
      1,
      38,
    );
    const targetGw = requestedGw ? Math.min(requestedGw, latestLockedGw) : latestLockedGw;
    const [picks, rawTransfers, entryHistory] = await Promise.all([
      fetchFplJson<RawRecord>(`/entry/${id}/event/${targetGw}/picks/`, { retries: 1 }),
      fetchFplJson<RawRecord[]>(`/entry/${id}/transfers/`, { retries: 1 }).catch(() => [] as RawRecord[]),
      fetchFplJson<RawEntryHistoryPayload>(`/entry/${id}/history/`, { retries: 1 }).catch(() => null),
    ]);
    const recentTransfers = Array.isArray(rawTransfers)
      ? rawTransfers.slice(0, 12).map((tr) => ({
          event: numberValue(tr.event),
          elementIn: numberValue(tr.element_in),
          elementOut: numberValue(tr.element_out),
          elementInCost: numberValue(tr.element_in_cost),
          elementOutCost: numberValue(tr.element_out_cost),
          time: stringValue(tr.time),
        }))
      : [];

    const maxHistoryEvent = Array.isArray(entryHistory?.current)
      ? entryHistory!.current!.reduce((maxEv, row) => Math.max(maxEv, numberValue(row?.event, 0)), 0)
      : latestLockedGw;
    const postLockTransfersUsed = Array.isArray(rawTransfers)
      ? rawTransfers.filter((tr) => numberValue(tr.event, 0) > maxHistoryEvent).length
      : 0;

    const latestTransferInCostByElement = new Map<number, number>();
    if (Array.isArray(rawTransfers)) {
      // Official FPL returns transfers sorted newest-first; keep the most recent transfer-in cost per element
      const sortedNewestFirst = [...rawTransfers].sort(
        (a, b) => numberValue(b?.event, 0) - numberValue(a?.event, 0),
      );
      for (const tr of sortedNewestFirst) {
        const elIn = numberValue(tr?.element_in, 0);
        const inCost = numberValue(tr?.element_in_cost, 0);
        if (elIn > 0 && inCost >= 35 && !latestTransferInCostByElement.has(elIn)) {
          latestTransferInCostByElement.set(elIn, inCost);
        }
      }
    }

    // Apply any published post-GW transfers when viewing upcoming GWs
    const result = normalizeEntry(
      root,
      picks,
      snapshot,
      enriched,
      'live',
      entryHistory,
      postLockTransfersUsed,
      latestTransferInCostByElement,
    );
    result.recentTransfers = recentTransfers;
    const newerTransfers = recentTransfers
      .filter((tr) => tr.event > targetGw)
      .reverse();
    if (newerTransfers.length > 0 && (!requestedGw || requestedGw > targetGw)) {
      const playerIndex = new Map(enriched.map((p) => [p.id, p]));
      const updatedPicks = result.picks.map((pk) => ({ ...pk }));
      for (const tr of newerTransfers) {
        const slot = updatedPicks.find((pk) => pk.element === tr.elementOut);
        if (slot && playerIndex.has(tr.elementIn)) {
          slot.element = tr.elementIn;
          const incomingPlayer = playerIndex.get(tr.elementIn)!;
          const prices = resolveSquadPurchaseAndSellingPrices(
            incomingPlayer,
            undefined,
            undefined,
            tr.elementInCost > 0 ? tr.elementInCost : latestTransferInCostByElement.get(tr.elementIn),
          );
          slot.purchasePrice = prices.purchasePrice;
          slot.sellingPrice = prices.sellingPrice;
        }
      }
      result.picks = updatedPicks;
      result.players = updatedPicks
        .map((pk) => playerIndex.get(pk.element))
        .filter((p): p is (typeof enriched)[number] => Boolean(p));
    }
    return writeCache(cacheKey, result, PROFILE_TTL);
  } catch (error) {
    if (error instanceof UpstreamHttpError && error.status === 404) {
      throw new UpstreamHttpError(`FPL team ID ${id} was not found.`, 404);
    }
    const fallbackFile = await loadOfflineLeagueFallback();
    const archived = fallbackFile.entries?.[id];
    const fallbackResult = archived
      ? normalizeEntry(archived.root, archived.picks, snapshot, enriched, 'snapshot', archived.history ?? null)
      : buildOfflineSyntheticEntry(numberValue(id, 999999), snapshot, enriched);
    return writeCache(cacheKey, fallbackResult, 120_000);
  }
}

export async function getLeague(id: string): Promise<LeagueData> {
  const cached = readCache<LeagueData>(`league:${id}`);
  if (cached) {
    return {
      ...cached,
      source: cached.source === 'snapshot' ? 'snapshot' : 'cache',
      generatedAt: new Date().toISOString(),
    };
  }
  try {
    const raw = await fetchFplJson<RawRecord>(`/leagues-classic/${id}/standings/`, { retries: 1 });
    const result = normalizeLeaguePayload(raw, id, 'live');
    return writeCache(`league:${id}`, result, PROFILE_TTL);
  } catch (error) {
    if (error instanceof UpstreamHttpError && error.status === 404) {
      throw new UpstreamHttpError(`Classic league ID ${id} was not found.`, 404);
    }
    const fallbackFile = await loadOfflineLeagueFallback();
    const archived = fallbackFile.leagues?.[id] ?? fallbackFile.leagues?.['314'];
    if (archived) {
      const fallbackResult = normalizeLeaguePayload(
        id === '314' ? archived : { ...archived, league: { ...archived.league, id: numberValue(id), name: `Classic League #${id} (offline snapshot)` } },
        id,
        'snapshot',
      );
      return writeCache(`league:${id}`, fallbackResult, 120_000);
    }
    throw error;
  }
}

export async function getHealth(): Promise<Record<string, unknown>> {
  const snapshot = await getSnapshot();
  return {
    ok: true,
    service: 'fpl-vortex',
    time: new Date().toISOString(),
    upstreamOk: snapshot.meta.upstreamOk,
    source: snapshot.meta.source,
    stale: snapshot.meta.stale,
    season: snapshot.meta.season,
    seasonRules: REPO_SEASON_RULES_2026_27,
    currentEventId: snapshot.meta.currentEventId,
    nextEventId: snapshot.meta.nextEventId,
    defaultEntryId: null,
    players: snapshot.players.length,
    fixtures: snapshot.fixtures.length,
    repoData: snapshot.meta.repoData ?? null,
    oddsMeta: snapshot.meta.oddsMeta ?? null,
    cacheEntries: cache.size,
    node: process.version,
  };
}
