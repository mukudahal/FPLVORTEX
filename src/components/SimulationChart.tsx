import { useState } from 'react';
import type { MonteCarloSummary } from '../lib/repoModel/types';

/** Per-GW quantiles only: cumulative quantiles must not be obtained by adding bands. */
export function SimulationChart({ simulation }: { simulation: MonteCarloSummary }) {
  const [pathId, setPathId] = useState(simulation.recommendedPathId);
  const path = simulation.paths.find(p => p.id === pathId) ?? simulation.paths[0];
  if (!path?.perGw.length) return <p role="status">Simulation chart unavailable.</p>;
  const values = path.perGw;
  const low = Math.floor(Math.min(0, ...values.map(v => v.p10)) / 10) * 10;
  const high = Math.max(low + 10, Math.ceil(Math.max(...values.map(v => v.p90)) / 10) * 10);
  const x = (i: number) => values.length === 1 ? 197 : 45 + i * 305 / (values.length - 1);
  const y = (v: number) => 182 - (v - low) / (high - low) * 150;
  const line = values.map((v,i) => `${x(i)},${y(v.mean)}`).join(' ');
  const band = [...values.map((v,i) => `${x(i)},${y(v.p90)}`), ...values.map((v,i) => `${x(i)},${y(v.p10)}`).reverse()].join(' ');
  return <section className="simulation-chart" aria-label="Weekly simulated points">
    <div className="simulation-chart-heading"><h3>Weekly points</h3><label><span className="sr-only">Simulation chart plan</span><select aria-label="Simulation chart plan" value={path.id} onChange={e => setPathId(e.target.value)}>{simulation.paths.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label></div>
    <div className="simulation-chart-legend"><span>● Mean</span><span>▰ P10–P90</span><span>{simulation.draws.toLocaleString()} draws · Seed {simulation.seed}</span></div>
    <svg viewBox="0 0 380 224" role="img" aria-label={`${path.label}: weekly mean points and P10 to P90 range`}>
      <text x="45" y="17">Points</text>
      {[0,1,2,3].map(i => { const v = low + (high-low)*i/3;return <g key={i}><line className="simulation-chart-grid" x1="45" x2="350" y1={y(v)} y2={y(v)} /><text x="36" y={y(v)+4} textAnchor="end">{v.toFixed(0)}</text></g>; })}
      {values.length > 1 && <polygon className="simulation-chart-band" points={band} />}
      <polyline className="simulation-chart-line" points={line} />
      {values.map((v,i) => <g key={v.gw}><line className="simulation-chart-whisker" x1={x(i)} x2={x(i)} y1={y(v.p10)} y2={y(v.p90)} /><circle className="simulation-chart-dot" cx={x(i)} cy={y(v.mean)} r="3"><title>{`GW${v.gw}: mean ${v.mean.toFixed(2)}, P10 ${v.p10.toFixed(2)}, P90 ${v.p90.toFixed(2)}`}</title></circle>{(values.length <= 5 || i % 2 === 0 || i === values.length-1) && <text x={x(i)} y="205" textAnchor="middle">{v.gw}</text>}</g>)}
      <text x="350" y="222" textAnchor="end">Gameweek</text>
    </svg>
    <details><summary>Exact weekly points</summary><div className="table-wrap"><table><thead><tr><th>GW</th><th>Mean</th><th>P10</th><th>P90</th></tr></thead><tbody>{values.map(v => <tr key={v.gw}><th>{v.gw}</th><td>{v.mean.toFixed(2)}</td><td>{v.p10.toFixed(2)}</td><td>{v.p90.toFixed(2)}</td></tr>)}</tbody></table></div></details>
  </section>;
}
