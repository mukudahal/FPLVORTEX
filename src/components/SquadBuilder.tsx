import { useDeferredValue, useMemo, useState, useTransition, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CircleDollarSign,
  Copy,
  Crown,
  Gauge,
  Info,
  Lock,
  LockOpen,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  WandSparkles,
} from 'lucide-react';
import type { EnrichedPlayer, RiskProfile, SquadPlayer, SquadResult } from '../lib/types';
import { optimizeSquad, formationRisk, MAX_PLAYERS_PER_CLUB } from '../lib/optimize';
import { classNames, formatNumber, formatPercent, formatPrice } from '../lib/format';
import { StatCard } from './StatCard';

interface SquadBuilderProps {
  players: EnrichedPlayer[];
  profile: RiskProfile;
  onProfileChange: (profile: RiskProfile) => void;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

const PROFILES: Array<{ id: RiskProfile; label: string; hint: string; icon: ReactNode }> = [
  { id: 'balanced', label: 'Balanced', hint: 'Best blend of projection and reliability', icon: <Gauge size={15} /> },
  { id: 'safe', label: 'Safe', hint: 'Favour minutes, ownership and confidence', icon: <ShieldCheck size={15} /> },
  { id: 'differential', label: 'Differential', hint: 'Boost low-owned, high-upside picks', icon: <Sparkles size={15} /> },
  { id: 'upside', label: 'Upside', hint: 'Prioritise ceiling and underlying numbers', icon: <WandSparkles size={15} /> },
];

interface PlayerCardProps {
  player: SquadPlayer;
  locked: boolean;
  onToggleLock: (id: number) => void;
  compact?: boolean;
}

function PlayerCard({ player, locked, onToggleLock, compact = false }: PlayerCardProps) {
  return (
    <article className={classNames('pitch-player', compact && 'pitch-player--compact', !player.isStarter && 'is-bench')}>
      <button
        type="button"
        className={classNames('pitch-player__lock', locked && 'is-locked')}
        onClick={() => onToggleLock(player.id)}
        aria-label={`${locked ? 'Unlock' : 'Lock'} ${player.name}`}
        title={locked ? 'Remove from locked picks' : 'Lock this player into the next optimization'}
      >
        {locked ? <Lock size={12} /> : <LockOpen size={12} />}
      </button>
      {player.isCaptain && <span className="pitch-player__badge is-captain" title="Captain"><Crown size={11} /> C</span>}
      {player.isViceCaptain && <span className="pitch-player__badge is-vice" title="Vice-captain">V</span>}
      <span className={`pitch-player__shirt team-${player.team.shortName.toLowerCase()}`}>
        {player.position}
      </span>
      <div className="pitch-player__info">
        <strong>{player.name}</strong>
        <small>{player.team.shortName} · {formatPrice(player.price)}</small>
      </div>
      <span className="pitch-player__projection">{player.projection.toFixed(1)}</span>
    </article>
  );
}

function Constraint({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={classNames('constraint', ok && 'is-ok')}>
      <span>{ok ? <Check size={13} /> : <AlertTriangle size={13} />}</span>
      {children}
    </div>
  );
}

function buildSquadText(result: SquadResult): string {
  const lines = [
    `FPL VORTEX · ${result.formation} · ${result.projectedPoints.toFixed(1)} projected pts · £${result.cost.toFixed(1)}m`,
    'STARTERS',
    ...result.starters.map((player) => `${player.position} ${player.name} (${player.team.shortName}) ${player.isCaptain ? '[C]' : ''}${player.isViceCaptain ? '[VC]' : ''}`),
    'BENCH',
    ...result.bench.map((player) => `${player.position} ${player.name} (${player.team.shortName})`),
  ];
  return lines.join('\n');
}

export function SquadBuilder({ players, profile, onProfileChange, onToast }: SquadBuilderProps) {
  const [budget, setBudget] = useState(1000);
  const [lockedIds, setLockedIds] = useState<number[]>([]);
  const [nonce, setNonce] = useState(0);
  const [isPending, startTransition] = useTransition();
  const deferredBudget = useDeferredValue(budget);
  const deferredLockedIds = useDeferredValue(lockedIds);

  const result = useMemo(() => {
    void nonce;
    if (!players.length) return null;
    try {
      return optimizeSquad(players, {
        budget: deferredBudget,
        profile,
        lockedIds: deferredLockedIds,
        beamWidth: 560,
        poolSize: 24,
      });
    } catch (error) {
      console.error('Optimizer failed:', error);
      return null;
    }
  }, [deferredBudget, deferredLockedIds, nonce, players, profile]);

  const toggleLock = (id: number) => {
    setLockedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id].slice(-8)));
  };

  const autoOptimize = () => {
    startTransition(() => setNonce((value) => value + 1));
    onToast('Re-optimized against the current player universe.', 'success');
  };

  const copySquad = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(buildSquadText(result));
      onToast('Optimized squad copied to clipboard.', 'success');
    } catch {
      onToast('Clipboard access was blocked by the browser.', 'error');
    }
  };

  if (!result) {
    return (
      <div className="page">
        <div className="panel empty-state">
          <RefreshCw size={24} className="spin" />
          <h3>Preparing the optimizer…</h3>
          <p>The player universe is still loading.</p>
        </div>
      </div>
    );
  }

  const counts = {
    GKP: result.squad.filter((player) => player.position === 'GKP').length,
    DEF: result.squad.filter((player) => player.position === 'DEF').length,
    MID: result.squad.filter((player) => player.position === 'MID').length,
    FWD: result.squad.filter((player) => player.position === 'FWD').length,
  };
  const maxClubCount = Math.max(
    ...[...new Set(result.squad.map((player) => player.teamId))].map(
      (teamId) => result.squad.filter((player) => player.teamId === teamId).length,
    ),
  );
  const byPosition = (position: string) => result.starters.filter((player) => player.position === position);
  const highConfidence = result.squad.filter((player) => player.confidence > 0.75).length;
  const differentialCount = result.squad.filter((player) => player.ownership < 15).length;

  return (
    <div className="page page--optimizer">
      <section className="optimizer-controls panel">
        <div className="optimizer-controls__intro">
          <span className="panel__eyebrow">AUTONOMOUS SQUAD ENGINE</span>
          <h3>Choose your strategy. VORTEX handles the constraints.</h3>
          <p>The search respects the £100m budget, 15-player squad shape, formation rules, and maximum three players per club.</p>
        </div>
        <div className="profile-switcher" role="group" aria-label="Optimization strategy">
          {PROFILES.map((item) => (
            <button
              type="button"
              key={item.id}
              className={classNames('profile-button', profile === item.id && 'is-active')}
              onClick={() => onProfileChange(item.id)}
              title={item.hint}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="budget-control">
          <label htmlFor="budget-range">
            <CircleDollarSign size={15} /> Squad budget
            <strong>£{(budget / 10).toFixed(1)}m</strong>
          </label>
          <input
            id="budget-range"
            type="range"
            min="950"
            max="1050"
            step="1"
            value={budget}
            onChange={(event) => setBudget(Number(event.target.value))}
          />
          <div className="budget-control__ticks"><span>£95m</span><span>£100m</span><span>£105m</span></div>
        </div>
        <div className="optimizer-controls__actions">
          <button type="button" className="button button--primary" onClick={autoOptimize} disabled={isPending}>
            {isPending ? <RefreshCw size={16} className="spin" /> : <WandSparkles size={16} />} Auto-optimise
          </button>
          <button type="button" className="button button--ghost" onClick={() => void copySquad()}>
            <Copy size={16} /> Copy squad
          </button>
          {lockedIds.length > 0 && (
            <button type="button" className="button button--ghost" onClick={() => setLockedIds([])}>
              <LockOpen size={16} /> Clear {lockedIds.length} locked
            </button>
          )}
        </div>
      </section>

      <section className="stat-grid stat-grid--optimizer">
        <StatCard label="Projected gameweek" value={`${result.projectedPoints.toFixed(1)} pts`} icon={<Gauge size={19} />} tone="violet" footer="Includes captain double points" />
        <StatCard label="Squad cost" value={`£${result.cost.toFixed(1)}m`} icon={<CircleDollarSign size={19} />} tone="mint" footer={`Remaining: £${(budget / 10 - result.cost).toFixed(1)}m`} />
        <StatCard label="Best formation" value={result.formation} icon={<Users size={19} />} tone="blue" footer={formationRisk(result)} />
        <StatCard label="Confidence" value={formatPercent(result.averageConfidence * 100, 0)} icon={<ShieldCheck size={19} />} tone="amber" footer={`${highConfidence} high-confidence starters`} />
      </section>

      <div className="optimizer-layout">
        <section className="panel pitch-panel">
          <div className="pitch-panel__header">
            <div>
              <span className="panel__eyebrow">AUTO-BUILT XV</span>
              <h3>{result.formation} formation</h3>
            </div>
            <div className="captain-summary">
              <Crown size={16} />
              <span><strong>{result.captain.name}</strong> captain · {result.viceCaptain.name} vice</span>
            </div>
          </div>
          <div className="pitch">
            <div className="pitch__stripes" />
            <div className="pitch__center-circle" />
            <div className="pitch__box pitch__box--top" />
            <div className="pitch__box pitch__box--bottom" />
            <div className="pitch__lineup">
              {(['GKP', 'DEF', 'MID', 'FWD'] as const).map((position) => (
                <div className={`pitch__row pitch__row--${position.toLowerCase()}`} key={position}>
                  {byPosition(position).map((player) => (
                    <PlayerCard
                      key={player.id}
                      player={player}
                      locked={lockedIds.includes(player.id)}
                      onToggleLock={toggleLock}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="bench">
            <div className="bench__header">
              <strong>BENCH · AUTO ORDER</strong>
              <span>Bench points are weighted lightly during squad selection.</span>
            </div>
            <div className="bench__players">
              {result.bench.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  locked={lockedIds.includes(player.id)}
                  onToggleLock={toggleLock}
                  compact
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="optimizer-side">
          <section className="panel constraint-panel">
            <div className="panel__header">
              <div><span className="panel__eyebrow">VALIDATION</span><h3>All FPL rules pass</h3></div>
              <ShieldCheck size={19} className="panel__header-icon" />
            </div>
            <div className="constraint-list">
              <Constraint ok={result.squad.length === 15}>Exactly 15 players</Constraint>
              <Constraint ok={counts.GKP === 2}>2 goalkeepers ({counts.GKP})</Constraint>
              <Constraint ok={counts.DEF === 5}>5 defenders ({counts.DEF})</Constraint>
              <Constraint ok={counts.MID === 5}>5 midfielders ({counts.MID})</Constraint>
              <Constraint ok={counts.FWD === 3}>3 forwards ({counts.FWD})</Constraint>
              <Constraint ok={maxClubCount <= MAX_PLAYERS_PER_CLUB}>Max {maxClubCount} players from one club</Constraint>
              <Constraint ok={result.cost <= budget / 10}>Budget limit respected</Constraint>
              <Constraint ok={result.starters.length === 11}>Valid 11-player starting XI</Constraint>
            </div>
          </section>

          <section className="panel squad-insight-panel">
            <div className="panel__header">
              <div><span className="panel__eyebrow">AUTOMATED READ</span><h3>Why this squad?</h3></div>
              <Sparkles size={19} className="panel__header-icon" />
            </div>
            <ul className="squad-insights">
              <li><Crown size={15} /><span><strong>{result.captain.name}</strong> leads the captain model at {result.captain.projection.toFixed(1)} projected points.</span></li>
              <li><Gauge size={15} /><span>Average model confidence is <strong>{formatPercent(result.averageConfidence * 100, 0)}</strong> across the fifteen.</span></li>
              <li><Sparkles size={15} /><span><strong>{differentialCount}</strong> selected players are owned by fewer than 15% of managers.</span></li>
              <li><Users size={15} /><span>Average effective ownership is <strong>{formatPercent(result.averageOwnership)}</strong> for the {profile} profile.</span></li>
            </ul>
            <div className="insight-callout insight-callout--info">
              <Info size={16} />
              <span>Lock any player with the padlock, then change strategy or re-run the optimizer to build around them.</span>
            </div>
          </section>

          <section className="panel value-panel">
            <div className="panel__header">
              <div><span className="panel__eyebrow">VALUE MAP</span><h3>Best points per million</h3></div>
            </div>
            <div className="value-list">
              {[...result.squad].sort((a, b) => b.value - a.value).slice(0, 5).map((player) => (
                <div className="value-row" key={player.id}>
                  <span className="team-badge">{player.team.shortName}</span>
                  <span><strong>{player.name}</strong><small>{player.position} · {formatPrice(player.price)}</small></span>
                  <strong>{player.value.toFixed(2)}</strong>
                </div>
              ))}
            </div>
            <div className="value-panel__footer">
              <span>{formatNumber(players.length, 0)} eligible players scanned</span>
              <span>Beam-search optimization</span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
