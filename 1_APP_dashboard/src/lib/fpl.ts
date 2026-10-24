import { db } from "@/db";
import { apiCache } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validFplPath, retryableStatus, retryWaitMilliseconds, maxStaleAgeMilliseconds } from "./fplReliability";

const BASE = "https://fantasy.premierleague.com/api";
const USER_AGENT = "FPL-Vortex/1.0 (analytics dashboard; contact: local)";
const MIN_GAP_MS = 250;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_JSON_BYTES = 15_000_000;
const MAX_ATTEMPTS = 3;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
const inFlight = new Map<string, Promise<FplFetchResult<unknown>>>();

export type FplDataStatus = "upstream" | "fresh-cache" | "stale-cache";
export interface FplFetchResult<T> {
  data: T;
  status: FplDataStatus;
  fetchedAt: string;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validatePath(path: string): string {
  if (!validFplPath(path)) {
    throw new RangeError("Invalid upstream FPL resource path.");
  }
  return path;
}

async function throttledFetch(url: string): Promise<Response> {
  const run = async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  };
  const pending = queue.then(run, run);
  queue = pending.catch(() => undefined);
  return pending;
}

export class FplError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function retryable(error: unknown): boolean {
  return !(error instanceof FplError) || retryableStatus(error.status);
}

async function fetchWithRetry(path: string): Promise<unknown> {
  const url = `${BASE}/${validatePath(path)}`;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let retryAfter: string | null = null;
    try {
      const response = await throttledFetch(url);
      retryAfter = response.headers.get("retry-after");
      if (!response.ok) throw new FplError(`FPL API ${response.status} for ${path}`, response.status);
      const length = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(length) && length > MAX_JSON_BYTES) {
        throw new FplError("Upstream FPL payload exceeds maximum size.", 502);
      }
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_JSON_BYTES) {
        throw new FplError("Upstream FPL payload exceeds maximum size.", 502);
      }
      return JSON.parse(body) as unknown;
    } catch (error) {
      lastError = error;
      if (!retryable(error) || attempt === MAX_ATTEMPTS - 1) break;
      await sleep(retryWaitMilliseconds(attempt, retryAfter, Date.now()));
    }
  }
  throw lastError instanceof Error ? lastError : new FplError("FPL API unreachable", 502);
}

async function readCache(key: string) {
  try {
    const rows = await db.select().from(apiCache).where(eq(apiCache.key, key)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error(`[FPL Vortex cache read failed: ${key}]`, error);
    return null;
  }
}

async function writeCache(key: string, data: unknown) {
  try {
    await db.insert(apiCache).values({ key, data, fetchedAt: new Date() }).onConflictDoUpdate({
      target: apiCache.key,
      set: { data, fetchedAt: new Date() },
    });
  } catch (error) {
    console.error(`[FPL Vortex cache write failed: ${key}]`, error);
  }
}

/** Generic accessors are intentionally unchanged for non-FPL material. */
export async function cacheGet<T>(key: string, maxAgeSeconds: number): Promise<T | null> {
  const row = await readCache(key);
  if (row && Date.now() - row.fetchedAt.getTime() < maxAgeSeconds * 1000) {
    return row.data as T;
  }
  return null;
}

export async function cacheSet(key: string, data: unknown): Promise<void> {
  await writeCache(key, data);
}

/** Cached reads are explicit about provenance; stale results never outlive a bounded grace window. */
export async function fplFetchDetailed<T>(path: string, ttlSeconds: number): Promise<FplFetchResult<T>> {
  validatePath(path);
  const staleWindowMs = maxStaleAgeMilliseconds(ttlSeconds);
  const cached = await readCache(path);
  const ageMs = cached ? Math.max(0, Date.now() - cached.fetchedAt.getTime()) : Infinity;
  if (cached && ageMs < ttlSeconds * 1000) {
    return { data: cached.data as T, status: "fresh-cache", fetchedAt: cached.fetchedAt.toISOString() };
  }
  const pending = inFlight.get(path);
  if (pending) return pending as Promise<FplFetchResult<T>>;

  const request: Promise<FplFetchResult<T>> = (async () => {
    try {
      const data = await fetchWithRetry(path);
      const fetchedAt = new Date().toISOString();
      await writeCache(path, data);
      return { data: data as T, status: "upstream", fetchedAt };
    } catch (error) {
      // Cache fallback must not camouflage missing endpoints or stale predictions.
      if (cached && !(error instanceof FplError && error.status === 404)
          && retryable(error) && ageMs <= staleWindowMs) {
        return { data: cached.data as T, status: "stale-cache", fetchedAt: cached.fetchedAt.toISOString() };
      }
      console.error(`[FPL Vortex upstream FPL fetch failed: ${path}]`, error);
      throw error;
    } finally {
      inFlight.delete(path);
    }
  })();
  inFlight.set(path, request as Promise<FplFetchResult<unknown>>);
  return request;
}

/** Backwards-compatible value API for existing calculation consumers. */
export async function fplFetch<T>(path: string, ttlSeconds: number): Promise<T> {
  return (await fplFetchDetailed<T>(path, ttlSeconds)).data;
}
