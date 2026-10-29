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
import { mirroredSnapshotState } from '../src/lib/snapshotFreshness.ts';
import {
  computeDynamicFreeTransfers,
  resolveSquadPurchaseAndSellingPrices,
  type RawEntryHistoryPayload,
} from '../src/lib/freeTransfers.ts';
import { enrichPlayers } from '../src/lib/analytics.ts';
import { auditNormalizedPlayers } from '../src/lib/playerDataQuality.ts';
import { fetchFplJson, UpstreamHttpError, isNumericId } from './http.ts';
import { normalizeSnapshot, type RawFplData } from './normalize.ts';
import { enrichFixturesWithLiveOdds } from './odds.ts';
import { enrichWithMatchHistory } from './matchHistory.ts';
import {
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

async function loadOfflineSnapshot(options: { skipOdds?: boolean } = {}): Promise<Snapshot> {
  const file = path.resolve(process.cwd(), SNAPSHOT_PATH);
  const raw = JSON.parse(await readFile(file, 'utf8')) as Snapshot;
  const mirroredState = mirroredSnapshotState(raw.meta, MIRROR_FRESH_MS);
  const markedOffline: Snapshot = {
    ...raw,
    meta: {
      ...raw.meta,
      playerDataQuality: raw.meta.playerDataQuality ?? auditNormalizedPlayers(raw.players, raw.teams, raw.meta.generatedAt),
      source: mirroredState.source,
      servedAt: new Date().toISOString(),
      upstreamOk: mirroredState.upstreamOk,
      stale: mirroredState.stale,
      refreshSeconds: 120,
    },
  };
  const enrichedRepo = await enrichWithMatchHistory(await enrichSnapshotWithRepoData(markedOffline));
  // A mirrored snapshot already carries the deployment's odds enrichment; never replace it
  // with a local (usually blocked) fetch. `skipOdds` powers the cold-start fast path: first
  // paint must never wait on market feeds.
  if (raw.meta.mirroredFrom || options.skipOdds) return enrichedRepo;
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
      const repoEnriched = await enrichWithMatchHistory(await enrichSnapshotWithRepoData(normalized));
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

/**
 * First-paint snapshot used by `GET /api/vortex/snapshot`.
 *
 * `getSnapshot` waits for the live FPL payload (bootstrap + fixtures + live points) and the
 * bookmaker feeds before answering. On a cold instance that is several seconds of blank
 * screen. This variant returns the committed snapshot straight away and refreshes behind the
 * request, so the dashboard paints immediately and still upgrades itself to live data.
 */
export async function getSnapshotFast(force = false): Promise<Snapshot> {
  if (force) return getSnapshot(true);

  const cacheKey = 'snapshot';
  const cached = readCache<Snapshot>(cacheKey);
  if (cached) {
    return markSnapshot(cached, cached.meta.source === 'snapshot' ? 'snapshot' : 'cache', cached.meta.stale, cached.meta.upstreamOk);
  }

  // Already have a live copy but its TTL lapsed: serve it, refresh in the background.
  if (lastGoodSnapshot) {
    void getSnapshot(true).catch(() => undefined);
    return markSnapshot(lastGoodSnapshot, 'cache', true, false);
  }

  const fast = await loadOfflineSnapshot({ skipOdds: true });
  writeCache(cacheKey, fast, 20_000);
  void getSnapshot(true).catch(() => undefined);
  return fast;
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
  if (!isNumericId(id)) throw new UpstreamHttpError('Enter a valid positive numeric FPL Team ID.', 400);
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
    if (numberValue(root.id) !== Number(id)) {
      throw new UpstreamHttpError('Official FPL entry identity did not match the requested Team ID.', 502);
    }
    result.provenance = { kind: 'official', requestedIdVerified: true, sourceCapturedAt: null };
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
    if (!archived || numberValue(archived.root.id) !== Number(id)) {
      throw new UpstreamHttpError(
        `Official FPL team #${id} is unavailable; no matching verified archive exists. No demo team was substituted.`,
        503,
      );
    }
    const fallbackResult = normalizeEntry(archived.root, archived.picks, snapshot, enriched, 'snapshot', archived.history ?? null);
    fallbackResult.provenance = {
      kind: id === '999999' ? 'demo' : 'archived',
      requestedIdVerified: false,
      sourceCapturedAt: null,
    };
    return writeCache(cacheKey, fallbackResult, 120_000);
  }
}

export async function getLeague(id: string): Promise<LeagueData> {
  if (!isNumericId(id)) throw new UpstreamHttpError('Enter a valid positive classic league ID.', 400);
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
    if (numberValue(raw.league?.id) !== Number(id)) {
      throw new UpstreamHttpError('Official FPL league identity did not match the requested ID.', 502);
    }
    const result = normalizeLeaguePayload(raw, id, 'live');
    result.provenance = { kind: 'official', requestedIdVerified: true, sourceCapturedAt: null };
    return writeCache(`league:${id}`, result, PROFILE_TTL);
  } catch (error) {
    if (error instanceof UpstreamHttpError && error.status === 404) {
      throw new UpstreamHttpError(`Classic league ID ${id} was not found.`, 404);
    }
    const fallbackFile = await loadOfflineLeagueFallback();
    const archived = fallbackFile.leagues?.[id];
    if (!archived || numberValue(archived.league?.id) !== Number(id)) {
      throw new UpstreamHttpError(
        `Classic league #${id} is unavailable; no matching standings archive exists. No other league was substituted.`,
        503,
      );
    }
    const fallbackResult = normalizeLeaguePayload(archived, id, 'snapshot');
    fallbackResult.provenance = { kind: 'archived', requestedIdVerified: false, sourceCapturedAt: null };
    return writeCache(`league:${id}`, fallbackResult, 120_000);
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
