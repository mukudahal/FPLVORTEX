export function validFplPath(path: string): boolean {
  return Boolean(path) && !path.startsWith("/") && !path.includes("..")
    && /^[a-z0-9/_?=&-]+$/i.test(path);
}

export function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function retryWaitMilliseconds(attempt: number, retryAfter: string | null, nowMs: number): number {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(10_000, seconds * 1_000);
  const date = retryAfter ? Date.parse(retryAfter) : NaN;
  if (Number.isFinite(date)) return Math.min(10_000, Math.max(0, date - nowMs));
  return Math.min(5_000, 500 * (2 ** Math.max(0, attempt)));
}

export function maxStaleAgeMilliseconds(ttlSeconds: number): number {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds < 0 || ttlSeconds > 86_400) {
    throw new RangeError("Invalid FPL cache lifetime.");
  }
  return Math.max(120_000, ttlSeconds * 2_000);
}
