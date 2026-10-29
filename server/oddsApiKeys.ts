/** Fail over only on explicit exhausted credits, not rate limits or outages. */
export function createOddsApiFetcher(request: typeof fetch = fetch, now: () => number = Date.now, retryMs = 6 * 60 * 60 * 1000) {
  const exhaustedUntil = new Map<string, number>();
  return async (primary: string, backup: string, timeoutMs: number): Promise<string | null> => {
    const keys = [...new Set([primary.trim(), backup.trim()].filter(Boolean))];
    for (const key of exhaustedUntil.keys()) if (!keys.includes(key)) exhaustedUntil.delete(key);
    for (const key of keys) {
      const until = exhaustedUntil.get(key);
      if (until !== undefined && until > now()) continue;
      if (until !== undefined) exhaustedUntil.delete(key);
      const url = new URL('https://api.the-odds-api.com/v4/sports/soccer_epl/odds/');
      url.search = new URLSearchParams({ apiKey: key, regions: 'uk,eu', markets: 'h2h,totals', oddsFormat: 'decimal' }).toString();
      try {
        const response = await request(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'Mozilla/5.0 FPL-VORTEX/4.0', Accept: 'application/json' } });
        const body = await response.text();
        if (response.ok) {
          const remaining = response.headers.get('x-requests-remaining');
          if (remaining !== null && /^\s*0\s*$/.test(remaining)) exhaustedUntil.set(key, now() + retryMs);
          return body;
        }
        let exhausted = false;
        try {
          const error: unknown = JSON.parse(body);
          exhausted = typeof error === 'object' && error !== null && 'error_code' in error && error.error_code === 'OUT_OF_USAGE_CREDITS';
        } catch { /* malformed errors are not proof of quota exhaustion */ }
        if (exhausted) { exhaustedUntil.set(key, now() + retryMs); continue; }
        return null;
      } catch {
        // Never log exception or request URL: it contains the secret.
        return null;
      }
    }
    return null;
  };
}
