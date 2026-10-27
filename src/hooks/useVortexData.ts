import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../lib/types';
import { fetchOfflineSnapshot, fetchSnapshot, forceRefresh } from '../lib/api';

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
      let data: Snapshot;
      try {
        data = await fetchSnapshot(controller.signal);
      } catch (apiError) {
        if (controller.signal.aborted) throw apiError;
        data = await fetchOfflineSnapshot(controller.signal);
      }
      if (controller.signal.aborted) return;
      setSnapshot(data);
      setError(data.meta.stale ? 'Live upstream unavailable — showing the built-in data snapshot.' : null);
      setLastSuccessAt(new Date().toISOString());
    } catch (caught) {
      if (controller.signal.aborted) return;
      try {
        const fallback = await fetchOfflineSnapshot();
        setSnapshot(fallback);
        setError('The data engine is offline — using the built-in snapshot.');
        setLastSuccessAt(new Date().toISOString());
      } catch {
        setError(caught instanceof Error ? caught.message : 'Could not load FPL data.');
      }
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
    const intervalSeconds = Math.max(30, snapshot?.meta.refreshSeconds ?? 300);
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
