import { useState, type ReactNode } from 'react';
import { ArrowRight, Check, LoaderCircle, Play, Settings2, Square } from 'lucide-react';
import type { EnrichedPlayer, Snapshot, SquadResult } from '../lib/types';
import type { PlannerSimulationOutput, StrategyWeek } from '../lib/repoModel/compassPlanner';
import type { SeasonChipUse } from '../lib/repoModel/seasonRules';
import type { StoredTransferPlan } from '../lib/transferPlansStore';
import { classNames, formatPrice } from '../lib/format';
import { PlayerProjectionCard } from './PlayerProjectionCard';
import { InfoDisclosure } from './InfoDisclosure';

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
  startingSquad?: SquadResult; bankTenths?: number;
  scenarioControls?: ReactNode; advancedControls?: ReactNode;
  chipHistory?: Array<{ name: string; event: number }>; historyKnown: boolean; template: boolean;
  onModeChange: (mode: 'auto' | 'manual') => void; onScheduleChange: (uses: SeasonChipUse[]) => void;
  onHorizonChange: (value: number) => void; freeTransfers: number; onFreeTransfersChange: (value: number) => void;
  onSaveAsNew: () => void; saveError: string | null;
  onRun: () => void; onCancel: () => void; onInspectPlayer?: (player: EnrichedPlayer) => void;
}
const chipBadge = (chip: StrategyWeek['chip']) => CHIPS.find(item => item.chip === chip)?.badge;
export function ChipStrategyWorkspace(props: Props) {
  const { snapshot, players, result, pending, error, mode, requestedChips, savedPlan } = props;
  const [selectedGw, setSelectedGw] = useState(snapshot.meta.nextEventId);
  const byId = new Map(players.map(player => [player.id, player]));
  const gws = Array.from({ length: Math.min(props.horizon, 39 - snapshot.meta.nextEventId) }, (_, index) => snapshot.meta.nextEventId + index);
  const weeks = result?.strategy.weeks.filter(step => gws.includes(step.gw)) ?? [];
  const week = weeks.find(step => step.gw === selectedGw) ?? weeks[0];
  const displayGw = week?.gw ?? snapshot.meta.nextEventId;
  const lineup = week?.lineup ?? (props.startingSquad ? {
    starters: props.startingSquad.starters.map(player => player.id),
    bench: props.startingSquad.bench.map(player => player.id),
    captainId: props.startingSquad.captain.id, viceId: props.startingSquad.viceCaptain.id,
  } : null);
  const total = weeks.reduce((sum, step) => sum + step.netXPts, 0);
  const totalHits = weeks.reduce((sum, step) => sum + step.hitCost, 0);
  const xp = (id: number) => week ? result?.forecastByGw[week.gw]?.[id] : byId.get(id)?.projection;
  const portrait = (id: number, _label?: string, priceTenths?: number) => {
    const player = byId.get(id);
    if (!player) return <span>Unavailable</span>;
    return <PlayerProjectionCard player={player} snapshot={snapshot} gw={displayGw} points={xp(id)} priceTenths={priceTenths}
      captainMultiplier={id === lineup?.captainId ? week?.chip === 'tc' ? 3 : 2 : 1}
      vice={id === lineup?.viceId} onInspect={props.onInspectPlayer} />;
  };
  return <div className={classNames('strategy-workspace', 'strategy-workspace--quiet', !result && 'is-ready')}>
    <section className="panel strategy-setup" aria-label="Transfer solver settings">
      <div className="strategy-heading"><h2>Solver</h2><span className="strategy-period">GW{gws[0]}–{gws.at(-1)}</span></div>
      {props.scenarioControls}
      <div className="strategy-mode" role="group" aria-label="Recommendation mode">
        <button type="button" aria-pressed={mode === 'auto'} className={classNames(mode === 'auto' && 'is-active')} onClick={() => props.onModeChange('auto')}>Automatic</button>
        <button type="button" aria-pressed={mode === 'manual'} className={classNames(mode === 'manual' && 'is-active')} onClick={() => props.onModeChange('manual')}>Manual chips</button>
      </div>
      <div className="planner-control-row">
        <label>Horizon<select aria-label="Solver planning horizon" value={Math.min(props.horizon,39-snapshot.meta.nextEventId)} onChange={event => props.onHorizonChange(Number(event.target.value))}>{Array.from({length: Math.min(10,39-snapshot.meta.nextEventId)},(_,index) => index+1).map(value => <option key={value} value={value}>{value} gameweek{value === 1 ? '' : 's'}</option>)}</select></label>
        <label>Free transfers<select aria-label="Free transfers available" value={props.freeTransfers} onChange={event => props.onFreeTransfersChange(Number(event.target.value))}>{[0,1,2,3,4,5].map(value => <option key={value} value={value}>{value} FT</option>)}</select></label>
      </div>
      <div className="strategy-inventories">{[...new Set(gws.map(gw => gw <= 19 ? 1 : 2))].map(half => {
        const used = (name: string) => props.chipHistory?.find(use => use.name === name && use.event < snapshot.meta.nextEventId && (use.event <= 19 ? 1 : 2) === half);
        const allSpent = props.historyKnown && CHIPS.every(chip => used(chip.name));
        return <div key={half}>
          <div className="strategy-chip-heading"><span>Chips{gws[0] <= 19 && gws.at(-1)! >= 20 ? ` · ${half === 1 ? 'GW1–19' : 'GW20–38'}` : ''}</span>{allSpent && half === 1 && <span title="Next chip set">GW20 <ArrowRight size={12} aria-hidden="true" /></span>}</div>
          <div className="strategy-chip-inventory" aria-label={`Chip inventory half ${half}`}>{CHIPS.map(chip => {
            const history = used(chip.name);
            const fixed = Object.entries(savedPlan?.chips ?? {}).find(([gw,value]) => value === chip.chip && gws.includes(Number(gw)) && (Number(gw) <= 19 ? 1 : 2) === half);
            const requested = requestedChips.find(use => use.chip === chip.chip && (use.gw <= 19 ? 1 : 2) === half);
            return <div key={chip.chip} className={classNames('strategy-chip', history && 'is-used')} title={`${chip.label}: ${history ? `used GW${history.event}` : !props.historyKnown ? 'history unverified' : 'available'}`}>
              <strong>{chip.badge}{history && <Check size={10} aria-hidden="true" />}</strong><span>{history ? `GW${history.event}` : !props.historyKnown ? '?' : fixed ? `GW${fixed[0]}` : 'Ready'}</span>
              {mode === 'manual' && <label className="strategy-chip-select"><span className="sr-only">{chip.label} gameweek</span><select aria-label={`${chip.label} gameweek${gws[0] <= 19 && gws.at(-1)! >= 20 ? ` half ${half}` : ''}`} disabled={!!history || !props.historyKnown || !!fixed} value={fixed ? Number(fixed[0]) : requested?.gw ?? ''} onChange={event => props.onScheduleChange([...requestedChips.filter(use => use.chip !== chip.chip || (use.gw <= 19 ? 1 : 2) !== half), ...(event.target.value ? [{chip:chip.chip,gw:Number(event.target.value)}] : [])])}>
                <option value="">{history ? 'Used' : 'Hold'}</option>{gws.filter(gw => (gw <= 19 ? 1 : 2) === half).map(gw => <option key={gw} value={gw}>GW{gw}</option>)}
              </select></label>}
            </div>;
          })}</div>
        </div>;
      })}</div>
      {props.advancedControls && <details className="strategy-settings"><summary><Settings2 size={15} aria-hidden="true" />Settings</summary>{props.advancedControls}</details>}
      <div className="strategy-run"><button type="button" className="button button--primary" onClick={props.onRun} disabled={pending} aria-busy={pending}>{pending ? <LoaderCircle size={17} className="strategy-spinner" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{pending ? 'Solving…' : 'Run Solver'}</button>{pending && <button type="button" className="button button--ghost" onClick={props.onCancel}><Square size={14} aria-hidden="true" />Stop</button>}</div>
      {error && <p className="strategy-error" role="alert">{error}</p>}
      <div className="strategy-context"><div>{!snapshot.meta.stale && <span className="strategy-fresh" role="img" aria-label="Fresh snapshot" title={`Snapshot: ${snapshot.meta.generatedAt}`}><Check size={13} aria-hidden="true" /></span>}{props.template && <span className="strategy-state">Template</span>}{snapshot.meta.stale && <span className="strategy-state is-stale">Stale</span>}{!props.historyKnown && <span className="strategy-state">Chips unverified</span>}</div><InfoDisclosure label="About the solver"><p>xPts are forecasts. This search uses shortlisted players and fixed prices; a global optimum is not certified.</p><p>Automatic chooses available chip weeks. Manual chips uses your selections. Saved decisions remain fixed.</p><p>Snapshot: {snapshot.meta.generatedAt}.</p><a href="#/method">Methodology</a></InfoDisclosure></div>
    </section>
    <section className="panel strategy-results" aria-label={result ? 'Joint chip schedule' : 'Starting squad'} aria-busy={pending}>
      <div className="strategy-summary"><div><small>{result ? `${weeks.length} GW` : `GW${displayGw}`} </small><h3>{result ? total.toFixed(2) : (props.startingSquad?.projectedPoints.toFixed(2) ?? '—')} <span>xPts{result ? ' · net' : ' · preview'}</span></h3></div><div><strong>{formatPrice((week?.bankAfter ?? props.bankTenths ?? 0) / 10)} <span>bank</span></strong><small>{week ? `${week.ftBefore} → ${week.ftAfter}` : props.freeTransfers} FT{totalHits ? ` · −${totalHits} hits` : ''}</small>{result && <small className="strategy-gain">{total - result.strategy.holdPoints >= 0 ? '+' : ''}{(total - result.strategy.holdPoints).toFixed(1)} vs hold</small>}</div>{result && <span className="strategy-result-state" aria-label="Calculated"><Check size={13} aria-hidden="true" /></span>}</div>
      {result && <div className="strategy-gw-strip" role="group" aria-label="Recommended gameweeks">{weeks.map(step => <button type="button" key={step.gw} aria-pressed={week?.gw === step.gw} onClick={() => setSelectedGw(step.gw)}><span>GW{step.gw}</span><strong>{step.netXPts.toFixed(2)}</strong><small>{chipBadge(step.chip) ?? (step.moves.length ? `${step.moves.length} move${step.moves.length > 1 ? 's' : ''}` : 'Roll')}{step.hitCost ? ` · −${step.hitCost}` : ''}</small></button>)}</div>}
      <div className={classNames('strategy-main-grid', !result && 'is-preview')}>
        {result && <div className="strategy-timeline" aria-label="Ten-gameweek transfer roadmap">{weeks.map(step => <button type="button" key={step.gw} className={classNames('strategy-step',week?.gw === step.gw && 'is-active')} onClick={() => setSelectedGw(step.gw)}><strong>GW{step.gw}</strong><span>{step.chip && <b>{chipBadge(step.chip)} · </b>}{step.moves.length ? step.moves.map(move => `${byId.get(move.outId)?.name ?? 'Unavailable'} → ${byId.get(move.inId)?.name ?? 'Unavailable'}`).join(' / ') : 'Roll'}<small>{step.ftBefore} → {step.ftAfter} FT · {formatPrice(step.bankAfter / 10)}{step.hitCost ? ` · −${step.hitCost}` : ''}</small></span><b>{step.netXPts.toFixed(2)}</b></button>)}</div>}
        <section className="strategy-week" aria-label={week ? `GW${displayGw} recommendation` : 'Starting squad preview'}>
          <div className="strategy-week-heading"><h3>GW{displayGw}{week ? ` · ${chipBadge(week.chip) ?? (week.moves.length ? 'Transfer' : 'Roll')}` : ''}</h3><strong>{week?.netXPts.toFixed(2) ?? props.startingSquad?.projectedPoints.toFixed(2)} xPts</strong></div>
          {lineup && <><div className="strategy-pitch" aria-label={`GW${displayGw} recommended starting eleven`}><div className="strategy-pitch-markings" aria-hidden="true" /><div className="strategy-formation-grid">{(['GKP','DEF','MID','FWD'] as const).map(position => <div className="strategy-formation" key={position}>{lineup.starters.filter(id => byId.get(id)?.position === position).map(id => <div className="strategy-pitch-player" key={id}>{portrait(id)}</div>)}</div>)}</div></div><div className="strategy-bench" aria-label="Recommended bench">{lineup.bench.map(id => <div key={id}>{portrait(id)}</div>)}</div></>}
          {week && <div className="strategy-moves">{week.moves.map(move => <div className="strategy-move" key={`${move.outId}-${move.inId}`}><div><small>OUT</small>{portrait(move.outId,'Sell',week.sellingPricesBefore[move.outId])}</div><ArrowRight size={16} aria-hidden="true" /><div><small>IN</small>{portrait(move.inId,'Buy')}</div></div>)}{!week.moves.length && <span className="strategy-roll">Roll · {week.ftAfter} FT</span>}</div>}
        </section>
      </div>
      {result && <div className="strategy-save"><button type="button" onClick={props.onSaveAsNew}>Save as new Plan</button></div>}
      {props.saveError && <p className="strategy-error" role="alert">{props.saveError}</p>}
    </section>
    {result && <details className="panel strategy-details strategy-model-details"><summary>Chip analysis</summary><div className="table-wrap"><table className="chip-matrix-table"><thead><tr><th>GW</th><th>WC</th><th>FH</th><th>BB</th><th>TC</th></tr></thead><tbody>{result.chipMatrixByGw.map(row => <tr key={row.gw}><th>GW{row.gw}</th>{[row.wildcardGain,row.freehitGain,row.bboostGain,row.tripleCapGain].map((value,index) => <td key={index}>{result.chipSimulations[index]?.available ? value.toFixed(1) : '—'}</td>)}</tr>)}</tbody></table></div><InfoDisclosure label="About chip analysis"><p>Individual chip gains are diagnostics and cannot be added together.</p>{result.warnings.map(warning => <p key={warning}>{warning}</p>)}</InfoDisclosure></details>}
  </div>;
}
