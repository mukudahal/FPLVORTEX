import { useMemo, useState } from 'react';
import { BRAND_LION_SRC } from '../lib/baseUrl';
import { toRepoElement } from '../lib/analytics';
import { buildFixtureMatrix, toRepoFixtures, toRepoTeams } from '../lib/fixtures';
import { futureGwScore } from '../lib/repoModel/decay';
import { computePlayerXPts, computePositionPriors } from '../lib/repoModel/xpts';
import type { PlannerSimulationOutput } from '../lib/repoModel/compassPlanner';
import { evaluateSquad } from '../lib/optimize';
import { makeFixtureForecasts, overallDifficulty, difficultyColor } from '../lib/fixtureForecast';
import type { EnrichedPlayer, Snapshot } from '../lib/types';
import { PlayerAvatar } from './PlayerAvatar';

interface Props {
  snapshot: Snapshot;
  squad: EnrichedPlayer[];
  players: EnrichedPlayer[];
  onInspectPlayer?: (player: EnrichedPlayer) => void;
  horizon: number;
  decay: number;
  onDecayChange: (value: number) => void;
  onHorizonChange: (value: number) => void;
  plan: PlannerSimulationOutput | null;
  onSuggest: () => void;
  canSuggest: boolean;
}

export function PlannerOverview({ snapshot, squad, players, onInspectPlayer, horizon, decay, onDecayChange, onHorizonChange, plan, onSuggest, canSuggest }: Props) {
  const [selectedGw, setSelectedGw] = useState(snapshot.meta.nextEventId);
  const gws = Array.from({ length: Math.min(horizon, Math.max(0, 39 - snapshot.meta.nextEventId)) }, (_, i) => snapshot.meta.nextEventId + i);
  const selected = gws.includes(selectedGw) ? selectedGw : gws[0];
  const playerMap = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);
  const model = useMemo(() => ({ fixtures: toRepoFixtures(snapshot.fixtures), teams: new Map(toRepoTeams(snapshot.teams).map(team => [team.id, team])), priors: computePositionPriors(snapshot.players.map(toRepoElement)), completed: Math.max(1, snapshot.gameweeks.filter(gw => gw.finished).length) }), [snapshot]);
  const projected = gws.map(gw => {
    const week = plan?.transferWeeks.find(w => w.gw === gw);
    const source = week ? week.squad.map(id => playerMap.get(id)).filter((p): p is EnrichedPlayer => !!p) : squad;
    const weekPlayers = source.map(p => ({ ...p, projection: plan?.forecastByGw[gw]?.[p.id] ?? p.gwProjections?.[gw] ?? computePlayerXPts(toRepoElement(p), gw, model.fixtures, model.teams, model.completed, gw - snapshot.meta.nextEventId, model.priors).xPts }));
    if (week) {
      const lookup = new Map(weekPlayers.map(p => [p.id, { ...p, isCaptain: p.id === week.lineup.captainId, isViceCaptain: p.id === week.lineup.viceId }]));
      return { starters: week.lineup.starters.map(id => lookup.get(id)).filter((p): p is NonNullable<typeof p> => !!p), bench: week.lineup.bench.map(id => lookup.get(id)).filter((p): p is NonNullable<typeof p> => !!p), total: week.netXPts };
    }
    if (weekPlayers.length < 11) return null;
    const result = evaluateSquad(weekPlayers);
    return { starters: result.starters, bench: result.bench, total: result.projectedPoints };
  });
  const lineup = projected[gws.indexOf(selected)];
  const totals = projected.map(result => result?.total ?? 0);
  const rows = useMemo(() => buildFixtureMatrix(snapshot.teams, snapshot.fixtures, snapshot.meta.nextEventId, horizon, snapshot.players.map(toRepoElement), snapshot.historicalTeamModel?.strengths), [snapshot, horizon]);
  const forecasts = useMemo(() => makeFixtureForecasts(snapshot, 'vortex', gws), [snapshot, horizon]);
  const card = (p: NonNullable<typeof lineup>['starters'][number], bench = false) => {
    const cell = rows.find(row => row.team.id === p.teamId)?.cells[gws.indexOf(selected)];
    const fixtures = forecasts.get(`${p.teamId}:${selected}`) ?? [];
    const difficulty = fixtures.length ? fixtures.reduce((sum, item) => sum + overallDifficulty(item), 0) / fixtures.length : null;
    const tone = difficulty === null ? 'blank' : difficulty <= 2.5 ? 'easy' : difficulty >= 3.5 ? 'hard' : 'medium';
    return <div key={p.id} data-player-id={p.id} role="button" tabIndex={0} className={`vx-pitch-player${bench ? ' vx-pitch-player--bench' : ''}`} onClick={() => onInspectPlayer?.(p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onInspectPlayer?.(p); } }} aria-label={`Open ${p.name} player card`}>
      <span className={bench ? 'vx-pitch-pos-label' : 'vx-pitch-xp'}>{p.projection.toFixed(1)} xP</span>
      <div className="vx-pitch-avatar-box">{p.isCaptain && <span className="vx-pitch-armband is-cap">C</span>}{p.isViceCaptain && <span className="vx-pitch-armband is-vice">V</span>}<PlayerAvatar code={p.code} teamCode={p.team.code} name={p.name} fullName={p.fullName} teamShort={p.team.shortName} position={p.position} size="md" className="vx-pitch-portrait" /></div>
      <strong className="vx-pitch-name">{p.name}</strong><span className={`vx-pitch-fix ${tone} is-${tone}`} style={difficulty === null ? undefined : { background: difficultyColor(difficulty), color: '#071a1b' }}>{cell?.label ?? '—'}</span>
    </div>;
  };
  return <section className="vx-planner-overview" aria-label="Team planner">
    <div className="vx-planner-controls panel">
      <label>Horizon<select value={horizon} onChange={e => onHorizonChange(Number(e.target.value))}><option value={1}>1 GW</option><option value={5}>5 GW</option><option value={10}>10 GW</option></select></label>
      <label>Decay/GW<select value={decay} onChange={e => onDecayChange(Number(e.target.value))}>{[0, 5, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n}%</option>)}</select></label>
      <div className="vx-planner-score"><span>{plan ? 'Plan net xPts' : 'Projected xPts'} <strong>{totals.reduce((a, b) => a + b, 0).toFixed(1)}</strong></span><span>Planning score <strong>{futureGwScore(totals, 1 - decay / 100).toFixed(1)}</strong></span></div>
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
      <div className="panel planner-recommendations" aria-label="Transfer recommendations">
        <button type="button" className="button button--primary planner-suggest" onClick={onSuggest} disabled={!canSuggest}>Suggest transfers</button>
        <h3>{plan ? 'VORTEX suggested transfer path' : 'Your team plan'}</h3>
        <p>{plan ? 'Preview only — chips are saved and no transfers are made in FPL. Select a gameweek to see its suggested squad on the pitch.' : 'Choose Suggest transfers to preview a modelled path on your pitch.'}</p>
        {plan && <><p className="planner-recommendations__notice">Approximate search, not a guaranteed optimum. Projections and chip availability depend on the supplied data; verify your team, bank and rules before acting.</p>
          <div className="planner-week-list">{gws.map(gw => {
            const week = plan.transferWeeks.find(w => w.gw === gw);
            return <button type="button" className={`planner-week ${selected === gw ? 'is-active' : ''}`} key={gw} onClick={() => setSelectedGw(gw)} aria-pressed={selected === gw}>
              <strong>GW{gw}</strong><span>{week?.chip && <b>{({ wc: 'Wildcard', fh: 'Free Hit', bb: 'Bench Boost', tc: 'Triple Captain' })[week.chip]} · </b>}{week?.moves.length ? week.moves.map(move => <span key={`${move.outId}-${move.inId}`} data-in-id={move.inId} data-out-id={move.outId} className="planner-move">{[move.outId, move.inId].map((id, index) => { const p = playerMap.get(id); return <span className="planner-move__player" key={id}>{p && <PlayerAvatar code={p.code} teamCode={p.team.code} name={p.name} fullName={p.fullName} teamShort={p.team.shortName} position={p.position} size="sm" />}<span>{index === 0 ? 'Out: ' : 'In: '}{p?.name ?? `#${id}`}</span></span>; })}</span>) : 'No transfer'}</span><small>{week ? `${week.netXPts.toFixed(1)} net xP` : '—'}</small>
            </button>;
          })}</div></>}
      </div>
    </div>
  </section>;
}
