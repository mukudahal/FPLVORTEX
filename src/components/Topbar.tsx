import { useMemo } from 'react';
import { Clock3, Moon, RefreshCw, Search, Sun } from 'lucide-react';
import { BRAND_LION_SRC } from '../lib/baseUrl';
import type { RouteId } from '../hooks/useHashRoute';
import { useNow } from '../hooks/useNow';
import { countdown } from '../lib/format';
import type { Snapshot } from '../lib/types';

interface TopbarProps {
  snapshot: Snapshot;
  refreshing: boolean;
  onRefresh: () => void;
  theme: 'dark' | 'light';
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  onNavigate: (route: RouteId) => void;
}

export function Topbar({
  snapshot,
  refreshing,
  onRefresh,
  theme,
  searchQuery,
  onSearchChange,
  onToggleTheme,
  onOpenPalette,
  onNavigate,
}: TopbarProps) {
  const event = snapshot.gameweeks.find((week) => week.id === snapshot.meta.nextEventId);
  const now = useNow(1000);
  const remaining = useMemo(() => countdown(event?.deadlineTime), [event?.deadlineTime, now]);
  const deadlineDate = event?.deadlineTime && Number.isFinite(Date.parse(event.deadlineTime))
    ? `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(event.deadlineTime))} UTC`
    : 'Date TBC';

  return (
    <header className="topbar">
      <div className="topbar__left">
        <button
          type="button"
          className="topbar__brand-lion"
          onClick={() => onNavigate('command')}
          aria-label="Go to FPL VORTEX Home"
          title="FPL VORTEX — Home"
        >
          <img
            src={BRAND_LION_SRC}
            alt="FPL VORTEX lion logo"
            className="topbar__mobile-lion"
            width={58}
            height={58}
          />
        </button>
        <div className="topbar__identity">
          <div className="topbar__channel"><span>FPL</span> <strong>VORTEX</strong></div>
        </div>
        <div className="topbar__deadline" aria-label="Next gameweek deadline and countdown">
          <Clock3 size={17} aria-hidden="true" />
          <div>
            <strong>GW{snapshot.meta.nextEventId} DEADLINE</strong>
            <small>{deadlineDate}</small>
          </div>
          <b aria-label="Time remaining">{remaining.label}</b>
        </div>
      </div>

      <div className="topbar__right">
        <label className="topbar__global-search">
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              onOpenPalette();
            }}
            onFocus={onOpenPalette}
            placeholder="SEARCH PLAYERS, TEAMS & PAGES"
            aria-label="Search all players, teams and site pages"
            autoComplete="off"
          />
          <kbd aria-hidden="true">⌘ K</kbd>
        </label>
        <div className="topbar__utilities">
          <button
            type="button"
            className={`vortex-theme-switch ${theme === 'light' ? 'is-light' : 'is-dark'}`}
            onClick={onToggleTheme}
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            <span className={`vortex-theme-switch__opt ${theme === 'dark' ? 'is-active' : ''}`} aria-hidden="true"><Moon size={14} /></span>
            <span className={`vortex-theme-switch__opt ${theme === 'light' ? 'is-active' : ''}`} aria-hidden="true"><Sun size={14} /></span>
          </button>
          <button type="button" className="topbar__sync" onClick={onRefresh} disabled={refreshing} title="Sync official FPL data">
            <RefreshCw size={12} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'SYNCING' : 'SYNC FPL'}
          </button>
        </div>
      </div>
    </header>
  );
}
