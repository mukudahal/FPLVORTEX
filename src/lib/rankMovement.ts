/** In FPL a smaller overall-rank number is an improvement. Never infer an unknown prior rank. */
export function rankMovement(current: number | null | undefined, previous: number | null | undefined) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || !current || !previous || current <= 0 || previous <= 0) {
    return { direction: 'unknown' as const, delta: null };
  }
  const delta = Math.round(previous) - Math.round(current);
  return { direction: delta > 0 ? 'up' as const : delta < 0 ? 'down' as const : 'same' as const, delta };
}
