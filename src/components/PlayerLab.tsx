import { makeFixtureForecasts, difficultyFillStyle, overallDifficulty, type FixtureForecast } from '../lib/fixtureForecast';
import { buildFixtureMatrix } from '../lib/fixtures';
import { buildPlayerForecastContext, playerFixtureForecast, playerHorizonPoints } from '../lib/playerTableForecast';
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
import type { EnrichedPlayer, FixtureCell, FixtureRow, FplTeam, Position } from '../lib/types';
import { parsePlayerInjuryDetails } from '../lib/analytics';
import { importedProjectionsNotice } from '../lib/projectionFreshness';
import { playerPredictionsCsv } from '../lib/playerPredictionExport';
import { classNames, formatPercent, formatPrice } from '../lib/format';

import { ClubBadge } from './ClubBadge';
import { InjuryDetailModal } from './InjuryDetailModal';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerGraphicModal } from './PlayerGraphicModal';
import { Sparkline } from './Sparkline';
import { SaveTableButton } from './SaveTableButton';

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

/** A double gameweek gets a separate, individually coloured block for each match. */
export function PlayerFixtureBlocks({ cell, teamId, teamById, forecasts, player, pointsForFixture }: {
  cell: FixtureCell;
  teamId: number;
  teamById: ReadonlyMap<number, FplTeam>;
  forecasts: ReadonlyMap<string, FixtureForecast[]>;
  player?: EnrichedPlayer;
  pointsForFixture?: (player:EnrichedPlayer, fixture:FixtureCell['fixtures'][number], gw:number)=>number|null;
}) {
  if (cell.isBlank || !cell.fixtures.length) return <span className="fdr-chip fdr-chip--blank" title={`GW${cell.event}: Blank gameweek`} aria-label={`GW${cell.event}: Blank gameweek`}><strong>—</strong><small>BLANK</small></span>;
  return <>{cell.fixtures.map(fixture => {
    const home = fixture.teamH === teamId;
    const opponentId = home ? fixture.teamA : fixture.teamH;
    const opponent = teamById.get(opponentId);
    const label = opponent?.shortName ?? `T${opponentId}`;
    const forecast = (forecasts.get(`${teamId}:${cell.event}`) ?? []).find(item => item.fixture.id === fixture.id);
    const style = forecast ? difficultyFillStyle(overallDifficulty(forecast)) : undefined;
    const xp = player && pointsForFixture ? pointsForFixture(player, fixture, cell.event) : null;
    return <span key={fixture.id} className="fdr-chip" style={style}
      title={`GW${cell.event}: ${opponent?.name ?? label} (${home ? 'H' : 'A'}), ${xp===null ? 'xPts unavailable' : xp.toFixed(2)+' mechanistic model xPts'}`}
      aria-label={`GW${cell.event}: ${label} ${home ? 'home' : 'away'}, ${xp===null ? 'xPts unavailable' : xp.toFixed(1)+' expected points'}`}>
      <strong>{label}</strong><small>{home ? 'H' : 'A'}-{xp === null ? '—' : xp.toFixed(1)}</small><em>GW{cell.event}</em>
    </span>;
  })}</>;
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

function exportCsv(players: EnrichedPlayer[], gw: number, nextGw: number,
  gwPoints:(p:EnrichedPlayer,gw:number)=>number|null,
  fivePoints:(p:EnrichedPlayer)=>number|null): void {
  const csv = playerPredictionsCsv(players, gw, nextGw, gwPoints, fivePoints);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `fpl-vortex-${players.length}-players-gw${gw}.csv`;
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
  const [selectedGw, setSelectedGw] = useState(nextEventId);
  const [forecastOnly, setForecastOnly] = useState(false);
  useEffect(() => { setSelectedGw(nextEventId); }, [nextEventId]);
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
  }, [deferredQuery, position, teamId, sort, sortDir, maxPrice, differentialsOnly, pageSize, selectedGw, forecastOnly]);

  // Only Players gets eight fixtures: do not alter the shared Planner/Fixtures horizon.
  const playerFixtureRows = useMemo(() => snapshot
    ? buildFixtureMatrix(snapshot.teams, snapshot.fixtures, nextEventId, Math.min(8,39-nextEventId), [], snapshot.historicalTeamModel?.strengths)
    : [], [snapshot, nextEventId]);
  const sharedFixtureForecasts = useMemo(() => snapshot ? makeFixtureForecasts(snapshot, 'vortex', playerFixtureRows[0]?.cells.map(cell => cell.event) ?? []) : new Map<string, FixtureForecast[]>(), [snapshot, playerFixtureRows]);
  const predictionContext = useMemo(() => snapshot ? buildPlayerForecastContext(snapshot) : null, [snapshot]);
  const predictionCache = useMemo(() => new Map<string, number | null>(), [predictionContext]);
  const fixturePoints = (player:EnrichedPlayer, fixture:FixtureCell['fixtures'][number], gw:number):number|null => {
    if (!predictionContext) return null;
    const key = player.id + ':' + fixture.id + ':' + gw;
    if (!predictionCache.has(key)) predictionCache.set(key,playerFixtureForecast(predictionContext,player,fixture,gw).points);
    return predictionCache.get(key) ?? null;
  };
  const gameweekPoints = (player:EnrichedPlayer,gw:number):number|null => {
    if (!predictionContext) return null;
    const games = predictionContext.snapshot.fixtures.filter(f=>f.event===gw&&(f.teamH===player.teamId||f.teamA===player.teamId));
    if (!games.length || new Set(games.map(f=>f.id)).size!==games.length) return null;
    let total=0;
    for (const fixture of games) {
      const xp=fixturePoints(player,fixture,gw);
      if (xp===null)return null;
      total+=xp;
    }
    return Math.round(total*100)/100;
  };
  const horizonPoints=(player:EnrichedPlayer)=>predictionContext?playerHorizonPoints(predictionContext,player,nextEventId,5):null;

  const teamById = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams]);

  const fixtureByTeam = useMemo(
    () => new Map(playerFixtureRows.map((row) => [row.team.id, row])),
    [playerFixtureRows],
  );

  const vortexFiveGwAvg = useMemo(() => new Map(playerFixtureRows.map(row => {
    const items = row.cells.slice(0, 5).flatMap(cell => sharedFixtureForecasts.get(`${row.team.id}:${cell.event}`) ?? []);
    return [row.team.id, items.length ? items.reduce((sum, item) => sum + overallDifficulty(item), 0) / items.length : null] as const;
  })), [playerFixtureRows, sharedFixtureForecasts]);

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
      if (forecastOnly && gameweekPoints(player, selectedGw) === null) return false;
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
          cmp = (horizonPoints(a) ?? -1) - (horizonPoints(b) ?? -1);
          break;
        case 'projection':
        default:
          cmp = (gameweekPoints(a, selectedGw) ?? -1) - (gameweekPoints(b, selectedGw) ?? -1);
          break;
      }
      if (cmp !== 0) return cmp * dir;
      return (gameweekPoints(b, selectedGw) ?? -1) - (gameweekPoints(a, selectedGw) ?? -1) || a.id - b.id;
    });
    return result;
  }, [deferredQuery, differentialsOnly, forecastOnly, maxPrice, nextEventId, players, position, selectedGw, sort, sortDir, teamId, vortexFiveGwAvg]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const visiblePlayers = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const toggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 8) return prev;
      return [...prev, id];
    });
  };

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
                exportCsv(filtered, selectedGw, nextEventId, gameweekPoints, horizonPoints);
                onToast(`Exported ${filtered.length} players as CSV.`, 'success');
              }}
            >
              <Download size={15} /> Export GW{selectedGw} CSV
            </button>
          </div>
        </div>

        <div className="player-filters">
          <label className="filter-select">
            <span>Prediction Gameweek</span>
            <select aria-label="Prediction Gameweek" value={selectedGw}
              onChange={event => setSelectedGw(Number(event.target.value))}>
              {Array.from({ length: Math.min(10, Math.max(0, 39 - nextEventId)) }, (_, i) => nextEventId + i)
                .map(gw => <option key={gw} value={gw}>GW{gw}</option>)}
            </select>
          </label>
          <label className="filter-select" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={forecastOnly} onChange={event => setForecastOnly(event.target.checked)} />
            <span>Only players with GW{selectedGw} forecast</span>
          </label>
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

        <p role="status" className="planner-data-notice">
          GW{selectedGw} uses the existing per-fixture VORTEX mechanistic model. Official status and a fresh FPL snapshot are required; — indicates suppressed, stale, missing or blank, not a 0-point prediction. Return dates require confirmation. Selected-by is not EO.
        </p>
      </section>

      <section className="panel vx-h2h-launch" aria-label="H2H Player Comparison">
        <div>
          <strong>H2H Player Comparison</strong>
          <span>{compareIds.length} of 8 selected · compare five or more players in a dedicated workspace.</span>
        </div>
        <div className="button-row">
          <button type="button" className="button button--ghost" onClick={()=>setCompareIds([])} disabled={!compareIds.length}>Clear selected</button>
          <button type="button" className="button button--primary" onClick={()=>{
            const url=window.location.origin+window.location.pathname+window.location.search+'#/compare'+
              (compareIds.length?'?ids='+compareIds.join(','):'');
            window.open(url,'_blank','noopener,noreferrer');
          }}>Open H2H Player Comparison ↗</button>
        </div>
      </section>

      <section className="panel table-panel" aria-label="Player Predictions">
        <div className="save-table-bar"><SaveTableButton filename={`fpl-vortex-player-lab-gw${selectedGw}.png`}
          onError={message=>onToast(message,'error')}
          getTables={()=>[{title:`PLAYERS GW${selectedGw} · VORTEX MECHANISTIC MODEL`,
            headers:['PLAYER / PRICE / CLUB','GW xPts','5GW xPts','xMINS','DEFCON','SELECTED%','NEXT 8 FIXTURES'],
            widths:[205,90,90,75,80,85,560],
            rows:visiblePlayers.map(p=>[
              {text:p.name+' · '+formatPrice(p.price)+' · '+p.position+' #'+p.id+' '+p.team.shortName},
              {text:gameweekPoints(p,selectedGw)?.toFixed(2)??'—'},
              {text:horizonPoints(p)?.toFixed(2)??'—'},
              {text:p.modelBreakdown.expectedMinutes.toFixed(0)},
              {text:p.modelBreakdown.defcon.toFixed(2)},
              {text:formatPercent(p.ownership)},
              {text:playerFixtureRows.find(row=>row.team.id===p.teamId)?.cells.map(cell=>
                cell.isBlank?'GW'+cell.event+' BLANK':cell.fixtures.map(f=>{
                  const home=f.teamH===p.teamId;
                  const opponent=teamById.get(home?f.teamA:f.teamH)?.shortName??'TBC';
                  const xp=fixturePoints(p,f,cell.event);
                  return 'GW'+cell.event+' '+opponent+' '+(home?'H':'A')+'-'+(xp===null?'—':xp.toFixed(1));
                }).join(' · ')
              ).join('\n')??'—'}
            ]) }]} /></div>
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
                <th>
                  <button type="button" className="sortable-th" onClick={() => toggleSort('projection')}>
                    GW{selectedGw} xPts <ArrowUpDown size={11} />
                  </button>
                </th>
                <th>
                  <button type="button" className="sortable-th" onClick={() => toggleSort('horizon5Projection')}>
                    5-GW xPts <ArrowUpDown size={11} />
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
                    Selected% <ArrowUpDown size={11} />
                  </button>
                </th>
                <th>
                  <button type="button" className="sortable-th" onClick={() => toggleSort('easeSum5')}>
                    Next 8 Fixtures · FDR + xPts <ArrowUpDown size={11} />
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
                          <span className="vx-players-identity-price">{formatPrice(player.price)}</span>
                          <small className="vx-players-identity-meta">{player.position} · #{player.id} <ClubBadge teamCode={player.team.code} shortName={player.team.shortName} teamName={player.team.name} size="sm" /></small>
                        </div>
                      </div>
                    </td>
                    <td>{(() => {
                      const xp = gameweekPoints(player, selectedGw);
                      return xp === null ? <span title="xPts unavailable: blank, injury, recovery unknown or stale data">—</span>
                        : <strong className={`score-pill ${scoreTone(xp)}`}>{xp.toFixed(2)}</strong>;
                    })()}</td>
                    <td className="mono-num"><strong>{horizonPoints(player)?.toFixed(2) ?? '—'}</strong></td>
                    <td className="mono-num">{player.modelBreakdown.expectedMinutes.toFixed(0)}′</td>
                    <td className="mono-num">+{player.modelBreakdown.defcon.toFixed(2)}</td>
                    <td className="mono-num">{formatPercent(player.ownership)}</td>
                    <td>
                      <div className="fixture-inline">
                        {(row?.cells.slice(0, 8) ?? []).map(cell => <PlayerFixtureBlocks key={cell.event} cell={cell} teamId={player.teamId} teamById={teamById} forecasts={sharedFixtureForecasts} player={player} pointsForFixture={fixturePoints} />)}
                      </div>
                    </td>
                    <td><Sparkline values={player.sparkline} width={76} height={22} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={classNames('icon-button icon-button--xs', pinned && 'is-selected')}
                        onClick={() => toggleCompare(player.id)}
                        aria-label={`${pinned?'Remove':'Add'} ${player.name} ${pinned?'from':'to'} comparison`}
                        title="Pin or remove for the dedicated H2H comparison tab"
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
        <details className="player-projection-details"><summary>Projection information</summary><p>{importedProjectionsNotice(snapshot?.meta.repoData) ?? 'Imported projection source unavailable. '}Legacy xP is a local heuristic, not a live Opta feed.</p></details>
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
