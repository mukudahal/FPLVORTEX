import {
  BrainCircuit,
  CalendarDays,
  Gauge,
  Trophy,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import type { Snapshot } from '../lib/types';
import type { RouteId } from '../hooks/useHashRoute';
import { classNames } from '../lib/format';
import { Brand } from './Brand';

const NAV_ITEMS = [
  { id: 'command', label: 'Command center', hint: 'Live overview', icon: Gauge },
  { id: 'optimizer', label: 'Squad optimizer', hint: 'Best XV', icon: WandSparkles },
  { id: 'players', label: 'Player lab', hint: '669 profiles', icon: Users },
  { id: 'fixtures', label: 'Fixture matrix', hint: 'FDR swings', icon: CalendarDays },
  { id: 'league', label: 'League intel', hint: 'Team & rivals', icon: Trophy },
  { id: 'method', label: 'Model & automation', hint: 'How it works', icon: BrainCircuit },
] as const;

interface SidebarProps {
  route: RouteId;
  onNavigate: (route: RouteId) => void;
  snapshot: Snapshot | null;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ route, onNavigate, snapshot, open, onClose }: SidebarProps) {
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
          <span className="sidebar__season-label">SEASON</span>
          <strong>{snapshot?.meta.season ?? '2026/27'}</strong>
          <span>{snapshot?.meta.isLive ? 'Matchday live' : 'Tracking next deadline'}</span>
        </div>

        <nav className="sidebar__nav">
          <p className="sidebar__section-label">WORKSPACE</p>
          {NAV_ITEMS.map((item) => {
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
              <span className={classNames('pulse-dot', snapshot?.meta.upstreamOk && 'is-live')} />
              <strong>Autonomous data engine</strong>
            </div>
            <p>
              {snapshot?.meta.upstreamOk
                ? 'Public FPL feeds are normalized, scored and refreshed automatically.'
                : 'Resilient offline snapshot is keeping the dashboard available.'}
            </p>
            <div className="sidebar__status-meta">
              <span>{snapshot?.players.length ?? 0} players</span>
              <span>{snapshot?.fixtures.length ?? 0} fixtures</span>
            </div>
          </div>
          <div className="sidebar__version">
            <span>VORTEX OS</span>
            <span>v1.0</span>
          </div>
        </div>
      </aside>
    </>
  );
}
