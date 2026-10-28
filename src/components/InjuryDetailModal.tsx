import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Clock,
  ShieldAlert,
  Stethoscope,
  X,
} from 'lucide-react';
import { parsePlayerInjuryDetails } from '../lib/analytics';
import { classNames, formatPrice } from '../lib/format';
import type { EnrichedPlayer } from '../lib/types';
import { ClubBadge } from './ClubBadge';
import { PlayerAvatar } from './PlayerAvatar';

interface InjuryDetailModalProps {
  player: EnrichedPlayer | null;
  nextFixtureLabel?: string;
  nextEventId?: number;
  onClose: () => void;
  onOpenPlayerCard?: (player: EnrichedPlayer) => void;
}

export function InjuryDetailModal({
  player,
  nextFixtureLabel,
  nextEventId,
  onClose,
  onOpenPlayerCard,
}: InjuryDetailModalProps) {
  const cardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!player) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !cardRef.current) return;
      if (cardRef.current.contains(target)) return;
      if (target.closest('.vx-injury-rect, .vx-injury-rect-sign, .vx-injury-copy-trigger, [data-injury-trigger]')) {
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClose, player]);

  if (!player) return null;

  const details = parsePlayerInjuryDetails(player, nextFixtureLabel);
  const newsDateLabel = player.newsAdded
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(player.newsAdded))
    : null;

  const content = (
    <aside
      className="vx-side-popup-dock vx-injury-modal-overlay"
      aria-label={`${player.fullName} injury side panel`}
    >
      <section
        ref={cardRef}
        className="vx-injury-modal vx-injury-modal--side"
        role="dialog"
        aria-modal="false"
        aria-label={`${player.fullName} injury and return report`}
      >
        <header className="vx-injury-modal__header">
          <div className="vx-injury-modal__badge-row">
            <span className={classNames('vx-injury-rect', `is-${details.severity}`)}>
              <AlertTriangle size={13} />
              <span>{details.statusLabel.toUpperCase()}</span>
            </span>
            {newsDateLabel && (
              <span className="vx-injury-modal__timestamp">
                <Clock size={12} /> Updated {newsDateLabel}
              </span>
            )}
          </div>

          <button
            type="button"
            className="vx-pcard__close vx-injury-modal__close"
            onClick={onClose}
            aria-label="Close injury details"
          >
            <X size={17} />
          </button>
        </header>

        <div className="vx-injury-modal__identity">
          <button
            type="button"
            className="vx-injury-modal__avatar-btn"
            onClick={() => {
              if (onOpenPlayerCard) {
                onClose();
                onOpenPlayerCard(player);
              }
            }}
            title="Click player image to open full FPL VORTEX graphic card"
          >
            <PlayerAvatar
              code={player.code}
              teamCode={player.team.code}
              name={player.name}
              fullName={player.fullName}
              teamShort={player.team.shortName}
              position={player.position}
              size="lg"
            />
          </button>

          <div className="vx-injury-modal__title-copy">
            <h3>{player.fullName || player.name}</h3>
            <div className="vx-injury-modal__sub">
              <ClubBadge
                teamCode={player.team.code}
                shortName={player.team.shortName}
                teamName={player.team.name}
                size="sm"
              />
              <span>{player.team.name}</span>
              <span>·</span>
              <span>{player.position}</span>
              <span>·</span>
              <strong>{formatPrice(player.price)}</strong>
            </div>
          </div>
        </div>

        <div className="vx-injury-modal__grid">
          <div className="vx-injury-modal__box">
            <span className="vx-injury-modal__label">
              <Stethoscope size={14} /> WHAT INJURY / ISSUE
            </span>
            <strong className="vx-injury-modal__val">{details.injuryType}</strong>
          </div>

          <div className="vx-injury-modal__box">
            <span className="vx-injury-modal__label">
              <CalendarClock size={14} /> WHEN BACK / EXPECTED RETURN
            </span>
            <strong className="vx-injury-modal__val">{details.expectedReturn}</strong>
          </div>
        </div>

        <div className="vx-injury-modal__chance-card">
          <div className="vx-injury-modal__chance-head">
            <span>
              <Activity size={14} /> Chance of Playing{nextEventId ? ` (GW ${nextEventId})` : ''}
            </span>
            <strong className={classNames(`is-${details.severity}`)}>{details.chancePercent}%</strong>
          </div>
          <div className="vx-injury-modal__bar-track" aria-hidden="true">
            <span
              className={classNames('vx-injury-modal__bar-fill', `is-${details.severity}`)}
              style={{ width: `${Math.max(4, details.chancePercent)}%` }}
            />
          </div>
          <div className="vx-injury-modal__chance-meta">
            <span>
              Projected xMins:{' '}
              <strong>
                {Math.round(player.modelBreakdown?.expectedMinutes ?? player.repoExpectedMinutes ?? 0)} mins
              </strong>
            </span>
            {nextFixtureLabel && (
              <span>Next Fixture: <strong>{nextFixtureLabel}</strong></span>
            )}
          </div>
        </div>

        <div className="vx-injury-modal__bulletin">
          <ShieldAlert size={15} />
          <div>
            <small>Official Premier League Bulletin</small>
            <p>{details.officialBulletin}</p>
          </div>
        </div>

        <footer className="vx-injury-modal__footer">
          <button type="button" className="vx-btn" onClick={onClose}>
            Close
          </button>
          {onOpenPlayerCard && (
            <button
              type="button"
              className="vx-btn-primary"
              onClick={() => {
                onClose();
                onOpenPlayerCard(player);
              }}
            >
              <span>View Player Stats Card</span>
              <ArrowRight size={14} />
            </button>
          )}
        </footer>
      </section>
    </aside>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
