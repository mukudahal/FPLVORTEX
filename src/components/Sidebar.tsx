import {
  BrainCircuit,
  CalendarDays,
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

interface SidebarProps {
  route: RouteId;
  onNavigate: (route: RouteId) => void;
  snapshot: Snapshot | null;
  entry?: EntryData | null;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ route, onNavigate, snapshot, entry, open, onClose }: SidebarProps) {
  const playerCount = snapshot?.players.length ?? 667;
  const navItems = [
    { id: 'command' as const, label: 'Command center', hint: 'Home & GW hub', icon: Gauge },
    { id: 'optimizer' as const, label: 'Squad optimizer', hint: 'Planner · Chips · MC', icon: WandSparkles },
    { id: 'players' as const, label: 'Player lab', hint: `${playerCount} repo profiles`, icon: Users },
    { id: 'fixtures' as const, label: 'Fixture matrix', hint: 'Poisson & FDR', icon: CalendarDays },
    { id: 'league' as const, label: 'League intel', hint: 'EO & rivals', icon: Trophy },
    { id: 'method' as const, label: 'Model & automation', hint: 'Math & backtest', icon: BrainCircuit },
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
          <button type="button" className="sidebar__brand-button" onClick={() => onNavigate('command')} aria-label="Go to command center">
            <Brand />
          </button>
          <button type="button" className="icon-button sidebar__close" onClick={onClose} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="sidebar__season">
          <div className="sidebar__manager-row">
            <img
              src="/player-images/brand/fpl-vortex-lion.jpg"
              alt="FPL VORTEX lion crest"
              className="sidebar__repo-crest"
              loading="lazy"
            />
            <div>
              <span className="sidebar__season-label">TEAM #{entry?.id ?? 145784}</span>
              <strong>{entry?.teamName ?? 'FPLVORTEX'}</strong>
              <span>
                {snapshot?.meta.season ?? '2026/27'} ·{' '}
                {entry?.overallRank ? `OR ${formatNumber(entry.overallRank)}` : 'GW8–16 active'}
              </span>
            </div>
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
              <strong>Repo-first data engine</strong>
            </div>
            <p>
              {snapshot?.meta.upstreamOk
                ? 'Repo GW7–16 projections + live FPL feeds synchronized.'
                : 'Repo GW7–16 CSV projections primary · offline fixture/code supplement.'}
            </p>
            <div className="sidebar__status-meta">
              <span>{snapshot?.players.length ?? 667} players</span>
              <span>{snapshot?.fixtures.length ?? 380} fixtures</span>
            </div>
          </div>
          <div className="sidebar__version">
            <span>@FPLVORTEX</span>
            <span>2026/27 DEFCON</span>
          </div>
        </div>
      </aside>
    </>
  );
}
