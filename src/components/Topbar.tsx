import { Menu, Moon, RefreshCw, Search, Sun, Target } from 'lucide-react';
import type { Snapshot } from '../lib/types';
import { BRAND_LION_SRC } from '../lib/baseUrl';
import type { RouteId } from '../hooks/useHashRoute';
import { SourcePill } from './SourcePill';

const ROUTE_TITLES: Record<RouteId, { title: string; subtitle: string }> = {
  command: { title: 'Command center', subtitle: 'The whole gameweek at a glance' },
  optimizer: { title: 'Squad optimizer', subtitle: 'Build the strongest legal fifteen automatically' },
  players: { title: 'Player lab', subtitle: 'Search, compare and explain every projection' },
  fixtures: { title: 'Fixture matrix', subtitle: 'Five-gameweek difficulty and schedule swings' },
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
  onMenu: () => void;
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
  onMenu,
  onOpenPalette,
  onRefresh,
  onNavigate,
}: TopbarProps) {
  const heading = ROUTE_TITLES[route];
  const event = snapshot?.gameweeks.find((gameweek) => gameweek.id === snapshot.meta.nextEventId);
  return (
    <header className="topbar">
      <div className="topbar__left">
        <button type="button" className="icon-button topbar__menu" onClick={onMenu} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <img
          src={BRAND_LION_SRC}
          alt="FPL VORTEX"
          className="topbar__mobile-lion"
          width={34}
          height={34}
        />
        <div className="topbar__heading">
          <span className="topbar__breadcrumb">FPL VORTEX / {heading.title}</span>
          <h1>{heading.title}</h1>
          <p>{heading.subtitle}</p>
        </div>
      </div>

      <div className="topbar__right">
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
          className="icon-button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <button type="button" className="button button--primary topbar__connect" onClick={() => onNavigate('league')}>
          <Target size={16} /> Connect team
        </button>
      </div>
    </header>
  );
}
