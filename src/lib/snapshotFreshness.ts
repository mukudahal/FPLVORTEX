import type { Snapshot } from './types';

/** Reject a response known to predate the data already on screen. Unknown dates are not ordered. */
export function isOlderSnapshot(current: Snapshot | null, incoming: Snapshot): boolean {
  if (!current) return false;
  const currentTime = Date.parse(current.meta.generatedAt ?? '');
  const incomingTime = Date.parse(incoming.meta.generatedAt ?? '');
  return Number.isFinite(currentTime) && Number.isFinite(incomingTime) && incomingTime < currentTime;
}
