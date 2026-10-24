import { fplFetch, fplFetchDetailed, type FplFetchResult } from "@/lib/fpl";
import {
  normalizeBootstrap, parseBootstrap, parseFixtures,
  type FplRawBootstrap,
} from "@/lib/fplNormalize";
import type {
  ElementSummary, EntryHistory, EntrySummary, Fixture, LeagueStandings,
  LiveResponse, PicksResponse, SlimBootstrap, Transfer,
} from "@/lib/types";

function positiveInteger(value: number, kind: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(`Invalid ${kind}: expected integer between 1 and ${maximum}.`);
  }
  return value;
}

export async function loadRawBootstrap(ttlSeconds = 300): Promise<FplRawBootstrap> {
  return parseBootstrap(await fplFetch<unknown>("bootstrap-static/", ttlSeconds));
}

export async function loadBootstrap(ttlSeconds = 300): Promise<SlimBootstrap> {
  return normalizeBootstrap(await loadRawBootstrap(ttlSeconds));
}

export async function loadBootstrapDetailed(ttlSeconds = 300): Promise<FplFetchResult<SlimBootstrap>> {
  const fetched = await fplFetchDetailed<unknown>("bootstrap-static/", ttlSeconds);
  return { ...fetched, data: normalizeBootstrap(parseBootstrap(fetched.data)) };
}

export async function loadFixtures(ttlSeconds = 300): Promise<Fixture[]> {
  return parseFixtures(await fplFetch<unknown>("fixtures/", ttlSeconds));
}

export async function loadFixturesDetailed(ttlSeconds = 300): Promise<FplFetchResult<Fixture[]>> {
  const fetched = await fplFetchDetailed<unknown>("fixtures/", ttlSeconds);
  return { ...fetched, data: parseFixtures(fetched.data) };
}

export async function loadEntry(entryId: number): Promise<EntrySummary> {
  const id = positiveInteger(entryId, "entry ID");
  const value = await fplFetch<EntrySummary>(`entry/${id}/`, 120);
  if (!value || value.id !== id || typeof value.name !== "string") {
    throw new Error("Invalid upstream entry response.");
  }
  return value;
}

export async function loadEntryHistory(entryId: number, ttlSeconds = 120): Promise<EntryHistory> {
  const id = positiveInteger(entryId, "entry ID");
  const value = await fplFetch<EntryHistory>(`entry/${id}/history/`, ttlSeconds);
  if (!value || !Array.isArray(value.current) || !Array.isArray(value.chips)) {
    throw new Error("Invalid upstream manager history.");
  }
  return value;
}

export async function loadPicks(entryId: number, gameweek: number, ttlSeconds = 60): Promise<PicksResponse> {
  const id = positiveInteger(entryId, "entry ID");
  const gw = positiveInteger(gameweek, "gameweek", 38);
  const value = await fplFetch<PicksResponse>(`entry/${id}/event/${gw}/picks/`, ttlSeconds);
  if (!value || !Array.isArray(value.picks) || !value.entry_history) {
    throw new Error("Invalid upstream manager picks.");
  }
  return value;
}

export async function loadTransfers(entryId: number): Promise<Transfer[]> {
  const id = positiveInteger(entryId, "entry ID");
  const value = await fplFetch<unknown>(`entry/${id}/transfers/`, 300);
  if (!Array.isArray(value)) throw new Error("Invalid upstream transfer list.");
  return value as Transfer[];
}

export async function loadElementSummary(elementId: number): Promise<ElementSummary> {
  const id = positiveInteger(elementId, "player ID");
  const value = await fplFetch<ElementSummary>(`element-summary/${id}/`, 600);
  if (!value || !Array.isArray(value.history) || !Array.isArray(value.fixtures)) {
    throw new Error("Invalid upstream player summary.");
  }
  return value;
}

export async function loadLiveGameweek(gameweek: number, ttlSeconds = 45): Promise<LiveResponse> {
  const gw = positiveInteger(gameweek, "gameweek", 38);
  const value = await fplFetch<LiveResponse>(`event/${gw}/live/`, ttlSeconds);
  if (!value || !Array.isArray(value.elements)) {
    throw new Error("Invalid upstream live gameweek data.");
  }
  return value;
}

export async function loadLeagueStandings(leagueId: number, page?: number, ttlSeconds = 180): Promise<LeagueStandings> {
  const id = positiveInteger(leagueId, "league ID");
  const pageSuffix = page === undefined ? "" : `?page_standings=${positiveInteger(page, "standings page", 200000)}`;
  const value = await fplFetch<LeagueStandings>(`leagues-classic/${id}/standings/${pageSuffix}`, ttlSeconds);
  if (!value || !value.standings || !Array.isArray(value.standings.results) || !value.league) {
    throw new Error("Invalid upstream league standings.");
  }
  return value;
}
