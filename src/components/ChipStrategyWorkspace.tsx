import { useState } from 'react';
import type { EnrichedPlayer, Snapshot } from '../lib/types';
import type { PlannerSimulationOutput, StrategyWeek } from '../lib/repoModel/compassPlanner';
import type { SeasonChipUse } from '../lib/repoModel/seasonRules';
import type { StoredTransferPlan } from '../lib/transferPlansStore';
import { classNames, formatPrice } from '../lib/format';
import { PlayerAvatar } from './PlayerAvatar';
import { ClubBadge } from './ClubBadge';

const CHIPS = [
  { chip: 'wc', name: 'wildcard', label: 'Wildcard', badge: 'WC' },
  { chip: 'fh', name: 'freehit', label: 'Free Hit', badge: 'FH' },
  { chip: 'bb', name: 'bboost', label: 'Bench Boost', badge: 'BB' },
  { chip: 'tc', name: '3xc', label: 'Triple Captain', badge: 'TC' },
] as const;
interface Props {
  snapshot: Snapshot; players: EnrichedPlayer[]; result: PlannerSimulationOutput | null;
  pending: boolean; error: string | null; horizon: number; mode: 'auto' | 'manual';
  requestedChips: SeasonChipUse[]; savedPlan: StoredTransferPlan | null;
  chipHistory?: Array<{ name: string; event: number }>; historyKnown: boolean; template: boolean;
  onModeChange: (mode: 'auto' | 'manual') => void; onScheduleChange: (uses: SeasonChipUse[]) => void;
  onHorizonChange: (value: number) => void; freeTransfers: number; onFreeTransfersChange: (value: number) => void;
  onSaveAsNew: () => void; saveError: string | null;
  onRun: () => void; onCancel: () => void; onInspectPlayer?: (player: EnrichedPlayer) => void;
}
const chipBadge = (chip: StrategyWeek['chip']) => CHIPS.find(c => c.chip === chip)?.badge;
export function ChipStrategyWorkspace(props: Props) {
  const { snapshot, players, result, pending, error, mode, requestedChips, savedPlan } = props;
  const [selectedGw, setSelectedGw] = useState(snapshot.meta.nextEventId);
  const byId = new Map(players.map(player => [player.id, player]));
  const gws = Array.from({ length: Math.min(props.horizon, 39 - snapshot.meta.nextEventId) }, (_, i) => snapshot.meta.nextEventId + i);
  const weeks = result?.strategy.weeks.filter(w => gws.includes(w.gw)) ?? [];
  const week = weeks.find(w => w.gw === selectedGw) ?? weeks[0];
  const half = snapshot.meta.nextEventId <= 19 ? 1 : 2;
  const used = (name: string, chipHalf = half) => props.chipHistory?.find(use => use.name === name && use.event < snapshot.meta.nextEventId && (use.event <= 19 ? 1 : 2) === chipHalf);
  const allSpent = props.historyKnown && CHIPS.every(chip => used(chip.name));
  const total = weeks.reduce((sum, step) => sum + step.netXPts, 0);
  const totalHits = weeks.reduce((sum, step) => sum + step.hitCost, 0);
  const portrait = (id: number, label?: string, priceTenths?: number) => {
    const player = byId.get(id);
    if (!player) return <span>Player unavailable</span>;
    return <button type="button" className="strategy-player" onClick={() => props.onInspectPlayer?.(player)} aria-label={`${label ? label + ' ' : ''}${player.name}`}>
      <PlayerAvatar code={player.code} teamCode={player.team.code} name={player.name} fullName={player.fullName} teamShort={player.team.shortName} position={player.position} size="md" />
      <span><strong>{player.name}</strong><small><ClubBadge teamCode={player.team.code} teamName={player.team.name} shortName={player.team.shortName} size="sm" /> {player.team.shortName} · {formatPrice(priceTenths === undefined ? player.price : priceTenths / 10)}</small></span>
    </button>;
  };
  return <div className="strategy-workspace">
    <section className="panel strategy-setup" aria-label="Transfer solver settings">
      <div className="panel__header"><h2>Transfer solver</h2><span className="badge badge--mint">GW{gws[0]}–{gws.at(-1)}</span></div>
      <div className="strategy-mode" role="group" aria-label="Recommendation mode">
        <button type="button" aria-pressed={mode === 'auto'} className={classNames(mode === 'auto' && 'is-active')} onClick={() => props.onModeChange('auto')}>Best recommendations</button>
        <button type="button" aria-pressed={mode === 'manual'} className={classNames(mode === 'manual' && 'is-active')} onClick={() => props.onModeChange('manual')}>Manual check</button>
      </div>
      <div className="planner-control-row">
        <label>Plan ahead<select aria-label="Solver planning horizon" value={props.horizon} onChange={e => props.onHorizonChange(Number(e.target.value))}>{Array.from({length: Math.min(10,39-snapshot.meta.nextEventId)},(_,i)=>i+1).map(value => <option key={value} value={value}>{value} gameweeks</option>)}</select></label>
        <label>Free transfers<select aria-label="Free transfers available" value={props.freeTransfers} onChange={e => props.onFreeTransfersChange(Number(e.target.value))}>{[0,1,2,3,4,5].map(value=><option key={value} value={value}>{value} FT</option>)}</select></label>
      </div>
      {[...new Set(gws.map(gw => gw <= 19 ? 1 : 2))].map(chipHalf => <div key={chipHalf}>
      {gws[0] <= 19 && gws.at(-1)! >= 20 && <small>Chips · GW{chipHalf === 1 ? '1–19' : '20–38'}</small>}
      <div className="strategy-chip-inventory" aria-label={`Chip inventory half ${chipHalf}`}>
        {CHIPS.map(chip => {
          const history = used(chip.name,chipHalf);
          const fixed = Object.entries(savedPlan?.chips ?? {}).find(([gw, value]) => value === chip.chip && gws.includes(Number(gw)) && (Number(gw) <= 19 ? 1 : 2) === chipHalf);
          const requested = requestedChips.find(use => use.chip === chip.chip && (use.gw <= 19 ? 1 : 2) === chipHalf);
          return <div key={chip.chip} className={classNames('strategy-chip', history && 'is-used')}>
            <strong>{chip.badge}</strong><span>{history ? `Used GW${history.event}` : !props.historyKnown ? 'Unverified' : 'Available'}</span>
            {mode === 'manual' && <label className="strategy-chip-select"><span className="sr-only">{chip.label} gameweek</span><select aria-label={`${chip.label} gameweek${gws[0] <= 19 && gws.at(-1)! >= 20 ? ` half ${chipHalf}` : ''}`} disabled={!!history || !props.historyKnown || !!fixed} value={fixed ? Number(fixed[0]) : requested?.gw ?? ''} onChange={e => props.onScheduleChange([...requestedChips.filter(use => use.chip !== chip.chip || (use.gw <= 19 ? 1 : 2) !== chipHalf), ...(e.target.value ? [{chip:chip.chip,gw:Number(e.target.value)}] : [])])}>
              <option value="">{history ? 'Spent' : 'Hold'}</option>{gws.filter(gw => (gw <= 19 ? 1 : 2) === chipHalf).map(gw => <option key={gw} value={gw}>GW{gw}</option>)}
            </select></label>}
          </div>;
        })}
      </div></div>)}
      {allSpent && <p className="strategy-notice">All chips spent{half === 1 ? ' · next set GW20' : ''}. Transfer recommendations stay on.</p>}
      {!props.historyKnown && <p role="status">Chip history unavailable. Transfers still work; reload your team to enable chips.</p>}
      {props.template && <p className="strategy-notice">Template scenario · load your team or select your saved Plan for personal recommendations.</p>}
      {savedPlan && <p className="strategy-notice">Saved transfers and chips stay fixed. This check does not edit your Plan.</p>}
      <p className="strategy-notice">Model forecast · {snapshot.meta.stale ? 'stale snapshot fallback' : 'fresh snapshot'}</p>
      <div className="strategy-run"><button type="button" className="button button--primary" onClick={props.onRun} disabled={pending}>{pending ? 'Finding legal paths…' : mode === 'auto' ? 'Find best recommendations' : 'Check my chip schedule'}</button>{pending && <button type="button" onClick={props.onCancel}>Stop calculation</button>}</div>
      {error && <p role="alert">{error}</p>}
      {pending && <p role="status" aria-live="polite">Comparing transfers, rolls, hits and available chips…</p>}
    </section>
    {result && week && <>
      <section className="panel strategy-results" aria-label="Joint chip schedule">
        <div className="strategy-summary"><div><small>{mode === 'manual' ? 'YOUR CHIP SCHEDULE' : 'RECOMMENDED PATH'}</small><h3>{total.toFixed(1)} <span>net xPts</span></h3></div><div><strong>{weeks.length} GWs</strong><small>{totalHits ? `−${totalHits} total hits` : 'No transfer hits'}</small></div><span className="badge badge--violet">Shortlist-limited</span></div>
        <div className="strategy-gw-strip" role="group" aria-label="Recommended gameweeks">{weeks.map(step => <button type="button" key={step.gw} aria-pressed={week.gw === step.gw} onClick={() => setSelectedGw(step.gw)}><span>GW{step.gw}</span><strong>{step.netXPts.toFixed(1)}</strong><small>{chipBadge(step.chip) ?? (step.moves.length ? `${step.moves.length} transfer${step.moves.length > 1 ? 's' : ''}` : 'Roll')}{step.hitCost ? ` · −${step.hitCost}` : ''}</small></button>)}</div>
        <div className="strategy-main-grid">
          <div className="strategy-timeline" aria-label="Ten-gameweek transfer roadmap">{weeks.map(step => <button type="button" key={step.gw} className={classNames('strategy-step',week.gw === step.gw && 'is-active')} onClick={() => setSelectedGw(step.gw)}><strong>GW{step.gw}</strong><span>{step.chip && <b>{chipBadge(step.chip)} · </b>}{step.moves.length ? step.moves.map(move => `${byId.get(move.outId)?.name ?? 'Unavailable'} → ${byId.get(move.inId)?.name ?? 'Unavailable'}`).join(' / ') : 'Roll transfer'}<small>{step.ftBefore} → {step.ftAfter} FT · {formatPrice(step.bankAfter / 10)} bank{step.hitCost ? ` · −${step.hitCost} hit` : ''}</small></span><b>{step.netXPts.toFixed(1)}</b></button>)}</div>
          <section className="strategy-week" aria-label={`GW${week.gw} recommendation`}>
            <div className="strategy-week-heading"><h3>GW{week.gw} · {week.chip ? chipBadge(week.chip) : week.moves.length ? 'Transfer' : 'Roll'}</h3><strong>{week.netXPts.toFixed(1)} xPts</strong></div>
            <div className="strategy-moves">{week.moves.length ? week.moves.map(move => <div className="strategy-move" key={`${move.outId}-${move.inId}`}><div><small>SELL</small>{portrait(move.outId,'Sell',week.sellingPricesBefore[move.outId])}</div><span aria-hidden="true">→</span><div><small>BUY</small>{portrait(move.inId,'Buy')}</div></div>) : <p className="strategy-roll">Keep your squad · bank the free transfer</p>}</div>
            <div className="strategy-pitch" aria-label={`GW${week.gw} recommended starting eleven`}>{(['GKP','DEF','MID','FWD'] as const).map(position => <div className="strategy-formation" key={position}>{week.lineup.starters.filter(id=>byId.get(id)?.position === position).map(id=><div className="strategy-pitch-player" key={id}>{portrait(id)}<strong>{(result.forecastByGw[week.gw]?.[id] ?? 0).toFixed(1)}{id === week.lineup.captainId ? ' · C' : id === week.lineup.viceId ? ' · V' : ''}</strong></div>)}</div>)}</div>
            <div className="strategy-bench" aria-label="Recommended bench">{week.lineup.bench.map(id=><div key={id}>{portrait(id)}<small>Bench · {(result.forecastByGw[week.gw]?.[id] ?? 0).toFixed(1)}</small></div>)}</div>
          </section>
        </div>
        <div className="strategy-save"><button type="button" onClick={props.onSaveAsNew}>Save as new Plan</button><small>Your existing plans stay unchanged.</small></div>
        {props.saveError && <p role="alert">{props.saveError}</p>}
      </section>
      <details className="panel strategy-details"><summary>Chip timing & model details</summary><p>Model forecasts, fixed prices. Shortlisted search; a global optimum is not proven. Net xPts include transfer hits.</p><div className="table-wrap"><table className="chip-matrix-table"><thead><tr><th>GW</th><th>WC</th><th>FH</th><th>BB</th><th>TC</th></tr></thead><tbody>{result.chipMatrixByGw.map(row=><tr key={row.gw}><th>GW{row.gw}</th>{[row.wildcardGain,row.freehitGain,row.bboostGain,row.tripleCapGain].map((value,i)=><td key={i}>{result.chipSimulations[i]?.available ? value.toFixed(1) : '—'}</td>)}</tr>)}</tbody></table></div><p>Individual chip gains are diagnostics, not additive.</p>{result.warnings.map(warning=><p key={warning}>{warning}</p>)}<p>Snapshot {snapshot.meta.generatedAt} · {snapshot.meta.stale ? 'stale fallback' : 'official snapshot'}.</p></details>
    </>}
  </div>;
}
