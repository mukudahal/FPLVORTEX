import { makeFixtureForecasts, fixtureCellIndex, difficultyColor, overallDifficulty } from '../lib/fixtureForecast';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpDown,
  Download,
  Filter,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { EnrichedPlayer, FixtureRow, FplTeam, Position } from '../lib/types';
import { parsePlayerInjuryDetails } from '../lib/analytics';
import { classNames, formatPercent, formatPrice } from '../lib/format';

import { ClubBadge } from './ClubBadge';
import { InjuryDetailModal } from './InjuryDetailModal';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerGraphicModal } from './PlayerGraphicModal';
import { Sparkline } from './Sparkline';

interface PlayerLabProps {
  snapshot?: import('../lib/types').Snapshot;
  players: EnrichedPlayer[];
  teams: FplTeam[];
  fixtureRows: FixtureRow[];
  nextEventId: number;
  query: string;
  onQueryChange: (query: string) => void;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

/** Keep all opponents visible for double gameweeks without squeezing them together. */
export function fixtureChipLabel(label: string, isBlank: boolean): string {
  return isBlank ? '—' : label.split(' · ').map(item => item.split(' ')[0]).join('/');
}

type SortKey =
  | 'projection'
  | 'horizon5Projection'
  | 'optaXP5Gw'
  | 'value'
  | 'expectedMinutes'
  | 'defcon'
  | 'ownership'
  | 'price'
  | 'easeSum5'
  | 'name'
  | 'club';

function scoreTone(value: number): string {
  if (value >= 6.5) return 'is-elite';
  if (value >= 4.8) return 'is-strong';
  if (value >= 3.0) return 'is-solid';
  return 'is-low';
}

function exportCsv(players: EnrichedPlayer[], nextGw: number): void {
  const headers = [
    'FPL_ID',
    'Code',
    'Player',
    'Club',
    'Position',
    'Price',
    `GW${nextGw}_Repo_xPts`,
    '5GW_Repo_xPts',
    'Legacy_5GW_xP',
    'Model_xPts',
    'xMins',
    'DEFCON_xPts',
    'EO_Pct',
    'Fixture_Ease_5GW',
  ];
  const rows = players.map((p) => [
    String(p.id),
    String(p.code),
    p.name,
    p.team.shortName,
    p.position,
    p.price.toFixed(1),
    p.projection.toFixed(2),
    p.horizon5Projection.toFixed(2),
    p.modelBreakdown.optaXP5Gw.toFixed(2),
    p.modelBreakdown.modelXPts.toFixed(2),
    p.modelBreakdown.expectedMinutes.toFixed(1),
    p.modelBreakdown.defcon.toFixed(2),
    p.ownership.toFixed(1),
    String(p.modelBreakdown.fiveGwEaseScore),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `fpl-vortex-667-players-gw${nextGw}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function PlayerLab({
  snapshot,
  players,
  teams,
  fixtureRows,
  nextEventId,
  query,
  onQueryChange,
  onToast,
}: PlayerLabProps) {
  const deferredQuery = useDeferredValue(query);
  const [position, setPosition] = useState<'ALL' | Position>('ALL');
  const [teamId, setTeamId] = useState<number | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortKey>('projection');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [maxPrice, setMaxPrice] = useState(16);
  const [differentialsOnly, setDifferentialsOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<EnrichedPlayer | null>(null);
  const [selectedInjury, setSelectedInjury] = useState<EnrichedPlayer | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);

  useEffect(() => {
    setPage(0);
  }, [deferredQuery, position, teamId, sort, sortDir, maxPrice, differentialsOnly, pageSize]);

  const sharedFixtureForecasts = useMemo(() => snapshot ? makeFixtureForecasts(snapshot, 'vortex', fixtureRows[0]?.cells.map(cell => cell.event) ?? []) : new Map(), [snapshot, fixtureRows]);

  const fixtureByTeam = useMemo(
    () => new Map(fixtureRows.map((row) => [row.team.id, row])),
    [fixtureRows],
  );

  const vortexFiveGwAvg = useMemo(() => new Map(fixtureRows.map(row => {
    const items = row.cells.slice(0, 5).flatMap(cell => sharedFixtureForecasts.get(`${row.team.id}:${cell.event}`) ?? []);
    return [row.team.id, items.length ? items.reduce((sum, item) => sum + overallDifficulty(item), 0) / items.length : null] as const;
  })), [fixtureRows, sharedFixtureForecasts]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSort(key);
      setSortDir(key === 'name' || key === 'club' || key === 'price' || key === 'easeSum5' ? 'asc' : 'desc');
    }
  };

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const result = players.filter((player) => {
      if (position !== 'ALL' && player.position !== position) return false;
      if (teamId !== 'ALL' && player.teamId !== teamId) return false;
      if (player.price > maxPrice + 0.001) return false;
      if (differentialsOnly && player.ownership >= 15) return false;
      if (!needle) return true;
      return (
        player.name.toLowerCase().includes(needle) ||
        player.fullName.toLowerCase().includes(needle) ||
        player.team.name.toLowerCase().includes(needle) ||
        player.team.shortName.toLowerCase().includes(needle)
      );
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    result.sort((a, b) => {
      let cmp = 0;
      switch (sort) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'club':
          cmp = a.team.name.localeCompare(b.team.name);
          break;
        case 'price':
          cmp = a.cost - b.cost;
          break;
        case 'ownership':
          cmp = a.ownership - b.ownership;
          break;
        case 'value':
          cmp = a.value - b.value;
          break;
        case 'expectedMinutes':
          cmp = a.modelBreakdown.expectedMinutes - b.modelBreakdown.expectedMinutes;
          break;
        case 'defcon':
          cmp = a.modelBreakdown.defcon - b.modelBreakdown.defcon;
          break;
        case 'easeSum5':
          {
            const av = vortexFiveGwAvg.get(a.teamId) ?? null, bv = vortexFiveGwAvg.get(b.teamId) ?? null;
            if (av === null || bv === null) return av === bv ? a.name.localeCompare(b.name) : av === null ? 1 : -1;
            cmp = av - bv;
          }
          break;
        case 'optaXP5Gw':
          cmp = a.modelBreakdown.optaXP5Gw - b.modelBreakdown.optaXP5Gw;
          break;
        case 'horizon5Projection':
          cmp = a.horizon5Projection - b.horizon5Projection;
          break;
        case 'projection':
        default:
          cmp = a.projection - b.projection;
          break;
      }
      if (cmp !== 0) return cmp * dir;
      return b.projection - a.projection;
    });
    return result;
  }, [deferredQuery, differentialsOnly, maxPrice, players, position, sort, sortDir, teamId, vortexFiveGwAvg]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const visiblePlayers = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const toggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const comparedPlayers = useMemo(
    () => compareIds.map((id) => players.find((p) => p.id === id)).filter((p): p is EnrichedPlayer => Boolean(p)),
    [compareIds, players],
  );

  return (
    <div className="page page--players">
      <section className="panel player-controls" aria-label="Player search and filters">
        <div className="player-controls__top">
          <label className="search-input">
            <Search size={17} />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={`Search all ${players.length} players, clubs or roles…`}
            />
            {query && (
              <button type="button" className="icon-inline" onClick={() => onQueryChange('')} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </label>
          <div className="button-row">
            <button
              type="button"
              className={classNames('button button--ghost', differentialsOnly && 'is-selected')}
              onClick={() => setDifferentialsOnly((value) => !value)}
            >
              <Sparkles size={15} /> Differentials (&lt;15%)
            </button>
            <button
              type="button"
              className="button button--subtle"
              onClick={() => {
                exportCsv(filtered, nextEventId);
                onToast(`Exported ${filtered.length} players as CSV.`, 'success');
              }}
            >
              <Download size={15} /> Export CSV
            </button>
          </div>
        </div>

        <div className="player-filters">
          <div className="filter-group">
            <span><Filter size={13} /> Position</span>
            <div className="pos-pills">
              {(['ALL', 'GKP', 'DEF', 'MID', 'FWD'] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  className={classNames('pos-pill', position === item && 'is-active')}
                  onClick={() => setPosition(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <label className="filter-select">
            <span>Club</span>
            <select
              value={teamId}
              onChange={(event) => setTeamId(event.target.value === 'ALL' ? 'ALL' : Number(event.target.value))}
            >
              <option value="ALL">All 20 clubs</option>
              {[...teams]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.shortName})
                  </option>
                ))}
            </select>
          </label>

          <label className="filter-range">
            <span>Max price: <strong>{formatPrice(maxPrice)}</strong></span>
            <input
              type="range"
              min={4}
              max={16}
              step={0.5}
              value={maxPrice}
              onChange={(event) => setMaxPrice(Number(event.target.value))}
            />
          </label>
        </div>

      </section>

      {/* Head-to-head comparison bar when 1 or 2 players pinned */}
      {comparedPlayers.length > 0 && (
        <section className="panel compare-panel" aria-label="Head-to-head player comparison">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">HEAD-TO-HEAD PLAYER COMPARISON</span>
              <h3>
                {comparedPlayers.length === 2
                  ? `${comparedPlayers[0].name} vs ${comparedPlayers[1].name}`
                  : `Selected ${comparedPlayers[0].name} — pin one more player to compare`}
              </h3>
            </div>
            <button type="button" className="button button--ghost button--sm" onClick={() => setCompareIds([])}>
              Clear comparison
            </button>
          </div>
          <div className="compare-grid">
            {comparedPlayers.map((p) => (
              <div key={p.id} className="compare-card">
                <div className="compare-card__head">
                  <PlayerAvatar
                    code={p.code}
                    teamCode={p.team.code}
                    name={p.name}
                    fullName={p.fullName}
                    teamShort={p.team.shortName}
                    position={p.position}
                    size="lg"
                  />
                  <div>
                    <div className="inline-player-tag">
                      <ClubBadge teamCode={p.team.code} shortName={p.team.shortName} size="sm" />
                      <span>{p.team.name} · {p.position} · {formatPrice(p.price)}</span>
                    </div>
                    <h4>{p.fullName}</h4>
                    <small>EO {formatPercent(p.ownership)} · xMins {p.modelBreakdown.expectedMinutes.toFixed(0)}</small>
                  </div>
                </div>
                <div className="compare-card__metrics">
                  <div><span>GW{nextEventId} xPts</span><strong>{p.projection.toFixed(2)}</strong></div>
                  <div><span>5-GW xPts</span><strong>{p.horizon5Projection.toFixed(2)}</strong></div>
                  <div><span>Legacy 5GW xP</span><strong>{p.modelBreakdown.optaXP5Gw.toFixed(2)}</strong></div>
                  <div><span>DEFCON xPts</span><strong>+{p.modelBreakdown.defcon.toFixed(2)}</strong></div>
                  <div><span>Attack xPts</span><strong>{p.modelBreakdown.attacking.toFixed(2)}</strong></div>
                  <div><span>CS / Saves</span><strong>{(p.modelBreakdown.cleanSheet + p.modelBreakdown.saves).toFixed(2)}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel table-panel" aria-label="All 667 repository players">
        <p className="table-swipe-hint">Swipe left or right to see all columns ↔</p>
        <div className="table-wrap player-table-scroll" role="region" aria-label="Player results, scroll sideways to see all columns" tabIndex={0}>
          <table className="player-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="sortable-th" onClick={() => toggleSort('name')}>
                    Player <ArrowUpDown size={11} />
                  </button>
                </th>
                <th><button type="button" className="sortable-th" onClick={() => toggleSort('club')}>Club <ArrowUpDown size={11} /></button></th>
                <th>
                  <button type="button" className="sortable-th" onClick={() => toggleSort('price')}>
                    Price <ArrowUpDown size={11} />
                  </button>
                </th>
                <th>
                  <button type="button" className="sortable-th" onClick={() => toggleSort('projection')}>
                    GW{nextEventId} xPts <ArrowUpDown size={11} />
                  </button>
                </th>
                <th>
                  <button type="button" className="sortable-th" onClick={() => toggleSort('horizon5Projection')}>
                    5-GW xPts <ArrowUpDown size={11} />
                  </button>
                </th>
                <th>
                  <button type="button" className="sortable-th" onClick={() => toggleSort('optaXP5Gw')}>
                    Legacy xP <ArrowUpDown size={11} />
                  </button>
                </th>
                <th>
                  <button type="button" className="sortable-th" onClick={() => toggleSort('expectedMinutes')}>
                    xMins <ArrowUpDown size={11} />
                  </button>
                </th>
                <th>
                  <button type="button" className="sortable-th" onClick={() => toggleSort('defcon')}>
                    DEFCON <ArrowUpDown size={11} />
                  </button>
                </th>
                <th>
                  <button type="button" className="sortable-th" onClick={() => toggleSort('ownership')}>
                    EO% <ArrowUpDown size={11} />
                  </button>
                </th>
                <th>
                  <button type="button" className="sortable-th" onClick={() => toggleSort('easeSum5')}>
                    Next 5 Fixtures (VORTEX FDR) <ArrowUpDown size={11} />
                  </button>
                </th>
                <th>GW7–16 Trend</th>
                <th>H2H</th>
              </tr>
            </thead>
            <tbody>
              {visiblePlayers.map((player) => {
                const row = fixtureByTeam.get(player.teamId);
                const pinned = compareIds.includes(player.id);
                return (
                  <tr key={player.id} onClick={() => setSelected(player)} tabIndex={0} onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelected(player);
                    }
                  }}>
                    <td>
                      <div className="player-cell player-cell--avatar">
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
                          <div className="vx-name-with-flag">
                            <strong>{player.name}</strong>
                            {(player.status !== 'a' || (player.chance !== null && player.chance < 100)) && (() => {
                              const flagInfo = parsePlayerInjuryDetails(player);
                              return (
                                <button
                                  type="button"
                                  className={classNames('vx-injury-rect vx-injury-rect--sm', `is-${flagInfo.severity}`)}
                                  data-injury-trigger="1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelected(null);
                                    setSelectedInjury(player);
                                  }}
                                >
                                  <AlertTriangle size={10} />
                                  <span>{flagInfo.badgeText}</span>
                                </button>
                              );
                            })()}
                          </div>
                          <small>{player.position} · #{player.id}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="inline-player-tag">
                        <ClubBadge teamCode={player.team.code} shortName={player.team.shortName} teamName={player.team.name} size="sm" />
                        {player.team.shortName}
                      </span>
                    </td>
                    <td className="mono-num">{formatPrice(player.price)}</td>
                    <td><strong className={`score-pill ${scoreTone(player.projection)}`}>{player.projection.toFixed(2)}</strong></td>
                    <td className="mono-num"><strong>{player.horizon5Projection.toFixed(2)}</strong></td>
                    <td className="mono-num">{player.modelBreakdown.optaXP5Gw.toFixed(2)}</td>
                    <td className="mono-num">{player.modelBreakdown.expectedMinutes.toFixed(0)}′</td>
                    <td className="mono-num">+{player.modelBreakdown.defcon.toFixed(2)}</td>
                    <td className="mono-num">{formatPercent(player.ownership)}</td>
                    <td>
                      <div className="fixture-inline">
                        {(row?.cells.slice(0, 5) ?? []).map((cell) => (
                          <span
                            key={cell.event}
                            className="fdr-chip" style={(() => { const value = fixtureCellIndex(sharedFixtureForecasts, player.teamId, cell.event); return value === null ? undefined : { background: difficultyColor(value), color: "#071a1b" }; })()}
                            title={`GW${cell.event}: ${cell.label}`}
                          >
                            {fixtureChipLabel(cell.label, cell.isBlank)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td><Sparkline values={player.sparkline} width={76} height={22} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={classNames('icon-button icon-button--xs', pinned && 'is-selected')}
                        onClick={() => toggleCompare(player.id)}
                        aria-label={`Compare ${player.name}`}
                        title="Pin to head-to-head comparison"
                      >
                        <ArrowLeftRight size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <nav className="player-pagination" aria-label="Player results pages">
          <label>Rows per page <select value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
          <span>{filtered.length} players · Page {currentPage + 1} of {totalPages}</span>
          <div><button type="button" onClick={() => setPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0}>Previous</button><button type="button" onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage >= totalPages - 1}>Next</button></div>
        </nav>
        <details className="player-projection-details"><summary>Projection information</summary><p>{snapshot?.meta.repoData?.benchmarkPlayers ? `Some xPts use ${snapshot.meta.repoData.benchmarkFile.split('/').pop()}, which may be outdated. ` : 'Projection freshness depends on available source data. '}Legacy xP is a local heuristic, not a live Opta feed.</p></details>
      </section>

      <PlayerGraphicModal
        snapshot={snapshot}
        player={selected}
        teams={teams}
        fixtureRows={fixtureRows}
        reviewGw={nextEventId}
        onClose={() => setSelected(null)}
        onOpenInjuryDetail={(p) => {
          setSelected(null);
          setSelectedInjury(p);
        }}
      />

      <InjuryDetailModal
        player={selectedInjury}
        nextFixtureLabel={
          selectedInjury
            ? fixtureByTeam.get(selectedInjury.teamId)?.cells[0]?.label
            : undefined
        }
        nextEventId={nextEventId}
        onClose={() => setSelectedInjury(null)}
        onOpenPlayerCard={(p) => {
          setSelectedInjury(null);
          setSelected(p);
        }}
      />
    </div>
  );
}
