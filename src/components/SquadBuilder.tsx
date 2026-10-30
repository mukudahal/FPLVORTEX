import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CircleDollarSign,
  Crown,
  Dices,
  Layers,
  RefreshCw,
  ShieldCheck,
  WandSparkles,
} from 'lucide-react';
import type {
  EnrichedPlayer,
  EntryData,
  FixtureRow,
  RiskProfile,
  Snapshot,
} from '../lib/types';
import { toRepoElement } from '../lib/analytics';
import { toRepoFixtures, toRepoTeams } from '../lib/fixtures';
import { classNames, formatPrice } from '../lib/format';
import { evaluateSquad, formationRisk, optimizeSquad } from '../lib/optimize';
import type { PlannerSimulationInput, PlannerSimulationOutput } from '../lib/repoModel/compassPlanner';
import { MC_DRAWS } from '../lib/repoModel/monteCarlo';
import { ClubBadge } from './ClubBadge';
import { TeamIdInput } from './TeamIdInput';
import type { RecentTeamEntry } from '../lib/recentTeamIds';
import { PlayerAvatar } from './PlayerAvatar';
import { PlannerOverview } from './PlannerOverview';
import { StatCard } from './StatCard';
import { TransferPlanModal } from './TransferPlanModal';

interface SquadBuilderProps {
  snapshot: Snapshot;
  players: EnrichedPlayer[];
  fixtureRows: FixtureRow[];
  entry?: EntryData | null;
  /** Optional for isolated planner simulations; wired by the real App shell. */
  teamId?: string;
  recentTeams?: RecentTeamEntry[];
  entryLoading?: boolean;
  entryError?: string | null;
  onLoadTeam?: (id: string) => void;
  profile: RiskProfile;
  onProfileChange: (profile: RiskProfile) => void;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onInspectPlayer?: (player: EnrichedPlayer) => void;
  onInspectInjury?: (player: EnrichedPlayer) => void;
}

type OptimizerSubTab = 'planner' | 'chips' | 'montecarlo';

const DEFAULT_TEMPLATE_SQUAD = [1, 31, 332, 173, 40, 154, 427, 124, 165, 411, 346, 623, 115, 112, 289];

const CHIP_META: Record<string, { label: string; badge: string; tone: string }> = {
  wildcard: { label: 'Wildcard', badge: 'WC', tone: 'mint' },
  freehit: { label: 'Free Hit', badge: 'FH', tone: 'violet' },
  bboost: { label: 'Bench Boost', badge: 'BB', tone: 'blue' },
  '3xc': { label: 'Triple Captain', badge: 'TC', tone: 'pink' },
};

export function SquadBuilder({
  snapshot,
  players,
  entry,
  teamId = '',
  recentTeams = [],
  entryLoading = false,
  entryError = null,
  onLoadTeam,
  profile,
  onToast,
  onInspectPlayer,
  onInspectInjury,
}: SquadBuilderProps) {
  const [subTab, setSubTab] = useState<OptimizerSubTab>('planner');
  const [draftTeamId, setDraftTeamId] = useState(teamId);
  const [transferPlansOpen, setTransferPlansOpen] = useState(false);
  const [plannerHorizon, setPlannerHorizon] = useState(10);
  const [plannerDecay, setPlannerDecay] = useState(15);
  const [simulationDraws, setSimulationDraws] = useState<number>(MC_DRAWS);
  const [reviewSim, setReviewSim] = useState<PlannerSimulationOutput | null>(null);
  const [simulationPending, setSimulationPending] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [strategyLabel, setStrategyLabel] = useState('steady');
  const [freeTransfers, setFreeTransfers] = useState<number>(entry?.freeTransfers ?? 2);
  const [lockedIds] = useState<number[]>([]);
  const [customSquadIds, setCustomSquadIds] = useState<number[]>([]);
  const [selectedChipPreview, setSelectedChipPreview] = useState<'wildcard' | 'freehit' | 'bboost' | '3xc'>('wildcard');
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const baseEntrySquadIds = useMemo(() => {
    if (entry && entry.picks.length === 15 && entry.picks.every((p) => playerMap.has(p.element))) {
      return entry.picks.map((p) => p.element);
    }
    const valid = DEFAULT_TEMPLATE_SQUAD.filter((id) => playerMap.has(id));
    return valid.length === 15 ? valid : players.slice(0, 15).map((p) => p.id);
  }, [entry, playerMap, players]);

  useEffect(() => {
    if (entry?.freeTransfers !== undefined) setFreeTransfers(entry.freeTransfers);
  }, [entry?.freeTransfers]);

  const baseSquadSignature = baseEntrySquadIds.join(',');
  useEffect(() => {
    if (baseEntrySquadIds.length === 15) {
      setCustomSquadIds(baseEntrySquadIds);
    }
  }, [entry?.id, baseSquadSignature]);

  const autoResult = useMemo(
    () =>
      optimizeSquad(players, {
        budget: 1000,
        profile,
        lockedIds,
      }),
    [lockedIds, players, profile],
  );

  const activeSquadIds = useMemo(() => {
    return customSquadIds.length === 15 ? customSquadIds : baseEntrySquadIds;
  }, [baseEntrySquadIds, customSquadIds]);

  const activeSquadPlayers = useMemo(
    () => activeSquadIds.map((id) => playerMap.get(id)).filter((p): p is EnrichedPlayer => Boolean(p)),
    [activeSquadIds, playerMap],
  );

  const result = useMemo(
    () =>
      activeSquadPlayers.length === 15
        ? evaluateSquad(activeSquadPlayers, profile)
        : autoResult,
    [activeSquadPlayers, autoResult, profile],
  );

  const bankTenths = useMemo(() => {
    const currentSet = new Set(activeSquadIds);
    const baseSet = new Set(baseEntrySquadIds);
    const sellById = new Map((entry?.picks ?? []).map(p => [p.element, p.sellingPrice]));
    const sales = baseEntrySquadIds.filter(id => !currentSet.has(id)).reduce((sum, id) => sum + Math.round((sellById.get(id) ?? playerMap.get(id)?.price ?? 0) * 10), 0);
    const purchases = activeSquadPlayers.filter(p => !baseSet.has(p.id)).reduce((sum, p) => sum + p.cost, 0);
    return (entry?.history.bank ?? 0) + sales - purchases;
  }, [activeSquadIds, activeSquadPlayers, baseEntrySquadIds, entry, playerMap]);

  const plannedMoves = activeSquadIds.filter(id => !baseEntrySquadIds.includes(id)).length;
  useEffect(() => {
    setReviewSim(null);
    setSimulationError(null);
    setSimulationPending(false);
    if (subTab === 'planner') return;
    if (players.length < 15 || activeSquadIds.length !== 15) {
      setSimulationError('Load a complete 15-player squad to simulate.');
      return;
    }
    if (bankTenths < 0) {
      setSimulationError('Squad exceeds the available budget. Undo a transfer or reset the squad.');
      return;
    }
    setSimulationPending(true);
    const input: PlannerSimulationInput = {
      players, currentSquadIds: activeSquadIds, bankTenths,
      freeTransfersNow: Math.max(0, freeTransfers - plannedMoves),
      initialHitCost: Math.max(0, plannedMoves - freeTransfers) * 4,
      initialFreeTransfersBeforeScenario: freeTransfers,
      nextGw: snapshot.meta.nextEventId, horizon: plannerHorizon, decay: 1 - plannerDecay / 100,
      repoFixtures: toRepoFixtures(snapshot.fixtures), repoTeams: toRepoTeams(snapshot.teams),
      repoElements: snapshot.players.map(toRepoElement), draws: simulationDraws,
      lockedIds: lockedIds.filter(id => activeSquadIds.includes(id)),
      chipsUsed: entry ? entry.chipsUsed : [], chipHistoryKnown: entry ? entry.chipsUsed !== undefined : true,
      startedEvent: entry?.startedEvent,
      sellingPrices: Object.fromEntries(activeSquadIds.map(id => {
        const pick = entry?.picks.find(p => p.element === id);
        return [id, Math.round((pick?.sellingPrice ?? playerMap.get(id)?.price ?? 0) * 10)];
      })),
      dataNotice: entry ? (entry.provenance?.kind === 'official' && !snapshot.meta.stale ? 'Team and snapshot loaded from the connected FPL data sources; projections remain model estimates.' : 'Archived or cached team/data: verify the current squad and chips before acting.') : 'Template squad scenario; load your FPL Team ID for personal chip availability.',
    };
    let worker: Worker | null = null;
    let cancelled = false;
    try {
      worker = new Worker(new URL('../workers/planner.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<{ result?: PlannerSimulationOutput; error?: string }>) => {
        if (cancelled) return;
        setSimulationPending(false);
        if (event.data.result) setReviewSim(event.data.result);
        else setSimulationError(event.data.error ?? 'Simulation failed. Refresh and try again.');
        worker?.terminate();
      };
      worker.onerror = () => {
        if (cancelled) return;
        setSimulationPending(false);
        setSimulationError('Simulation could not finish. Reload the page and try again.');
        worker?.terminate();
      };
      worker.postMessage(input);
    } catch {
      setSimulationPending(false);
      setSimulationError('This browser could not start the simulation. Reload the page in a browser with Web Worker support.');
    }
    return () => { cancelled = true; worker?.terminate(); };
  }, [subTab, activeSquadIds, bankTenths, freeTransfers, plannedMoves, players, snapshot, plannerHorizon, plannerDecay, simulationDraws, lockedIds, entry, playerMap]);

  const transfersUsedCount = activeSquadIds.filter((id) => !baseEntrySquadIds.includes(id)).length;
  const hitPoints = Math.max(0, transfersUsedCount - freeTransfers) * 4;

  const activeChipSim = reviewSim?.chipSimulations.find((c) => c.chip === selectedChipPreview) ?? null;
  return (
    <div className="page page--optimizer">
      <div className="planner-section-picker" role="group" aria-label="Planner sections">
        {([
          { id: 'planner', label: '1. Team Planner & Solver', icon: Layers },
          { id: 'chips', label: '2. Chip Strategy & EV Matrix', icon: BarChart3 },
          { id: 'montecarlo', label: `3. Monte Carlo (${simulationDraws.toLocaleString()} Draws)`, icon: Dices },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={classNames('subtab-btn', `planner-choice--${id}`, subTab === id && 'is-active')}
            aria-expanded={subTab === id} aria-controls={subTab === id ? "planner-section-content" : undefined}
            onClick={() => {
              setSubTab(id);
              if (id === 'planner') {
                setTransferPlansOpen(true);
              }
            }}>
            <Icon size={16} aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
        {onLoadTeam && <form className="planner-team-link" aria-label="Load official FPL team for planning"
          aria-busy={entryLoading} noValidate onSubmit={(event) => {
            event.preventDefault();
            if (/^[1-9]\d{0,11}$/.test(draftTeamId.trim())) onLoadTeam(draftTeamId.trim());
          }}>
          <label htmlFor="planner-fpl-team-id">{entry ? `TEAM #${entry.id}` : 'LOAD YOUR FPL TEAM'}</label>
          <div className="planner-team-link__controls">
            <TeamIdInput id="planner-fpl-team-id" value={draftTeamId} onChange={setDraftTeamId}
              onSelectRecent={onLoadTeam} recentTeams={recentTeams}
              ariaLabel="FPL Team ID" maskWhenBlurred />
            <button type="submit" disabled={entryLoading || !/^[1-9]\d{0,11}$/.test(draftTeamId.trim())}>
              {entryLoading ? 'Loading…' : 'Load team'}
            </button>
          </div>
          {entryError && <span className="planner-team-link__error" role="alert">{entryError}</span>}
        </form>}
      </div>
      {subTab && <div id="planner-section-content" className="planner-section-content">
      {subTab !== 'planner' && <section className="panel planner-compact-controls" aria-label="Planning settings">
        <div className="planner-control-row">
          <label>Strategy<select aria-label="Strategy" value={strategyLabel} onChange={e => setStrategyLabel(e.target.value)}>
            <option value="steady">Steady</option><option value="top10k">Top 10K</option><option value="template">Template</option>
          </select></label>
          <label>Simulation draws<select aria-label="Simulation draws" value={simulationDraws} onChange={e => setSimulationDraws(Number(e.target.value))}>
            <option value={3000}>3,000 draws</option><option value={10000}>10,000 draws</option>
          </select></label>
          <label>Free transfers<select aria-label="Free transfers available" value={freeTransfers} onChange={e => setFreeTransfers(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5].map(ft => <option key={ft} value={ft}>{ft} FT</option>)}
          </select></label>
          <label>Planning horizon<select aria-label="Planning horizon" value={plannerHorizon} onChange={e => setPlannerHorizon(Number(e.target.value))}>
            {[3, 5, 10].map(gw => <option key={gw} value={gw}>{gw} GW</option>)}
          </select></label>
          <label>Decay / GW<select aria-label="Decay per gameweek" value={plannerDecay} onChange={e => setPlannerDecay(Number(e.target.value))}>
            {[0, 5, 10, 15, 20, 30].map(value => <option key={value} value={value}>{value}%</option>)}
          </select></label>
        </div>
        <p className="planner-strategy-note">Strategy names are labels only for now; they do not change calculations. Current app profile: {profile}.</p>
      </section>}

      {subTab !== 'planner' && (simulationPending || simulationError) && <section className="panel" role={simulationError ? 'alert' : 'status'} aria-live="polite" aria-busy={simulationPending}>
        <div className="panel__header"><div><span className="panel__eyebrow">{simulationPending ? 'RUNNING SIMULATION' : 'SIMULATION UNAVAILABLE'}</span><h3>{simulationPending ? 'Comparing legal transfer and chip paths…' : simulationError}</h3></div></div>
      </section>}

      {subTab !== 'planner' && <section className="stat-grid stat-grid--optimizer">
        <StatCard
          label={`GW${snapshot.meta.nextEventId} XI Projection`}
          value={`${(result.projectedPoints - hitPoints).toFixed(1)} pts`}
          detail={`${result.formation} · ${hitPoints > 0 ? `−${hitPoints} hit applied` : `${freeTransfers} FT available`}`}
          icon={<WandSparkles size={18} />}
          tone="mint"
        />
        <StatCard
          label="Squad Cost / Bank"
          value={formatPrice(result.cost)}
          detail={`Bank: ${bankTenths >= 0 ? formatPrice(bankTenths / 10) : `−${formatPrice(Math.abs(bankTenths) / 10)}`}`}
          icon={<CircleDollarSign size={18} />}
          tone={bankTenths >= 0 ? 'violet' : 'pink'}
        />
        <StatCard
          label="Solver Recommendation"
          value={reviewSim ? reviewSim.recommendedDecision : '—'}
          detail={reviewSim ? reviewSim.winner.label : simulationError ? 'Check squad and budget' : 'Calculating transfer paths'}
          icon={<Crown size={18} />}
          tone="amber"
        />
        <StatCard
          label="Chip Strategy Posture"
          value={
            reviewSim?.recommendedChipDecision.bestFutureChip
              ? `${reviewSim.recommendedChipDecision.action} · ${CHIP_META[reviewSim.recommendedChipDecision.bestFutureChip]?.badge ?? ''} GW${reviewSim.recommendedChipDecision.bestFutureGw}`
              : reviewSim ? 'HOLD CHIPS' : '—'
          }
          detail={
            reviewSim
              ? `Peak swing +${reviewSim.recommendedChipDecision.bestFutureGain.toFixed(1)} xPts · ${formationRisk(result)}`
              : 'Evaluating half-season'
          }
          icon={<ShieldCheck size={18} />}
          tone="blue"
        />
      </section>}

      {/* ==================== TAB 1: TEAM PLANNER & TRANSFER SOLVER ==================== */}
      {subTab === 'planner' && !entry && <p className="planner-data-notice">Template squad scenario — load your FPL Team ID on Home for a personal starting squad. Verify bank and free transfers before acting.</p>}
      {subTab === 'planner' && (
        <PlannerOverview snapshot={snapshot} squad={activeSquadPlayers} onInspectPlayer={onInspectPlayer} />
      )}

      {/* ==================== TAB 2: FPLREVIEW-STYLE CHIP STRATEGY & HORIZON EV MATRIX ==================== */}
      {subTab === 'chips' && reviewSim && (
        <div className="chips-strategy-stack">
          <section className="panel" aria-label="Joint chip schedule">
            <div className="panel__header"><div><span className="panel__eyebrow">TRANSFER + CHIP PLAN</span><h3>{reviewSim.strategy.schedule.length ? reviewSim.strategy.schedule.map(use => `${({ wc: 'WC', fh: 'FH', bb: 'BB', tc: 'TC' })[use.chip]} GW${use.gw}`).join(' · ') : 'Keep chips available and re-evaluate before the deadline'}</h3></div><span className="badge badge--mint">{reviewSim.strategy.expectedPoints.toFixed(1)} model xPts</span></div>
            <p>GW{reviewSim.strategy.horizon[0]}–GW{reviewSim.strategy.horizon.at(-1)} · {reviewSim.strategy.gain >= 0 ? '+' : ''}{reviewSim.strategy.gain.toFixed(1)} undiscounted xPts versus the no-chip transfer path. Weeks below show legal budgets, hits and Free Hit restoration. This is an approximate plan; rank gains are not guaranteed.</p>
          </section>
          <section className="chip-cards-grid" aria-label="Half-season chip valuations">
            {reviewSim.chipSimulations.map((chip) => {
              const meta = CHIP_META[chip.chip] ?? { label: chip.chip, badge: 'CHIP', tone: 'violet' };
              const isSelected = selectedChipPreview === chip.chip;
              return (
                <article
                  key={chip.chip}
                  className={classNames('panel chip-sim-card', isSelected && 'chip-sim-card--active')}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`Preview ${meta.label}`}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedChipPreview(chip.chip as 'wildcard' | 'freehit' | 'bboost' | '3xc'); } }}
                  onClick={() => setSelectedChipPreview(chip.chip as 'wildcard' | 'freehit' | 'bboost' | '3xc')}
                >
                  <div className="chip-sim-card__head">
                    <span className={`badge badge--${meta.tone}`}>{meta.badge} · {meta.label}</span>
                    <small>{chip.available ? `Expires GW${chip.expiresGw}` : chip.usedGw ? `Used GW${chip.usedGw}` : 'Availability unverified'}</small>
                  </div>
                  <div className="chip-sim-card__kpis">
                    <div>
                      <span>Peak Window</span>
                      <strong>{chip.bestGw ? `GW${chip.bestGw}` : '—'}</strong>
                    </div>
                    <div>
                      <span>Peak Net EV</span>
                      <strong className="is-positive">+{chip.bestGain.toFixed(2)} xPts</strong>
                    </div>
                    <div>
                      <span>GW{reviewSim.nextGw} Gain</span>
                      <strong>+{chip.gainNow.toFixed(2)}</strong>
                    </div>
                  </div>
                  <p className="chip-sim-card__verdict">{chip.verdictLine}</p>
                </article>
              );
            })}
          </section>

          {/* FPLReview-style GW × Chip Expected Value Matrix */}
          <section className="panel" aria-label="Gameweek by chip EV matrix">
            <div className="panel__header">
              <div>
                <span className="panel__eyebrow">CHIP HORIZON EV MATRIX</span>
                <h3>Diagnostic chip gains · WC uses a 3-GW hold-squad reference · GW{reviewSim.chipHalfGws[0]}–GW{reviewSim.chipHalfGws.at(-1)}</h3>
              </div>
              <span className="badge badge--mint">2026/27 Half-Season Chip Rules</span>
            </div>

            <div className="table-wrap">
              <table className="chip-matrix-table">
                <thead>
                  <tr>
                    <th>Gameweek</th>
                    <th>Base XI xPts</th>
                    <th>Wildcard (3-GW ΔxPts)</th>
                    <th>Free Hit (1-GW ΔxPts)</th>
                    <th>Bench Boost (ΔxPts)</th>
                    <th>Triple Captain (ΔxPts)</th>
                    <th>Optimal Captain</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewSim.chipMatrixByGw.map((row) => {
                    const wcBest = reviewSim.chipSimulations.find((c) => c.chip === 'wildcard')?.bestGw === row.gw;
                    const fhBest = reviewSim.chipSimulations.find((c) => c.chip === 'freehit')?.bestGw === row.gw;
                    const bbBest = reviewSim.chipSimulations.find((c) => c.chip === 'bboost')?.bestGw === row.gw;
                    const tcSim = reviewSim.chipSimulations.find((c) => c.chip === '3xc');
                    const tcBest = tcSim?.bestGw === row.gw;
                    const capId = tcSim?.topGws.find((g) => g.gw === row.gw)?.captainId ?? result.captain.id;
                    const capPlayer = playerMap.get(capId);
                    return (
                      <tr key={row.gw}>
                        <td><strong>GW{row.gw}</strong></td>
                        <td className="mono-num">{row.baseXPts.toFixed(2)}</td>
                        <td className={classNames('chip-ev-cell', wcBest && 'is-peak')}>
                          {row.wildcardGain >= 0 ? '+' : ''}{row.wildcardGain.toFixed(2)} {wcBest && <em>★ Peak</em>}
                        </td>
                        <td className={classNames('chip-ev-cell', fhBest && 'is-peak')}>
                          {row.freehitGain >= 0 ? '+' : ''}{row.freehitGain.toFixed(2)} {fhBest && <em>★ Peak</em>}
                        </td>
                        <td className={classNames('chip-ev-cell', bbBest && 'is-peak')}>
                          {row.bboostGain >= 0 ? '+' : ''}{row.bboostGain.toFixed(2)} {bbBest && <em>★ Peak</em>}
                        </td>
                        <td className={classNames('chip-ev-cell', tcBest && 'is-peak')}>
                          {row.tripleCapGain >= 0 ? '+' : ''}{row.tripleCapGain.toFixed(2)} {tcBest && <em>★ Peak</em>}
                        </td>
                        <td>
                          {capPlayer ? (
                            <span className="inline-player-tag">
                              <ClubBadge teamCode={capPlayer.team.code} shortName={capPlayer.team.shortName} size="sm" />
                              {capPlayer.name}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Optimal Chip Squad Preview + Multi-GW Rollout */}
          <div className="method-grid">
            {activeChipSim?.bestPitch && (
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="panel__eyebrow">OPTIMAL CHIP LINEUP PREVIEW</span>
                    <h3>
                      {CHIP_META[activeChipSim.chip]?.label} Peak Squad · GW{activeChipSim.bestPitch.gw} (+{activeChipSim.bestPitch.gain.toFixed(2)} xPts)
                    </h3>
                  </div>
                  <span className="badge badge--mint">{activeChipSim.bestPitch.xPtsWithChip.toFixed(1)} xPts</span>
                </div>
                <div className="squad-mini-grid">
                  {activeChipSim.bestPitch.starters.map((id) => {
                    const p = playerMap.get(id);
                    if (!p) return null;
                    const isCap = id === activeChipSim.bestPitch?.captainId;
                    return (
                      <div
                        key={id}
                        role="button"
                        tabIndex={0}
                        data-player-card-trigger="1"
                        className="squad-mini-card vx-clickable-row"
                        onClick={() => onInspectPlayer?.(p)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onInspectPlayer?.(p);
                          }
                        }}
                      >
                        {isCap && <span className="squad-mini-card__cap is-cap">{activeChipSim.chip === '3xc' ? '3×' : 'C'}</span>}
                        <PlayerAvatar
                          code={p.code}
                          teamCode={p.team.code}
                          name={p.name}
                          fullName={p.fullName}
                          teamShort={p.team.shortName}
                          position={p.position}
                          size="sm"
                        />
                        <strong>{p.name}</strong>
                        <small>{p.team.shortName} · {formatPrice(p.price)}</small>
                        <span className="squad-mini-card__xp">
                          {((reviewSim.forecastByGw[activeChipSim.bestPitch!.gw]?.[p.id] ?? 0) * (isCap ? (activeChipSim.chip === '3xc' ? 3 : 2) : 1)).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="panel">
              <div className="panel__header">
                <div>
                  <span className="panel__eyebrow">{reviewSim.strategy.horizon.length}-GAMEWEEK CHIP PLAN</span>
                  <h3>Projected XI & FT trajectory</h3>
                </div>
                <RefreshCw size={16} />
              </div>
              <div className="rollout-list">
                {reviewSim.strategy.weeks.map((step) => {
                  const cap = playerMap.get(step.lineup.captainId);
                  return (
                    <div key={step.gw} className="rollout-row">
                      <span className="badge badge--violet">GW{step.gw}</span>
                      <div>
                        <strong>{step.lineup.formation} · Captain {cap?.name ?? '—'}</strong>
                        <small>{step.ftBefore} → {step.ftAfter} FT · {step.chip ? ({ wc: 'WC', fh: 'FH', bb: 'BB', tc: 'TC' })[step.chip] : step.moves.length ? step.moves.map(move => `${playerMap.get(move.outId)?.name} → ${playerMap.get(move.inId)?.name}`).join(', ') : 'Roll'} · Bank {formatPrice(step.bankAfter / 10)} · Hit −{step.hitCost}</small>
                      </div>
                      <strong className="score-pill is-elite">{step.netXPts.toFixed(2)} xPts</strong>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ==================== TAB 3: PAIRED 3,000-DRAW MONTE CARLO SIMULATION ==================== */}
      {subTab === 'montecarlo' && reviewSim && (
        <div className="chips-strategy-stack">
          <section className="panel" aria-label="Monte Carlo strategy distribution">
            <div className="panel__header">
              <div>
                <span className="panel__eyebrow">
                  MONTE CARLO SIMULATION · {reviewSim.monteCarlo.draws.toLocaleString()} PAIRED DRAWS
                </span>
                <h3>GW{reviewSim.monteCarlo.gws[0]}–GW{reviewSim.monteCarlo.gws.at(-1)} Strategy Outcome Distributions</h3>
              </div>
              <span className="badge badge--mint">Auto-sub + VC + chip & hit replay</span>
            </div>

            <div className="mc-paths-list">
              {reviewSim.monteCarlo.paths.map((path) => {
                const maxP90 = Math.max(...reviewSim.monteCarlo.paths.map((p) => p.p90), 1);
                const minP10 = Math.min(...reviewSim.monteCarlo.paths.map((p) => p.p10), 0);
                const span = Math.max(20, maxP90 - minP10 + 20);
                const leftPct = Math.max(0, ((path.p10 - (minP10 - 10)) / span) * 100);
                const widthPct = Math.min(100 - leftPct, ((path.p90 - path.p10) / span) * 100);
                const meanPct = Math.min(99, Math.max(1, ((path.mean - (minP10 - 10)) / span) * 100));

                return (
                  <div key={path.id} className="mc-range-row">
                    <div className="mc-range-row__head">
                      <div>
                        <strong>{path.label}</strong>
                        <small>
                          Floor P10: {path.p10.toFixed(1)} · Median P50: {path.median.toFixed(1)} · Ceiling P90: {path.p90.toFixed(1)} · σ {path.sd.toFixed(1)}
                        </small>
                      </div>
                      <div className="mc-range-row__badges">
                        {path.id === reviewSim.monteCarlo.recommendedPathId && <span className="badge badge--mint">Recommended plan</span>}
                        {path.probBeatsHold !== null && (
                          <span className={classNames('badge', path.probBeatsHold >= 0.5 ? 'badge--mint' : 'badge--violet')}>
                            {(path.probBeatsHold * 100).toFixed(1)}% Beat unchanged squad
                          </span>
                        )}
                        <strong className="score-pill is-elite">Mean {path.mean.toFixed(1)} pts</strong>
                      </div>
                    </div>
                    <small>{path.deltaMean === null ? 'Unchanged-squad baseline' : `Net gain ${path.deltaMean >= 0 ? '+' : ''}${path.deltaMean.toFixed(1)} pts · paired 80% gain range ${path.deltaP10?.toFixed(1)} to ${path.deltaP90?.toFixed(1)} · ties ${((path.probDrawsHold ?? 0) * 100).toFixed(1)}%`}</small>
                    {path.vsReference && <small>
                      Versus best transfer plan (chips saved): {path.vsReference.deltaMean >= 0 ? '+' : ''}{path.vsReference.deltaMean.toFixed(1)} pts · {(path.vsReference.probWin * 100).toFixed(1)}% beat · {(path.vsReference.probTie * 100).toFixed(1)}% tie · {(path.vsReference.probLoss * 100).toFixed(1)}% lose · 80% gain range {path.vsReference.deltaP10.toFixed(1)} to {path.vsReference.deltaP90.toFixed(1)} pts.
                      {' '}Win share sampling interval (95%): {(path.vsReference.winProbability95[0] * 100).toFixed(1)}–{(path.vsReference.winProbability95[1] * 100).toFixed(1)}%; model uncertainty is additional.
                    </small>}
                    <div className="mc-range-track" aria-hidden="true">
                      <div className="mc-range-band" style={{ left: `${leftPct}%`, width: `${widthPct}%` }} />
                      <span className="mc-range-mean" style={{ left: `${meanPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="method-grid">
            <section className="panel">
              <div className="panel__header">
                <div>
                  <span className="panel__eyebrow">GW{reviewSim.nextGw} CAPTAINCY VARIANCE</span>
                  <h3>Captain score risk · means and ceiling shown at 2×</h3>
                </div>
                <Crown size={17} />
              </div>
              <div className="table-wrap">
                <table className="chip-matrix-table">
                  <thead>
                    <tr>
                      <th>Captain</th>
                      <th>Mean (2×)</th>
                      <th>P90 Ceiling (2×)</th>
                      <th>P(Player ≥ 9 pts)</th>
                      <th>P(Player ≤ 2 pts)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewSim.monteCarlo.captains.map((cap) => {
                      const p = playerMap.get(cap.id);
                      return (
                        <tr key={cap.id}>
                          <td>
                            <div className="player-cell player-cell--avatar">
                              {p && (
                                <PlayerAvatar
                                  code={p.code}
                                  teamCode={p.team.code}
                                  name={p.name}
                                  fullName={p.fullName}
                                  teamShort={p.team.shortName}
                                  position={p.position}
                                  size="sm"
                                />
                              )}
                              <div>
                                <strong>{p?.name ?? `#${cap.id}`}</strong>
                                <small>{p?.team.shortName ?? ''} {cap.isPick ? '· Active [C]' : ''}</small>
                              </div>
                            </div>
                          </td>
                          <td><strong>{(cap.mean * 2).toFixed(2)}</strong></td>
                          <td className="mono-num">{(cap.p90 * 2).toFixed(1)}</td>
                          <td className="is-positive mono-num">{(cap.pHaul * 100).toFixed(1)}%</td>
                          <td className="is-negative mono-num">{(cap.pBlank * 100).toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel__header">
                <div>
                  <span className="panel__eyebrow">SIMULATION ASSUMPTIONS</span>
                  <h3>Stochastic engine mechanics</h3>
                </div>
                <Dices size={17} />
              </div>
              <ul className="reason-list">
                {reviewSim.monteCarlo.assumptions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
      </div>}
      <TransferPlanModal
        open={transferPlansOpen}
        onClose={() => setTransferPlansOpen(false)}
        snapshot={snapshot}
        players={players}
        fallbackSquadIds={activeSquadIds}
        entry={entry}
        defaultFreeTransfers={freeTransfers}
        onToast={onToast}
        onInspectPlayer={onInspectPlayer}
        onInspectInjury={onInspectInjury}
      />
    </div>
  );
}

