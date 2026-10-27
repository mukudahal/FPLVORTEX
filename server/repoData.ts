import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  Position,
  RepoBenchmarkRow,
  RepoBenchmarksResponse,
  RepoDataMeta,
  Snapshot,
  VideoItem,
  VideosResponse,
} from '../src/lib/types.ts';
import { clamp, numberValue, round } from '../src/lib/format.ts';

const BENCHMARK_REL_PATH =
  process.env.VORTEX_BENCHMARK_CSV_PATH ?? '3_data_third_party/fplcopilot-projections-gw7-2026-10-15-v4.csv';
const VIDEOS_REL_PATH = process.env.VORTEX_VIDEOS_JSON_PATH ?? 'site/ui/videos.json';
const DEFAULT_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID ?? 'UCDU7nEIN72xoiR3NtxCT6CQ';
const CONFIGURED_REPO_ENTRY_ID = Number.parseInt(process.env.VORTEX_DEFAULT_ENTRY_ID ?? '145784', 10) || 145784;

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
  chips: ['wc', 'fh', 'bb', 'tc'] as const,
});

interface ParsedCsvPlayer {
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

function resolveGwMetric(metricMap: Map<number, number>, targetGw: number): number | null {
  if (!metricMap.size) return null;
  if (metricMap.has(targetGw)) return metricMap.get(targetGw) ?? null;
  const gws = [...metricMap.keys()].sort((a, b) => a - b);
  const clampedGw = clamp(targetGw, gws[0], gws[gws.length - 1]);
  return metricMap.get(clampedGw) ?? null;
}

function resolveHorizonSum(metricMap: Map<number, number>, startGw: number, horizon = 5): number | null {
  if (!metricMap.size) return null;
  const gws = [...metricMap.keys()].sort((a, b) => a - b);
  let total = 0;
  let found = 0;
  for (let offset = 0; offset < horizon; offset += 1) {
    const gw = clamp(startGw + offset, gws[0], gws[gws.length - 1]);
    const val = metricMap.get(gw);
    if (val !== undefined) {
      total += val;
      found += 1;
    }
  }
  return found > 0 ? round(total, 2) : null;
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
      const result: VideosResponse = {
        channelId,
        channelTitle: archive.channelTitle,
        capturedAt: new Date().toISOString(),
        source: 'live',
        videos: liveVideos,
      };
      liveVideosCache = { value: result, expiresAt: Date.now() + 30 * 60_000 };
      return result;
    }
  } catch {
    // Fall back to repository's verified videos.json archive.
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
    const expectedMinutes = resolveGwMetric(row.xmins, targetEventId) ?? 0;
    const expectedPoints = resolveGwMetric(row.xpts, targetEventId) ?? 0;
    const horizon5Points = resolveHorizonSum(row.xpts, targetEventId, 5) ?? expectedPoints * 5;
    players.push({
      fplId: row.fplId,
      name: row.name,
      team: row.team,
      position: row.position,
      price: row.price,
      expectedMinutes: round(expectedMinutes, 1),
      expectedPoints: round(expectedPoints, 2),
      horizon5Points: round(horizon5Points, 2),
    });
  }
  players.sort((a, b) => b.expectedPoints - a.expectedPoints || b.horizon5Points - a.horizon5Points);
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
  return {
    benchmarkFile: BENCHMARK_REL_PATH,
    benchmarkPlayers: benchmarks.size,
    videosFile: VIDEOS_REL_PATH,
    videosCount: videos.videos.length,
    channelId: videos.channelId,
    configuredEntryId: CONFIGURED_REPO_ENTRY_ID,
    seasonRules: REPO_SEASON_RULES_2026_27.season,
  };
}

export async function enrichSnapshotWithRepoData(snapshot: Snapshot): Promise<Snapshot> {
  const [benchmarks, repoData] = await Promise.all([loadRepoBenchmarkIndex(), getRepoMeta()]);
  const targetGw = snapshot.meta.nextEventId || 9;
  const players = snapshot.players.map((player) => {
    const bench = benchmarks.get(player.id);
    if (!bench) return player;
    return {
      ...player,
      repoExpectedMinutes: resolveGwMetric(bench.xmins, targetGw),
      repoBenchmarkXpts: resolveGwMetric(bench.xpts, targetGw),
      repoHorizon5Xpts: resolveHorizonSum(bench.xpts, targetGw, 5),
    };
  });
  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      repoData,
    },
    players,
  };
}
