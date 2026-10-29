import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../lib/types';
import { fetchSnapshot, forceRefresh } from '../lib/api';
import { isOlderSnapshot } from '../lib/snapshotFreshness';
import { readSnapshotCache, writeSnapshotCache } from '../lib/snapshotCache';

export interface VortexDataState {
  snapshot: Snapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastSuccessAt: string | null;
  refresh: (manual?: boolean) => Promise<void>;
}

export function useVortexData(): VortexDataState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() => {
    try { return readSnapshotCache(window.localStorage); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef<Snapshot | null>(snapshot);

  const refresh = useCallback(async (manual = false) => {
    if (!manual && controllerRef.current) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (manual) setRefreshing(true);
    else if (!snapshotRef.current) setLoading(true);
    try {
      if (manual) {
        await forceRefresh(controller.signal);
      }
      const data = await fetchSnapshot(controller.signal);
      if (controller.signal.aborted) return;
      const existing = snapshotRef.current;
      if (existing && isOlderSnapshot(existing, data)) {
        const retained = { ...existing, meta: { ...existing.meta, stale: true, upstreamOk: false } };
        snapshotRef.current = retained;
        setSnapshot(retained);
        setError('An older data snapshot was ignored; showing the latest available data.');
      } else {
        snapshotRef.current = data;
        setSnapshot(data);
        setError(data.meta.stale ? 'Live data is unavailable or updating — showing the latest available snapshot.' : null);
      }
      setLastSuccessAt(new Date().toISOString());
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Could not load FPL data.');
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!snapshot || snapshot.meta.source === 'offline') return;
    // Persist outside render; quota errors must not delay or block a successful load.
    const timer = window.setTimeout(() => {
      try { writeSnapshotCache(window.localStorage, snapshot); } catch { /* optional cache */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [snapshot]);

  useEffect(() => {
    void refresh(false);
    return () => controllerRef.current?.abort();
    // Initial load only; polling is configured separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!snapshot?.meta.stale) return;
    // Upgrade a cold-start fallback promptly instead of waiting a full polling minute.
    // Bound rapid retries; persistent outages return to the regular polling interval.
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 30_000) { window.clearInterval(timer); return; }
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh(false);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [snapshot?.meta.stale, refresh]);

  useEffect(() => {
    // Check for an updated snapshot at least once a minute; the server/provider cache
    // still controls paid odds requests and may return older prices.
    const intervalSeconds = Math.min(60, Math.max(30, snapshot?.meta.refreshSeconds ?? 60));
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh(false);
    }, intervalSeconds * 1000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      const staleAfter = intervalSeconds * 1000;
      if (!lastSuccessAt || Date.now() - new Date(lastSuccessAt).getTime() > staleAfter) void refresh(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, lastSuccessAt, snapshot?.meta.refreshSeconds]);

  return { snapshot, loading, refreshing, error, lastSuccessAt, refresh };
}

