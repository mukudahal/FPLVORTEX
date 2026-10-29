import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../lib/types';
import { fetchSnapshot, forceRefresh } from '../lib/api';
import { isOlderSnapshot } from '../lib/snapshotFreshness';

export interface VortexDataState {
  snapshot: Snapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastSuccessAt: string | null;
  refresh: (manual?: boolean) => Promise<void>;
}

export function useVortexData(): VortexDataState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);

  const refresh = useCallback(async (manual = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (manual) setRefreshing(true);
    else if (!snapshot) setLoading(true);
    try {
      if (manual) {
        await forceRefresh(controller.signal);
      }
      const data = await fetchSnapshot(controller.signal);
      if (controller.signal.aborted) return;
      const existing = snapshotRef.current;
      if (existing && isOlderSnapshot(existing, data)) {
        const retained = { ...existing, meta: { ...existing.meta, source: 'cache' as const, stale: true, upstreamOk: false } };
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
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [snapshot]);

  useEffect(() => {
    void refresh(false);
    return () => controllerRef.current?.abort();
    // Initial load only; polling is configured separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
