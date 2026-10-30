import { useMemo, useState } from 'react';
import { BRAND_LION_SRC } from '../lib/baseUrl';
import { toRepoElement } from '../lib/analytics';
import { buildFixtureMatrix, toRepoFixtures, toRepoTeams } from '../lib/fixtures';
import { computePlayerXPts, computePositionPriors } from '../lib/repoModel/xpts';
import { evaluateSquad } from '../lib/optimize';
import { createPlanningHorizon } from '../lib/dataProvenance';
import { makeFixtureForecasts, overallDifficulty, difficultyFillStyle } from '../lib/fixtureForecast';
import type { EnrichedPlayer, Snapshot } from '../lib/types';
import { PlayerAvatar } from './PlayerAvatar';
import { ClubBadge } from './ClubBadge';

interface Props {
  snapshot: Snapshot;
  squad: EnrichedPlayer[];
  onInspectPlayer?: (player: EnrichedPlayer) => void;
}

export function PlannerOverview({ snapshot, squad, onInspectPlayer }: Props) {
  const [horizon, setHorizon] = useState(10);
  const [sort, setSort] = useState<{ gw: number | 'avg'; ascending: boolean }>({ gw: 'avg', ascending: true });
  const [selectedGw, setSelectedGw] = useState(snapshot.meta.nextEventId);
  const finalGw = snapshot.gameweeks.reduce((latest, gw) => Math.max(latest, gw.id), 0);
  const gws = finalGw > 0 ? createPlanningHorizon(snapshot.meta.nextEventId, finalGw, horizon) : [];
  const selected = gws.includes(selectedGw) ? selectedGw : gws[0];
  const model = useMemo(() => ({ fixtures: toRepoFixtures(snapshot.fixtures), teams: new Map(toRepoTeams(snapshot.teams).map(team => [team.id, team])), priors: computePositionPriors(snapshot.players.map(toRepoElement)), completed: Math.max(1, snapshot.gameweeks.filter(gw => gw.finished).length) }), [snapshot]);
  const projected = gws.map(gw => {
    const weekPlayers = squad.map(p => ({ ...p, projection: p.gwProjections?.[gw] ?? computePlayerXPts(toRepoElement(p), gw, model.fixtures, model.teams, model.completed, gw - snapshot.meta.nextEventId, model.priors).xPts }));
    if (weekPlayers.length < 11) return null;
    const result = evaluateSquad(weekPlayers);
    return { starters: result.starters, bench: result.bench, total: result.projectedPoints };
  });
  const lineup = projected[gws.indexOf(selected)];
  const totals = projected.map(result => result?.total ?? 0);
  const rows = useMemo(() => buildFixtureMatrix(snapshot.teams, snapshot.fixtures, snapshot.meta.nextEventId, horizon, snapshot.players.map(toRepoElement), snapshot.historicalTeamModel?.strengths), [snapshot, horizon]);
  const forecasts = useMemo(() => makeFixtureForecasts(snapshot, 'vortex', gws), [snapshot, horizon]);
  const difficultyFor = (teamId: number, gw: number | 'avg') => {
    const fixtures = gw === 'avg' ? gws.flatMap(event => forecasts.get(`${teamId}:${event}`) ?? []) : (forecasts.get(`${teamId}:${gw}`) ?? []);
    return fixtures.length ? fixtures.reduce((sum, fixture) => sum + overallDifficulty(fixture), 0) / fixtures.length : null;
  };
  const sortedRows = [...rows].sort((a, b) => {
    const av = difficultyFor(a.team.id, sort.gw), bv = difficultyFor(b.team.id, sort.gw);
    if (av === null || bv === null) return av === bv ? a.team.shortName.localeCompare(b.team.shortName) : av === null ? 1 : -1;
    return (av - bv) * (sort.ascending ? 1 : -1) || a.team.shortName.localeCompare(b.team.shortName);
  });
  const toggleSort = (gw: number | 'avg') => setSort(prev => ({ gw, ascending: prev.gw === gw ? !prev.ascending : true }));
  const card = (p: NonNullable<typeof lineup>['starters'][number], bench = false) => {
    const cell = rows.find(row => row.team.id === p.teamId)?.cells[gws.indexOf(selected)];
    const fixtures = forecasts.get(`${p.teamId}:${selected}`) ?? [];
    const difficulty = fixtures.length ? fixtures.reduce((sum, item) => sum + overallDifficulty(item), 0) / fixtures.length : null;
    const tone = difficulty === null ? 'blank' : difficulty <= 2.85 ? 'easy' : difficulty > 4.2 ? 'hard' : 'medium';
    return <div key={p.id} data-player-id={p.id} role="button" tabIndex={0} className={`vx-pitch-player${bench ? ' vx-pitch-player--bench' : ''}`} onClick={() => onInspectPlayer?.(p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onInspectPlayer?.(p); } }} aria-label={`Open ${p.name} player card`}>
      <span className={bench ? 'vx-pitch-pos-label' : 'vx-pitch-xp'}>{p.projection.toFixed(1)} xP</span>
      <div className="vx-pitch-avatar-box">{p.isCaptain && <span className="vx-pitch-armband is-cap">C</span>}{p.isViceCaptain && <span className="vx-pitch-armband is-vice">V</span>}<PlayerAvatar code={p.code} teamCode={p.team.code} name={p.name} fullName={p.fullName} teamShort={p.team.shortName} position={p.position} size="md" className="vx-pitch-portrait" /></div>
      <strong className="vx-pitch-name">{p.name}</strong><span className={`vx-pitch-fix ${tone} is-${tone}`} style={difficulty === null ? undefined : difficultyFillStyle(difficulty)}>{cell?.label ?? '—'}</span>
    </div>;
  };
  return <section className="vx-planner-overview" aria-label="Team planner">
    <div className="vx-planner-timeline-bar">
      <div className="vx-planner-timeline-summary" role="status"><strong>10-GW PLANNING ROADMAP</strong><span>{gws.length ? `GW${gws[0]}–GW${gws[gws.length - 1]} · ${gws.length} weeks · model xP` : 'Upcoming gameweek schedule unavailable'}</span></div>
      <div className="vx-planner-gws" aria-label="Select gameweek">{gws.length ? gws.map((gw, i) => <button type="button" key={gw} className={selected === gw ? 'is-active' : ''} onClick={() => setSelectedGw(gw)} aria-pressed={selected === gw}>GW{gw}<strong>{totals[i]?.toFixed(1)} xP</strong></button>) : <p role="status">No verified upcoming gameweek is available. Refresh the official FPL snapshot.</p>}</div>
    </div>
    <div className="vx-planner-columns">
      <div className="vx-soccer-pitch">
        <div className="vx-pitch-top-boards"><div className="vx-pitch-board"><img src={BRAND_LION_SRC} alt="" /><span>FPL VORTEX</span></div><div className="vx-pitch-goal-net" aria-hidden="true" /><a href="https://www.youtube.com/@Fplvortex" target="_blank" rel="noreferrer" className="vx-pitch-board vx-pitch-board--link">@FPLVORTEX</a></div>
        <div className="vx-pitch-turf"><div className="vx-pitch-lines" aria-hidden="true"><span className="vx-pitch-box-18" /><span className="vx-pitch-box-6" /><span className="vx-pitch-halfway" /><span className="vx-pitch-circle" /></div>
          <div className="vx-pitch-formation">{(['GKP', 'DEF', 'MID', 'FWD'] as const).map(pos => <div className="vx-pitch-row" key={pos}>{lineup?.starters.filter(p => p.position === pos).map(p => card(p))}</div>)}</div>
          <div className="vx-pitch-bench-wrap"><div className="vx-pitch-bench-head"><span>BENCH</span></div><div className="vx-pitch-bench">{lineup?.bench.map(p => card(p, true))}</div></div>
        </div>
      </div>
      <section className="panel vx-planner-fixtures" aria-label="Fixture difficulty table">
        <div className="vx-planner-fixture-head">
          <div><strong>FIXTURE DIFFICULTY</strong><small>VORTEX model · lower is easier</small></div>
          <label>GAMEWEEKS <select aria-label="Fixture gameweeks" value={horizon} onChange={e => setHorizon(Number(e.target.value))}>
            {[3, 5, 10].map(n => <option key={n} value={n}>{`${n} GW`}</option>)}
          </select></label>
        </div>
        <div className="vx-planner-table-scroll" role="region" aria-label="Fixture difficulty table scroll" tabIndex={0}>
          <table><thead><tr><th scope="col">TEAM</th>{gws.map(gw => <th key={gw} scope="col"><button type="button" onClick={() => toggleSort(gw)} aria-label={`Sort by GW${gw} difficulty`}>GW{gw}{sort.gw === gw ? (sort.ascending ? ' ↑' : ' ↓') : ''}</button></th>)}<th scope="col"><button type="button" onClick={() => toggleSort('avg')} aria-label="Sort by average difficulty">AVG{sort.gw === 'avg' ? (sort.ascending ? ' ↑' : ' ↓') : ''}</button></th></tr></thead>
            <tbody>{sortedRows.map(row => <tr key={row.team.id}><th scope="row"><ClubBadge teamCode={row.team.code} shortName={row.team.shortName} teamName={row.team.name} size="sm" /> {row.team.shortName}</th>
              {row.cells.map(cell => { const value = difficultyFor(row.team.id, cell.event); return <td key={cell.event} className={`vx-planner-fdr${value === null ? ' fdr-blank' : ''}`} style={value === null ? undefined : difficultyFillStyle(value)} title={`${cell.label} · VORTEX difficulty ${value === null ? 'unavailable' : value.toFixed(1)}`}><span>{cell.label && !cell.isBlank ? cell.label : '—'}</span><b>{value === null ? '—' : value.toFixed(1)}</b></td>; })}
              {(() => { const avg = difficultyFor(row.team.id, 'avg'); return <td className={`vx-planner-fdr${avg === null ? ' fdr-blank' : ''}`} style={avg === null ? undefined : difficultyFillStyle(avg)}>{avg === null ? '—' : avg.toFixed(1)}</td>; })()}</tr>)}</tbody>
          </table>
        </div>
        <small className="vx-planner-source">Provisional VORTEX index: average attack and defence difficulty. Doubles are averaged; blanks excluded. Not calibrated FDR.</small>
      </section>
    </div>
  </section>;
}
