import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpDown,
  Download,
  Filter,
  Flame,
  Info,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import type { EnrichedPlayer, FixtureRow, FplTeam, Position } from '../lib/types';
import { classNames, formatCompact, formatNumber, formatPercent, formatPrice } from '../lib/format';
import { fixtureTone } from '../lib/fixtures';
import { Sparkline } from './Sparkline';

interface PlayerLabProps {
  players: EnrichedPlayer[];
  teams: FplTeam[];
  fixtureRows: FixtureRow[];
  query: string;
  onQueryChange: (query: string) => void;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

type SortKey = 'projection' | 'value' | 'form' | 'ownership' | 'price' | 'fixtureScore' | 'xGI';

const SORT_OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: 'projection', label: 'Projected points' },
  { id: 'value', label: 'Value score' },
  { id: 'form', label: 'Recent form' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'price', label: 'Price (low first)' },
  { id: 'fixtureScore', label: 'Easiest fixtures' },
  { id: 'xGI', label: 'Expected goal involvement' },
];

function scoreTone(value: number): string {
  if (value >= 7) return 'is-elite';
  if (value >= 5) return 'is-strong';
  if (value >= 3) return 'is-solid';
  return 'is-low';
}

function exportCsv(players: EnrichedPlayer[]): void {
  const headers = ['Player', 'Club', 'Position', 'Price', 'Projection', 'Form', 'PPG', 'Ownership', 'xGI', 'FDR5', 'Confidence', 'Repo_xMins', 'Repo_5GW_xPts'];
  const rows = players.map((player) => [
    player.name,
    player.team.shortName,
    player.position,
    player.price.toFixed(1),
    player.projection.toFixed(2),
    player.form.toFixed(1),
    player.ppg.toFixed(1),
    player.ownership.toFixed(1),
    player.xGI.toFixed(2),
    player.fixtureScore.toFixed(2),
    player.confidence.toFixed(2),
    player.repoExpectedMinutes !== undefined && player.repoExpectedMinutes !== null ? player.repoExpectedMinutes.toFixed(1) : '',
    player.repoHorizon5Xpts !== undefined && player.repoHorizon5Xpts !== null ? player.repoHorizon5Xpts.toFixed(2) : '',
  ]);
  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `fpl-vortex-players-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function PlayerLab({ players, teams, fixtureRows, query, onQueryChange, onToast }: PlayerLabProps) {
  const deferredQuery = useDeferredValue(query);
  const [position, setPosition] = useState<'ALL' | Position>('ALL');
  const [teamId, setTeamId] = useState<number | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortKey>('projection');
  const [maxPrice, setMaxPrice] = useState(15);
  const [differentialsOnly, setDifferentialsOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const [selected, setSelected] = useState<EnrichedPlayer | null>(null);

  useEffect(() => {
    setVisibleCount(30);
  }, [deferredQuery, position, teamId, sort, maxPrice, differentialsOnly]);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const result = players.filter((player) => {
      if (position !== 'ALL' && player.position !== position) return false;
      if (teamId !== 'ALL' && player.teamId !== teamId) return false;
      if (player.price > maxPrice) return false;
      if (differentialsOnly && player.ownership >= 15) return false;
      if (!needle) return true;
      return (
        player.name.toLowerCase().includes(needle) ||
        player.fullName.toLowerCase().includes(needle) ||
        player.team.name.toLowerCase().includes(needle) ||
        player.team.shortName.toLowerCase().includes(needle) ||
        player.position.toLowerCase() === needle
      );
    });
    result.sort((a, b) => {
      switch (sort) {
        case 'value': return b.value - a.value;
        case 'form': return b.form - a.form || b.projection - a.projection;
        case 'ownership': return b.ownership - a.ownership;
        case 'price': return a.price - b.price || b.projection - a.projection;
        case 'fixtureScore': return a.fixtureScore - b.fixtureScore || b.projection - a.projection;
        case 'xGI': return b.xGI - a.xGI || b.projection - a.projection;
        default: return b.projection - a.projection;
      }
    });
    return result;
  }, [deferredQuery, differentialsOnly, maxPrice, players, position, sort, teamId]);

  const selectedFixtureRow = selected ? fixtureRows.find((row) => row.team.id === selected.teamId) : undefined;

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  return (
    <div className="page page--players">
      <section className="panel player-controls">
        <div className="player-controls__top">
          <div className="search-field">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search player, club or position…"
              aria-label="Search players"
            />
            {query && <button type="button" onClick={() => onQueryChange('')} aria-label="Clear search"><X size={15} /></button>}
          </div>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => {
              exportCsv(filtered);
              onToast(`Exported ${filtered.length} players as CSV.`, 'success');
            }}
          >
            <Download size={16} /> Export view
          </button>
        </div>
        <div className="player-filters">
          <label className="filter-control">
            <span><Filter size={13} /> Position</span>
            <select value={position} onChange={(event) => setPosition(event.target.value as 'ALL' | Position)}>
              <option value="ALL">All positions</option>
              <option value="GKP">Goalkeepers</option>
              <option value="DEF">Defenders</option>
              <option value="MID">Midfielders</option>
              <option value="FWD">Forwards</option>
            </select>
          </label>
          <label className="filter-control">
            <span>Club</span>
            <select value={teamId} onChange={(event) => setTeamId(event.target.value === 'ALL' ? 'ALL' : Number(event.target.value))}>
              <option value="ALL">All clubs</option>
              {teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="filter-control">
            <span><ArrowUpDown size={13} /> Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              {SORT_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="filter-control filter-control--range">
            <span>Max price <strong>{formatPrice(maxPrice)}</strong></span>
            <input type="range" min="4" max="15" step="0.5" value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))} />
          </label>
          <label className="toggle-control">
            <input type="checkbox" checked={differentialsOnly} onChange={(event) => setDifferentialsOnly(event.target.checked)} />
            <span className="toggle-control__switch" />
            <span><Sparkles size={13} /> Differentials only</span>
          </label>
        </div>
        <div className="player-results-meta">
          <strong>{formatNumber(filtered.length, 0)}</strong> players match this view
          <span>{players.length} total in the live universe</span>
        </div>
      </section>

      <section className="panel player-table-panel">
        <div className="table-scroll">
          <table className="player-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th>Price</th>
                <th>Projection</th>
                <th>Form</th>
                <th>PPG</th>
                <th>Owned</th>
                <th>FDR 5</th>
                <th>Confidence</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, visibleCount).map((player) => (
                <tr key={player.id} onClick={() => setSelected(player)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && setSelected(player)}>
                  <td>
                    <div className="table-player">
                      <span className={`player-avatar player-avatar--${player.team.shortName.toLowerCase()}`}>{player.name.slice(0, 2).toUpperCase()}</span>
                      <span><strong>{player.name}</strong><small>{player.team.name}</small></span>
                    </div>
                  </td>
                  <td><span className={`position-tag position-tag--${player.position.toLowerCase()}`}>{player.position}</span></td>
                  <td>{formatPrice(player.price)}</td>
                  <td><strong className={classNames('projection-pill', scoreTone(player.projection))}>{player.projection.toFixed(1)}</strong></td>
                  <td>{player.form.toFixed(1)}</td>
                  <td>{player.ppg.toFixed(1)}</td>
                  <td>{formatPercent(player.ownership)}</td>
                  <td><span className={`fdr-pill fdr-pill--${fixtureTone(player.fixtureScore)}`}>{player.fixtureScore.toFixed(2)}</span></td>
                  <td>
                    <div className="confidence-cell"><span><i style={{ width: `${player.confidence * 100}%` }} /></span>{Math.round(player.confidence * 100)}%</div>
                  </td>
                  <td><Sparkline values={player.sparkline} width={72} height={24} color={player.projection >= 6 ? 'var(--brand-mint)' : 'var(--accent)'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="empty-state">
            <Search size={24} />
            <h3>No players match those filters</h3>
            <p>Try clearing the search, raising the price limit, or turning off differentials only.</p>
            <button type="button" className="button button--ghost" onClick={() => {
              onQueryChange(''); setPosition('ALL'); setTeamId('ALL'); setMaxPrice(15); setDifferentialsOnly(false);
            }}>Reset filters</button>
          </div>
        )}
        {visibleCount < filtered.length && (
          <div className="load-more">
            <button type="button" className="button button--soft" onClick={() => setVisibleCount((count) => count + 30)}>
              Show 30 more players
            </button>
            <span>Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}</span>
          </div>
        )}
      </section>

      {selected && (
        <div className="modal-overlay" role="presentation" onMouseDown={() => setSelected(null)}>
          <section
            className="player-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name} projection details`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button type="button" className="modal-close" onClick={() => setSelected(null)} aria-label="Close player details"><X size={18} /></button>
            <header className="player-modal__header">
              <span className={`player-modal__shirt team-${selected.team.shortName.toLowerCase()}`}>{selected.position}</span>
              <div>
                <span className="panel__eyebrow">PLAYER PROFILE</span>
                <h3>{selected.fullName || selected.name}</h3>
                <p>{selected.team.name} · {selected.position} · {formatPrice(selected.price)} · {formatPercent(selected.ownership)} owned</p>
              </div>
              <div className="player-modal__projection">
                <strong>{selected.projection.toFixed(1)}</strong>
                <span>projected pts</span>
              </div>
            </header>

            <div className="player-modal__scorebars">
              {[
                { label: 'Projection', value: selected.projection / 12, display: `${selected.projection.toFixed(1)} pts`, icon: <Target size={14} /> },
                { label: 'Form', value: selected.form / 10, display: selected.form.toFixed(1), icon: <Flame size={14} /> },
                { label: 'Confidence', value: selected.confidence, display: formatPercent(selected.confidence * 100, 0), icon: <ShieldCheck size={14} /> },
                { label: 'Fixture ease', value: (6 - selected.fixtureScore) / 4, display: `${selected.fixtureScore.toFixed(2)} FDR`, icon: <Activity size={14} /> },
              ].map((item) => (
                <div className="scorebar" key={item.label}>
                  <span>{item.icon} {item.label}</span>
                  <div><i style={{ width: `${Math.max(4, Math.min(100, item.value * 100))}%` }} /></div>
                  <strong>{item.display}</strong>
                </div>
              ))}
            </div>

            <div className="player-modal__stats">
              {[
                ['Total points', selected.totalPoints],
                ['Minutes', selected.minutes],
                ['Goals', selected.goals],
                ['Assists', selected.assists],
                ['xGI', selected.xGI.toFixed(2)],
                ['Bonus', selected.bonus],
                ['GW transfers in', formatCompact(selected.transfersInEvent)],
                ['Value score', selected.value.toFixed(2)],
              ].map(([label, value]) => (
                <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>
              ))}
            </div>

            <div className="player-modal__columns">
              <div className="reason-box">
                <h4><Sparkles size={15} /> Why this projection?</h4>
                <ul>
                  {selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  {selected.repoExpectedMinutes !== undefined && selected.repoExpectedMinutes !== null && (
                    <li>
                      Repository benchmark: {selected.repoExpectedMinutes.toFixed(0)} xMins
                      {selected.repoHorizon5Xpts !== undefined && selected.repoHorizon5Xpts !== null
                        ? ` · ${selected.repoHorizon5Xpts.toFixed(1)} 5-GW xPts`
                        : ''}
                    </li>
                  )}
                </ul>
                {selected.news && <p className="player-news"><Info size={14} /> {selected.news}</p>}
              </div>
              <div className="fixture-box">
                <h4>Next five fixtures</h4>
                <div className="fixture-mini-grid">
                  {selectedFixtureRow?.cells.map((cell) => (
                    <div className={`fixture-mini fixture-mini--${fixtureTone(cell.difficulty, cell.isBlank)}`} key={cell.event} title={cell.label}>
                      <small>GW{cell.event}</small>
                      <strong>{cell.isBlank ? 'BLK' : cell.difficulty.toFixed(1)}</strong>
                    </div>
                  ))}
                </div>
                <p>{selectedFixtureRow?.cells.map((cell) => cell.label).join(' · ')}</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
