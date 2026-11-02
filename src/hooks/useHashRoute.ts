import { useCallback, useEffect, useState } from 'react';

export const ROUTES = ['command', 'optimizer', 'review', 'players', 'fixtures', 'league', 'method'] as const;
export type RouteId = (typeof ROUTES)[number];

// Old review bookmarks remain valid even though Review is no longer a navigation tab.
export function resolveHashRoute(value: string): RouteId {
  const hash = value.replace(/^#\/?/, '').split('?')[0];
  return (ROUTES as readonly string[]).includes(hash) ? (hash as RouteId) : 'command';
}

function routeFromHash(): RouteId {
  return resolveHashRoute(window.location.hash);
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
