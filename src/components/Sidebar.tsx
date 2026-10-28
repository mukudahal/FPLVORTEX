import {
  BrainCircuit,
  CalendarDays,
  ExternalLink,
  Gauge,
  Trophy,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import type { EntryData, Snapshot } from '../lib/types';
import type { RouteId } from '../hooks/useHashRoute';
import { classNames, formatNumber } from '../lib/format';
import { Brand } from './Brand';
import { XBrandLogo, YouTubeBrandLogo } from './SocialIcons';
import { YOUTUBE_CHANNEL_URL, handleYouTubeChannelClick } from './YouTubePlayerModal';

interface SidebarProps {
  route: RouteId;
  onNavigate: (route: RouteId) => void;
  snapshot: Snapshot | null;
  entry?: EntryData | null;
  open: boolean;
  onClose: () => void;
  onOpenYouTubeChannel?: () => void;
}

export function Sidebar({
  route,
  onNavigate,
  snapshot,
  entry,
  open,
  onClose,
  onOpenYouTubeChannel,
}: SidebarProps) {
  const playerCount = snapshot?.players.length ?? 667;
  const navItems = [
    { id: 'command' as const, label: 'Command center', hint: 'Gameweek hub', icon: Gauge },
    { id: 'optimizer' as const, label: 'Squad optimizer', hint: 'Planner · Chips · Sim', icon: WandSparkles },
    { id: 'players' as const, label: 'Player lab', hint: `${playerCount} profiles`, icon: Users },
    { id: 'fixtures' as const, label: 'Fixture matrix', hint: 'FDR & xG swings', icon: CalendarDays },
    { id: 'league' as const, label: 'League intel', hint: 'Team & rivals', icon: Trophy },
    { id: 'method' as const, label: 'Model & automation', hint: 'Scoring & engine', icon: BrainCircuit },
  ];

  return (
    <>
      <button
        type="button"
        className={classNames('sidebar-backdrop', open && 'is-open')}
        aria-label="Close navigation"
        onClick={onClose}
      />
      <aside className={classNames('sidebar', open && 'is-open')} aria-label="Main navigation">
        <div className="sidebar__header">
          <button
            type="button"
            className="sidebar__brand-button"
            onClick={() => onNavigate('command')}
            aria-label="FPL VORTEX home"
          >
            <Brand />
          </button>
          <button type="button" className="icon-button sidebar__close" onClick={onClose} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="sidebar__season">
          <div className="sidebar__channel-links">
            <a
              href={YOUTUBE_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar__yt-pill"
              title="Subscribe to @FPLVORTEX on YouTube"
              onClick={(e) => handleYouTubeChannelClick(e, onOpenYouTubeChannel)}
            >
              <YouTubeBrandLogo size={18} />
              <strong>@FPLVORTEX</strong>
              <ExternalLink size={11} />
            </a>
            <a
              href="https://x.com/FplVortexM"
              target="_blank"
              rel="noreferrer"
              className="sidebar__x-pill"
              title="Follow @FplVortexM on X"
            >
              <XBrandLogo size={13} />
              <span>@FplVortexM</span>
            </a>
          </div>
          <div className="sidebar__team-summary">
            <span className="sidebar__season-label">SEASON {snapshot?.meta.season ?? '2026/27'}</span>
            {entry ? (
              <>
                <strong>{entry.teamName} · #{entry.id}</strong>
                <span>
                  {entry.overallRank ? `OR ${formatNumber(entry.overallRank)} · ` : ''}
                  {entry.freeTransfers} FT · £{(entry.history.bank / 10).toFixed(1)}m ITB
                </span>
              </>
            ) : (
              <>
                <strong>Link Your FPL Team</strong>
                <span>Enter your FPL ID at the top</span>
              </>
            )}
          </div>
        </div>

        <nav className="sidebar__nav">
          <p className="sidebar__section-label">WORKSPACE</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={classNames('nav-item', route === item.id && 'is-active')}
                onClick={() => {
                  onNavigate(item.id);
                  onClose();
                }}
                aria-current={route === item.id ? 'page' : undefined}
              >
                <span className="nav-item__icon"><Icon size={18} /></span>
                <span className="nav-item__text">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
                {route === item.id && <span className="nav-item__active-dot" />}
              </button>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__status-card">
            <div className="sidebar__status-head">
              <span className={classNames('pulse-dot', snapshot?.meta.upstreamOk ? 'is-live' : 'is-stale')} />
              <strong>Automated data engine</strong>
            </div>
            <p>
              {snapshot?.meta.upstreamOk
                ? 'Live Premier League feeds and GW projections synchronized.'
                : 'GW7–16 projections active with resilient snapshot sync.'}
            </p>
            <div className="sidebar__status-meta">
              <span>{snapshot?.players.length ?? 667} players</span>
              <span>{snapshot?.fixtures.length ?? 380} fixtures</span>
            </div>
          </div>
          <div className="sidebar__version">
            <span>FPL VORTEX</span>
            <a
              href={YOUTUBE_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar__version-yt-link"
              onClick={(e) => handleYouTubeChannelClick(e, onOpenYouTubeChannel)}
            >
              <YouTubeBrandLogo size={14} />
              <span>youtube.com/@Fplvortex</span>
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
