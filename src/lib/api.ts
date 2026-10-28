import { enrichPlayers } from './analytics';
import { withBase } from './baseUrl';
import { numberValue } from './format';
import type { RecentTeamEntry } from './recentTeamIds';
import type { EntryData, LeagueData, Snapshot, VideosResponse } from './types';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly isJsonError = false,
  ) {
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
    let isJsonError = false;
    try {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const body = (await response.json()) as { error?: string };
        if (body.error) {
          message = body.error;
          isJsonError = true;
        }
      }
    } catch {
      // Keep the status message when the response is not JSON.
    }
    throw new ApiRequestError(message, response.status, isJsonError);
  }
  return (await response.json()) as T;
}

export async function fetchSnapshot(signal?: AbortSignal): Promise<Snapshot> {
  try {
    return await getJson<Snapshot>(withBase('api/vortex/snapshot'), signal);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 400 && error.isJsonError) {
      throw error;
    }
    try {
      return await getJson<Snapshot>(withBase('data/vortex-snapshot.json'), signal);
    } catch {
      return fetchOfflineSnapshot(signal);
    }
  }
}

export async function fetchOfflineSnapshot(signal?: AbortSignal): Promise<Snapshot> {
  try {
    return await getJson<Snapshot>(withBase('data/vortex-snapshot.json'), signal);
  } catch {
    const snapshot = await getJson<Snapshot>(withBase('data/fpl-snapshot.json'), signal);
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
}

export async function forceRefresh(signal?: AbortSignal): Promise<void> {
  const response = await fetch(withBase('api/vortex/refresh'), {
    method: 'POST',
    headers: { accept: 'application/json' },
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    if (response.status === 404 || response.status === 405) {
      // Static-only deployment without /api/vortex/refresh backend.
      return;
    }
    const body = (await response.json().catch(() => ({ error: 'Refresh failed.' }))) as { error?: string };
    throw new ApiRequestError(body.error ?? 'Refresh failed.', response.status);
  }
}

interface RawLeagueFallback {
  entries?: Record<string, { root: Record<string, any>; picks: Record<string, any> }>;
  leagues?: Record<string, Record<string, any>>;
}

export async function fetchEntry(
  id: string,
  signal?: AbortSignal,
  options?: { refresh?: boolean; gw?: number },
): Promise<EntryData> {
  try {
    const params = new URLSearchParams();
    if (options?.refresh) params.set('refresh', '1');
    if (options?.gw) params.set('gw', String(options.gw));
    const qs = params.toString();
    const url = `${withBase(`api/vortex/entry/${encodeURIComponent(id)}`)}${qs ? `?${qs}` : ''}`;
    return await getJson<EntryData>(url, signal);
  } catch (error) {
    // Re-throw genuine backend validation errors (400), but fall back cleanly on static hosts (non-JSON 404) or upstream outages (>=500).
    if (error instanceof ApiRequestError && error.status < 500 && !(error.status === 404 && !error.isJsonError)) {
      throw error;
    }
    const [snapshot, fallback] = await Promise.all([
      fetchOfflineSnapshot(signal),
      getJson<RawLeagueFallback>(withBase('data/fpl-league-fallback.json'), signal),
    ]);
    const archived = fallback.entries?.[id] ?? fallback.entries?.['145784'];
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
    const targetGw = options?.gw ?? numberValue(history.event, snapshot.meta.currentEventId);
    return {
      id: numberValue(archived.root.id, numberValue(id)),
      name: `${archived.root.player_first_name ?? ''} ${archived.root.player_last_name ?? ''}`.trim(),
      teamName: String(archived.root.name ?? 'FPLVORTEX'),
      region: String(archived.root.player_region_name ?? 'Worldwide'),
      startedEvent: numberValue(archived.root.started_event, 1),
      favouriteTeamId: archived.root.favourite_team ?? null,
      overallRank: archived.root.summary_overall_rank ?? null,
      overallPoints: archived.root.summary_overall_points ?? null,
      currentEvent: numberValue(history.event, snapshot.meta.currentEventId),
      activeChip: archived.picks.active_chip ?? null,
      freeTransfers: numberValue((archived.root as Record<string, any>).free_transfers, 4),
      history: {
        event: targetGw,
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
    return await getJson<LeagueData>(withBase(`api/vortex/league/${encodeURIComponent(id)}`), signal);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status < 500 && !(error.status === 404 && !error.isJsonError)) {
      throw error;
    }
    const fallback = await getJson<RawLeagueFallback>(withBase('data/fpl-league-fallback.json'), signal);
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
  try {
    return await getJson<VideosResponse>(withBase('api/vortex/videos'), signal);
  } catch {
    return getJson<VideosResponse>(withBase('data/vortex-videos.json'), signal);
  }
}

export async function fetchSavedTeams(signal?: AbortSignal): Promise<RecentTeamEntry[]> {
  try {
    const res = await getJson<{ teams?: RecentTeamEntry[] }>(withBase('api/vortex/saved-teams'), signal);
    return Array.isArray(res.teams) ? res.teams : [];
  } catch {
    return [];
  }
}

export async function saveTeamOnServer(entry: {
  id: string;
  teamName?: string;
  managerName?: string;
}): Promise<RecentTeamEntry[]> {
  try {
    const response = await fetch(withBase('api/vortex/saved-teams'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(entry),
      cache: 'no-store',
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { teams?: RecentTeamEntry[] };
    return Array.isArray(data.teams) ? data.teams : [];
  } catch {
    return [];
  }
}

export async function deleteSavedTeamOnServer(id: string): Promise<void> {
  try {
    await fetch(withBase(`api/vortex/saved-teams/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    // Ignore offline/static errors; client storage is updated synchronously.
  }
}

