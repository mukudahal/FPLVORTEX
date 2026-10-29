import { useMemo, useState } from 'react';
import { BRAND_LION_SRC } from '../lib/baseUrl';
import { toRepoElement } from '../lib/analytics';
import { buildFixtureMatrix, toRepoFixtures, toRepoTeams } from '../lib/fixtures';
import { futureGwScore } from '../lib/repoModel/decay';
import { computePlayerXPts, computePositionPriors } from '../lib/repoModel/xpts';
import { evaluateSquad } from '../lib/optimize';
import { plannerDifficulty, averagePlannerDifficulty } from '../lib/plannerDifficulty';
import type { EnrichedPlayer, Snapshot } from '../lib/types';
import { PlayerAvatar } from './PlayerAvatar';
import { ClubBadge } from './ClubBadge';

interface Props {
  snapshot: Snapshot;
  squad: EnrichedPlayer[];
  onInspectPlayer?: (player: EnrichedPlayer) => void;
}

export function PlannerOverview({ snapshot, squad, onInspectPlayer }: Props) {
  const [horizon, setHorizon] = useState(5);
  const [decay, setDecay] = useState(15);
  const [selectedGw, setSelectedGw] = useState(snapshot.meta.nextEventId);
  const [sort, setSort] = useState<{ gw: number | 'avg'; ascending: boolean }>({ gw: snapshot.meta.nextEventId, ascending: true });
  const gws = Array.from({ length: Math.min(horizon, Math.max(0, 39 - snapshot.meta.nextEventId)) }, (_, i) => snapshot.meta.nextEventId + i);
  const selected = gws.includes(selectedGw) ? selectedGw : gws[0];
  const model = useMemo(() => {
    const fixtures = toRepoFixtures(snapshot.fixtures);
    const teams = new Map(toRepoTeams(snapshot.teams).map(team => [team.id, team]));
    const elements = snapshot.players.map(toRepoElement);
    return { fixtures, teams, priors: computePositionPriors(elements), completed: Math.max(1, snapshot.gameweeks.filter(gw => gw.finished).length) };
  }, [snapshot]);
  const projected = useMemo(() => gws.map(gw => {
    const weekPlayers = squad.map(p => ({ ...p, projection: p.gwProjections?.[gw] ?? computePlayerXPts(toRepoElement(p), gw, model.fixtures, model.teams, model.completed, gw - snapshot.meta.nextEventId, model.priors).xPts }));
    return weekPlayers.length >= 11 ? evaluateSquad(weekPlayers) : null;
  }), [squad, model, snapshot.meta.nextEventId, horizon]);
  const lineup = projected[gws.indexOf(selected)];
  const totals = projected.map(result => result ? result.starters.reduce((sum, p) => sum + p.projection * (p.isCaptain ? 2 : 1), 0) : 0);
  const rows = useMemo(() => buildFixtureMatrix(snapshot.teams, snapshot.fixtures, snapshot.meta.nextEventId, horizon, snapshot.players.map(toRepoElement), snapshot.historicalTeamModel?.strengths), [snapshot, horizon]);
  const sortIndex = sort.gw === 'avg' ? -1 : Math.max(0, gws.indexOf(sort.gw));
  const sorted = [...rows].sort((a, b) => {
    const av = sortIndex < 0 ? averagePlannerDifficulty(a.cells) : plannerDifficulty(a.cells[sortIndex]);
    const bv = sortIndex < 0 ? averagePlannerDifficulty(b.cells) : plannerDifficulty(b.cells[sortIndex]);
    if (av === null || bv === null) return av === bv ? a.team.shortName.localeCompare(b.team.shortName) : av === null ? 1 : -1;
    return (av - bv) * (sort.ascending ? 1 : -1) || a.team.shortName.localeCompare(b.team.shortName);
  });
  const card = (p: NonNullable<typeof lineup>['squad'][number], bench = false) => {
    const cell = rows.find(row => row.team.id === p.teamId)?.cells[gws.indexOf(selected)];
    const difficulty = cell ? plannerDifficulty(cell) : null;
    const tone = difficulty === null ? 'blank' : difficulty <= 2.5 ? 'easy' : difficulty >= 3.5 ? 'hard' : 'medium';
    return <div key={p.id} role="button" tabIndex={0} className={`vx-pitch-player${bench ? ' vx-pitch-player--bench' : ''}`} onClick={() => onInspectPlayer?.(p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onInspectPlayer?.(p); } }} aria-label={`Open ${p.name} player card`}>
      <span className={bench ? 'vx-pitch-pos-label' : 'vx-pitch-xp'}>{(p.projection * (p.isCaptain ? 2 : 1)).toFixed(1)} xP</span>
      <div className="vx-pitch-avatar-box">{p.isCaptain && <span className="vx-pitch-armband is-cap">C</span>}{p.isViceCaptain && <span className="vx-pitch-armband is-vice">V</span>}<PlayerAvatar code={p.code} teamCode={p.team.code} name={p.name} fullName={p.fullName} teamShort={p.team.shortName} position={p.position} size="md" className="vx-pitch-portrait" /></div>
      <strong className="vx-pitch-name">{p.name}</strong><span className={`vx-pitch-fix ${tone} is-${tone}`}>{cell?.label ?? '—'}</span>
    </div>;
  };
  return <section className="vx-planner-overview" aria-label="Team planner">
    <div className="vx-planner-controls panel">
      <label>Horizon<select value={horizon} onChange={e => setHorizon(Number(e.target.value))}><option value={1}>1 GW</option><option value={5}>5 GW</option><option value={10}>10 GW</option></select></label>
      <label>Decay/GW<select value={decay} onChange={e => setDecay(Number(e.target.value))}>{[0, 5, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n}%</option>)}</select></label>
      <div className="vx-planner-score"><span>Projected xPts <strong>{totals.reduce((a, b) => a + b, 0).toFixed(1)}</strong></span><span>Planning score <strong>{futureGwScore(totals, 1 - decay / 100).toFixed(1)}</strong></span></div>
    </div>
    <div className="vx-planner-gws" aria-label="Select gameweek">{gws.map((gw, i) => <button type="button" key={gw} className={selected === gw ? 'is-active' : ''} onClick={() => setSelectedGw(gw)} aria-pressed={selected === gw}>GW{gw}<strong>{totals[i]?.toFixed(1)} xP</strong></button>)}</div>
    <div className="vx-planner-columns">
      <div className="vx-soccer-pitch">
        <div className="vx-pitch-top-boards"><div className="vx-pitch-board"><img src={BRAND_LION_SRC} alt="" /><span>FPL VORTEX</span></div><div className="vx-pitch-goal-net" aria-hidden="true" /><a href="https://www.youtube.com/@Fplvortex" target="_blank" rel="noreferrer" className="vx-pitch-board vx-pitch-board--link">@FPLVORTEX</a></div>
        <div className="vx-pitch-turf"><div className="vx-pitch-lines" aria-hidden="true"><span className="vx-pitch-box-18" /><span className="vx-pitch-box-6" /><span className="vx-pitch-halfway" /><span className="vx-pitch-circle" /></div>
          <div className="vx-pitch-formation">{(['GKP', 'DEF', 'MID', 'FWD'] as const).map(pos => <div className="vx-pitch-row" key={pos}>{lineup?.starters.filter(p => p.position === pos).map(p => card(p))}</div>)}</div>
          <div className="vx-pitch-bench-wrap"><div className="vx-pitch-bench-head"><span>BENCH</span></div><div className="vx-pitch-bench">{lineup?.bench.map(p => card(p, true))}</div></div>
        </div>
      </div>
      <div className="panel vx-planner-fixtures">
        <div className="vx-planner-fixture-head"><strong>Fixtures · VORTEX difficulty</strong><small>Click a GW or AVG to sort</small></div>
        <div className="vx-planner-table-scroll"><table><thead><tr><th>TEAM</th>{gws.map(gw => <th key={gw}><button type="button" onClick={() => setSort(prev => ({ gw, ascending: prev.gw === gw ? !prev.ascending : true }))}>GW{gw}{sort.gw === gw ? (sort.ascending ? ' ↑' : ' ↓') : ''}</button></th>)}<th><button type="button" onClick={() => setSort(prev => ({ gw: 'avg', ascending: prev.gw === 'avg' ? !prev.ascending : true }))}>AVG{sort.gw === 'avg' ? (sort.ascending ? ' ↑' : ' ↓') : ''}</button></th></tr></thead>
          <tbody>{sorted.map(row => {
            const average = averagePlannerDifficulty(row.cells);
            return <tr key={row.team.id}><th><ClubBadge teamCode={row.team.code} shortName={row.team.shortName} teamName={row.team.name} size="sm" /> {row.team.shortName}</th>{row.cells.map(cell => {
              const value = plannerDifficulty(cell);
              const source = cell.fixtures.length && cell.fixtures.every(f => f.marketOdds) ? 'Market odds' : cell.fixtures.some(f => f.marketOdds) ? 'Market odds and model' : 'VORTEX model';
              return <td key={cell.event} className={`vx-planner-fdr fdr-${value === null ? 'blank' : Math.min(5, Math.max(1, Math.round(value)))}`} title={`${cell.label} · ${source} · win chance ${((cell.winProb ?? 0) * 100).toFixed(0)}% · official FDR ${cell.isBlank ? '—' : cell.difficulty}`}><span>{cell.isBlank ? '—' : cell.label.replaceAll(' (', '(')}</span><b>{value === null ? '' : value.toFixed(1)}</b></td>;
            })}<td className={`vx-planner-fdr fdr-${average === null ? 'blank' : Math.min(5, Math.max(1, Math.round(average)))}`} title="Average of rated gameweeks; blanks excluded">{average === null ? '—' : average.toFixed(1)}</td></tr>;
          })}</tbody></table></div>
        <small className="vx-planner-source">Provisional 1–5 index: 1 + 4 × (1 − win probability). Odds where available, otherwise VORTEX model. Doubles averaged; blanks excluded from AVG. Not official FDR or a validated player-points forecast.</small>
      </div>
    </div>
  </section>;
}
