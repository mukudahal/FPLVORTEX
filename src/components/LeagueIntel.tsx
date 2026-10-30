import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CircleDollarSign,
  Crown,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
  Trophy,
  WandSparkles,
} from 'lucide-react';
import type { EntryData, EnrichedPlayer, LeagueData, RiskProfile, Snapshot } from '../lib/types';
import type { RecentTeamEntry } from '../lib/recentTeamIds';
import { fetchEntry, fetchLeague } from '../lib/api';
import { recommendTransfers } from '../lib/optimize';
import { classNames, formatNumber, formatPercent, formatPrice, formatSigned } from '../lib/format';
import { ClubBadge } from './ClubBadge';
import { PlayerAvatar } from './PlayerAvatar';
import { StatCard } from './StatCard';
import { TeamIdInput } from './TeamIdInput';
import { SaveTableButton } from './SaveTableButton';

interface LeagueIntelProps {
  snapshot: Snapshot;
  players: EnrichedPlayer[];
  teamId: string;
  leagueId: string;
  recentTeams?: RecentTeamEntry[];
  onRemoveRecentTeam?: (idToRemove: string) => void;
  onTeamIdChange: (value: string) => void;
  onLeagueIdChange: (value: string) => void;
  profile: RiskProfile;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onInspectPlayer?: (player: EnrichedPlayer) => void;
  onInspectInjury?: (player: EnrichedPlayer) => void;
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
  recentTeams = [],
  onRemoveRecentTeam,
  onTeamIdChange,
  onLeagueIdChange,
  profile,
  onToast,
  onInspectPlayer,
}: LeagueIntelProps) {
  const resolvedInitialTeamId = teamId === '5112705' ? '' : teamId;
  const [draftTeamId, setDraftTeamId] = useState(resolvedInitialTeamId);
  const [draftLeagueId, setDraftLeagueId] = useState(leagueId || String(snapshot.meta.exampleLeagueId));
  const [activeTeamId, setActiveTeamId] = useState(resolvedInitialTeamId);
  const [activeLeagueId, setActiveLeagueId] = useState(leagueId || String(snapshot.meta.exampleLeagueId));
  const [entry, setEntry] = useState<EntryData | null>(null);
  const [league, setLeague] = useState<LeagueData | null>(null);
  const [entryLoading, setEntryLoading] = useState(false);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [scanNonce, setScanNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadEntry = useCallback(async (id: string, signal?: AbortSignal) => {
    if (!isNumeric(id)) return;
    setEntryLoading(true);
    setEntry(null); // Clear the previous manager while the requested ID is loading.
    setEntryError(null);
    try {
      const data = await fetchEntry(id.trim(), signal);
      setEntry(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setEntry(null);
        setEntryError(err instanceof Error ? err.message : 'Unable to scan team.');
      }
    } finally {
      setEntryLoading(false);
    }
  }, []);

  const loadLeague = useCallback(async (id: string, signal?: AbortSignal) => {
    if (!isNumeric(id)) return;
    setLeagueLoading(true);
    setLeague(null);
    setLeagueError(null);
    try {
      const data = await fetchLeague(id.trim(), signal);
      setLeague(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setLeague(null);
        setLeagueError(err instanceof Error ? err.message : 'Unable to scan classic league.');
      }
    } finally {
      setLeagueLoading(false);
    }
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void loadEntry(activeTeamId, controller.signal);
    void loadLeague(activeLeagueId, controller.signal);
    return () => controller.abort();
  }, [activeLeagueId, activeTeamId, loadEntry, loadLeague, scanNonce]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTeam = draftTeamId.trim();
    const cleanLeague = draftLeagueId.trim();
    if (!isNumeric(cleanTeam)) {
      onToast('Enter a valid numeric FPL team ID.', 'error');
      return;
    }
    if (!isNumeric(cleanLeague)) {
      onToast('Enter a numeric classic league ID.', 'error');
      return;
    }
    onTeamIdChange(cleanTeam);
    onLeagueIdChange(cleanLeague);
    setActiveTeamId(cleanTeam);
    setActiveLeagueId(cleanLeague);
    setScanNonce((n) => n + 1);
  };

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const transfers = useMemo(() => {
    if (!entry || entry.players.length === 0) return [];
    const enrichedSquad = entry.picks
      .map((pick) => playerMap.get(pick.element))
      .filter((p): p is EnrichedPlayer => Boolean(p));
    return recommendTransfers(enrichedSquad, players, {
      profile,
      bankTenths: entry.history.bank,
    });
  }, [entry, playerMap, players, profile]);

  // Rank impact projection (`(myMultiplier - fieldEO) * projectedXPts`) from `1_APP_dashboard/src/lib/explain.ts`
  const rankImpactSummary = useMemo(() => {
    if (!entry) return { upside: [], downside: [] };
    const multMap = new Map<number, number>();
    for (const p of entry.picks) multMap.set(p.element, p.multiplier);

    const rows = players
      .map((el) => {
        const mult = multMap.get(el.id) ?? 0;
        const eo = Math.min(1, Math.max(0, el.ownership / 100));
        const expectedSwing = (mult - eo) * el.projection;
        return { player: el, mult, eo, expectedSwing, owned: multMap.has(el.id) };
      })
      .filter((r) => Math.abs(r.expectedSwing) >= 0.45);

    const upside = [...rows].filter((r) => r.expectedSwing > 0).sort((a, b) => b.expectedSwing - a.expectedSwing).slice(0, 5);
    const downside = [...rows].filter((r) => r.expectedSwing < 0).sort((a, b) => a.expectedSwing - b.expectedSwing).slice(0, 5);
    return { upside, downside };
  }, [entry, players]);

  return (
    <div className="page page--league">
      <section className="panel connect-panel" aria-label="Team and league scanner">
        <div>
          <span className="panel__eyebrow">TEAM & MINI-LEAGUE INTELLIGENCE</span>
          <h3>Connect without a password · {entry?.teamName ?? 'FPLVORTEX'} (#{activeTeamId})</h3>
          <p>
            Scan any public FPL Team ID and classic mini-league to inspect projected points, effective ownership rank
            swings, one-move upgrades, and rival standings.
          </p>
        </div>

        <form noValidate className="connect-panel__form" onSubmit={handleSubmit}>
          <label className="filter-select">
            <span>FPL Team ID</span>
            <TeamIdInput
              value={draftTeamId}
              onChange={setDraftTeamId}
              recentTeams={recentTeams}
              onRemoveRecent={onRemoveRecentTeam}
              onSelectRecent={(selectedId) => {
                setDraftTeamId(selectedId);
                setActiveTeamId(selectedId);
                onTeamIdChange(selectedId);
              }}
              ariaLabel="FPL Team ID"
            />
          </label>
          <label className="filter-select">
            <span>Classic League ID</span>
            <input
              type="text"
              inputMode="numeric"
              value={draftLeagueId}
              onChange={(e) => setDraftLeagueId(e.target.value)}
              placeholder=""
            />
          </label>
          <div className="button-row">
            <button type="submit" className="button button--primary" disabled={entryLoading || leagueLoading}>
              {entryLoading || leagueLoading ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
              Scan IDs
            </button>
          </div>
        </form>
      </section>

      {entryError && (
        <div className="data-warning" role="alert">
          <span>{entryError}</span>
          <button type="button" onClick={() => setScanNonce((n) => n + 1)}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {entry && (entry.provenance?.kind === 'demo' || entry.provenance?.kind === 'archived' || entry.source === 'offline' || entry.source === 'snapshot') && (
        <div className="data-warning" role="status">
          {entry.provenance?.kind === 'demo' ? 'DEMO SQUAD' : 'ARCHIVED SQUAD'} · Team #{entry.id}. Not verified as the requested manager's current FPL team. Archive capture date: {entry.provenance?.sourceCapturedAt ?? 'unknown'}.
        </div>
      )}
      {entry && (
        <section className="stat-grid stat-grid--league">
          <StatCard
            label={entry.teamName}
            value={entry.overallRank ? `OR ${formatNumber(entry.overallRank)}` : 'Connected'}
            detail={`${entry.name || 'Manager'} · ${entry.overallPoints ?? entry.history.totalPoints} total pts`}
            icon={<Trophy size={18} />}
            tone="mint"
          />
          <StatCard
            label={`GW${snapshot.meta.nextEventId} Squad Projection`}
            value={`${entry.projectedPoints.toFixed(1)} xPts`}
            detail={`GW${entry.currentEvent} actual: ${entry.history.points} pts (${entry.history.pointsOnBench} on bench)`}
            icon={<Activity size={18} />}
            tone="violet"
          />
          <StatCard
            label="Free Transfers & Bank"
            value={`${entry.freeTransfers} FT`}
            detail={`${formatPrice(entry.history.bank / 10)} ITB · Squad value ${formatPrice(entry.squadValue)}`}
            icon={<CircleDollarSign size={18} />}
            tone="amber"
          />
          <StatCard
            label="Top 1-FT Upgrade"
            value={transfers[0] ? `${transfers[0].out.name} → ${transfers[0].incoming.name}` : 'Roll FT'}
            detail={transfers[0] ? `+${transfers[0].gain.toFixed(2)} GW xPts (${formatSigned(transfers[0].horizonGain ?? 0, 1)} 5GW)` : 'Squad optimal'}
            icon={<WandSparkles size={18} />}
            tone="pink"
          />
        </section>
      )}

      <div className="league-grid">
        {entry && (
          <section className="panel" aria-label="Scanned squad">
            <div className="panel__header">
              <div>
                <span className="panel__eyebrow">SCANNED 15-PLAYER SQUAD · {entry.source.toUpperCase()}</span>
                <h3>{entry.teamName} · GW{snapshot.meta.nextEventId} Projections</h3>
              </div>
              <span className="badge badge--mint">{entry.freeTransfers} FT · {formatPrice(entry.history.bank / 10)} ITB</span>
            </div>

            <div className="squad-scan-list">
              {entry.picks.map((pick) => {
                const p = playerMap.get(pick.element);
                if (!p) return null;
                return (
                  <div
                    key={pick.element}
                    role="button"
                    tabIndex={0}
                    data-player-card-trigger="1"
                    className={classNames('squad-scan-row vx-clickable-row', pick.position > 11 && 'is-bench')}
                    onClick={() => onInspectPlayer?.(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onInspectPlayer?.(p);
                      }
                    }}
                  >
                    <span className="squad-scan-row__pos">{pick.position <= 11 ? pick.position : `B${pick.position - 11}`}</span>
                    <PlayerAvatar
                      code={p.code}
                      teamCode={p.team.code}
                      name={p.name}
                      fullName={p.fullName}
                      teamShort={p.team.shortName}
                      position={p.position}
                      size="sm"
                    />
                    <div className="squad-scan-row__name">
                      <strong>
                        {p.name}{' '}
                        {pick.isCaptain && <span className="mini-badge is-cap">C</span>}
                        {pick.isViceCaptain && <span className="mini-badge is-vc">V</span>}
                      </strong>
                      <small>
                        {p.team.shortName} · {p.position} · {formatPrice(p.price)} · EO {formatPercent(p.ownership)}
                      </small>
                    </div>
                    <span className="squad-scan-row__event">5GW {p.horizon5Projection.toFixed(1)}</span>
                    <strong className="score-pill is-strong">
                      {(p.projection * (pick.isCaptain ? 2 : pick.position <= 11 ? 1 : 1)).toFixed(2)}
                    </strong>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <aside className="league-side">
          {/* Transfer Recommendations */}
          <section className="panel">
            <div className="panel__header">
              <div>
                <span className="panel__eyebrow">SOLVER UPGRADES</span>
                <h3>Recommended 1-FT moves</h3>
              </div>
              <Target size={17} />
            </div>
            <div className="transfer-list">
              {transfers.map((move) => (
                <div key={`${move.out.id}-${move.incoming.id}`} className="transfer-card">
                  <div className="transfer-card__swap">
                    <button
                      type="button"
                      data-player-card-trigger="1"
                      className="inline-player-tag vx-tag-btn"
                      onClick={() => onInspectPlayer?.(move.out)}
                    >
                      <PlayerAvatar
                        code={move.out.code}
                        teamCode={move.out.team.code}
                        name={move.out.name}
                        teamShort={move.out.team.shortName}
                        position={move.out.position}
                        size="sm"
                      />
                      <span>{move.out.name}</span>
                    </button>
                    <ArrowRight size={14} />
                    <button
                      type="button"
                      data-player-card-trigger="1"
                      className="inline-player-tag vx-tag-btn"
                      onClick={() => onInspectPlayer?.(move.incoming)}
                    >
                      <PlayerAvatar
                        code={move.incoming.code}
                        teamCode={move.incoming.team.code}
                        name={move.incoming.name}
                        teamShort={move.incoming.team.shortName}
                        position={move.incoming.position}
                        size="sm"
                      />
                      <strong>{move.incoming.name}</strong>
                    </button>
                    <span className="score-pill is-elite">+{move.gain.toFixed(2)}</span>
                  </div>
                  <p>{move.reason}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Rank Impact & EO Leverage (`explain.ts`) */}
          <section className="panel">
            <div className="panel__header">
              <div>
                <span className="panel__eyebrow">EFFECTIVE OWNERSHIP LEVERAGE</span>
                <h3>Differential climbers vs field threats</h3>
              </div>
              <Crown size={17} />
            </div>
            <div className="momentum-columns">
              <div>
                <span className="momentum-label is-positive">Your rank climbers</span>
                {rankImpactSummary.upside.map((item) => (
                  <div key={item.player.id} className="momentum-row momentum-row--avatar">
                    <ClubBadge teamCode={item.player.team.code} shortName={item.player.team.shortName} size="sm" />
                    <div>
                      <strong>{item.player.name}</strong>
                      <small>{item.mult}× vs {(item.eo * 100).toFixed(0)}% EO</small>
                    </div>
                    <span className="is-positive">+{item.expectedSwing.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div>
                <span className="momentum-label is-negative"><ShieldAlert size={12} /> Field EO danger</span>
                {rankImpactSummary.downside.map((item) => (
                  <div key={item.player.id} className="momentum-row momentum-row--avatar">
                    <ClubBadge teamCode={item.player.team.code} shortName={item.player.team.shortName} size="sm" />
                    <div>
                      <strong>{item.player.name}</strong>
                      <small>{(item.eo * 100).toFixed(0)}% EO unowned</small>
                    </div>
                    <span className="is-negative">{item.expectedSwing.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* Classic League Standings */}
      {leagueError && (
        <div className="data-warning" role="alert">{leagueError} <button type="button" onClick={() => setScanNonce(n => n + 1)}><RefreshCw size={14} /> Retry</button></div>
      )}
      {league && (league.provenance?.kind === 'archived' || league.source === 'snapshot' || league.source === 'offline') && (
        <div className="data-warning" role="status">
          ARCHIVED LEAGUE · #{league.id}. These standings are not verified current. Archive capture date: {league.provenance?.sourceCapturedAt ?? 'unknown'}.
        </div>
      )}
      {league && (
        <section className="panel" aria-label="Classic league standings">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">CLASSIC MINI-LEAGUE · #{league.id} ({league.source.toUpperCase()})</span>
              <h3>{league.name}</h3>
            </div>
            {leagueError && <span className="badge badge--amber">{leagueError}</span>}
          </div>
          <div className="save-table-bar"><SaveTableButton filename={`fpl-vortex-league-${league.id}.png`} onError={message => onToast(message, 'error')} getTables={() => [{ title: `LEAGUE STANDINGS · LOADED RESULTS · ${league.name}`, headers: ['RANK', 'MOVE', 'TEAM', 'MANAGER', 'GW PTS', 'TOTAL'], widths: [65, 65, 180, 180, 80, 80], rows: league.standings.map(row => [{ text: String(row.rank) }, { text: rankMovement(row).label }, { text: row.entryName }, { text: row.playerName }, { text: String(row.eventTotal) }, { text: String(row.total) }]) }]} /></div>
          <div className="table-wrap">
            <table className="player-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Move</th>
                  <th>Team</th>
                  <th>Manager</th>
                  <th>GW Pts</th>
                  <th>Total Pts</th>
                  <th>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {league.standings.slice(0, 20).map((row) => {
                  const mv = rankMovement(row);
                  const isMe = String(row.entry) === activeTeamId;
                  return (
                    <tr key={row.entry} className={classNames(isMe && 'is-selected')}>
                      <td><strong>#{formatNumber(row.rank)}</strong></td>
                      <td className={mv.tone}>{mv.label}</td>
                      <td>
                        <strong>{row.entryName}</strong> {isMe && <span className="badge badge--mint">Active</span>}
                      </td>
                      <td>{row.playerName}</td>
                      <td className="mono-num">{row.eventTotal}</td>
                      <td className="mono-num"><strong>{row.total}</strong></td>
                      <td>
                        <button
                          type="button"
                          className="button button--ghost button--xs"
                          onClick={() => {
                            const nextId = String(row.entry);
                            setDraftTeamId(nextId);
                            setActiveTeamId(nextId);
                            onTeamIdChange(nextId);
                          }}
                        >
                          Scan #{row.entry}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
