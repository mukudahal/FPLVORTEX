import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Download,
  Info,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { EnrichedPlayer, FixtureRow, Snapshot } from '../lib/types';
import { fixtureTone, positionFixtureRows } from '../lib/fixtures';
import { classNames, formatSigned } from '../lib/format';
import { StatCard } from './StatCard';

interface FixtureMatrixProps {
  snapshot: Snapshot;
  fixtureRows: FixtureRow[];
  players: EnrichedPlayer[];
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

function exportMatrix(rows: FixtureRow[], startEvent: number): void {
  const headers = ['Team', 'Next 3 FDR', 'Next 5 FDR', 'Swing', ...Array.from({ length: 5 }, (_, index) => `GW${startEvent + index}`)];
  const data = rows.map((row) => [
    row.team.name,
    row.next3.toFixed(2),
    row.next5.toFixed(2),
    row.swing.toFixed(2),
    ...row.cells.map((cell) => `${cell.difficulty.toFixed(1)} ${cell.label}`),
  ]);
  const csv = [headers, ...data].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `fpl-vortex-fixtures-gw${startEvent}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function FixtureMatrix({ snapshot, fixtureRows, players, onToast }: FixtureMatrixProps) {
  const [sortBy, setSortBy] = useState<'difficulty' | 'swing' | 'name'>('difficulty');
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(fixtureRows[0]?.team.id ?? null);
  const startEvent = snapshot.meta.nextEventId;
  const rows = useMemo(() => positionFixtureRows(fixtureRows, sortBy), [fixtureRows, sortBy]);
  const selectedRow = fixtureRows.find((row) => row.team.id === selectedTeamId) ?? fixtureRows[0];
  const teamPlayers = players
    .filter((player) => player.teamId === selectedRow?.team.id)
    .sort((a, b) => b.projection - a.projection)
    .slice(0, 6);
  const best = fixtureRows[0];
  const worst = fixtureRows.at(-1);
  const improving = [...fixtureRows].sort((a, b) => a.swing - b.swing)[0];
  const blankCount = fixtureRows.reduce((sum, row) => sum + row.cells.filter((cell) => cell.isBlank).length, 0);
  const doubleCount = fixtureRows.reduce((sum, row) => sum + row.cells.filter((cell) => cell.isDouble).length, 0);

  return (
    <div className="page page--fixtures">
      <section className="fixture-hero panel">
        <div>
          <span className="panel__eyebrow">SCHEDULE INTELLIGENCE</span>
          <h3>Find the run before the market does.</h3>
          <p>
            Every club is scored across the next five gameweeks using official fixture difficulty ratings, with blank
            gameweeks penalized and doubles rewarded.
          </p>
          <div className="fixture-hero__legend">
            <span><i className="legend-dot legend-dot--easy" /> Easy 1.5–2.5</span>
            <span><i className="legend-dot legend-dot--medium" /> Medium 2.6–3.6</span>
            <span><i className="legend-dot legend-dot--hard" /> Hard 3.7–5</span>
            <span><i className="legend-dot legend-dot--blank" /> Blank</span>
          </div>
        </div>
        <div className="fixture-hero__actions">
          <button type="button" className="button button--ghost" onClick={() => {
            exportMatrix(fixtureRows, startEvent);
            onToast('Fixture matrix exported as CSV.', 'success');
          }}>
            <Download size={16} /> Export matrix
          </button>
        </div>
      </section>

      <section className="stat-grid stat-grid--fixtures">
        <StatCard
          label="Easiest next five"
          value={best ? `${best.next5.toFixed(2)} FDR` : '—'}
          icon={<Zap size={19} />}
          tone="mint"
          footer={best ? `${best.team.name} · rank #1 of 20` : 'No fixture data'}
        />
        <StatCard
          label="Toughest next five"
          value={worst ? `${worst.next5.toFixed(2)} FDR` : '—'}
          icon={<Target size={19} />}
          tone="pink"
          footer={worst ? `${worst.team.name} · avoid short-term punts` : 'No fixture data'}
        />
        <StatCard
          label="Best improving swing"
          value={improving ? formatSigned(improving.swing, 2) : '—'}
          icon={<TrendingUp size={19} />}
          tone="violet"
          footer={improving ? `${improving.team.name} · medium-term fixtures improve` : 'No fixture data'}
        />
        <StatCard
          label="Schedule anomalies"
          value={`${blankCount + doubleCount}`}
          icon={<CalendarDays size={19} />}
          tone="amber"
          footer={`${blankCount} blanks · ${doubleCount} doubles in horizon`}
        />
      </section>

      <div className="fixture-layout">
        <section className="panel matrix-panel">
          <div className="panel__header matrix-panel__header">
            <div>
              <span className="panel__eyebrow">FIVE-GAMEWEEK HORIZON</span>
              <h3>Club difficulty matrix</h3>
              <p>Click a row to inspect the best assets from that club.</p>
            </div>
            <label className="inline-select">
              <span>Sort</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'difficulty' | 'swing' | 'name')}>
                <option value="difficulty">Best fixture run</option>
                <option value="swing">Best swing</option>
                <option value="name">Club name</option>
              </select>
            </label>
          </div>
          <div className="matrix-scroll">
            <table className="fixture-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Club</th>
                  {Array.from({ length: 5 }, (_, index) => <th key={index}>GW {startEvent + index}</th>)}
                  <th>Next 3</th>
                  <th>Next 5</th>
                  <th>Swing</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.team.id}
                    className={classNames(selectedRow?.team.id === row.team.id && 'is-selected')}
                    onClick={() => setSelectedTeamId(row.team.id)}
                    tabIndex={0}
                    onKeyDown={(event) => event.key === 'Enter' && setSelectedTeamId(row.team.id)}
                  >
                    <td><span className="matrix-rank">{String(index + 1).padStart(2, '0')}</span></td>
                    <td>
                      <div className="matrix-club">
                        <span className={`team-badge team-${row.team.shortName.toLowerCase()}`}>{row.team.shortName}</span>
                        <span><strong>{row.team.name}</strong><small>League position {row.team.position || '—'}</small></span>
                      </div>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.event}>
                        <div
                          className={classNames('fdr-cell', `fdr-cell--${fixtureTone(cell.difficulty, cell.isBlank)}`)}
                          title={cell.label}
                        >
                          <strong>{cell.isBlank ? 'BLK' : cell.difficulty.toFixed(1)}</strong>
                          <small>
                            {cell.fixtures.length
                              ? cell.fixtures.map((fixture) => {
                                  const opponentId = fixture.teamH === row.team.id ? fixture.teamA : fixture.teamH;
                                  return snapshot.teams.find((team) => team.id === opponentId)?.shortName ?? '—';
                                }).join('/')
                              : '—'}
                          </small>
                          {cell.isDouble && <span className="fdr-cell__tag">2×</span>}
                        </div>
                      </td>
                    ))}
                    <td><strong>{row.next3.toFixed(2)}</strong></td>
                    <td><strong className="fdr-total">{row.next5.toFixed(2)}</strong></td>
                    <td>
                      <span className={classNames('swing-pill', row.swing <= 0 ? 'is-positive' : 'is-negative')}>
                        {row.swing <= 0 ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                        {formatSigned(row.swing, 2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="fixture-side">
          <section className="panel selected-team-panel">
            <div className="selected-team-panel__header">
              <span className={`team-badge team-badge--large team-${selectedRow?.team.shortName.toLowerCase()}`}>{selectedRow?.team.shortName}</span>
              <div>
                <span className="panel__eyebrow">CLUB FOCUS</span>
                <h3>{selectedRow?.team.name}</h3>
              </div>
              <span className="selected-team-panel__rank">#{selectedRow?.rank}</span>
            </div>
            <div className="selected-team-panel__metrics">
              <div><span>Next 3</span><strong>{selectedRow?.next3.toFixed(2)}</strong></div>
              <div><span>Next 5</span><strong>{selectedRow?.next5.toFixed(2)}</strong></div>
              <div><span>Swing</span><strong>{selectedRow ? formatSigned(selectedRow.swing, 2) : '—'}</strong></div>
            </div>
            <div className="selected-team-panel__fixtures">
              {selectedRow?.cells.map((cell) => (
                <div className="selected-fixture" key={cell.event} title={cell.label}>
                  <span>GW {cell.event}</span>
                  <strong className={classNames(`is-${fixtureTone(cell.difficulty, cell.isBlank)}`)}>{cell.isBlank ? 'Blank' : `${cell.difficulty.toFixed(1)} FDR`}</strong>
                  <small>{cell.label}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="panel team-assets-panel">
            <div className="panel__header">
              <div><span className="panel__eyebrow">BEST ASSETS</span><h3>{selectedRow?.team.shortName} player signals</h3></div>
              <Sparkles size={19} className="panel__header-icon" />
            </div>
            <div className="team-assets">
              {teamPlayers.map((player) => (
                <div className="team-asset" key={player.id}>
                  <span className={`position-tag position-tag--${player.position.toLowerCase()}`}>{player.position}</span>
                  <span><strong>{player.name}</strong><small>£{player.price.toFixed(1)}m · {player.ownership.toFixed(1)}% owned</small></span>
                  <strong className="team-asset__score">{player.projection.toFixed(1)}</strong>
                </div>
              ))}
            </div>
            <div className="insight-callout insight-callout--info">
              <Info size={16} />
              <span>Fixture difficulty is one input. Minutes, role and form still drive the final player projection.</span>
            </div>
          </section>

          <section className="panel swing-panel">
            <div className="panel__header">
              <div><span className="panel__eyebrow">MEDIUM-TERM EDGE</span><h3>Best schedule swings</h3></div>
              <TrendingUp size={19} className="panel__header-icon" />
            </div>
            <div className="swing-panel__list">
              {[...fixtureRows].sort((a, b) => a.swing - b.swing).slice(0, 6).map((row, index) => (
                <div className="swing-panel__row" key={row.team.id}>
                  <span>#{index + 1}</span>
                  <strong>{row.team.shortName}</strong>
                  <div><i style={{ width: `${Math.min(100, Math.abs(row.swing) / 1.2 * 100)}%` }} /></div>
                  <span>{formatSigned(row.swing, 2)}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
