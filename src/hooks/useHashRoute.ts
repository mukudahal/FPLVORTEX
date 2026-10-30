import { useCallback, useEffect, useState } from 'react';

export const ROUTES = ['command', 'review', 'optimizer', 'players', 'fixtures', 'league', 'method'] as const;
export type RouteId = (typeof ROUTES)[number];

function routeFromHash(): RouteId {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return (ROUTES as readonly string[]).includes(hash) ? (hash as RouteId) : 'command';
}

export function useHashRoute(): [RouteId, (route: RouteId) => void] {
  const [route, setRoute] = useState<RouteId>(routeFromHash);

  useEffect(() => {
    const onChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: RouteId) => {
    if (window.location.hash.replace(/^#\/?/, '') === next) {
      setRoute(next);
      return;
    }
    window.location.hash = `/${next}`;
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return [route, navigate];
}
