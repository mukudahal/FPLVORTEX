import type { RepoDataMeta, SnapshotMeta } from './types';

export type ImportedProjectionFreshness = 'recent' | 'stale' | 'unknown';

/** Date printed in a filename is not a verified upstream publication timestamp. */
export function filenameProjectionDate(file: string): string | null {
  const filename = file.split(/[\\/]/).pop() ?? '';
  const match = filename.match(/(?:^|[-_])(\d{4}-\d{2}-\d{2})(?=[-_.]|$)/);
  if (!match) return null;
  const date = match[1];
  const parsed = new Date(date + 'T00:00:00.000Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

/** Explicitly use UTC calendar days: cache refreshes cannot change file age. */
export function projectionFreshness(
  fileDate: string | null | undefined,
  now: Date = new Date(),
): { status: ImportedProjectionFreshness; ageDays: number | null } {
  if (!fileDate || !/^\d{4}-\d{2}-\d{2}$/.test(fileDate) || !Number.isFinite(now.valueOf())) {
    return { status: 'unknown', ageDays: null };
  }
  const source = new Date(fileDate + 'T00:00:00.000Z');
  if (!Number.isFinite(source.valueOf()) || source.toISOString().slice(0, 10) !== fileDate) {
    return { status: 'unknown', ageDays: null };
  }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const ageDays = Math.round((today - source.getTime()) / 86_400_000);
  if (ageDays < 0) return { status: 'unknown', ageDays: null };
  return { status: ageDays > 7 ? 'stale' : 'recent', ageDays };
}

/** Distinguish dated imported projections from live official FPL prices and injuries. */
export function importedProjectionsNotice(meta: RepoDataMeta | undefined, now: Date = new Date()): string | null {
  if (!meta || meta.benchmarkPlayers <= 0) return null;
  const date = meta.projectionFileDate ?? filenameProjectionDate(meta.benchmarkFile);
  const { status, ageDays } = projectionFreshness(date, now);
  const gws = meta.projectionGameweeks ?? [];
  const range = gws.length
    ? ` Imported file coverage: GW${Math.min(...gws)}–GW${Math.max(...gws)} (available values vary by player).`
    : '';
  const label = status === 'stale'
    ? `Imported projections may be stale — last file-name date: ${date} (${ageDays} days old).`
    : status === 'recent'
      ? `Imported xPts/xMins file-name date: ${date} (${ageDays} days old); not a live feed.`
      : 'Imported projection freshness unknown — dated source not verified.';
  return `${label} File-name date is not a verified provider publication time. Separate from live FPL data.${range}`;
}

export function snapshotSourceLabel(meta: SnapshotMeta | undefined): string {
  if (!meta) return 'OFFLINE';
  if (meta.source === 'live' && meta.upstreamOk && !meta.stale) return 'FPL LIVE';
  if (meta.source === 'cache' && meta.upstreamOk && !meta.stale) return 'FPL CACHE';
  if (meta.source === 'cache') return 'STALE CACHE';
  return meta.source === 'snapshot' ? 'SNAPSHOT' : 'OFFLINE';
}
