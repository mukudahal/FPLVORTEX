import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Download,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { EnrichedPlayer, FixtureRow, Snapshot } from '../lib/types';
import { fixtureTone, positionFixtureRows } from '../lib/fixtures';
import { classNames, formatPrice, formatSigned } from '../lib/format';
import { ClubBadge } from './ClubBadge';
import { PlayerAvatar } from './PlayerAvatar';
import { StatCard } from './StatCard';

interface FixtureMatrixProps {
  snapshot: Snapshot;
  fixtureRows: FixtureRow[];
  players: EnrichedPlayer[];
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

function exportMatrix(rows: FixtureRow[], startEvent: number): void {
  const headers = [
    'Team',
    'Ease_5GW',
    'Avg_Lambda_Goals',
    'Avg_CS_Pct',
    'Next_3_FDR',
    'Next_5_FDR',
    'Swing',
    ...Array.from({ length: 5 }, (_, index) => `GW${startEvent + index}`),
  ];
  const data = rows.map((row) => [
    row.team.name,
    String(row.easeSum5),
    row.avgLambdaFor.toFixed(2),
    `${(row.avgCsProb * 100).toFixed(1)}%`,
    row.next3.toFixed(2),
    row.next5.toFixed(2),
    row.swing.toFixed(2),
    ...row.cells.map((cell) => `${cell.difficulty.toFixed(1)} ${cell.label}`),
  ]);
  const csv = [headers, ...data]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `fpl-vortex-fixtures-gw${startEvent}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function FixtureMatrix({ snapshot, fixtureRows, players, onToast }: FixtureMatrixProps) {
  const [sortBy, setSortBy] = useState<'difficulty' | 'attack' | 'cleanSheet' | 'swing' | 'name'>('difficulty');
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(fixtureRows[0]?.team.id ?? null);
  const startEvent = snapshot.meta.nextEventId;
  const rows = useMemo(() => positionFixtureRows(fixtureRows, sortBy), [fixtureRows, sortBy]);
  const selectedRow = fixtureRows.find((row) => row.team.id === selectedTeamId) ?? fixtureRows[0];
  const teamPlayers = players
    .filter((player) => player.teamId === selectedRow?.team.id)
    .sort((a, b) => b.projection - a.projection)
    .slice(0, 6);

  const best = fixtureRows[0];
  const bestAttack = [...fixtureRows].sort((a, b) => b.avgLambdaFor - a.avgLambdaFor)[0];
  const bestDefence = [...fixtureRows].sort((a, b) => b.avgCsProb - a.avgCsProb)[0];
  const improving = [...fixtureRows].sort((a, b) => a.swing - b.swing)[0];

  return (
    <div className="page page--fixtures">
      <section className="fixture-hero panel">
        <div>
          <span className="panel__eyebrow">POISSON SCHEDULE INTELLIGENCE</span>
          <h3>Find the run before the market does.</h3>
          <p>
            Every club is modeled with expected goals, clean-sheet odds, and 5-gameweek fixture difficulty swings so you
            can target attacking and defensive runs ahead of the template.
          </p>
          <div className="fixture-hero__legend">
            <span><i className="legend-dot legend-dot--easy" /> Easy 1.5–2.5</span>
            <span><i className="legend-dot legend-dot--medium" /> Medium 2.6–3.6</span>
            <span><i className="legend-dot legend-dot--hard" /> Hard 3.7–5.0</span>
            <span><i className="legend-dot legend-dot--blank" /> Blank</span>
          </div>
        </div>
        <div className="fixture-hero__actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={() => {
              exportMatrix(fixtureRows, startEvent);
              onToast('Fixture matrix exported as CSV.', 'success');
            }}
          >
            <Download size={15} /> Export matrix
          </button>
        </div>
      </section>

      <section className="stat-grid stat-grid--fixtures">
        <StatCard
          label="Easiest 5-GW Run"
          value={best?.team.name ?? '—'}
          detail={best ? `Ease +${best.easeSum5} · ${best.next5.toFixed(2)} avg FDR` : ''}
          icon={<ArrowDownRight size={18} />}
          tone="mint"
        />
        <StatCard
          label="Highest Poisson Attack"
          value={bestAttack?.team.name ?? '—'}
          detail={bestAttack ? `${bestAttack.avgLambdaFor.toFixed(2)} expected goals / GW` : ''}
          icon={<Target size={18} />}
          tone="violet"
        />
        <StatCard
          label="Highest Clean Sheet %"
          value={bestDefence?.team.name ?? '—'}
          detail={bestDefence ? `${(bestDefence.avgCsProb * 100).toFixed(1)}% avg CS probability` : ''}
          icon={<ShieldCheck size={18} />}
          tone="blue"
        />
        <StatCard
          label="Sharpest Turnaround"
          value={improving?.team.name ?? '—'}
          detail={improving ? `${formatSigned(improving.swing, 2)} late-window swing` : ''}
          icon={<TrendingUp size={18} />}
          tone="amber"
        />
      </section>

      <div className="fixture-layout">
        <section className="panel matrix-panel" aria-label="Five-gameweek fixture matrix">
          <div className="matrix-panel__header">
            <div>
              <span className="panel__eyebrow">GW{startEvent}–GW{startEvent + 4} TICKER</span>
              <h3>All 20 Premier League clubs</h3>
            </div>
            <div className="pos-pills">
              {([
                ['difficulty', 'Ease score'],
                ['attack', 'Attack λ'],
                ['cleanSheet', 'CS %'],
                ['swing', 'Swing'],
                ['name', 'A–Z'],
              ] as const).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={classNames('pos-pill', sortBy === key && 'is-active')}
                  onClick={() => setSortBy(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="matrix-table-wrap">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Club</th>
                  {Array.from({ length: 5 }, (_, index) => (
                    <th key={index}>GW{startEvent + index}</th>
                  ))}
                  <th>λ Goals</th>
                  <th>CS%</th>
                  <th>Ease</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.team.id}
                    className={classNames(selectedRow?.team.id === row.team.id && 'is-selected')}
                    onClick={() => setSelectedTeamId(row.team.id)}
                  >
                    <td>{row.rank}</td>
                    <td>
                      <div className="matrix-team matrix-team--badge">
                        <ClubBadge teamCode={row.team.code} shortName={row.team.shortName} teamName={row.team.name} size="sm" />
                        <div>
                          <strong>{row.team.name}</strong>
                          <small>{row.team.shortName} · FDR {row.next5.toFixed(2)}</small>
                        </div>
                      </div>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.event}>
                        <div className={classNames('matrix-cell', `matrix-cell--${fixtureTone(cell.difficulty, cell.isBlank)}`)}>
                          <strong>{cell.isBlank ? 'BLANK' : cell.label}</strong>
                          <span>
                            {cell.isBlank
                              ? 'No match'
                              : `λ ${(cell.lambdaFor ?? 0).toFixed(2)} · CS ${((cell.csProb ?? 0) * 100).toFixed(0)}%`}
                          </span>
                        </div>
                      </td>
                    ))}
                    <td className="mono-num"><strong>{row.avgLambdaFor.toFixed(2)}</strong></td>
                    <td className="mono-num">{(row.avgCsProb * 100).toFixed(0)}%</td>
                    <td>
                      <span className="score-pill is-elite">+{row.easeSum5}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="fixture-side">
          {selectedRow && (
            <section className="panel">
              <div className="panel__header">
                <div className="inline-player-tag">
                  <ClubBadge teamCode={selectedRow.team.code} shortName={selectedRow.team.shortName} teamName={selectedRow.team.name} size="lg" />
                  <div>
                    <span className="panel__eyebrow">CLUB SPOTLIGHT</span>
                    <h3>{selectedRow.team.name}</h3>
                  </div>
                </div>
                <CalendarDays size={17} />
              </div>
              <p className="muted-copy">
                Ease score +{selectedRow.easeSum5} · Avg Poisson goals {selectedRow.avgLambdaFor.toFixed(2)} · Avg CS{' '}
                {(selectedRow.avgCsProb * 100).toFixed(1)}% · Next 5 FDR {selectedRow.next5.toFixed(2)}.
              </p>

              <div className="club-schedule-list">
                {selectedRow.cells.map((cell) => (
                  <div className="club-schedule-row" key={cell.event}>
                    <span>GW{cell.event}</span>
                    <div>
                      <strong>{cell.label}</strong>
                      {!cell.isBlank && (
                        <small className="block-sub">
                          xG {(cell.lambdaFor ?? 0).toFixed(2)} vs {(cell.lambdaAgainst ?? 0).toFixed(2)} · Win {((cell.winProb ?? 0) * 100).toFixed(0)}%
                        </small>
                      )}
                    </div>
                    <em className={`fdr-chip fdr-chip--${fixtureTone(cell.difficulty, cell.isBlank)}`}>
                      {cell.isBlank ? '—' : cell.difficulty.toFixed(1)}
                    </em>
                  </div>
                ))}
              </div>

              <h4 className="subheading">Top {selectedRow.team.shortName} assets</h4>
              <div className="team-targets">
                {teamPlayers.map((player) => (
                  <div className="team-target-row team-target-row--avatar" key={player.id}>
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
                      <small>{player.position} · {formatPrice(player.price)} · 5GW {player.horizon5Projection.toFixed(1)}</small>
                    </div>
                    <strong className="score-pill is-strong">{player.projection.toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel__header">
              <div>
                <span className="panel__eyebrow">SWING WATCH</span>
                <h3>Clubs turning easier</h3>
              </div>
              <ArrowUpRight size={17} />
            </div>
            <div className="swing-list">
              {[...fixtureRows]
                .sort((a, b) => a.swing - b.swing)
                .slice(0, 6)
                .map((row) => (
                  <div className="swing-row" key={row.team.id}>
                    <ClubBadge teamCode={row.team.code} shortName={row.team.shortName} size="sm" />
                    <strong>{row.team.shortName}</strong>
                    <small>{row.next3.toFixed(2)} → {row.next5.toFixed(2)}</small>
                    <span className={row.swing <= 0 ? 'is-positive' : 'is-negative'}>
                      {formatSigned(row.swing, 2)}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
