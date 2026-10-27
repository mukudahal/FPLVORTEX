import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  CircleDollarSign,
  Crown,
  ExternalLink,
  Flame,
  Gauge,
  Play,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  WandSparkles,
  Zap,
} from 'lucide-react';
import type { EnrichedPlayer, EntryData, FixtureRow, RiskProfile, Snapshot, VideoItem } from '../lib/types';
import type { RouteId } from '../hooks/useHashRoute';
import { useNow } from '../hooks/useNow';
import { fetchVideos } from '../lib/api';
import { buildInsights, toRepoElement } from '../lib/analytics';
import { toRepoFixtures, toRepoTeams } from '../lib/fixtures';
import { countdown, formatCompact, formatNumber, formatPercent, formatPrice, formatSigned } from '../lib/format';
import { runFplReviewSimulation } from '../lib/repoModel/fplReviewSimulator';
import { ClubBadge } from './ClubBadge';
import { PlayerAvatar } from './PlayerAvatar';
import { Sparkline } from './Sparkline';
import { StatCard } from './StatCard';

interface CommandCenterProps {
  snapshot: Snapshot;
  entry?: EntryData | null;
  players: EnrichedPlayer[];
  insights: ReturnType<typeof buildInsights>;
  fixtureRows: FixtureRow[];
  profile: RiskProfile;
  onNavigate: (route: RouteId) => void;
  onOpenPalette: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const DEFAULT_145784_SQUAD = [1, 31, 332, 173, 40, 154, 427, 124, 165, 411, 346, 623, 115, 112, 289];

export function CommandCenter({
  snapshot,
  entry,
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
  const [videos, setVideos] = useState<VideoItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetchVideos(controller.signal)
      .then((res) => setVideos(res.videos.slice(0, 3)))
      .catch(() => setVideos([]));
    return () => controller.abort();
  }, []);

  const nextEvent = snapshot.gameweeks.find((event) => event.id === snapshot.meta.nextEventId);
  const currentEvent = snapshot.gameweeks.find((event) => event.id === snapshot.meta.currentEventId);
  const deadline = useMemo(() => countdown(nextEvent?.deadlineTime), [nextEvent?.deadlineTime, now]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const squadIds = useMemo(() => {
    if (entry && entry.picks.length === 15) {
      return entry.picks.map((p) => p.element);
    }
    const valid = DEFAULT_145784_SQUAD.filter((id) => playerMap.has(id));
    return valid.length === 15 ? valid : players.slice(0, 15).map((p) => p.id);
  }, [entry, playerMap, players]);

  // Run lightweight repo optimizer verdict for Home banner (600 MC draws for instant Home render)
  const quickSim = useMemo(() => {
    if (players.length < 15 || squadIds.length < 15) return null;
    return runFplReviewSimulation({
      players,
      currentSquadIds: squadIds,
      bankTenths: entry?.history.bank ?? 4,
      freeTransfersNow: entry?.freeTransfers ?? 4,
      nextGw: snapshot.meta.nextEventId,
      horizon: 5,
      repoFixtures: toRepoFixtures(snapshot.fixtures),
      repoTeams: toRepoTeams(snapshot.teams),
      repoElements: snapshot.players.map(toRepoElement),
      draws: 600,
    });
  }, [entry?.freeTransfers, entry?.history.bank, players, snapshot, squadIds]);

  const captain = insights.captainCandidates[0];
  const differential = insights.differentials[0];
  const valuePick = insights.bestValues[0];
  const bestFixture = fixtureRows[0];
  const squadSet = useMemo(() => new Set(squadIds), [squadIds]);
  const nonOwnedThreats = useMemo(
    () =>
      players
        .filter((p) => !squadSet.has(p.id) && p.ownership >= 15)
        .sort((a, b) => (b.ownership / 100) * b.projection - (a.ownership / 100) * a.projection)
        .slice(0, 5),
    [players, squadSet],
  );
  const verifiedNotes = snapshot.meta.repoData?.verifiedNotes ?? [];

  return (
    <div className="page page--command">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__noise" />
        <div className="hero__content">
          <div className="eyebrow">
            <Sparkles size={14} /> FPL VORTEX · TEAM #{entry?.id ?? 145784} ({entry?.teamName ?? 'FPLVORTEX'}) · {snapshot.meta.season}
          </div>
          <h2 id="hero-title">Every transfer, chip and captain — solved from your repo engine.</h2>
          <p>
            Powered directly by your 667-player GW7–16 repository projections, 2026/27 DEFCON Bayesian-Poisson model,
            banked-FT transfer solver, and paired Monte Carlo horizon simulation.
          </p>
          <div className="hero__actions">
            <button type="button" className="button button--primary button--large" onClick={() => onNavigate('optimizer')}>
              <WandSparkles size={18} /> Planner, Chips & Simulation <ArrowRight size={17} />
            </button>
            <button type="button" className="button button--ghost button--large" onClick={onOpenPalette}>
              <Target size={18} /> Search 667 players
            </button>
          </div>
          <div className="hero__trust">
            <span><Users size={15} /> <strong>{formatNumber(snapshot.players.length)}</strong> repo players</span>
            <span><Trophy size={15} /> OR <strong>{formatNumber(entry?.overallRank ?? 237000)}</strong></span>
            <span><CircleDollarSign size={15} /> <strong>{entry?.freeTransfers ?? 4} FT</strong> · £{((entry?.history.bank ?? 4) / 10).toFixed(1)}m bank</span>
          </div>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <div className="vortex-orb">
            <span className="vortex-orb__ring vortex-orb__ring--one" />
            <span className="vortex-orb__ring vortex-orb__ring--two" />
            <span className="vortex-orb__ring vortex-orb__ring--three" />
            <div className="vortex-orb__core">
              <img
                src="/player-images/brand/fpl-vortex-lion.jpg"
                alt=""
                className="vortex-orb__crest"
              />
              <span>GW{snapshot.meta.nextEventId}</span>
              <strong>{quickSim ? quickSim.winner.nextGwXPts.toFixed(1) : captain?.projection.toFixed(1) ?? '—'}</strong>
              <small>projected XI pts</small>
            </div>
          </div>

          {captain && (
            <div className="float-card float-card--captain">
              <div className="float-card__row">
                <PlayerAvatar
                  code={captain.code}
                  teamCode={captain.team.code}
                  name={captain.name}
                  fullName={captain.fullName}
                  teamShort={captain.team.shortName}
                  position={captain.position}
                  size="sm"
                />
                <div>
                  <span className="float-card__label"><Crown size={12} /> #1 Captain</span>
                  <strong>{captain.name}</strong>
                  <small>{captain.team.shortName} · {(captain.projection * 2).toFixed(1)} 2× xPts</small>
                </div>
              </div>
            </div>
          )}

          {bestFixture && (
            <div className="float-card float-card--fixture">
              <div className="float-card__row">
                <ClubBadge teamCode={bestFixture.team.code} shortName={bestFixture.team.shortName} teamName={bestFixture.team.name} size="md" />
                <div>
                  <span className="float-card__label"><Flame size={12} /> Best 5-GW run</span>
                  <strong>{bestFixture.team.name}</strong>
                  <small>Ease {bestFixture.easeSum5} · {bestFixture.next5.toFixed(2)} FDR</small>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="deadline-band" aria-label="Next gameweek countdown">
        <div className="deadline-band__title">
          <span className="deadline-band__pulse" />
          <div>
            <span>NEXT DEADLINE · {nextEvent?.name ?? `Gameweek ${snapshot.meta.nextEventId}`}</span>
            <strong>
              {quickSim
                ? `Engine Verdict: ${quickSim.winner.label} · ${quickSim.recommendedChipDecision.action} chips`
                : 'Transfer, captain & chip strategy locked'}
            </strong>
          </div>
        </div>
        <div className="countdown" role="timer" aria-live="off">
          {(deadline.parts.length > 0
            ? deadline.parts
            : [
                { value: '00', unit: 'days' },
                { value: '00', unit: 'hrs' },
                { value: '00', unit: 'min' },
                { value: '00', unit: 'sec' },
              ]
          ).map((part) => (
            <div key={part.unit} className="countdown__unit">
              <strong>{part.value}</strong>
              <span>{part.unit}</span>
            </div>
          ))}
        </div>
        <button type="button" className="button button--subtle" onClick={onRefresh} disabled={refreshing}>
          <Zap size={15} /> {refreshing ? 'Syncing…' : 'Sync now'}
        </button>
      </section>

      <section className="stat-grid" aria-label="Headline intelligence">
        <StatCard
          label="Team #145784 Projected XI"
          value={quickSim ? `${quickSim.winner.nextGwXPts.toFixed(1)} pts` : '—'}
          detail={quickSim ? `${quickSim.lineup0.formation} · 5-GW ${quickSim.winner.horizonXPts.toFixed(1)} xPts` : 'Loading squad'}
          icon={<Gauge size={18} />}
          tone="mint"
        />
        <StatCard
          label="Top Captain Pick"
          value={captain ? captain.name : '—'}
          detail={captain ? `${(captain.projection * 2).toFixed(1)} 2× xPts · ${formatPercent(captain.ownership)} EO` : 'Calculating'}
          icon={<Crown size={18} />}
          tone="violet"
        />
        <StatCard
          label="Banked FT Valuation"
          value={quickSim ? `+${quickSim.bankedTransferValueNextGw.toFixed(2)} xPts` : '—'}
          detail={quickSim ? `${quickSim.freeTransfersNow} FT now → ${quickSim.freeTransfersAfterRoll} FT on roll` : 'Roll vs move'}
          icon={<CircleDollarSign size={18} />}
          tone="amber"
        />
        <StatCard
          label="Peak Chip Window"
          value={
            quickSim?.recommendedChipDecision.bestFutureChip
              ? `${quickSim.recommendedChipDecision.bestFutureChip.toUpperCase()} GW${quickSim.recommendedChipDecision.bestFutureGw}`
              : 'HOLD'
          }
          detail={
            quickSim?.recommendedChipDecision.bestFutureGain
              ? `+${quickSim.recommendedChipDecision.bestFutureGain.toFixed(1)} xPts over FT baseline`
              : valuePick
                ? `Best value: ${valuePick.name} (${formatPrice(valuePick.price)})`
                : 'Chip horizon active'
          }
          icon={<BrainCircuit size={18} />}
          tone="pink"
        />
      </section>

      <div className="dashboard-grid">
        {/* Manager 145784 Squad Strip with Real Player Portraits */}
        <section className="panel panel--full">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">MY SQUAD · {entry?.teamName ?? 'FPLVORTEX'} (#{entry?.id ?? 145784})</span>
              <h3>GW{snapshot.meta.nextEventId} Optimal XI & Bench</h3>
            </div>
            <div className="button-row">
              <button type="button" className="button button--ghost" onClick={() => onNavigate('league')}>
                <Trophy size={15} /> League & EO Intel
              </button>
              <button type="button" className="button button--primary" onClick={() => onNavigate('optimizer')}>
                <WandSparkles size={15} /> Open Planner & Chip Sim <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {quickSim && (
            <>
              <div className="squad-mini-grid">
                {quickSim.lineup0.starters.map((id) => {
                  const p = playerMap.get(id);
                  if (!p) return null;
                  const isCap = id === quickSim.lineup0.captainId;
                  const isVc = id === quickSim.lineup0.viceId;
                  return (
                    <div key={id} className="squad-mini-card">
                      {isCap && <span className="squad-mini-card__cap is-cap">C</span>}
                      {isVc && <span className="squad-mini-card__cap is-vc">V</span>}
                      <PlayerAvatar
                        code={p.code}
                        teamCode={p.team.code}
                        name={p.name}
                        fullName={p.fullName}
                        teamShort={p.team.shortName}
                        position={p.position}
                        size="md"
                      />
                      <strong>{p.name}</strong>
                      <small>{p.team.shortName} · {p.position}</small>
                      <span className="squad-mini-card__xp">
                        {(p.projection * (isCap ? 2 : 1)).toFixed(2)} xP
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="squad-mini-bench">
                <span className="squad-mini-bench__label">BENCH ({quickSim.lineup0.benchXPts.toFixed(1)} xPts)</span>
                <div className="squad-mini-bench__list">
                  {quickSim.lineup0.bench.map((id, idx) => {
                    const p = playerMap.get(id);
                    if (!p) return null;
                    return (
                      <div key={id} className="squad-mini-bench__item">
                        <span className="squad-mini-bench__order">{idx === 0 ? 'GK' : `#${idx}`}</span>
                        <PlayerAvatar
                          code={p.code}
                          teamCode={p.team.code}
                          name={p.name}
                          fullName={p.fullName}
                          teamShort={p.team.shortName}
                          position={p.position}
                          size="sm"
                        />
                        <div>
                          <strong>{p.name}</strong>
                          <small>{p.team.shortName} · {p.projection.toFixed(2)} xP</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Top Projected Players with Real Portraits & GW7-16 Trajectory */}
        <section className="panel panel--projection">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">REPO PROJECTION BOARD ({profile.toUpperCase()})</span>
              <h3>Highest GW{snapshot.meta.nextEventId} expected points</h3>
            </div>
            <button type="button" className="text-button" onClick={() => onNavigate('players')}>
              All {snapshot.players.length} players <ArrowRight size={15} />
            </button>
          </div>

          <div className="projection-list">
            {insights.topProjected.slice(0, 8).map((player, index) => (
              <div className="projection-row projection-row--with-avatar" key={player.id}>
                <span className="projection-row__rank">{index + 1}</span>
                <PlayerAvatar
                  code={player.code}
                  teamCode={player.team.code}
                  name={player.name}
                  fullName={player.fullName}
                  teamShort={player.team.shortName}
                  position={player.position}
                  size="sm"
                />
                <div className="projection-row__identity">
                  <strong>{player.name}</strong>
                  <small>
                    {player.team.shortName} · {player.position} · {formatPrice(player.price)} · {formatPercent(player.ownership)} EO
                  </small>
                </div>
                <Sparkline values={player.sparkline} />
                <div className="projection-row__bar-wrap">
                  <div
                    className="projection-row__bar"
                    style={{ width: `${Math.min(100, (player.projection / (insights.topProjected[0]?.projection || 8)) * 100)}%` }}
                  />
                </div>
                <strong className="projection-row__score">{player.projection.toFixed(2)}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* Captaincy Showdown */}
        <section className="panel panel--captain">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">ARMBAND MATRIX (`rankCaptaincy`)</span>
              <h3>Captaincy candidates</h3>
            </div>
            <span className="badge badge--violet">2× Armband</span>
          </div>

          <div className="captain-grid">
            {insights.captainCandidates.slice(0, 4).map((player, index) => (
              <article className="captain-card" key={player.id}>
                <div className="captain-card__top">
                  <div className="captain-card__identity-row">
                    <PlayerAvatar
                      code={player.code}
                      teamCode={player.team.code}
                      name={player.name}
                      fullName={player.fullName}
                      teamShort={player.team.shortName}
                      position={player.position}
                      size="md"
                    />
                    <div>
                      <span className="captain-card__pick">#{index + 1} Captain</span>
                      <h4>{player.name}</h4>
                      <p>{player.team.name} · {formatPrice(player.price)}</p>
                    </div>
                  </div>
                  <span className="captain-card__double">{(player.projection * 2).toFixed(1)} pts</span>
                </div>
                <div className="captain-card__metrics">
                  <span>EO {formatPercent(player.ownership)}</span>
                  <span>5GW {player.horizon5Projection.toFixed(1)}</span>
                  <span>xMins {player.modelBreakdown.expectedMinutes.toFixed(0)}</span>
                </div>
                <p className="captain-card__reason">{player.reasons[0]}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Fixture Swing Radar with Club Badges */}
        <section className="panel panel--swing">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">POISSON SCHEDULE RADAR</span>
              <h3>Strongest 5-GW runs</h3>
            </div>
            <button type="button" className="text-button" onClick={() => onNavigate('fixtures')}>
              Full matrix <ArrowRight size={15} />
            </button>
          </div>
          <div className="fixture-mini-table">
            {fixtureRows.slice(0, 6).map((row) => (
              <div className="fixture-mini-row" key={row.team.id}>
                <div className="fixture-mini-row__team fixture-mini-row__team--badge">
                  <ClubBadge teamCode={row.team.code} shortName={row.team.shortName} teamName={row.team.name} size="sm" />
                  <div>
                    <strong>{row.team.shortName}</strong>
                    <small>λ {row.avgLambdaFor.toFixed(2)} · CS {(row.avgCsProb * 100).toFixed(0)}%</small>
                  </div>
                </div>
                <div className="fixture-mini-row__chips">
                  {row.cells.map((cell) => (
                    <span
                      key={cell.event}
                      className={`fdr-chip fdr-chip--${cell.isBlank ? 'blank' : cell.difficulty <= 2.5 ? 'easy' : cell.difficulty <= 3.6 ? 'medium' : 'hard'}`}
                      title={`GW${cell.event}: ${cell.label}`}
                    >
                      {cell.isBlank ? '—' : cell.label.split(' ')[0]}
                    </span>
                  ))}
                </div>
                <strong className="fixture-mini-row__avg">+{row.easeSum5}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* EO Threat Radar & Market Momentum */}
        <section className="panel panel--momentum">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">EO THREATS & MARKET PULSE</span>
              <h3>Non-owned rank threats & transfers</h3>
            </div>
            <TrendingUp size={18} />
          </div>
          <div className="momentum-columns">
            <div>
              <span className="momentum-label is-negative"><ShieldAlert size={12} /> High-EO non-owned threats</span>
              {nonOwnedThreats.map((player) => (
                <div className="momentum-row momentum-row--avatar" key={player.id}>
                  <PlayerAvatar
                    code={player.code}
                    teamCode={player.team.code}
                    name={player.name}
                    fullName={player.fullName}
                    teamShort={player.team.shortName}
                    position={player.position}
                    size="sm"
                  />
                  <div>
                    <strong>{player.name}</strong>
                    <small>{player.team.shortName} · {formatPercent(player.ownership)} EO · {player.projection.toFixed(2)} xP</small>
                  </div>
                  <span className="is-negative">−{((player.ownership / 100) * player.projection).toFixed(1)}</span>
                </div>
              ))}
            </div>
            <div>
              <span className="momentum-label is-positive">Top GW transfers in</span>
              {insights.marketIn.slice(0, 5).map((player) => (
                <div className="momentum-row momentum-row--avatar" key={player.id}>
                  <PlayerAvatar
                    code={player.code}
                    teamCode={player.team.code}
                    name={player.name}
                    fullName={player.fullName}
                    teamShort={player.team.shortName}
                    position={player.position}
                    size="sm"
                  />
                  <div>
                    <strong>{player.name}</strong>
                    <small>{player.team.shortName} · {formatPrice(player.price)} · {player.projection.toFixed(2)} xP</small>
                  </div>
                  <span className="is-positive">+{formatCompact(player.transfersInEvent)}</span>
                </div>
              ))}
            </div>
          </div>
          {differential && (
            <div className="callout-strip">
              <Sparkles size={15} />
              <span>
                Top differential: <strong>{differential.name}</strong> ({differential.team.shortName}, {formatPercent(differential.ownership)} EO) projects{' '}
                <strong>{differential.projection.toFixed(2)} xPts</strong> ({formatSigned(differential.fixtureDelta * 10, 1)} fixture swing).
              </span>
            </div>
          )}
        </section>

        {/* Verified Club/International Evidence + @FPLVORTEX Briefings */}
        <section className="panel panel--automation">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">VERIFIED CONTEXT & @FPLVORTEX BRIEFINGS</span>
              <h3>Confirmed squad notes & channel intelligence</h3>
            </div>
            <span className="badge badge--mint">
              {currentEvent ? `${currentEvent.shortName} avg ${currentEvent.averageEntryScore} pts` : '2026/27 Verified'}
            </span>
          </div>

          {verifiedNotes.length > 0 && (
            <div className="verified-notes-grid">
              {verifiedNotes.map((note, idx) => (
                <div key={idx} className="verified-note-card">
                  <div className="verified-note-card__head">
                    <span className={note.monitor ? 'badge badge--amber' : 'badge badge--mint'}>
                      {note.monitor ? 'Monitor minutes' : 'Confirmed'}
                    </span>
                    <a href={note.sourceUrl} target="_blank" rel="noreferrer" className="text-button">
                      Official source <ExternalLink size={12} />
                    </a>
                  </div>
                  <p>{note.summary}</p>
                </div>
              ))}
            </div>
          )}

          {videos.length > 0 && (
            <div className="home-videos-strip">
              {videos.map((video) => (
                <a
                  key={video.id}
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="home-video-pill"
                >
                  <Play size={14} />
                  <span>{video.title}</span>
                  <ExternalLink size={13} />
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
