"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseJsonResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
  lastUpdated: Date | null;
}

/**
 * Client-side JSON fetcher with optional polling.
 * Guarantees loading === true whenever url is non-null and neither data nor error has resolved yet.
 */
export function useJson<T>(
  url: string | null,
  refreshMs = 0,
): UseJsonResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(url));
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(async (target: string, isInitial: boolean) => {
    if (isInitial) setLoading(true);
    try {
      const res = await fetch(target);
      let body: unknown = null;
      try {
        body = await res.json();
      } catch (parseErr) {
        console.error(`[FPL Vortex useJson JSON parse error for ${target}]`, parseErr);
      }
      if (urlRef.current !== target) return;
      if (!res.ok) {
        const bodyErr =
          body && typeof body === "object" && "error" in body
            ? (body as { error?: unknown }).error
            : undefined;
        const errMsg =
          typeof bodyErr === "string" && bodyErr
            ? bodyErr
            : `Request failed (${res.status})`;
        console.error(`[FPL Vortex useJson HTTP ${res.status} for ${target}]`, errMsg);
        setError(errMsg);
        setResolvedUrl(target);
        if (isInitial) setData(null);
      } else {
        setData(body as T);
        setError(null);
        setResolvedUrl(target);
        setLastUpdated(new Date());
      }
    } catch (netErr) {
      console.error(`[FPL Vortex useJson network error for ${target}]`, netErr);
      if (urlRef.current === target) {
        setError(
          netErr instanceof Error ? netErr.message : "Network request failed",
        );
        setResolvedUrl(target);
      }
    } finally {
      if (urlRef.current === target) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      setError(null);
      setResolvedUrl(null);
      return;
    }
    setData(null);
    setError(null);
    setLoading(true);
    void load(url, true);
    if (refreshMs > 0) {
      const t = setInterval(() => void load(url, false), refreshMs);
      return () => clearInterval(t);
    }
  }, [url, refreshMs, load]);

  const refresh = useCallback(() => {
    if (url) {
      setLoading(true);
      setError(null);
      void load(url, false);
    }
  }, [url, load]);

  // If url just transitioned from null to a new string and hasn't resolved yet, treat as loading
  const effectiveLoading =
    loading || (Boolean(url) && resolvedUrl !== url && data === null && error === null);

  return { data, error, loading: effectiveLoading, refresh, lastUpdated };
}
