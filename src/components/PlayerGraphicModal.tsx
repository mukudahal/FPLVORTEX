import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Calendar,
  Crosshair,
  Download,
  Footprints,
  Shield,
  Star,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { BRAND_LION_SRC } from '../lib/baseUrl';
import { parsePlayerInjuryDetails } from '../lib/analytics';
import { classNames } from '../lib/format';
import { downloadPlayerCardPng } from '../lib/playerCardPng';
import { makeFixtureForecasts, overallDifficulty, difficultyFillStyle, type FixtureForecast } from '../lib/fixtureForecast';
import {
  buildJerseyFallbackSvgDataUri,
  getPlayerPhotoCandidates,
} from '../lib/playerImages';
import type { EnrichedPlayer, FixtureRow, FplTeam, Position, Snapshot } from '../lib/types';
import { ClubBadge } from './ClubBadge';

interface PlayerGraphicModalProps {
  player: EnrichedPlayer | null;
  snapshot?: Snapshot;
  teams: FplTeam[];
  fixtureRows: FixtureRow[];
  reviewGw?: number;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  onClose: () => void;
  onOpenInjuryDetail?: (player: EnrichedPlayer) => void;
}

const POSITION_FULL_LABELS: Record<Position, string> = {
  GKP: 'GOALKEEPER',
  DEF: 'DEFENDER',
  MID: 'MIDFIELDER',
  FWD: 'FORWARD',
};

const SURNAME_PARTICLES = new Set([
  'van',
  'de',
  'di',
  'da',
  'del',
  'della',
  'dos',
  'das',
  'mac',
  'mc',
  'al',
  'el',
  'st',
  'st.',
  'le',
  'la',
]);

export function splitPlayerDisplayName(
  fullNameRaw: string,
  webNameRaw: string,
): { firstName: string; lastName: string } {
  const fullName = (fullNameRaw || '').trim();
  const webName = (webNameRaw || '').trim();
  const words = fullName.split(/\s+/).filter(Boolean);

  if (words.length <= 1) {
    return { firstName: '', lastName: (webName || fullName || 'PLAYER').toUpperCase() };
  }

  if (words.length === 2) {
    return {
      firstName: words[0].toUpperCase(),
      lastName: words[1].toUpperCase(),
    };
  }

  const secondLastLower = words[words.length - 2]?.toLowerCase() ?? '';
  if (SURNAME_PARTICLES.has(secondLastLower)) {
    return {
      firstName: words.slice(0, -2).join(' ').toUpperCase(),
      lastName: words.slice(-2).join(' ').toUpperCase(),
    };
  }

  if (webName) {
    const webLower = webName.toLowerCase();
    if (words[0].toLowerCase() === webLower) {
      return {
        firstName: words[0].toUpperCase(),
        lastName: words[words.length - 1].toUpperCase(),
      };
    }
    return {
      firstName: words[0].toUpperCase(),
      lastName: webName.toUpperCase(),
    };
  }

  return {
    firstName: words[0].toUpperCase(),
    lastName: words.slice(1).join(' ').toUpperCase(),
  };
}

function per90Value(stat: number, minutes: number): number {
  if (!Number.isFinite(stat) || !Number.isFinite(minutes) || minutes <= 0) return 0;
  return (stat / minutes) * 90;
}

function computeCleanSheetPct(player: EnrichedPlayer): number {
  if (player.minutes <= 0) {
    return Math.round(Math.max(0, Math.min(1, player.modelBreakdown?.csProb ?? 0)) * 100);
  }
  const appearances = Math.max(1, player.starts || Math.round(player.minutes / 90));
  const rawPct = Math.round((player.cleanSheets / appearances) * 100);
  return Math.max(0, Math.min(100, rawPct));
}

function SoccerBallIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polygon points="12 7 16.5 10.2 14.8 15.5 9.2 15.5 7.5 10.2 12 7" fill="currentColor" fillOpacity="0.28" />
      <line x1="12" y1="2" x2="12" y2="7" />
      <line x1="21.5" y1="9" x2="16.5" y2="10.2" />
      <line x1="18" y1="20" x2="14.8" y2="15.5" />
      <line x1="6" y1="20" x2="9.2" y2="15.5" />
      <line x1="2.5" y1="9" x2="7.5" y2="10.2" />
    </svg>
  );
}

export function PlayerGraphicModal({
  player,
  snapshot,
  teams,
  fixtureRows,
  isCaptain = false,
  isViceCaptain = false,
  onClose,
  onOpenInjuryDetail,
}: PlayerGraphicModalProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [savingPng, setSavingPng] = useState(false);
  const [pngError, setPngError] = useState<string | null>(null);

  useEffect(() => {
    if (!player) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !cardRef.current) return;
      if (cardRef.current.contains(target)) return;
      // Let clicks on another player trigger switch the card cleanly instead of closing first
      if (
        target.closest(
          '.vx-pitch-player, .pitch-player, .vx-clickable-row, .vx-top-player-row, .vx-injury-avatar-trigger, .float-card--interactive, [data-player-card-trigger]',
        )
      ) {
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

  const photoCandidates = useMemo(() => {
    if (!player) return [];
    const base = getPlayerPhotoCandidates(player.code, player.team.code, 'lg');
    // On phones the portrait renders at ~150-200 CSS px inside the card. Pulling the 500x500
    // cutout there costs 3-6x the bytes (often 200 KB+) and delays the card opening, so only
    // large viewports prefer it. The other size stays in the list as a fallback.
    const preferHighRes =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 861px)').matches;
    const highRes = base.filter((u) => u.includes('/500x500/'));
    const rest = base.filter((u) => !u.includes('/500x500/'));
    return preferHighRes ? [...highRes, ...rest] : [...rest, ...highRes];
  }, [player]);

  const fallbackPortrait = useMemo(
    () =>
      player
        ? buildJerseyFallbackSvgDataUri(
            player.fullName || player.name,
            player.team.shortName,
            player.position === 'GKP',
          )
        : '',
    [player],
  );

  const [photoIdx, setPhotoIdx] = useState(0);
  useEffect(() => {
    setPhotoIdx(0);
  }, [player?.id, player?.code]);

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const nextFiveFixtures = useMemo(() => {
    if (!player) return [];
    const row = fixtureRows.find((r) => r.team.id === player.teamId);
    if (!row) return [];
    const predictions = snapshot ? makeFixtureForecasts(snapshot, 'vortex', row.cells.slice(0, 5).map(c => c.event)) : new Map<string, FixtureForecast[]>();
    return row.cells.slice(0, 5).map((cell) => {
      if (cell.isBlank || cell.fixtures.length === 0) {
        return {
          key: `gw-${cell.event}`,
          label: 'BLANK',
          oppTeam: null as FplTeam | null,
          difficulty: null as number | null,
          isBlank: true,
        };
      }
      const primaryFx = cell.fixtures[0];
      const isHome = primaryFx.teamH === player.teamId;
      const oppId = isHome ? primaryFx.teamA : primaryFx.teamH;
      const oppTeam = teamMap.get(oppId) ?? null;
      const venue = isHome ? 'H' : 'A';
      const baseLabel = oppTeam ? `${oppTeam.shortName} (${venue})` : cell.label;
      const label = cell.fixtures.length > 1 ? `${baseLabel}+` : baseLabel;
      return {
        key: `gw-${cell.event}`,
        label,
        oppTeam,
        difficulty: (() => { const items = predictions.get(`${player.teamId}:${cell.event}`) ?? []; return items.length ? items.reduce((sum, item) => sum + overallDifficulty(item), 0) / items.length : null; })(),
        isBlank: false,
      };
    });
  }, [fixtureRows, player, teamMap, snapshot]);

  if (!player) return null;

  const { firstName, lastName } = splitPlayerDisplayName(player.fullName, player.name);
  const portraitSrc = photoIdx < photoCandidates.length ? photoCandidates[photoIdx] : fallbackPortrait;

  const xgPer90 = per90Value(player.xG, player.minutes).toFixed(2);
  const xaPer90 = per90Value(player.xA, player.minutes).toFixed(2);
  const goalsPer90 = per90Value(player.goals, player.minutes).toFixed(2);
  const assistsPer90 = per90Value(player.assists, player.minutes).toFixed(2);
  const cleanSheetPct = computeCleanSheetPct(player);
  const pointsPerMatch = player.ppg.toFixed(1);
  const hasFitnessNote =
    player.status !== 'a' ||
    (player.chance !== null && player.chance < 100) ||
    Boolean(player.news && player.news.trim().length > 0);
  const injuryInfo = hasFitnessNote ? parsePlayerInjuryDetails(player, nextFiveFixtures[0]?.label) : null;

  const statRows = [
    { label: 'xG PER 90', value: xgPer90, icon: <SoccerBallIcon /> },
    { label: 'xA PER 90', value: xaPer90, icon: <Footprints size={15} /> },
    { label: 'GOALS PER 90', value: goalsPer90, icon: <Crosshair size={15} /> },
    { label: 'ASSISTS PER 90', value: assistsPer90, icon: <Zap size={15} /> },
    { label: 'CLEAN SHEETS %', value: `${cleanSheetPct}%`, icon: <Shield size={15} /> },
    { label: 'POINTS PER MATCH', value: pointsPerMatch, icon: <Star size={15} /> },
  ];

  async function savePlayerPng() {
    if (!player || !cardRef.current || savingPng) return;
    setSavingPng(true);
    setPngError(null);
    try {
      const slug = player.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
      await downloadPlayerCardPng(cardRef.current, {
        name: player.fullName || player.name,
        club: player.team.name,
        position: POSITION_FULL_LABELS[player.position],
        price: '£' + player.price.toFixed(1) + 'M',
        ownership: player.ownership.toFixed(1) + '%',
        stats: statRows.map(row => ({ label: row.label, value: row.value })),
        fixtures: nextFiveFixtures.map(fx => ({ label: fx.label, rating: fx.difficulty })),
      }, 'fpl-vortex-player-' + (slug || String(player.id)) + '.png');
    } catch (error) {
      setPngError(error instanceof Error ? error.message : 'Could not create the player PNG.');
    } finally {
      setSavingPng(false);
    }
  }

  const content = (
    <aside
      className="vx-side-popup-dock vx-pcard-overlay"
      aria-label={`${player.fullName} side player card`}
    >
      <section
        ref={cardRef}
        className="vx-pcard vx-pcard--side"
        role="dialog"
        aria-modal="false"
        aria-label={`${player.fullName} FPL VORTEX player card`}
      >
        <div className="vx-pcard__top-actions" data-pitch-capture-exclude="true">
          <button type="button" className="vx-pcard__save-png"
            onClick={() => void savePlayerPng()} disabled={savingPng}
            aria-label="Save this player card as a 4K PNG">
            <Download size={16} /> {savingPng ? 'Preparing…' : 'Save PNG'}
          </button>
          <button type="button" className="vx-pcard__close" onClick={onClose}
            aria-label="Close player card"><X size={18} /></button>
        </div>
        {pngError && <p className="vx-pcard__png-error" role="alert">{pngError}</p>}

        {/* TOP HEADER RIBBONS */}
        <header className="vx-pcard__top-ribbons">
          <div className="vx-pcard__brand-ribbon">
            <img src={BRAND_LION_SRC} alt="" className="vx-pcard__brand-lion" width={30} height={30} />
            <span className="vx-pcard__brand-text">
              <strong>FPL</strong> <em>VORTEX</em>
            </span>
          </div>

          <div className="vx-pcard__pos-ribbon">
            <Shield size={15} className="vx-pcard__pos-icon" />
            <span>{POSITION_FULL_LABELS[player.position]}</span>
          </div>
        </header>

        {/* NEON INNER BROADCAST FRAME */}
        <div className="vx-pcard__frame">
          <img src={BRAND_LION_SRC} alt="" aria-hidden="true" className="vx-pcard__watermark" />

          <div className="vx-pcard__body">
            {/* LEFT HERO PLAYER CUTOUT PORTRAIT */}
            <div className="vx-pcard__portrait-col">
              <div className="vx-pcard__portrait-glow" aria-hidden="true" />
              {(isCaptain || isViceCaptain) && (
                <span className={classNames('vx-pcard__armband', isCaptain ? 'is-cap' : 'is-vice')}>
                  {isCaptain ? 'CAPTAIN (2×)' : 'VICE CAPTAIN'}
                </span>
              )}
              <img
                src={portraitSrc}
                data-player-code={player.code ?? ''}
                data-team-code={player.team.code ?? ''}
                alt={`${player.fullName} portrait`}
                className="vx-pcard__portrait-img"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                onError={() => {
                  setPhotoIdx((prev) => (prev < photoCandidates.length ? prev + 1 : prev));
                }}
              />
            </div>

            {/* RIGHT CLUB IDENTITY + PRICE/OWNERSHIP + 6 STAT ROWS */}
            <div className="vx-pcard__stats-col">
              <div className="vx-pcard__identity">
                <ClubBadge
                  teamCode={player.team.code}
                  shortName={player.team.shortName}
                  teamName={player.team.name}
                  size="lg"
                  className="vx-pcard__club-crest"
                />
                <div className="vx-pcard__name-stack">
                  {firstName && <span className="vx-pcard__first-name">{firstName}</span>}
                  <h3 className="vx-pcard__last-name">{lastName}</h3>
                  <span className="vx-pcard__club-pill">{player.team.name.toUpperCase()}</span>
                </div>
              </div>

              {/* DUAL GOLD PRICE + VIOLET OWNERSHIP BAR */}
              <div className="vx-pcard__market-bar">
                <div className="vx-pcard__market-price">
                  <small>PRICE</small>
                  <strong>£{player.price.toFixed(1)}M</strong>
                </div>
                <div className="vx-pcard__market-own">
                  <small>OWNERSHIP</small>
                  <strong>
                    <Users size={15} />
                    <span>{player.ownership.toFixed(1)}%</span>
                  </strong>
                </div>
              </div>

              {/* 6-ROW BROADCAST PER-90 & MATCH STATS */}
              <ul className="vx-pcard__stat-list" aria-label="Player key statistics">
                {statRows.map((row) => (
                  <li key={row.label} className="vx-pcard__stat-row">
                    <span className="vx-pcard__stat-icon">{row.icon}</span>
                    <span className="vx-pcard__stat-label">{row.label}</span>
                    <strong className="vx-pcard__stat-val">{row.value}</strong>
                  </li>
                ))}
              </ul>

              {injuryInfo && (
                <button
                  type="button"
                  className={classNames('vx-pcard__fitness-note', `is-${injuryInfo.severity}`)}
                  onClick={() => {
                    if (onOpenInjuryDetail) {
                      onClose();
                      onOpenInjuryDetail(player);
                    }
                  }}
                >
                  <span className={classNames('vx-injury-rect vx-injury-rect--sm', `is-${injuryInfo.severity}`)}>
                    <AlertTriangle size={11} />
                    <span>{injuryInfo.badgeText}</span>
                  </span>
                  <span className="vx-pcard__fitness-text">
                    {injuryInfo.injuryType} · {injuryInfo.expectedReturn}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* NEXT 5 FIXTURES BOX */}
          <div className="vx-pcard__fixtures-wrap">
            <div className="vx-pcard__fixtures-badge">
              <Calendar size={13} />
              <span>NEXT 5 FIXTURES</span>
            </div>

            <div className="vx-pcard__fixtures-grid">
              {nextFiveFixtures.map((fx) => (
                <div key={fx.key} className="vx-pcard__fix-item" style={fx.difficulty === null ? undefined : { ...difficultyFillStyle(fx.difficulty), borderRadius: 8 }}>
                  <strong className="vx-pcard__fix-opp">{fx.label}</strong>
                  <div className="vx-pcard__fix-crest">
                    {fx.oppTeam ? (
                      <ClubBadge
                        teamCode={fx.oppTeam.code}
                        shortName={fx.oppTeam.shortName}
                        teamName={fx.oppTeam.name}
                        size="md"
                      />
                    ) : (
                      <span className="vx-pcard__fix-blank">—</span>
                    )}
                  </div>
                  <span className={classNames('vx-pcard__fdr-pill', fx.difficulty === null && 'is-fdr-blank')} style={fx.difficulty === null ? undefined : difficultyFillStyle(fx.difficulty)} title="VORTEX average attack and defence index">
                    {fx.difficulty === null ? '—' : fx.difficulty.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* BOTTOM FDR LEGEND */}
          <footer className="vx-pcard__fdr-legend" aria-label="Fixture Difficulty Rating legend">
            <strong className="vx-pcard__fdr-title">FDR: VORTEX (PROVISIONAL)</strong>
            <span className="vx-pcard__legend-item">
              <em className="vx-pcard__fdr-dot" style={difficultyFillStyle(2.0)}>≤2.8</em> Easy
            </span>
            <span className="vx-pcard__legend-item">
              <em className="vx-pcard__fdr-dot" style={difficultyFillStyle(3.1)}>3.4</em> Moderate
            </span>
            <span className="vx-pcard__legend-item">
              <em className="vx-pcard__fdr-dot" style={difficultyFillStyle(3.8)}>4.2</em> Hard
            </span>
            <span className="vx-pcard__legend-item">
              <em className="vx-pcard__fdr-dot" style={difficultyFillStyle(4.6)}>5</em> Very Hard
            </span>
          </footer>
        </div>
      </section>
    </aside>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
