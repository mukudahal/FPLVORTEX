import { enrichPlayers } from './analytics';
import { numberValue } from './format';
import type { EntryData, LeagueData, Snapshot, VideosResponse } from './types';

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the status message when the response is not JSON.
    }
    throw new ApiRequestError(message, response.status);
  }
  return (await response.json()) as T;
}

export async function fetchSnapshot(signal?: AbortSignal): Promise<Snapshot> {
  return getJson<Snapshot>('/api/vortex/snapshot', signal);
}

export async function fetchOfflineSnapshot(signal?: AbortSignal): Promise<Snapshot> {
  const snapshot = await getJson<Snapshot>('/data/fpl-snapshot.json', signal);
  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      source: 'offline',
      servedAt: new Date().toISOString(),
      upstreamOk: false,
      stale: true,
      refreshSeconds: 120,
    },
  };
}

export async function forceRefresh(signal?: AbortSignal): Promise<void> {
  const response = await fetch('/api/vortex/refresh', {
    method: 'POST',
    headers: { accept: 'application/json' },
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: 'Refresh failed.' }))) as { error?: string };
    throw new ApiRequestError(body.error ?? 'Refresh failed.', response.status);
  }
}

interface RawLeagueFallback {
  entries?: Record<string, { root: Record<string, any>; picks: Record<string, any> }>;
  leagues?: Record<string, Record<string, any>>;
}

export async function fetchEntry(id: string, signal?: AbortSignal): Promise<EntryData> {
  try {
    return await getJson<EntryData>(`/api/vortex/entry/${encodeURIComponent(id)}`, signal);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status < 500) throw error;
    const [snapshot, fallback] = await Promise.all([
      fetchOfflineSnapshot(signal),
      getJson<RawLeagueFallback>('/data/fpl-league-fallback.json', signal),
    ]);
    const archived = fallback.entries?.[id] ?? fallback.entries?.['5112705'];
    if (!archived) throw error;
    const enriched = enrichPlayers(snapshot, 'balanced');
    const playerIndex = new Map(enriched.map((player) => [player.id, player]));
    const picks = (Array.isArray(archived.picks.picks) ? archived.picks.picks : []).map((pick: Record<string, any>) => ({
      element: numberValue(pick.element),
      position: numberValue(pick.position),
      multiplier: numberValue(pick.multiplier),
      isCaptain: Boolean(pick.is_captain),
      isViceCaptain: Boolean(pick.is_vice_captain),
    }));
    const players = picks
      .map((pick) => playerIndex.get(pick.element))
      .filter((player): player is (typeof enriched)[number] => Boolean(player));
    const projectedPoints = picks.reduce((sum, pick) => {
      const player = playerIndex.get(pick.element);
      if (!player) return sum;
      const mult = pick.isCaptain ? 2 : pick.multiplier > 0 ? 1 : 0;
      return sum + player.projection * mult;
    }, 0);
    const history = archived.picks.entry_history ?? {};
    return {
      id: numberValue(archived.root.id, numberValue(id)),
      name: `${archived.root.player_first_name ?? ''} ${archived.root.player_last_name ?? ''}`.trim(),
      teamName: String(archived.root.name ?? 'FPL Team'),
      region: String(archived.root.player_region_name ?? 'Worldwide'),
      startedEvent: numberValue(archived.root.started_event, 1),
      favouriteTeamId: archived.root.favourite_team ?? null,
      overallRank: archived.root.summary_overall_rank ?? null,
      overallPoints: archived.root.summary_overall_points ?? null,
      currentEvent: numberValue(history.event, snapshot.meta.currentEventId),
      activeChip: archived.picks.active_chip ?? null,
      history: {
        event: numberValue(history.event, snapshot.meta.currentEventId),
        points: numberValue(history.points),
        totalPoints: numberValue(history.total_points),
        rank: numberValue(history.rank),
        overallRank: numberValue(history.overall_rank),
        bank: numberValue(history.bank),
        value: numberValue(history.value),
        eventTransfers: numberValue(history.event_transfers),
        eventTransfersCost: numberValue(history.event_transfers_cost),
        pointsOnBench: numberValue(history.points_on_bench),
      },
      picks,
      players,
      projectedPoints: Math.round(projectedPoints * 10) / 10,
      squadValue: numberValue(history.value) / 10,
      source: 'offline',
      generatedAt: new Date().toISOString(),
    };
  }
}

export async function fetchLeague(id: string, signal?: AbortSignal): Promise<LeagueData> {
  try {
    return await getJson<LeagueData>(`/api/vortex/league/${encodeURIComponent(id)}`, signal);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status < 500) throw error;
    const fallback = await getJson<RawLeagueFallback>('/data/fpl-league-fallback.json', signal);
    const archived = fallback.leagues?.[id] ?? fallback.leagues?.['314'];
    if (!archived) throw error;
    return {
      id: numberValue(archived.league?.id, numberValue(id)),
      name: String(archived.league?.name ?? `League ${id}`),
      created: archived.league?.created ?? null,
      closed: Boolean(archived.league?.closed),
      standings: (Array.isArray(archived.standings?.results) ? archived.standings.results : []).map((row: Record<string, any>) => ({
        rank: numberValue(row.rank),
        lastRank: numberValue(row.last_rank),
        entry: numberValue(row.entry),
        playerName: String(row.player_name ?? ''),
        entryName: String(row.entry_name ?? ''),
        eventTotal: numberValue(row.event_total),
        total: numberValue(row.total),
      })),
      source: 'offline',
      generatedAt: new Date().toISOString(),
    };
  }
}

export async function fetchVideos(signal?: AbortSignal): Promise<VideosResponse> {
  return getJson<VideosResponse>('/api/vortex/videos', signal);
}
