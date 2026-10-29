import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, ChevronRight, Settings2, ShieldCheck, Sparkles, Target, X } from 'lucide-react';
import type { EnrichedPlayer, FixtureRow, Snapshot } from '../lib/types';
import { makeFixtureForecasts, meanForecast, difficultyColor, overallDifficulty, type FixtureForecast, type ForecastSource } from '../lib/fixtureForecast';
import { ClubBadge } from './ClubBadge';

interface FixtureMatrixProps {
  snapshot: Snapshot;
  fixtureRows: FixtureRow[];
  players: EnrichedPlayer[];
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onInspectPlayer?: (player: EnrichedPlayer) => void;
}
type Metric = 'difficulty' | 'goals' | 'cleanSheet' | 'win';
type SortMetric = 'overall' | 'attackIndex' | 'defenceIndex' | 'goals' | 'cleanSheet' | 'win';
const num = (n: number) => n.toFixed(2);
const percent = (n: number) => `${Math.round(n * 100)}%`;
const average = (xs: readonly FixtureForecast[], metric: SortMetric) => metric === 'overall' ? (xs.length ? xs.reduce((sum, x) => sum + overallDifficulty(x), 0) / xs.length : null) : meanForecast(xs, metric);
const metricLabel: Record<SortMetric, string> = { overall: 'Overall FDR', attackIndex: 'Attack', defenceIndex: 'Defence', goals: 'Goals', cleanSheet: 'Clean sheet', win: 'Win' };

function badge(value: number, prefix: string) {
  return <span className="fm-score" style={{ backgroundColor: difficultyColor(value) }}>{prefix} {value.toFixed(2)}</span>;
}
function fair(probability: number) { return probability > 0 ? (1 / probability).toFixed(2) : '—'; }

export function FixtureMatrix({ snapshot }: FixtureMatrixProps) {
  const first = Math.max(1, Math.min(38, snapshot.meta.nextEventId));
  const [source, setSource] = useState<ForecastSource>('vortex');
  const [metric, setMetric] = useState<Metric>('difficulty');
  const [start, setStart] = useState(first);
  const [end, setEnd] = useState(Math.min(38, first + 9));
  const [settings, setSettings] = useState(false);
  const [selected, setSelected] = useState<FixtureForecast | null>(null);
  const [sort, setSort] = useState<{ gw: number | 'avg'; metric: SortMetric; ascending: boolean }>({ gw: 'avg', metric: 'attackIndex', ascending: true });
  const safeStart = Math.max(first, Math.min(38, start));
  const safeEnd = Math.max(safeStart, Math.min(38, end, safeStart + 14));
  const gws = source === 'market' ? Array.from({ length: Math.min(3, 39 - first) }, (_, i) => first + i) : Array.from({ length: safeEnd - safeStart + 1 }, (_, i) => safeStart + i);
  const forecasts = useMemo(() => makeFixtureForecasts(snapshot, source, gws), [snapshot, source, safeStart, safeEnd, first]);
  const byCell = (team: number, gw: number) => forecasts.get(`${team}:${gw}`) ?? [];
  const allFor = (team: number) => gws.flatMap(gw => byCell(team, gw));
  const sorted = [...snapshot.teams].sort((a, b) => {
    const metricForSort = sort.metric;
    const av = average(sort.gw === 'avg' ? allFor(a.id) : byCell(a.id, sort.gw), metricForSort);
    const bv = average(sort.gw === 'avg' ? allFor(b.id) : byCell(b.id, sort.gw), metricForSort);
    if (av === null || bv === null) return av === bv ? a.name.localeCompare(b.name) : av === null ? 1 : -1;
    return (av - bv) * (sort.ascending ? 1 : -1) || a.name.localeCompare(b.name);
  });
  const marketCount = source === 'market' ? snapshot.fixtures.filter(f => gws.includes(f.event) && f.marketOdds).length : 0;
  const fixtureCount = snapshot.fixtures.filter(f => gws.includes(f.event)).length;
  const setSortMetric = (gw: number | 'avg', kind: SortMetric) => setSort(prev => ({ gw, metric: kind, ascending: prev.gw === gw && prev.metric === kind ? !prev.ascending : kind === 'overall' || kind === 'attackIndex' || kind === 'defenceIndex' }));
  const chooseMetric = (next: Metric) => {
    setMetric(next);
    setSort({ gw: 'avg', metric: next === 'difficulty' ? 'attackIndex' : next, ascending: next === 'difficulty' });
  };
  const chooseSource = (next: ForecastSource) => {
    setSource(next); setSelected(null); setSettings(false);
    chooseMetric('difficulty');
  };
  useEffect(() => {
    if (sort.gw !== 'avg' && !gws.includes(sort.gw)) setSort(prev => ({ ...prev, gw: 'avg' }));
  }, [sort.gw, safeStart, safeEnd, first, source]);
  useEffect(() => {
    if (!selected && !settings) return;
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelected(null); setSettings(false); } };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [selected, settings]);
  const marketLeaders = source === 'market'
    ? snapshot.teams.flatMap(team => byCell(team.id, first))
    : [];
  const goalLeaders = [...marketLeaders].sort((a, b) => b.goals - a.goals || a.team.name.localeCompare(b.team.name));
  const cleanSheetLeaders = [...marketLeaders].sort((a, b) => b.cleanSheet - a.cleanSheet || a.team.name.localeCompare(b.team.name));

  const metricKeys: SortMetric[] = metric === 'difficulty' ? ['attackIndex', 'defenceIndex'] : [metric];
  const formatMetric = (v: number, key: SortMetric) => key === 'cleanSheet' || key === 'win' ? percent(v) : num(v);

  return <div className={`page page--fixtures fm-page fm-page--${source}`}>
    <section className="fm-hero">
      <div className="fm-hero__copy"><span className="fm-kicker"><Sparkles size={13} /> VORTEX INTELLIGENCE</span><h1>Fixture <span>Matrix</span></h1><p>Find the fixtures. See the opportunity.</p></div>
      <div className="fm-hero__orb" aria-hidden="true"><span><CalendarDays size={34} /></span></div>
    </section>
    <section className="fm-panel" aria-label="Fixture forecast matrix">
      <div className="fm-topline">
        <div className="fm-model-tabs" role="group" aria-label="Forecast source">
          <button type="button" className={source === 'vortex' ? 'is-active' : ''} onClick={() => chooseSource('vortex')} aria-pressed={source === 'vortex'}><span className="fm-tab-icon"><Sparkles size={16} /></span><span><strong>VORTEX Model</strong><small>Team projections</small></span></button>
          <button type="button" className={source === 'market' ? 'is-active is-market' : ''} onClick={() => chooseSource('market')} aria-pressed={source === 'market'}><span className="fm-tab-icon"><BarChart3 size={16} /></span><span><strong>Market Model</strong><small>Odds-derived</small></span></button>
        </div>
        <div className="fm-actions">{source === 'vortex' && <button type="button" className="fm-settings-button" onClick={() => setSettings(true)}><Settings2 size={17} /> Settings</button>}</div>
      </div>
      <div className="fm-section-head"><div><span className="fm-kicker">{source === 'vortex' ? 'THE FULL PICTURE' : 'NEAR-TERM MARKET'}</span><h2>{source === 'vortex' ? 'Fixture difficulty' : 'Market projections'}</h2><p>{source === 'vortex' ? `GW${safeStart} – GW${safeEnd} · ${gws.length} gameweeks` : `Next ${gws.length} gameweeks · ${marketCount}/${fixtureCount} fixtures matched`}</p></div>
        <div className="fm-metric-tabs" role="group" aria-label="Projection metric">
          {(source === 'vortex' ? [['difficulty', 'Difficulty', Target], ['goals', 'Projected goals', Sparkles], ['cleanSheet', 'Clean sheet %', ShieldCheck]] : [['difficulty', 'Difficulty', Target], ['goals', 'Projected goals', Sparkles], ['cleanSheet', 'Clean sheet %', ShieldCheck], ['win', 'Win %', BarChart3]] as const).map(([key, label, Icon]) => <button type="button" key={key as string} className={metric === key ? 'is-active' : ''} onClick={() => chooseMetric(key as Metric)} aria-pressed={metric === key}><Icon size={14} />{label as string}</button>)}
        </div>
      </div>
      <div className="fm-legend">{metric === 'difficulty' ? <><span>Easy</span><div className="fm-gradient" /><span>Hard</span></> : <span>Per-fixture projections</span>}<small>{source === 'vortex' && metric === 'difficulty' ? 'A = Attack · D = Defence · H / A = venue' : source === 'market' ? 'Market-implied projections · prices may be unavailable' : 'H / A = venue · click a fixture for details'}</small></div>
      <div className="fm-mobile-sort"><label htmlFor="fm-sort-mobile">Sort fixtures</label><select id="fm-sort-mobile" value={`${sort.gw}:${sort.metric}`} onChange={event => { const [gw, kind] = event.target.value.split(':'); setSortMetric(gw === 'avg' ? 'avg' : Number(gw), kind as SortMetric); }}><option value="avg:overall">Average FDR</option>{metricKeys.map(key => <option key={`avg:${key}`} value={`avg:${key}`}>Average {metricLabel[key]}</option>)}{gws.flatMap(gw => metricKeys.map(key => <option key={`${gw}:${key}`} value={`${gw}:${key}`}>GW{gw} {metricLabel[key]}</option>))}</select><button type="button" aria-label="Reverse sort order" onClick={() => setSort(prev => ({ ...prev, ascending: !prev.ascending }))}>{sort.ascending ? '↑' : '↓'}</button></div>
      <p className="table-swipe-hint fm-swipe-hint">Swipe left or right to see all gameweeks ↔</p>
      <div className="fm-table-scroll" role="region" aria-label="Fixture matrix, scroll sideways to see all gameweeks" tabIndex={0}><table className="fm-table" style={{ minWidth: `${320 + gws.length * 72}px` }}><thead><tr><th className="fm-team-col">CLUB</th><th className="fm-overall-col"><button type="button" onClick={() => setSortMetric('avg', 'overall')} aria-label="Sort average overall FDR">AVG FDR {sort.gw === 'avg' && sort.metric === 'overall' ? (sort.ascending ? '↑' : '↓') : '↕'}</button></th><th className="fm-avg-col"><span>AVG</span><div className="fm-sort-pair">{metricKeys.map(key => <button key={key} type="button" onClick={() => setSortMetric('avg', key)} aria-label={`Sort average ${metricLabel[key]}`}>{metric === 'difficulty' ? (key === 'attackIndex' ? 'A' : 'D') : metricLabel[key]}{sort.gw === 'avg' && sort.metric === key ? (sort.ascending ? ' ↑' : ' ↓') : ' ↕'}</button>)}</div></th>{gws.map(gw => <th key={gw}><span>GW{gw}</span><div className="fm-sort-pair">{metricKeys.map(key => <button key={key} type="button" onClick={() => setSortMetric(gw, key)} aria-label={`Sort GW${gw} ${metricLabel[key]}`}>{metric === 'difficulty' ? (key === 'attackIndex' ? 'A' : 'D') : 'Sort'}{sort.gw === gw && sort.metric === key ? (sort.ascending ? ' ↑' : ' ↓') : ' ↕'}</button>)}</div></th>)}</tr></thead>
        <tbody>{sorted.map(team => {
          const all = allFor(team.id);
          return <tr key={team.id}><th className="fm-team-col"><div className="fm-club"><ClubBadge teamCode={team.code} shortName={team.shortName} teamName={team.name} size="md" /><span><strong>{team.name}</strong><small>{team.shortName}</small></span></div></th><td className="fm-overall-col">{average(all, 'overall') === null ? '—' : <span className="fm-overall-value" style={{ background: difficultyColor(average(all, 'overall')!) }}>{average(all, 'overall')!.toFixed(2)}</span>}</td><td className="fm-avg-col" data-label={metric === 'difficulty' ? 'AVG A / D' : 'AVG'}><div className="fm-average">{metricKeys.map(key => { const v = average(all, key); return v === null ? <span className="fm-empty-value" key={key}>—</span> : metric === 'difficulty' ? <span key={key}>{badge(v, key === 'attackIndex' ? 'A' : 'D')}</span> : <strong key={key}>{formatMetric(v, key)}</strong>; })}</div></td>
            {gws.map(gw => {
              const items = byCell(team.id, gw);
              const fixtures = snapshot.fixtures.filter(f => f.event === gw && (f.teamH === team.id || f.teamA === team.id));
              return <td key={gw}><span className="fm-mobile-gw">GW{gw}</span><div className="fm-cell-stack">{!fixtures.length ? <span className="fm-blank">BLANK</span> : fixtures.map(f => {
                const item = items.find(i => i.fixture.id === f.id);
                if (!item) return <span key={f.id} className="fm-unavailable">No market price</span>;
                return <button type="button" key={f.id} className="fm-match is-filled" style={{ backgroundColor: difficultyColor(metric === 'goals' ? item.attackIndex : metric === 'cleanSheet' ? item.defenceIndex : metric === 'win' ? 1 + 4 * (1 - item.win) : overallDifficulty(item)) }} onClick={() => setSelected(item)} aria-label={`Open ${team.name} vs ${item.opponent.name}, GW${gw}`}><span className="fm-opponent"><ClubBadge teamCode={item.opponent.code} shortName={item.opponent.shortName} teamName={item.opponent.name} size="sm" /><strong>{item.opponent.shortName}</strong><small>({item.home ? 'H' : 'A'})</small></span><span className="fm-match-values">{metric === 'difficulty' ? <>{badge(item.attackIndex, 'A')}{badge(item.defenceIndex, 'D')}</> : <strong>{formatMetric(item[metric], metric)}</strong>}<ChevronRight size={12} /></span></button>;
              })}</div></td>;
            })}</tr>;
        })}</tbody></table></div>
      {source === 'market' && <details className="fm-leaders"><summary>GW{first} market leaders · projected goals &amp; clean sheets</summary>
        {marketLeaders.length === 0 ? <p>No market prices are available for this gameweek.</p> : <div className="fm-leaders__grid">
          {([['Projected goals', goalLeaders, 'goals'], ['Clean-sheet probability', cleanSheetLeaders, 'cleanSheet']] as const).map(([heading, items, kind]) => <section key={kind}>
            <h3>{heading}</h3><table><thead><tr><th>Club</th><th>Opponent</th><th>{kind === 'goals' ? 'Goals' : 'CS'}</th></tr></thead><tbody>{items.map(item => <tr key={`${item.team.id}:${item.fixture.id}`}><td><ClubBadge teamCode={item.team.code} shortName={item.team.shortName} teamName={item.team.name} size="sm" /> {item.team.name}</td><td>{item.opponent.shortName} ({item.home ? 'H' : 'A'})</td><td style={{ backgroundColor: difficultyColor(kind === 'goals' ? item.attackIndex : item.defenceIndex), color: '#071a1b' }}>{kind === 'goals' ? num(item.goals) : percent(item.cleanSheet)}</td></tr>)}</tbody></table>
          </section>)}
        </div>}
        <p>Market-priced fixtures only. Each fixture is listed separately, including double gameweeks; missing prices are excluded.</p>
      </details>}
      <div className="fm-footnote">{source === 'vortex' ? <><strong>Provisional A / D ratings.</strong> Fixed illustrative 1–5 mappings from model goals and clean-sheet chance; not calibrated FDR. Each fixture counts once in averages; blanks excluded.</> : <><strong>Market only. Ratings use the same provisional mapping.</strong> Missing odds are not replaced with model estimates. Probabilities are derived from implied goal rates; price freshness is not verified. The page checks for updates every minute; provider caching and coverage determine when prices change.</>}</div>
    </section>
    {settings && <div className="fm-modal-backdrop" onClick={() => setSettings(false)}><section className="fm-dialog fm-settings" role="dialog" aria-modal="true" aria-labelledby="fm-settings-title" onClick={e => e.stopPropagation()}><div className="fm-dialog-head"><div><span className="fm-kicker">MAKE IT YOURS</span><h2 id="fm-settings-title">Matrix settings</h2></div><button type="button" className="fm-close" aria-label="Close settings" onClick={() => setSettings(false)} autoFocus><X size={20} /></button></div><h3>Gameweeks</h3><p>Choose up to 15 gameweeks to display.</p><div className="fm-range"><label>From<select value={safeStart} onChange={e => { const n = Number(e.target.value); setStart(n); setEnd(Math.max(n, Math.min(safeEnd, n + 14))); }}>{Array.from({ length: 39 - first }, (_, i) => first + i).map(gw => <option key={gw} value={gw}>GW{gw}</option>)}</select></label><span>→</span><label>To<select value={safeEnd} onChange={e => setEnd(Number(e.target.value))}>{Array.from({ length: Math.min(15, 39 - safeStart) }, (_, i) => safeStart + i).map(gw => <option key={gw} value={gw}>GW{gw}</option>)}</select></label></div><div className="fm-range-line"><span style={{ width: `${(safeEnd - safeStart + 1) / 15 * 100}%` }} /></div><p className="fm-settings-count">{safeEnd - safeStart + 1} of 15 gameweeks selected</p><button type="button" className="fm-done" onClick={() => setSettings(false)}>Done</button></section></div>}
    {selected && <div className="fm-modal-backdrop" onClick={() => setSelected(null)}><section className="fm-dialog fm-detail" role="dialog" aria-modal="true" aria-labelledby="fm-detail-title" onClick={e => e.stopPropagation()}><div className="fm-dialog-head"><span className="fm-kicker">MATCH FORECAST · GW{selected.fixture.event}</span><button type="button" className="fm-close" aria-label="Close match details" onClick={() => setSelected(null)} autoFocus><X size={20} /></button></div><div className="fm-detail-match"><ClubBadge teamCode={selected.team.code} shortName={selected.team.shortName} teamName={selected.team.name} size="lg" /><h2 id="fm-detail-title">{selected.team.name} <span>vs</span> {selected.opponent.name}</h2><ClubBadge teamCode={selected.opponent.code} shortName={selected.opponent.shortName} teamName={selected.opponent.name} size="lg" /></div><div className="fm-detail-meta"><span>{selected.home ? 'Home' : 'Away'} · {selected.fixture.kickoffTime ? new Date(selected.fixture.kickoffTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Kickoff TBC'}</span><span className={`fm-source-pill ${selected.source === 'market' ? 'is-market' : ''}`}>{selected.source === 'market' ? 'Market-implied' : 'VORTEX model'}</span></div><div className="fm-detail-grid">{<div><small>Attack / Defence</small><div className="fm-detail-badges">{badge(selected.attackIndex, 'A')}{badge(selected.defenceIndex, 'D')}</div><em>Provisional 1–5 index</em></div>}<div><small>Projected goals</small><strong>{num(selected.goals)}</strong><em>Against {num(selected.goalsAgainst)}</em></div><div><small>Clean-sheet probability</small><strong>{percent(selected.cleanSheet)}</strong><em>Derived fair odds {fair(selected.cleanSheet)}</em></div><div><small>Win probability</small><strong>{percent(selected.win)}</strong><em>Derived fair odds {fair(selected.win)}</em></div><div><small>Scores 2+ goals</small><strong>{percent(selected.score2Plus)}</strong><em>Same score model</em></div></div><p className="fm-detail-note">{selected.source === 'market' ? `From ${selected.fixture.marketOdds?.bookmaker ?? 'market odds'} · quote freshness not verified. Model-derived probabilities may differ from raw bookmaker odds.` : 'VORTEX estimates, not bookmaker prices. Attack and defence indices are illustrative and not yet calibrated.'}</p></section></div>}
  </div>;
}
