import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  Position,
  RepoBenchmarkRow,
  RepoBenchmarksResponse,
  RepoDataMeta,
  Snapshot,
  VerifiedEvidenceNote,
  VideoItem,
  VideosResponse,
} from '../src/lib/types.ts';
import { numberValue, round } from '../src/lib/format.ts';
import { filenameProjectionDate } from '../src/lib/projectionFreshness.ts';

const BENCHMARK_REL_PATH =
  process.env.VORTEX_BENCHMARK_CSV_PATH ?? '3_data_third_party/fplcopilot-projections-gw7-2026-10-15-v4.csv';
const VIDEOS_REL_PATH = process.env.VORTEX_VIDEOS_JSON_PATH ?? 'site/ui/videos.json';
const DEFAULT_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID ?? 'UCDU7nEIN72xoiR3NtxCT6CQ';
export const CONFIGURED_REPO_ENTRY_ID: number | null = process.env.VORTEX_DEFAULT_ENTRY_ID
  ? Number.parseInt(process.env.VORTEX_DEFAULT_ENTRY_ID, 10) || null
  : null;
export const CONFIGURED_REPO_ENTRY_NAME = 'FPLVORTEX';

export const REPO_SEASON_RULES_2026_27 = Object.freeze({
  season: '2026/27',
  gameweeks: 38,
  chipHalfBoundary: 19,
  maxFreeTransfers: 5,
  hitCost: 4,
  maxPerClub: 3,
  squadSize: 15,
  startingXI: 11,
  maxBudgetTenths: 1000,
  transferDeadlineLeadMinutes: 90,
  defconThresholds: { DEF: 10, MID: 12, FWD: 12, points: 2 },
  chips: ['wc', 'fh', 'bb', 'tc'] as const,
});

/**
 * Verified match/club context from `2_notebooks/FPL_VORTEX_Wildcard_Slides1_to_4_Premium_Captaincy.ipynb`
 * Cell 9 (`VX_WC_VERIFIED_EVIDENCE_JSON`).
 */
export const REPO_VERIFIED_NOTES: VerifiedEvidenceNote[] = [
  {
    playerId: 411,
    teamId: 15,
    checkedAt: '2026-10-05T15:29:59Z',
    sourceUrl: 'https://www.mancity.com/news/mens/international-roundup-4-october-2026-63926730',
    summary:
      'Haaland (MCI): Norway Nations League appearance, substituted after 67 minutes; workload monitored, no club absence confirmed.',
    monitor: true,
  },
  {
    playerId: 12,
    teamId: 1,
    checkedAt: '2026-10-05T15:29:59Z',
    sourceUrl:
      'https://www.englandfootball.com/articles/2026/Oct/03/croatia-england-uefa-nations-league-harry-kane-bukayo-saka-reaction-20260310',
    summary: 'Saka (ARS): Scored twice for England in 7-0 Nations League win over Croatia.',
    monitor: false,
  },
  {
    teamId: 15,
    checkedAt: '2026-10-05T15:29:59Z',
    sourceUrl: 'https://www.premierleague.com/en/news/4729207',
    summary:
      'Manchester City: Premier League statement confirms no fixture or player-eligibility change; zero numerical penalty applied.',
    monitor: false,
  },
];

export interface ParsedCsvPlayer {
  fplId: number;
  name: string;
  team: string;
  position: Position;
  price: number;
  xmins: Map<number, number>;
  xpts: Map<number, number>;
}

let cachedBenchmarks: Map<number, ParsedCsvPlayer> | null = null;
let cachedVideosArchive: { channelId: string; channelTitle: string; capturedAt: string; videos: VideoItem[] } | null = null;
let liveVideosCache: { value: VideosResponse; expiresAt: number } | null = null;

function mapPosition(raw: string): Position {
  const normalized = raw.trim().toUpperCase();
  if (normalized === 'GK' || normalized === 'GKP') return 'GKP';
  if (normalized === 'DEF') return 'DEF';
  if (normalized === 'FWD') return 'FWD';
  return 'MID';
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    if (ch === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export async function loadRepoBenchmarkIndex(): Promise<Map<number, ParsedCsvPlayer>> {
  if (cachedBenchmarks) return cachedBenchmarks;
  const map = new Map<number, ParsedCsvPlayer>();
  try {
    const file = path.resolve(process.cwd(), BENCHMARK_REL_PATH);
    const text = await readFile(file, 'utf8');
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      cachedBenchmarks = map;
      return map;
    }
    const headers = splitCsvLine(lines[0]).map((header) => header.trim());
    const gwCols: Array<{ gw: number; kind: 'xmins' | 'xpts'; colIndex: number }> = [];
    headers.forEach((header, colIndex) => {
      const match = header.match(/^gw(\d+)_(xmins|xpts)$/i);
      if (match) {
        gwCols.push({ gw: Number(match[1]), kind: match[2].toLowerCase() as 'xmins' | 'xpts', colIndex });
      }
    });
    const idxId = headers.indexOf('fpl_id');
    const idxName = headers.indexOf('name');
    const idxTeam = headers.indexOf('team');
    const idxPos = headers.indexOf('position');
    const idxPrice = headers.indexOf('price');
    for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
      const cells = splitCsvLine(lines[rowIndex]);
      const fplId = numberValue(cells[idxId], 0);
      if (fplId <= 0) continue;
      const xmins = new Map<number, number>();
      const xpts = new Map<number, number>();
      for (const col of gwCols) {
        const val = numberValue(cells[col.colIndex], Number.NaN);
        if (Number.isFinite(val)) {
          if (col.kind === 'xmins') xmins.set(col.gw, val);
          else xpts.set(col.gw, val);
        }
      }
      map.set(fplId, {
        fplId,
        name: (cells[idxName] ?? '').trim(),
        team: (cells[idxTeam] ?? '').trim(),
        position: mapPosition(cells[idxPos] ?? 'MID'),
        price: numberValue(cells[idxPrice], 0),
        xmins,
        xpts,
      });
    }
  } catch {
    // Optional repository file; return empty map if absent.
  }
  cachedBenchmarks = map;
  return map;
}

/** Missing GW data is unavailable, never a repeat of the first or last imported GW. */
function resolveGwMetric(metricMap: Map<number, number>, targetGw: number): number | null {
  return metricMap.get(targetGw) ?? null;
}

/** Report a five-GW imported total only when every exact GW has an imported value. */
function resolveHorizonSum(metricMap: Map<number, number>, startGw: number, horizon = 5): number | null {
  if (!Number.isInteger(horizon) || horizon <= 0) return null;
  let total = 0;
  for (let offset = 0; offset < horizon; offset += 1) {
    const val = metricMap.get(startGw + offset);
    if (val === undefined) return null;
    total += val;
  }
  return round(total, 2);
}

function mapToRecord(metricMap: Map<number, number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of metricMap.entries()) {
    out[k] = v;
  }
  return out;
}

async function loadRepoVideosArchive(): Promise<{
  channelId: string;
  channelTitle: string;
  capturedAt: string;
  videos: VideoItem[];
}> {
  if (cachedVideosArchive) return cachedVideosArchive;
  try {
    const file = path.resolve(process.cwd(), VIDEOS_REL_PATH);
    const parsed = JSON.parse(await readFile(file, 'utf8')) as {
      channelId?: string;
      channelTitle?: string;
      capturedAt?: string;
      videos?: VideoItem[];
    };
    cachedVideosArchive = {
      channelId: parsed.channelId ?? DEFAULT_CHANNEL_ID,
      channelTitle: parsed.channelTitle ?? 'FPL VORTEX',
      capturedAt: parsed.capturedAt ?? new Date().toISOString(),
      videos: Array.isArray(parsed.videos) ? parsed.videos : [],
    };
    return cachedVideosArchive;
  } catch {
    cachedVideosArchive = {
      channelId: DEFAULT_CHANNEL_ID,
      channelTitle: 'FPL VORTEX',
      capturedAt: new Date().toISOString(),
      videos: [],
    };
    return cachedVideosArchive;
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export async function getRepoVideos(): Promise<VideosResponse> {
  if (liveVideosCache && liveVideosCache.expiresAt > Date.now()) {
    return liveVideosCache.value;
  }
  const archive = await loadRepoVideosArchive();
  const channelId = process.env.YOUTUBE_CHANNEL_ID || archive.channelId || DEFAULT_CHANNEL_ID;
  if (process.env.VORTEX_OFFLINE !== '1') {
    try {
      const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
        signal: AbortSignal.timeout(3500),
        headers: { accept: 'application/atom+xml,text/xml,application/xml;q=0.9,*/*;q=0.8' },
      });
      if (!response.ok) throw new Error(`YouTube RSS status ${response.status}`);
      const xml = await response.text();
      const liveVideos: VideoItem[] = [];
      for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
        const block = match[1];
        const id = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
        const title = block.match(/<title>([^<]*)<\/title>/)?.[1];
        const published = block.match(/<published>([^<]+)<\/published>/)?.[1];
        if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id) || !title || !published) continue;
        liveVideos.push({
          id,
          title: decodeXmlEntities(title),
          published,
          thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${id}`,
        });
      }
      if (liveVideos.length > 0) {
        const seen = new Set(liveVideos.map((v) => v.id));
        const merged = [...liveVideos, ...archive.videos.filter((v) => !seen.has(v.id))];
        const result: VideosResponse = {
          channelId,
          channelTitle: archive.channelTitle,
          capturedAt: new Date().toISOString(),
          source: 'live',
          videos: merged,
        };
        liveVideosCache = { value: result, expiresAt: Date.now() + 30 * 60_000 };
        return result;
      }
    } catch {
      // Fall back to repository's verified videos.json archive.
    }
  }
  const fallback: VideosResponse = {
    channelId: archive.channelId,
    channelTitle: archive.channelTitle,
    capturedAt: archive.capturedAt,
    source: 'repository',
    videos: archive.videos,
  };
  liveVideosCache = { value: fallback, expiresAt: Date.now() + 5 * 60_000 };
  return fallback;
}

export async function getRepoBenchmarks(targetEventId = 9): Promise<RepoBenchmarksResponse> {
  const index = await loadRepoBenchmarkIndex();
  const horizonEvents = Array.from({ length: 5 }, (_, offset) => targetEventId + offset);
  const players: RepoBenchmarkRow[] = [];
  for (const row of index.values()) {
    const expectedMinutes = resolveGwMetric(row.xmins, targetEventId);
    const expectedPoints = resolveGwMetric(row.xpts, targetEventId);
    const horizon5Points = resolveHorizonSum(row.xpts, targetEventId, 5);
    players.push({
      fplId: row.fplId,
      name: row.name,
      team: row.team,
      position: row.position,
      price: row.price,
      expectedMinutes: expectedMinutes === null ? null : round(expectedMinutes, 1),
      expectedPoints: expectedPoints === null ? null : round(expectedPoints, 2),
      horizon5Points,
    });
  }
  players.sort((a, b) => (b.expectedPoints ?? -1) - (a.expectedPoints ?? -1) ||
    (b.horizon5Points ?? -1) - (a.horizon5Points ?? -1));
  return {
    sourceFile: BENCHMARK_REL_PATH,
    targetEventId,
    horizonEvents,
    count: players.length,
    players,
  };
}

export async function getRepoMeta(): Promise<RepoDataMeta> {
  const [benchmarks, videos] = await Promise.all([loadRepoBenchmarkIndex(), loadRepoVideosArchive()]);
  const projectionGameweeks = [...new Set([...benchmarks.values()].flatMap(player => [
    ...player.xpts.keys(), ...player.xmins.keys(),
  ]))].sort((a, b) => a - b);
  return {
    benchmarkFile: BENCHMARK_REL_PATH,
    benchmarkPlayers: benchmarks.size,
    projectionFileDate: filenameProjectionDate(BENCHMARK_REL_PATH),
    projectionGameweeks,
    videosFile: VIDEOS_REL_PATH,
    videosCount: videos.videos.length,
    channelId: videos.channelId,
    configuredEntryId: CONFIGURED_REPO_ENTRY_ID,
    configuredEntryName: CONFIGURED_REPO_ENTRY_NAME,
    seasonRules: REPO_SEASON_RULES_2026_27.season,
    verifiedNotes: REPO_VERIFIED_NOTES,
  };
}

/**
 * Dated imported repository data adapter (not a live or authoritative projection feed):
 * Preserves live/current official FPL player identity, club, position, and prices (`price`, `cost`),
 * while enriching GW7-GW16 model projections (`gwProjections`, `gwExpectedMinutes`) from
 * `3_data_third_party/fplcopilot-projections-gw7-2026-10-15-v4.csv`.
 * When `snapshot.meta.source !== 'live'`, restricts the pool strictly to the 667 repo CSV players.
 */
export async function enrichSnapshotWithRepoData(snapshot: Snapshot): Promise<Snapshot> {
  const [benchmarks, repoData] = await Promise.all([loadRepoBenchmarkIndex(), getRepoMeta()]);
  const targetGw = snapshot.meta.nextEventId || 9;
  const teamIdByShort = new Map(
    snapshot.teams.map((t) => [t.shortName.trim().toUpperCase(), t.id]),
  );

  const sourcePlayers =
    benchmarks.size > 0 && snapshot.meta.source !== 'live'
      ? snapshot.players.filter((player) => benchmarks.has(player.id))
      : snapshot.players;

  const players = sourcePlayers.map((player) => {
    const bench = benchmarks.get(player.id);
    if (!bench) return player;
    const resolvedCost = player.cost > 0 ? player.cost : Math.round(bench.price * 10);
    const resolvedPrice = player.price > 0 ? player.price : resolvedCost / 10;
    const resolvedTeamId =
      player.teamId > 0 ? player.teamId : (teamIdByShort.get(bench.team.toUpperCase()) ?? player.teamId);
    const resolvedPosition = player.position || bench.position;
    return {
      ...player,
      name: player.name || bench.name,
      teamId: resolvedTeamId,
      position: resolvedPosition,
      price: resolvedPrice,
      cost: resolvedCost,
      repoExpectedMinutes: resolveGwMetric(bench.xmins, targetGw),
      repoBenchmarkXpts: resolveGwMetric(bench.xpts, targetGw),
      repoHorizon5Xpts: resolveHorizonSum(bench.xpts, targetGw, 5),
      gwProjections: mapToRecord(bench.xpts),
      gwExpectedMinutes: mapToRecord(bench.xmins),
    };
  });

  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      exampleEntryId: null,
      fallbackNotice:
        snapshot.meta.source === 'live'
          ? undefined
          : 'Tier-1 repo projections (3_data_third_party/fplcopilot-projections-gw7-2026-10-15-v4.csv) active; offline snapshot supplying codes & fixtures.',
      repoData,
    },
    players,
  };
}
