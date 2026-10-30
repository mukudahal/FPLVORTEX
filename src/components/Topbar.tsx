import { Moon, Search, Sun } from 'lucide-react';
import { BRAND_LION_SRC } from '../lib/baseUrl';
import type { RouteId } from '../hooks/useHashRoute';

interface TopbarProps {
  theme: 'dark' | 'light';
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  onNavigate: (route: RouteId) => void;
}

export function Topbar({
  theme,
  searchQuery,
  onSearchChange,
  onToggleTheme,
  onOpenPalette,
  onNavigate,
}: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="topbar__identity">
          <div className="topbar__channel"><span>FPL</span> <strong>VORTEX</strong></div>
        </div>
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
      </div>

      <div className="topbar__right">
        <label className="topbar__global-search">
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => {
              onSearchChange(event.target.value);
              onOpenPalette();
            }}
            onFocus={onOpenPalette}
            placeholder="Search players, teams & all pages…"
            aria-label="Search all FPL VORTEX players, teams and website tabs"
            autoComplete="off"
          />
          <kbd aria-hidden="true">⌘ K</kbd>
        </label>
        <button
          type="button"
          className={`vortex-theme-switch ${theme === 'light' ? 'is-light' : 'is-dark'}`}
          onClick={onToggleTheme}
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          <span className={`vortex-theme-switch__opt ${theme === 'dark' ? 'is-active' : ''}`} aria-hidden="true">
            <Moon size={14} />
          </span>
          <span className={`vortex-theme-switch__opt ${theme === 'light' ? 'is-active' : ''}`} aria-hidden="true">
            <Sun size={14} />
          </span>
        </button>
      </div>
    </header>
  );
}
