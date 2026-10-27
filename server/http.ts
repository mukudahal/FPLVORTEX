const BASE_URL = (process.env.FPL_API_BASE ?? 'https://fantasy.premierleague.com/api').replace(/\/$/, '');
const DEFAULT_TIMEOUT = Number.parseInt(process.env.FPL_REQUEST_TIMEOUT_MS ?? '6000', 10) || 6000;

export class UpstreamHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'UpstreamHttpError';
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function fetchFplJson<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${BASE_URL}${normalizedPath}`;
  const retries = options.retries ?? 1;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT),
        headers: {
          accept: 'application/json',
          'user-agent': 'FPL-VORTEX/1.0 (+automated public-data dashboard)',
        },
      });
      if (!response.ok) {
        const error = new UpstreamHttpError(`FPL upstream ${response.status} for ${normalizedPath}`, response.status);
        if (!isRetryableStatus(response.status)) throw error;
        lastError = error;
      } else {
        return (await response.json()) as T;
      }
    } catch (error) {
      if (error instanceof UpstreamHttpError && !isRetryableStatus(error.status)) {
        throw error;
      }
      lastError = error;
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not fetch ${url}`);
}

export function isNumericId(value: string): boolean {
  return /^\d{1,12}$/.test(value);
}
