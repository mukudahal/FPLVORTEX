import { useMemo } from 'react';
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CircleDollarSign,
  Clock,
  Crown,
  Flame,
  Gauge,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  WandSparkles,
  Zap,
} from 'lucide-react';
import type { EnrichedPlayer, FixtureRow, RiskProfile, Snapshot } from '../lib/types';
import type { RouteId } from '../hooks/useHashRoute';
import { useNow } from '../hooks/useNow';
import { buildInsights } from '../lib/analytics';
import { countdown, formatCompact, formatNumber, formatPercent, formatPrice, formatSigned } from '../lib/format';
import { Sparkline } from './Sparkline';
import { StatCard } from './StatCard';

interface CommandCenterProps {
  snapshot: Snapshot;
  players: EnrichedPlayer[];
  insights: ReturnType<typeof buildInsights>;
  fixtureRows: FixtureRow[];
  profile: RiskProfile;
  onNavigate: (route: RouteId) => void;
  onOpenPalette: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function CommandCenter({
  snapshot,
  players,
  insights,
  fixtureRows,
  profile,
  onNavigate,
  onOpenPalette,
  onRefresh,
  refreshing,
}: CommandCenterProps) {
  const now = useNow(1000);
  const nextEvent = snapshot.gameweeks.find((event) => event.id === snapshot.meta.nextEventId);
  const currentEvent = snapshot.gameweeks.find((event) => event.id === snapshot.meta.currentEventId);
  const deadline = useMemo(() => countdown(nextEvent?.deadlineTime), [nextEvent?.deadlineTime, now]);
  const captain = insights.captainCandidates[0];
  const differential = insights.differentials[0];
  const valuePick = insights.bestValues[0];
  const mover = insights.marketIn[0];
  const bestFixture = fixtureRows[0];
  const improving = [...fixtureRows].sort((a, b) => a.swing - b.swing)[0];
  const averageOwnership = players.reduce((sum, player) => sum + player.ownership, 0) / Math.max(1, players.length);

  return (
    <div className="page page--command">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__noise" />
        <div className="hero__content">
          <div className="eyebrow"><Sparkles size={14} /> AUTONOMOUS FPL INTELLIGENCE · {snapshot.meta.season}</div>
          <h2 id="hero-title">Every transfer, captain and fixture — pulled into focus.</h2>
          <p>
            VORTEX reads the live FPL universe, scores every player against upcoming fixtures, and turns the noise into
            decisions you can make before the deadline.
          </p>
          <div className="hero__actions">
            <button type="button" className="button button--primary button--large" onClick={() => onNavigate('optimizer')}>
              <WandSparkles size={18} /> Auto-build best squad <ArrowRight size={17} />
            </button>
            <button type="button" className="button button--ghost button--large" onClick={onOpenPalette}>
              <Target size={18} /> Find a player
            </button>
          </div>
          <div className="hero__trust">
            <span><Users size={15} /> <strong>{formatNumber(snapshot.players.length)}</strong> players scored</span>
            <span><Activity size={15} /> <strong>{formatNumber(snapshot.fixtures.length)}</strong> fixtures parsed</span>
            <span><Clock size={15} /> <strong>{snapshot.meta.isLive ? '45s' : '10m'}</strong> auto refresh</span>
          </div>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <div className="vortex-orb">
            <span className="vortex-orb__ring vortex-orb__ring--one" />
            <span className="vortex-orb__ring vortex-orb__ring--two" />
            <span className="vortex-orb__ring vortex-orb__ring--three" />
            <div className="vortex-orb__core">
              <small>PROJECTION HORIZON</small>
              <strong>{nextEvent?.shortName ?? 'GW 1'}</strong>
              <span>{profile} model</span>
            </div>
            <i className="vortex-orb__satellite vortex-orb__satellite--a" />
            <i className="vortex-orb__satellite vortex-orb__satellite--b" />
          </div>
          {captain && (
            <div className="float-card float-card--captain">
              <span className="float-card__label"><Crown size={12} /> CAPTAIN SIGNAL</span>
              <strong>{captain.name}</strong>
              <span>{captain.projection.toFixed(1)} projected pts</span>
            </div>
          )}
          {bestFixture && (
            <div className="float-card float-card--fixture">
              <span className="float-card__label"><Zap size={12} /> BEST FIXTURE RUN</span>
              <strong>{bestFixture.team.shortName}</strong>
              <span>{bestFixture.next5.toFixed(2)} avg FDR</span>
            </div>
          )}
        </div>
      </section>

      <section className="deadline-band" aria-label="Upcoming deadline">
        <div className="deadline-band__intro">
          <span className="deadline-band__icon"><Clock size={20} /></span>
          <div>
            <strong>{nextEvent?.name ?? 'Next gameweek'} deadline</strong>
            <span>{nextEvent?.deadlineTime ? new Date(nextEvent.deadlineTime).toUTCString() : 'Schedule to be confirmed'}</span>
          </div>
        </div>
        <div className="countdown" aria-live="off">
          {deadline.parts.length ? deadline.parts.map((part) => (
            <div className="countdown__unit" key={part.unit}>
              <strong>{part.value}</strong>
              <span>{part.unit}</span>
            </div>
          )) : <strong>{deadline.label}</strong>}
        </div>
        <div className="deadline-band__pulse">
          <span className={snapshot.meta.isLive ? 'pulse-dot is-live' : 'pulse-dot'} />
          <div>
            <strong>{snapshot.meta.isLive ? 'Live scoring active' : 'Pre-deadline intelligence'}</strong>
            <span>
              {currentEvent
                ? `GW ${currentEvent.id} average ${currentEvent.averageEntryScore} pts · ${formatCompact(currentEvent.transfersMade)} transfers`
                : 'Waiting for gameweek data'}
            </span>
          </div>
        </div>
        <button type="button" className="button button--ghost button--small" onClick={onRefresh} disabled={refreshing}>
          <Zap size={15} /> Sync now
        </button>
      </section>

      <section className="stat-grid" aria-label="Key model signals">
        <StatCard
          label="Highest projection"
          value={captain ? `${captain.projection.toFixed(1)} pts` : '—'}
          icon={<Gauge size={19} />}
          tone="violet"
          footer={captain ? `${captain.name} · ${captain.team.shortName} · ${formatPrice(captain.price)}` : 'No player data'}
        />
        <StatCard
          label="Top differential"
          value={differential ? `${differential.projection.toFixed(1)} pts` : '—'}
          icon={<Flame size={19} />}
          tone="pink"
          footer={differential ? `${differential.name} · only ${differential.ownership.toFixed(1)}% owned` : 'No differential found'}
        />
        <StatCard
          label="Best value"
          value={valuePick ? valuePick.value.toFixed(2) : '—'}
          icon={<CircleDollarSign size={19} />}
          tone="mint"
          footer={valuePick ? `${valuePick.name} · ${valuePick.projection.toFixed(1)} pts per ${formatPrice(valuePick.price)}` : 'No value pick found'}
        />
        <StatCard
          label="Hottest transfer"
          value={mover ? formatCompact(mover.transfersInEvent - mover.transfersOutEvent) : '—'}
          icon={<TrendingUp size={19} />}
          tone="amber"
          footer={mover ? `${mover.name} net transfers in this gameweek` : 'No transfer data'}
        />
      </section>

      <div className="dashboard-grid">
        <section className="panel panel--projection">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">VORTEX MODEL</span>
              <h3>Projected points leaderboard</h3>
              <p>Form, minutes, role, availability and the next five fixtures blended into one score.</p>
            </div>
            <button type="button" className="text-button" onClick={() => onNavigate('players')}>
              Open player lab <ArrowRight size={15} />
            </button>
          </div>
          <div className="projection-list">
            {insights.topProjected.slice(0, 8).map((player, index) => {
              const max = insights.topProjected[0]?.projection ?? 1;
              return (
                <button
                  type="button"
                  className="projection-row"
                  key={player.id}
                  onClick={() => onNavigate('players')}
                  title={player.reasons.join(' · ')}
                >
                  <span className="projection-row__rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className={`player-avatar player-avatar--${player.team.shortName.toLowerCase()}`}>
                    {player.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="projection-row__identity">
                    <strong>{player.name}</strong>
                    <small>{player.team.shortName} · {player.position} · {formatPrice(player.price)}</small>
                  </span>
                  <Sparkline values={player.sparkline} width={82} height={28} color="var(--accent)" />
                  <span className="projection-row__bar-wrap">
                    <span className="projection-row__bar" style={{ width: `${(player.projection / max) * 100}%` }} />
                  </span>
                  <strong className="projection-row__score">{player.projection.toFixed(1)}</strong>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel panel--captain">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">CAPTAIN INDEX</span>
              <h3>Who deserves the armband?</h3>
            </div>
            <Crown size={19} className="panel__header-icon" />
          </div>
          <div className="captain-list">
            {insights.captainCandidates.slice(0, 3).map((player, index) => (
              <article className={`captain-card ${index === 0 ? 'is-top' : ''}`} key={player.id}>
                <div className="captain-card__ring" style={{ '--ring-value': `${Math.round(player.confidence * 100)}%` } as React.CSSProperties}>
                  <span>{index + 1}</span>
                </div>
                <div className="captain-card__body">
                  <div className="captain-card__title">
                    <strong>{player.name}</strong>
                    <span>{player.projection.toFixed(1)} pts</span>
                  </div>
                  <small>{player.team.name} · {formatPercent(player.ownership)} owned · {formatPercent(player.confidence * 100, 0)} confidence</small>
                  <p>{player.reasons[0]}</p>
                </div>
              </article>
            ))}
          </div>
          <button type="button" className="button button--soft button--full" onClick={() => onNavigate('optimizer')}>
            <WandSparkles size={16} /> Build captain-ready squad
          </button>
        </section>

        <section className="panel panel--swing">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">FIXTURE SWING</span>
              <h3>Schedule momentum</h3>
              <p>Negative swing means the medium-term run improves after the next three.</p>
            </div>
            <button type="button" className="text-button" onClick={() => onNavigate('fixtures')}>
              Full matrix <ArrowRight size={15} />
            </button>
          </div>
          <div className="swing-list">
            {[...fixtureRows].sort((a, b) => a.swing - b.swing).slice(0, 5).map((row, index) => (
              <div className="swing-row" key={row.team.id}>
                <span className="swing-row__rank">#{index + 1}</span>
                <span className="team-badge">{row.team.shortName}</span>
                <div className="swing-row__meter">
                  <span style={{ width: `${Math.min(100, Math.abs(row.swing) / 1.3 * 100)}%` }} />
                </div>
                <strong className={row.swing <= 0 ? 'is-positive' : 'is-negative'}>{formatSigned(row.swing, 2)}</strong>
                <small>Next 5: {row.next5.toFixed(2)}</small>
              </div>
            ))}
          </div>
          {improving && (
            <div className="insight-callout">
              <Zap size={16} />
              <span><strong>{improving.team.name}</strong> have the strongest improving fixture swing in the model.</span>
            </div>
          )}
        </section>

        <section className="panel panel--momentum">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">MARKET MOMENTUM</span>
              <h3>Transfer traffic</h3>
            </div>
            <TrendingUp size={19} className="panel__header-icon" />
          </div>
          <div className="momentum-columns">
            <div>
              <span className="momentum-label is-positive">MOST BOUGHT</span>
              {insights.marketIn.slice(0, 4).map((player) => (
                <div className="momentum-item" key={player.id}>
                  <span><strong>{player.name}</strong><small>{player.team.shortName} · {player.position}</small></span>
                  <strong className="is-positive">+{formatCompact(player.transfersInEvent - player.transfersOutEvent)}</strong>
                </div>
              ))}
            </div>
            <div>
              <span className="momentum-label is-negative">MOST SOLD</span>
              {insights.marketOut.slice(0, 4).map((player) => (
                <div className="momentum-item" key={player.id}>
                  <span><strong>{player.name}</strong><small>{player.team.shortName} · {player.position}</small></span>
                  <strong className="is-negative">{formatCompact(player.transfersInEvent - player.transfersOutEvent)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel panel--automation">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">ALWAYS ON</span>
              <h3>The automated decision loop</h3>
            </div>
            <BrainCircuit size={19} className="panel__header-icon" />
          </div>
          <div className="automation-flow">
            {[
              { icon: <Activity size={17} />, title: 'Ingest', text: 'Public bootstrap, fixtures and live points' },
              { icon: <Gauge size={17} />, title: 'Normalize', text: '669 players mapped to clubs and positions' },
              { icon: <BrainCircuit size={17} />, title: 'Project', text: 'Role, form, minutes and fixture difficulty' },
              { icon: <Trophy size={17} />, title: 'Optimize', text: 'Budget, formation and club-limit constraints' },
            ].map((step, index) => (
              <div className="automation-step" key={step.title}>
                <span className="automation-step__icon">{step.icon}</span>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
                {index < 3 && <ArrowRight size={14} className="automation-step__arrow" />}
              </div>
            ))}
          </div>
          <div className="automation-footer">
            <span><strong>{formatNumber(snapshot.meta.totalPlayers, 0)}</strong> managers in the global game</span>
            <span><strong>{formatPercent(averageOwnership)}</strong> average player ownership</span>
            <span><strong>{snapshot.meta.upstreamOk ? 'Live' : 'Snapshot'}</strong> data source</span>
          </div>
        </section>
      </div>
    </div>
  );
}
