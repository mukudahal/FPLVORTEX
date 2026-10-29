import type { DataSource, Snapshot, SnapshotMeta } from './types';

export type SnapshotFreshness = 'recent' | 'stale' | 'unknown';

/** Source generation time is separate from the time this API response was served. */
export function getSnapshotFreshness(
  meta: SnapshotMeta | null | undefined,
  now: Date = new Date(),
): { status: SnapshotFreshness; ageMinutes: number | null } {
  if (!meta || !Number.isFinite(now.valueOf())) return { status: 'unknown', ageMinutes: null };
  const generated = Date.parse(meta.generatedAt ?? '');
  const ageMs = now.getTime() - generated;
  if (!Number.isFinite(generated) || !Number.isFinite(ageMs) || ageMs < 0) {
    return { status: 'unknown', ageMinutes: null };
  }
  const intervalSeconds = Number.isFinite(meta.refreshSeconds) && meta.refreshSeconds > 0
    ? meta.refreshSeconds : 600;
  const thresholdMs = Math.max(120_000, Math.min(1_800_000, intervalSeconds * 2_000));
  return {
    status: meta.stale || ageMs > thresholdMs ? 'stale' : 'recent',
    ageMinutes: Math.floor(ageMs / 60_000),
  };
}

/** No fresh-source assertions are made from a mirrored file alone. */
export function mirroredSnapshotState(
  meta: SnapshotMeta,
  maxAgeMs: number,
  now: Date = new Date(),
): { source: DataSource; upstreamOk: boolean; stale: boolean } {
  const generated = Date.parse(meta.generatedAt ?? '');
  const mirrored = Date.parse(meta.mirroredAt ?? '');
  const current = now.getTime();
  const recent = Boolean(meta.mirroredFrom) &&
    Number.isFinite(maxAgeMs) && maxAgeMs > 0 &&
    Number.isFinite(generated) && Number.isFinite(mirrored) && Number.isFinite(current) &&
    generated <= mirrored && mirrored <= current &&
    current - generated >= 0 && current - generated < maxAgeMs &&
    current - mirrored >= 0 && current - mirrored < maxAgeMs;
  return recent
    ? { source: 'cache', upstreamOk: false, stale: false }
    : { source: 'snapshot', upstreamOk: false, stale: true };
}

/** Plain-text source status; a recent mirror is not proof of a live upstream connection. */
export function snapshotFreshnessNotice(meta: SnapshotMeta, now: Date = new Date()): string {
  const { status, ageMinutes } = getSnapshotFreshness(meta, now);
  const age = ageMinutes === null ? '' : ` (${ageMinutes} min old)`;
  const kind = meta.mirroredFrom ? 'Mirrored snapshot' :
    meta.source === 'live' ? 'Official FPL API snapshot' :
      meta.source === 'cache' ? 'FPL server cache' : 'Offline/static snapshot';
  const state = status === 'unknown' ? 'age unknown (missing/invalid/future generation time)' :
    status === 'stale' ? `stale${age}` : `recent${age}`;
  return `${kind}: ${state}. ${meta.mirroredFrom ? 'Not a verified live connection. ' : ''}Generated: ${meta.generatedAt || 'unknown'}; served: ${meta.servedAt || 'unknown'}.`;
}


/** Reject a response known to predate the data already on screen. Unknown dates are not ordered. */
export function isOlderSnapshot(current: Snapshot | null, incoming: Snapshot): boolean {
  if (!current) return false;
  const currentTime = Date.parse(current.meta.generatedAt ?? '');
  const incomingTime = Date.parse(incoming.meta.generatedAt ?? '');
  return Number.isFinite(currentTime) && Number.isFinite(incomingTime) && incomingTime < currentTime;
}
