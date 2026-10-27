import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CircleDollarSign,
  Crown,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
  Users,
  WandSparkles,
  Zap,
} from 'lucide-react';
import type { EntryData, EnrichedPlayer, LeagueData, RiskProfile, Snapshot } from '../lib/types';
import { fetchEntry, fetchLeague } from '../lib/api';
import { recommendTransfers } from '../lib/optimize';
import { classNames, formatCompact, formatNumber, formatPrice, formatSigned } from '../lib/format';
import { Sparkline } from './Sparkline';
import { StatCard } from './StatCard';

interface LeagueIntelProps {
  snapshot: Snapshot;
  players: EnrichedPlayer[];
  teamId: string;
  leagueId: string;
  onTeamIdChange: (value: string) => void;
  onLeagueIdChange: (value: string) => void;
  profile: RiskProfile;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

function isNumeric(value: string): boolean {
  return /^\d{1,12}$/.test(value.trim());
}

function rankMovement(row: { rank: number; lastRank: number }): { label: string; tone: string } {
  const change = row.lastRank - row.rank;
  if (change > 0) return { label: `▲ ${change}`, tone: 'is-positive' };
  if (change < 0) return { label: `▼ ${Math.abs(change)}`, tone: 'is-negative' };
  return { label: '—', tone: 'is-neutral' };
}

export function LeagueIntel({
  snapshot,
  players,
  teamId,
  leagueId,
  onTeamIdChange,
  onLeagueIdChange,
  profile,
  onToast,
}: LeagueIntelProps) {
  const [draftTeamId, setDraftTeamId] = useState(teamId);
  const [draftLeagueId, setDraftLeagueId] = useState(leagueId || String(snapshot.meta.exampleLeagueId));
  const [activeTeamId, setActiveTeamId] = useState(teamId);
  const [activeLeagueId, setActiveLeagueId] = useState(leagueId || String(snapshot.meta.exampleLeagueId));
  const [entry, setEntry] = useState<EntryData | null>(null);
  const [league, setLeague] = useState<LeagueData | null>(null);
  const [entryLoading, setEntryLoading] = useState(false);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [scanNonce, setScanNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!draftTeamId && teamId) {
      setDraftTeamId(teamId);
      setActiveTeamId(teamId);
    }
  }, [draftTeamId, teamId]);

  const loadEntry = useCallback(async (id: string, signal?: AbortSignal) => {
    if (!isNumeric(id)) return;
    setEntryLoading(true);
    setEntryError(null);
    try {
      const result = await fetchEntry(id.trim(), signal);
      setEntry(result);
    } catch (error) {
      if (signal?.aborted) return;
      setEntry(null);
      setEntryError(error instanceof Error ? error.message : 'Could not load this FPL team.');
    } finally {
      if (!signal?.aborted) setEntryLoading(false);
    }
  }, []);

  const loadLeague = useCallback(async (id: string, signal?: AbortSignal) => {
    if (!isNumeric(id)) return;
    setLeagueLoading(true);
    setLeagueError(null);
    try {
      const result = await fetchLeague(id.trim(), signal);
      setLeague(result);
    } catch (error) {
      if (signal?.aborted) return;
      setLeague(null);
      setLeagueError(error instanceof Error ? error.message : 'Could not load this classic league.');
    } finally {
      if (!signal?.aborted) setLeagueLoading(false);
    }
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (activeTeamId) void loadEntry(activeTeamId, controller.signal);
    if (activeLeagueId) void loadLeague(activeLeagueId, controller.signal);
    return () => controller.abort();
  }, [activeLeagueId, activeTeamId, loadEntry, loadLeague, scanNonce]);

  const scan = () => {
    if (!isNumeric(draftTeamId)) {
      setEntryError('Enter a valid numeric FPL team ID.');
      return;
    }
    if (draftLeagueId && !isNumeric(draftLeagueId)) {
      setLeagueError('Enter a valid numeric classic league ID.');
      return;
    }
    onTeamIdChange(draftTeamId.trim());
    onLeagueIdChange(draftLeagueId.trim());
    setActiveTeamId(draftTeamId.trim());
    setActiveLeagueId(draftLeagueId.trim());
    setScanNonce((value) => value + 1);
    onToast('Scanning public team and league data…', 'info');
  };

  const usePresetTeam = (presetTeamId: number) => {
    const targetTeam = String(presetTeamId);
    const exampleLeague = String(snapshot.meta.exampleLeagueId);
    setDraftTeamId(targetTeam);
    setDraftLeagueId(exampleLeague);
    onTeamIdChange(targetTeam);
    onLeagueIdChange(exampleLeague);
    setActiveTeamId(targetTeam);
    setActiveLeagueId(exampleLeague);
    setScanNonce((value) => value + 1);
  };

  const useExample = () => usePresetTeam(snapshot.meta.exampleEntryId ?? 5112705);
  const repoEntryId = snapshot.meta.repoData?.configuredEntryId ?? 145784;

  const transfers = useMemo(
    () => (entry ? recommendTransfers(entry.players, players, { profile }) : []),
    [entry, players, profile],
  );
  const picksWithPlayers = useMemo(() => {
    if (!entry) return [];
    const index = new Map(entry.players.map((player) => [player.id, player]));
    return entry.picks.map((pick) => ({ ...pick, player: index.get(pick.element) })).filter((pick) => pick.player);
  }, [entry]);
  const captain = picksWithPlayers.find((pick) => pick.isCaptain)?.player;
  const currentStanding = league?.standings.find((row) => row.entry === entry?.id);
  const leaderGap = league && currentStanding ? league.standings[0].total - currentStanding.total : null;

  return (
    <div className="page page--league">
      <section className="panel connect-panel">
        <div className="connect-panel__intro">
          <span className="panel__eyebrow">PUBLIC TEAM SCANNER</span>
          <h3>Connect without a password.</h3>
          <p>
            FPL team and classic league endpoints are public. Your IDs stay in this browser and are used only to fetch
            picks, rank and standings.
          </p>
          <div className="privacy-note"><ShieldCheck size={15} /> No login · no token · localStorage only</div>
        </div>
        <div className="connect-panel__form">
          <label>
            <span><Users size={14} /> FPL team ID</span>
            <input value={draftTeamId} onChange={(event) => setDraftTeamId(event.target.value)} inputMode="numeric" placeholder="e.g. 5112705" />
          </label>
          <label>
            <span><Trophy size={14} /> Classic league ID</span>
            <input value={draftLeagueId} onChange={(event) => setDraftLeagueId(event.target.value)} inputMode="numeric" placeholder="e.g. 314" />
          </label>
          <button type="button" className="button button--primary" onClick={scan} disabled={entryLoading || leagueLoading}>
            {entryLoading || leagueLoading ? <Loader2 size={16} className="spin" /> : <Search size={16} />} Scan my FPL
          </button>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <button type="button" className="text-button" onClick={useExample}>Use live example team</button>
            <button type="button" className="text-button" onClick={() => usePresetTeam(repoEntryId)}>
              Load repo team #{repoEntryId}
            </button>
          </div>
        </div>
      </section>

      {(entryError || leagueError) && (
        <div className="error-banner" role="alert">
          <Info size={16} />
          <span>{entryError ?? leagueError}</span>
          <button type="button" onClick={() => {
            if (entryError) void loadEntry(activeTeamId);
            if (leagueError) void loadLeague(activeLeagueId);
          }}><RefreshCw size={14} /> Retry</button>
        </div>
      )}

      {entryLoading && !entry ? (
        <div className="panel loading-panel"><Loader2 size={22} className="spin" /><span>Reading team picks…</span></div>
      ) : entry ? (
        <>
          <section className="team-summary panel">
            <div className="team-summary__identity">
              <span className="team-summary__avatar">{entry.teamName.slice(0, 2).toUpperCase()}</span>
              <div>
                <span className="panel__eyebrow">CONNECTED TEAM</span>
                <h3>{entry.teamName}</h3>
                <p>{entry.name} · {entry.region} · started GW {entry.startedEvent}</p>
              </div>
              {entry.activeChip && <span className="chip-badge"><Zap size={12} /> {entry.activeChip} active</span>}
            </div>
            <div className="team-summary__meta">
              <span><Crown size={14} /> {captain?.name ?? 'Captain TBC'}</span>
              <span><Activity size={14} /> GW {entry.currentEvent} · {entry.history.points} pts</span>
              <span><CircleDollarSign size={14} /> £{entry.squadValue.toFixed(1)}m + £{(entry.history.bank / 10).toFixed(1)}m</span>
            </div>
          </section>

          <section className="stat-grid stat-grid--league">
            <StatCard label="Overall rank" value={formatCompact(entry.overallRank ?? entry.history.overallRank)} icon={<Trophy size={19} />} tone="violet" footer={`${formatNumber(entry.overallPoints ?? entry.history.totalPoints, 0)} total points`} />
            <StatCard label="Gameweek score" value={`${entry.history.points} pts`} icon={<Activity size={19} />} tone="mint" footer={`GW rank ${formatCompact(entry.history.rank)}`} />
            <StatCard label="Model projection" value={`${entry.projectedPoints.toFixed(1)} pts`} icon={<Target size={19} />} tone="pink" footer="Current picks, captain doubled" />
            <StatCard label="Squad value" value={`£${entry.squadValue.toFixed(1)}m`} icon={<CircleDollarSign size={19} />} tone="amber" footer={`£${(entry.history.bank / 10).toFixed(1)}m in the bank`} />
          </section>

          <div className="league-grid">
            <section className="panel squad-scan-panel">
              <div className="panel__header">
                <div><span className="panel__eyebrow">YOUR FIFTEEN</span><h3>Current squad scan</h3></div>
                <span className="source-chip">
                  {entry.source === 'cache' ? 'CACHED' : entry.source === 'snapshot' || entry.source === 'offline' ? 'SNAPSHOT' : 'LIVE PICKS'}
                </span>
              </div>
              <div className="squad-scan-list">
                {picksWithPlayers.map((pick) => (
                  <div className={classNames('squad-scan-row', pick.isCaptain && 'is-captain', pick.multiplier === 0 && 'is-bench')} key={`${pick.element}-${pick.position}`}>
                    <span className="squad-scan-row__pos">{pick.position <= 11 ? pick.position : 'B'}</span>
                    <span className={`position-tag position-tag--${pick.player?.position.toLowerCase()}`}>{pick.player?.position}</span>
                    <span className="squad-scan-row__name">
                      <strong>{pick.player?.name ?? `Player ${pick.element}`}</strong>
                      <small>{pick.player?.team.shortName} · {pick.player ? formatPrice(pick.player.price) : '—'}</small>
                    </span>
                    {pick.isCaptain && <span className="mini-badge is-captain">C</span>}
                    {pick.isViceCaptain && <span className="mini-badge">V</span>}
                    <span className="squad-scan-row__event">{pick.player?.eventPoints ?? 0} GW</span>
                    <strong className="squad-scan-row__projection">{pick.player?.projection.toFixed(1) ?? '—'}</strong>
                  </div>
                ))}
              </div>
            </section>

            <div className="league-side">
              <section className="panel transfer-panel">
                <div className="panel__header">
                  <div><span className="panel__eyebrow">AUTO TRANSFER ENGINE</span><h3>Best one-move upgrades</h3></div>
                  <WandSparkles size={19} className="panel__header-icon" />
                </div>
                {transfers.length ? (
                  <div className="transfer-list">
                    {transfers.map((suggestion) => (
                      <article className="transfer-card" key={`${suggestion.out.id}-${suggestion.incoming.id}`}>
                        <div className="transfer-card__players">
                          <span className="transfer-player is-out"><small>OUT</small><strong>{suggestion.out.name}</strong><span>{suggestion.out.team.shortName} · {formatPrice(suggestion.out.price)}</span></span>
                          <ArrowRight size={16} />
                          <span className="transfer-player is-in"><small>IN</small><strong>{suggestion.incoming.name}</strong><span>{suggestion.incoming.team.shortName} · {formatPrice(suggestion.incoming.price)}</span></span>
                        </div>
                        <div className="transfer-card__footer">
                          <strong className="is-positive">+{suggestion.gain.toFixed(1)} proj</strong>
                          <span className={suggestion.costChange <= 0 ? 'is-positive' : 'is-negative'}>{formatSigned(suggestion.costChange, 1)}m</span>
                        </div>
                        <p>{suggestion.reason}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state empty-state--compact">
                    <ShieldCheck size={22} />
                    <h3>No clear upgrade found</h3>
                    <p>Your current squad is already strong for this profile and budget.</p>
                  </div>
                )}
                <div className="insight-callout insight-callout--info">
                  <Info size={15} /><span>Suggestions respect position, budget and the three-players-per-club rule. They do not account for future transfer plans.</span>
                </div>
              </section>

              <section className="panel rank-panel">
                <div className="panel__header">
                  <div><span className="panel__eyebrow">LEAGUE PULSE</span><h3>{league?.name ?? 'Classic league'}</h3></div>
                  <Trophy size={19} className="panel__header-icon" />
                </div>
                {leagueLoading && !league ? (
                  <div className="loading-panel"><Loader2 size={20} className="spin" /> Loading standings…</div>
                ) : league ? (
                  <>
                    <div className="rank-summary">
                      <div><span>Your rank</span><strong>{currentStanding ? `#${formatNumber(currentStanding.rank, 0)}` : 'Outside page 1'}</strong></div>
                      <div><span>Gap to leader</span><strong>{leaderGap !== null ? `${leaderGap} pts` : '—'}</strong></div>
                      <div><span>Managers shown</span><strong>{league.standings.length}</strong></div>
                    </div>
                    <div className="standings-table">
                      <div className="standings-table__head"><span>#</span><span>Manager</span><span>GW</span><span>Total</span></div>
                      {league.standings.slice(0, 12).map((row) => {
                        const movement = rankMovement(row);
                        return (
                          <div className={classNames('standings-row', row.entry === entry.id && 'is-you')} key={row.entry}>
                            <span className="standings-row__rank">#{row.rank}<small className={movement.tone}>{movement.label}</small></span>
                            <span className="standings-row__manager"><strong>{row.entryName}</strong><small>{row.playerName}</small></span>
                            <span>{row.eventTotal}</span>
                            <strong>{row.total}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="empty-state empty-state--compact"><Trophy size={22} /><h3>League data unavailable</h3><p>Check the league ID and try again.</p></div>
                )}
              </section>
            </div>
          </div>

          <section className="panel form-panel">
            <div className="panel__header">
              <div><span className="panel__eyebrow">MOMENTUM VIEW</span><h3>Projected shape of your squad</h3></div>
              <TrendingUp size={19} className="panel__header-icon" />
            </div>
            <div className="form-chart">
              {[...entry.players].sort((a, b) => b.projection - a.projection).map((player) => (
                <div className="form-chart__row" key={player.id}>
                  <span>{player.name}</span>
                  <div><i style={{ width: `${Math.min(100, player.projection / 10 * 100)}%` }} /></div>
                  <strong>{player.projection.toFixed(1)}</strong>
                  <Sparkline values={player.sparkline} width={70} height={22} />
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="panel empty-state">
          <Users size={24} />
          <h3>Connect a public FPL team</h3>
          <p>Enter your team ID above, or use the current example team to explore the full league intelligence workflow.</p>
          <button type="button" className="button button--primary" onClick={useExample}><Zap size={16} /> Load live example</button>
        </div>
      )}
    </div>
  );
}
