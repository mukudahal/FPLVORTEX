import { Moon, RefreshCw, Search, Sun, Target } from 'lucide-react';
import type { Snapshot } from '../lib/types';
import { BRAND_LION_SRC } from '../lib/baseUrl';
import type { RouteId } from '../hooks/useHashRoute';
import { SourcePill } from './SourcePill';

const ROUTE_TITLES: Record<RouteId, { title: string; subtitle: string }> = {
  command: { title: 'Command center', subtitle: 'The whole gameweek at a glance' },
  optimizer: { title: 'Squad optimizer', subtitle: 'Build the strongest legal fifteen automatically' },
  players: { title: 'Player lab', subtitle: 'Search, compare and explain every projection' },
  fixtures: { title: 'Fixture matrix', subtitle: 'Fixture forecasts and schedule difficulty' },
  league: { title: 'League intel', subtitle: 'Scan your team, transfers and rivals' },
  method: { title: 'Model & automation', subtitle: 'Transparent inputs, resilient infrastructure' },
};

interface TopbarProps {
  route: RouteId;
  snapshot: Snapshot | null;
  refreshing: boolean;
  lastSuccessAt: string | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  onRefresh: () => void;
  onNavigate: (route: RouteId) => void;
}

export function Topbar({
  route,
  snapshot,
  refreshing,
  lastSuccessAt,
  theme,
  onToggleTheme,
  onOpenPalette,
  onRefresh,
  onNavigate,
}: TopbarProps) {
  const heading = ROUTE_TITLES[route];
  const event = snapshot?.gameweeks.find((gameweek) => gameweek.id === snapshot.meta.nextEventId);
  return (
    <header className="topbar">
      <div className="topbar__left">
        <button
          type="button"
          className="topbar__brand-lion"
          onClick={() => onNavigate('command')}
          aria-label="FPL VORTEX home"
          title="FPL VORTEX — Command Center"
        >
          <img
            src={BRAND_LION_SRC}
            alt="FPL VORTEX"
            className="topbar__mobile-lion"
            width={44}
            height={44}
          />
        </button>
        <div className="topbar__identity"><div className="topbar__channel"><span>FPL</span> <strong>VORTEX</strong></div><p>Better transfers. Smarter captain picks.<br />Fixture ratings, goal projections &amp; clean-sheet probabilities.<br />Follow @FplVortexM for your next Gameweek edge.</p></div>
      </div>

      <div className="topbar__right">
        <div className="topbar__heading topbar__page-label"><h1>{heading.title}</h1><p>{heading.subtitle}</p></div>
        <button type="button" className="search-trigger" onClick={onOpenPalette}>
          <Search size={17} />
          <span>Search players, teams, pages…</span>
          <kbd>⌘ K</kbd>
        </button>

        <div className="gameweek-chip" title={event?.deadlineTime}>
          <span className="gameweek-chip__dot" />
          <span>{event?.shortName ?? 'GW —'}</span>
          <small>{snapshot?.meta.isLive ? 'LIVE' : 'NEXT'}</small>
        </div>

        <SourcePill
          snapshot={snapshot}
          refreshing={refreshing}
          lastSuccessAt={lastSuccessAt}
          onRefresh={onRefresh}
          compact
        />

        <button
          type="button"
          className="icon-button"
          onClick={() => void onRefresh()}
          disabled={refreshing}
          aria-label="Refresh data now"
          title="Refresh data now"
        >
          <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
        </button>

        <button
          type="button"
          className={`vortex-theme-switch ${theme === 'light' ? 'is-light' : 'is-dark'}`}
          onClick={onToggleTheme}
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={theme === 'dark' ? 'Dark theme (#070914) active — click for Light (#f4f6ff)' : 'Light theme (#f4f6ff) active — click for Dark (#070914)'}
        >
          <span className={`vortex-theme-switch__opt ${theme === 'dark' ? 'is-active' : ''}`} aria-hidden="true">
            <Moon size={14} />
          </span>
          <span className={`vortex-theme-switch__opt ${theme === 'light' ? 'is-active' : ''}`} aria-hidden="true">
            <Sun size={14} />
          </span>
        </button>

        <button type="button" className="button button--primary topbar__connect" onClick={() => onNavigate('league')}>
          <Target size={16} /> Connect team
        </button>
      </div>
    </header>
  );
}
