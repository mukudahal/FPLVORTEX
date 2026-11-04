import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CircleDollarSign,
  Crown,
  Dices,
  Layers,
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
import { buildExactMilpRequest, type ExactMilpResponse } from '../lib/exactMilpBridge';
import { isEligibleNewTransferTarget } from '../lib/transferEligibility';
import { compareMilpPaths, createReviewedMilpPlan, type ComparedMilpPath, type ExactMilpRequest } from '../lib/milpPathComparison';
import { MC_DRAWS } from '../lib/repoModel/monteCarlo';
import {
  buildVortexPlannerCache,
  buildPlanCtxFromCache,
  createNewTransferPlan,
  sanitizeStoredPlan,
  readStoredTransferPlans,
  readSelectedTransferPlanId,
  writeSelectedTransferPlanId,
  writeStoredTransferPlans,
  upsertTransferPlan,
  type StoredTransferPlan,
} from '../lib/transferPlansStore';
import { TeamIdInput } from './TeamIdInput';
import type { RecentTeamEntry } from '../lib/recentTeamIds';
import { PlayerAvatar } from './PlayerAvatar';
import { StatCard } from './StatCard';
import { replay, sanitize } from '../lib/repoModel/planEngine';
import { createStrategyPlan } from '../lib/strategyPlan';
import { ChipStrategyWorkspace } from './ChipStrategyWorkspace';
import type { SeasonChipUse } from '../lib/repoModel/seasonRules';
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
  useEffect(() => setDraftTeamId(teamId), [teamId]);
  const [transferPlansOpen, setTransferPlansOpen] = useState(false);
  const [chipMode, setChipMode] = useState<'auto' | 'manual'>('auto');
  const [requestedChips, setRequestedChips] = useState<SeasonChipUse[]>([]);
  const [solverSaveError, setSolverSaveError] = useState<string | null>(null);
  const [scenarioFreeTransfers, setScenarioFreeTransfers] = useState<number | null>(null);
  const [chipRequest, setChipRequest] = useState<{ input: PlannerSimulationInput } | null>(null);
  const plannerCancelRef = useRef<(() => void) | null>(null);
  const [plannerHorizon, setPlannerHorizon] = useState(10);
  const [plannerDecay, setPlannerDecay] = useState(15);
  const [simulationDraws, setSimulationDraws] = useState<number>(MC_DRAWS);
  const [simulationOutput, setReviewSim] = useState<PlannerSimulationOutput | null>(null);
  const [resultInput, setResultInput] = useState<PlannerSimulationInput | null>(null);
  const [simulationPending, setSimulationPending] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [exactResult, setExactResult] = useState<ExactMilpResponse | null>(null);
  const [exactComparison, setExactComparison] = useState<{
    request: ExactMilpRequest;
    paths: ComparedMilpPath[];
    sourceSnapshot: Snapshot;
    sourcePlanner: PlannerSimulationOutput;
  } | null>(null);
  const [selectedExactRank, setSelectedExactRank] = useState(1);
  const [reviewExactRank, setReviewExactRank] = useState<number | null>(null);
  const [exactError, setExactError] = useState<string | null>(null);
  const [exactPending, setExactPending] = useState(false);
  const exactAbortRef = useRef<AbortController | null>(null);
  const [freeTransfers, setFreeTransfers] = useState<number>(entry?.freeTransfers ?? 2);
  const [scenarioLockedIds, setScenarioLockedIds] = useState<number[] | null>(null);
  const [adHocLockedIds, setAdHocLockedIds] = useState<number[]>([]);
  const [savedPlans, setSavedPlans] = useState<StoredTransferPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('__live__');
  const storageScopeId = entry?.id ?? null;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = readStoredTransferPlans(window.localStorage, storageScopeId);
    const selection = readSelectedTransferPlanId(window.localStorage, storageScopeId);
    setSavedPlans(stored);
    setSelectedPlanId(selection === '__live__' ? '__live__' :
      stored.find(plan => plan.id === selection)?.id ?? stored[0]?.id ?? '__live__');
  }, [storageScopeId]);
  const selectedPlan = savedPlans.find(plan => plan.id === selectedPlanId) ?? null;
  const selectedPlanIsCurrent = !selectedPlan || selectedPlan.startGw === snapshot.meta.nextEventId;
  const lockedIds = selectedPlan ? scenarioLockedIds ?? selectedPlan.lockedPlayerIds ?? [] : adHocLockedIds;
  const selectPlan = (id: string) => {
    setSelectedPlanId(id);
    setScenarioFreeTransfers(null);
    setScenarioLockedIds(null);
    if (typeof window !== 'undefined') writeSelectedTransferPlanId(window.localStorage, storageScopeId, id);
  };
  const handlePlansChanged = (plans: StoredTransferPlan[], preferredId: string | null) => {
    setSavedPlans(plans);
    selectPlan(preferredId && plans.some(plan => plan.id === preferredId) ? preferredId : plans[0]?.id ?? '__live__');
  };
  const changeFreeTransfers = (next: number) => {
    if (selectedPlan) setScenarioFreeTransfers(next);
    else setFreeTransfers(next);
  };
  const effectiveFreeTransfers = scenarioFreeTransfers ?? selectedPlan?.baseFreeTransfers ?? freeTransfers;
  const togglePlayerLock = (playerId: number) => {
    const next = lockedIds.includes(playerId) ? lockedIds.filter(id => id !== playerId) : [...lockedIds, playerId];
    if (!selectedPlan) { setAdHocLockedIds(next); return; }
    setScenarioLockedIds(next);
  };
  const [customSquadIds, setCustomSquadIds] = useState<number[]>([]);
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
    return selectedPlan ? selectedPlan.baseSquad : customSquadIds.length === 15 ? customSquadIds : baseEntrySquadIds;
  }, [baseEntrySquadIds, customSquadIds, selectedPlan]);

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
    if (selectedPlan) return selectedPlan.baseBankTenths;
    const currentSet = new Set(activeSquadIds);
    const baseSet = new Set(baseEntrySquadIds);
    const sellById = new Map((entry?.picks ?? []).map(p => [p.element, p.sellingPrice]));
    const sales = baseEntrySquadIds.filter(id => !currentSet.has(id)).reduce((sum, id) => sum + Math.round((sellById.get(id) ?? playerMap.get(id)?.price ?? 0) * 10), 0);
    const purchases = activeSquadPlayers.filter(p => !baseSet.has(p.id)).reduce((sum, p) => sum + p.cost, 0);
    return (entry?.history.bank ?? 0) + sales - purchases;
  }, [activeSquadIds, activeSquadPlayers, baseEntrySquadIds, entry, playerMap, selectedPlan]);

  const plannedMoves = selectedPlan ? 0 : activeSquadIds.filter(id => !baseEntrySquadIds.includes(id)).length;
  const simulationInput = useMemo<PlannerSimulationInput>(() => ({
      players, currentSquadIds: activeSquadIds, bankTenths,
      horizonOnly: subTab === 'chips',
      chipPolicy: subTab === 'chips' ? chipMode : 'auto',
      requestedChips: subTab === 'chips' && chipMode === 'manual' ? requestedChips : [],
      freeTransfersNow: selectedPlan ? effectiveFreeTransfers : Math.max(0, freeTransfers - plannedMoves),
      initialHitCost: selectedPlan ? 0 : Math.max(0, plannedMoves - freeTransfers) * 4,
      initialFreeTransfersBeforeScenario: effectiveFreeTransfers,
      nextGw: snapshot.meta.nextEventId, horizon: plannerHorizon, decay: 1 - plannerDecay / 100,
      repoFixtures: toRepoFixtures(snapshot.fixtures), repoTeams: toRepoTeams(snapshot.teams),
      repoElements: snapshot.players.map(toRepoElement), draws: simulationDraws,
      importedProjectionFileDate: (snapshot.meta.repoData?.benchmarkPlayers ?? 0) > 0
        ? snapshot.meta.repoData?.projectionFileDate ?? null : undefined,
      lockedIds: lockedIds.filter(id => activeSquadIds.includes(id)),
      manualPlan: selectedPlan ?? undefined,
      chipsUsed: entry ? entry.chipsUsed : [], chipHistoryKnown: entry ? entry.chipsUsed !== undefined : true,
      startedEvent: entry?.startedEvent,
      sellingPrices: selectedPlan?.sellingPrices ?? Object.fromEntries(activeSquadIds.map(id => {
        const pick = entry?.picks.find(p => p.element === id);
        return [id, Math.round((pick?.sellingPrice ?? playerMap.get(id)?.price ?? 0) * 10)];
      })),
      dataNotice: entry ? (entry.provenance?.kind === 'official' && !snapshot.meta.stale ? 'Team and snapshot loaded from the connected FPL data sources; projections remain model estimates.' : 'Archived or cached team/data: verify the current squad and chips before acting.') : 'Template squad scenario; load your FPL Team ID for personal chip availability.',
  }), [subTab, players, activeSquadIds, bankTenths, freeTransfers, plannedMoves, snapshot, plannerHorizon, plannerDecay, simulationDraws, lockedIds, entry, playerMap, selectedPlan, chipMode, requestedChips, effectiveFreeTransfers]);
  const reviewSim = resultInput === simulationInput ? simulationOutput : null;
  useEffect(() => {
    setReviewSim(null);
    setResultInput(null);
    setSimulationError(null);
    setSimulationPending(false);
    setSolverSaveError(null);
    if (subTab === 'planner' || (subTab === 'chips' && chipRequest?.input !== simulationInput)) return;
    const input = simulationInput;
    if (!selectedPlanIsCurrent) {
      setSimulationError(`Saved plan starts GW${selectedPlan!.startGw}; current forecasts start GW${snapshot.meta.nextEventId}. Rebase or create a new plan in the Transfer Lab.`);
      return;
    }
    if (players.length < 15 || activeSquadIds.length !== 15) {
      setSimulationError('Load a complete 15-player squad to simulate.');
      return;
    }
    if (bankTenths < 0) {
      setSimulationError('Squad exceeds the available budget. Undo a transfer or reset the squad.');
      return;
    }
    setSimulationPending(true);

    let worker: Worker | null = null;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      worker = new Worker(new URL('../workers/planner.worker.ts', import.meta.url), { type: 'module' });
      plannerCancelRef.current = () => { cancelled = true; clearTimeout(timeout); worker?.terminate(); };
      worker.onmessage = (event: MessageEvent<{ result?: PlannerSimulationOutput; error?: string }>) => {
        if (cancelled) return;
        clearTimeout(timeout);
        setSimulationPending(false);
        setResultInput(input);
        if (event.data.result) setReviewSim(event.data.result);
        else setSimulationError(event.data.error ?? 'Simulation failed. Refresh and try again.');
        worker?.terminate();
      };
      worker.onerror = () => {
        if (cancelled) return;
        clearTimeout(timeout);
        setSimulationPending(false);
        setSimulationError('Simulation could not finish. Reload the page and try again.');
        worker?.terminate();
      };
      timeout = setTimeout(() => {
        cancelled = true;
        worker?.terminate();
        setSimulationPending(false);
        setSimulationError('Solver timed out. Try fewer gameweeks or run again.');
      }, 90_000);
      worker.postMessage(input);
    } catch {
      setSimulationPending(false);
      setSimulationError('This browser could not start the simulation. Reload the page in a browser with Web Worker support.');
    }
    return () => { cancelled = true; clearTimeout(timeout); worker?.terminate(); };
  }, [subTab, simulationInput, chipRequest, selectedPlanIsCurrent, selectedPlan, snapshot.meta.nextEventId, players.length, activeSquadIds.length, bankTenths]);

  // Cancel and discard MILP output when a squad, projection, lock or GW changes.
  // No saved manager plan is ever changed by the exact-transfer comparison.
  useEffect(() => {
    exactAbortRef.current?.abort();
    exactAbortRef.current = null;
    setExactPending(false);
    setExactResult(null);
    setExactComparison(null);
    setSelectedExactRank(1);
    setReviewExactRank(null);
    setExactError(null);
  }, [reviewSim, selectedPlanId, plannerHorizon, plannerDecay, activeSquadIds.join(','), lockedIds.join(','), bankTenths, freeTransfers, plannedMoves, snapshot, players, entry]);

  const runExactTransferComparison = async () => {
    let controller: AbortController | null = null;
    if (!reviewSim) { setExactError('Run the planner forecast first.'); return; }
    if (selectedPlan || plannedMoves > 0) {
      setExactError('Exact no-chip comparison cannot overwrite saved or unsaved manual transfers. Use the chip-aware planner for those commitments.');
      return;
    }
    try {
      const payload = buildExactMilpRequest({
        snapshot, players, planner: reviewSim,
        squadIds: activeSquadIds, bankTenths, freeTransfers, lockedIds,
        decay: 1 - plannerDecay / 100,
        sellingPrices: Object.fromEntries(activeSquadIds.map(id => {
          const entryPick = entry?.picks.find(p => p.element === id);
          return [id, Math.round((entryPick?.sellingPrice ?? playerMap.get(id)?.price ?? 0) * 10)];
        })),
      });
      exactAbortRef.current?.abort();
      controller = new AbortController();
      exactAbortRef.current = controller;
      setExactPending(true);
      setExactError(null);
      setExactResult(null);
      setExactComparison(null);
      setReviewExactRank(null);
      const reply = await fetch('/api/vortex/solver/exact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      const data = await reply.json() as ExactMilpResponse & { error?: string };
      if (!reply.ok) throw new Error(data.error ?? 'The exact transfer service could not complete this comparison.');
      if (!Array.isArray(data.plans) || !Array.isArray(data.solver_attempts))
        throw new Error('The server returned an invalid MILP response.');
      const paths = compareMilpPaths(payload, data, id => {
        const candidate = playerMap.get(id);
        return Boolean(candidate && isEligibleNewTransferTarget(candidate));
      });
      if (!controller.signal.aborted) {
        setExactResult(data);
        setExactComparison({ request: payload, paths, sourceSnapshot: snapshot, sourcePlanner: reviewSim });
        setSelectedExactRank(1);
      }
    } catch (error) {
      if (controller?.signal.aborted) return; // Discard stale errors after inputs changed.
      setExactError(error instanceof Error ? error.message : 'Exact Solver is unavailable.');
    } finally {
      if (controller && exactAbortRef.current === controller && !controller.signal.aborted) setExactPending(false);
    }
  };

  const saveReviewedExactPath = () => {
    if (!exactComparison || reviewExactRank === null || !reviewSim ||
        exactComparison.sourceSnapshot !== snapshot || exactComparison.sourcePlanner !== reviewSim ||
        selectedPlan || plannedMoves > 0 || snapshot.meta.stale || exactPending ||
        freeTransfers !== exactComparison.request.current_team.free_transfers ||
        Math.round(bankTenths) !== Math.round(exactComparison.request.current_team.bank * 10) ||
        !activeSquadIds.every((id, i) => exactComparison.request.current_team.squad_player_ids[i] === id) ||
        !lockedIds.every(id => exactComparison.request.settings.locked_players.includes(id)) ||
        lockedIds.length !== exactComparison.request.settings.locked_players.length) {
      setExactError('The team, source forecast or saved scenario changed. Re-run the MILP before accepting a path.');
      setReviewExactRank(null);
      return;
    }
    const chosen = exactComparison.paths.find(path => path.rank === reviewExactRank);
    if (!chosen || typeof window === 'undefined') {
      setExactError('Select a validated transfer path before saving.');
      return;
    }
    const previous = readStoredTransferPlans(window.localStorage, storageScopeId);
    const nowIso = new Date().toISOString();
    try {
      const proposed = createReviewedMilpPlan({
        request: exactComparison.request, path: chosen,
        id: 'milp-' + crypto.randomUUID(),
        name: `MILP Path ${chosen.rank} (GW${exactComparison.request.settings.start_gw}+)`,
        createdAt: nowIso,
      });
      const upsert = upsertTransferPlan(previous, proposed);
      if (!upsert.ok) {
        setExactError(upsert.error);
        return;
      }
      writeStoredTransferPlans(window.localStorage, storageScopeId, upsert.plans);
      // The existing storage writer deliberately swallows quota/security failures.
      // Never announce a confirmed plan if it failed to persist.
      if (!readStoredTransferPlans(window.localStorage, storageScopeId)
        .some(saved => saved.id === proposed.id)) {
        setExactError('The new plan could not be saved to browser storage. Check storage permissions or the available plan slots.');
        return;
      }
      setSavedPlans(upsert.plans);
      selectPlan(proposed.id);
      setReviewExactRank(null);
      setTransferPlansOpen(true);
      onToast('New reviewed MILP proposal saved to Transfer Lab. No FPL transfers have been made.', 'success');
    } catch (error) {
      setExactError(error instanceof Error ? error.message : 'The solver proposal could not be saved.');
    }
  };

  const saveStrategyAsNew = () => {
    if (!reviewSim || simulationPending || typeof window === 'undefined') return;
    try {
      const base = selectedPlan ?? createNewTransferPlan({ snapshot, players, fallbackSquadIds: activeSquadIds, entry, defaultFreeTransfers: effectiveFreeTransfers });
      const proposal = createStrategyPlan({ ...base, baseBankTenths: bankTenths, baseFreeTransfers: effectiveFreeTransfers, lockedPlayerIds: lockedIds }, reviewSim, crypto.randomUUID(), new Date().toISOString());
      const context = buildPlanCtxFromCache(proposal, players, buildVortexPlannerCache(snapshot, players));
      const checked = sanitize(context, proposal.transfers, proposal.chips);
      const wanted = Object.fromEntries(Object.entries(proposal.transfers).filter(([,moves]) => moves.length));
      if (JSON.stringify(checked) !== JSON.stringify(wanted)) throw new Error('This proposal conflicts with a saved future transfer. Your original plan is unchanged.');
      for (const [gw, captain] of Object.entries(proposal.captains)) {
        const squad = replay(context, proposal.transfers, Number(gw), proposal.chips).squad;
        if ([captain.captain,captain.vice].some(id => id !== undefined && !squad.includes(id))) throw new Error(`GW${gw} has a saved captain outside this proposal's squad. Review your future decisions first.`);
      }
      const stored = readStoredTransferPlans(window.localStorage, storageScopeId);
      const saved = upsertTransferPlan(stored, proposal);
      if (!saved.ok) throw new Error(saved.error);
      writeStoredTransferPlans(window.localStorage, storageScopeId, saved.plans);
      const committed = saved.plans.find(plan => plan.id === proposal.id);
      const readback = readStoredTransferPlans(window.localStorage, storageScopeId).find(plan => plan.id === proposal.id);
      if (!committed || JSON.stringify(readback) !== JSON.stringify(sanitizeStoredPlan(committed))) throw new Error('Could not save on this device. Your proposal is still open.');
      setSavedPlans(previous => saved.plans.map(plan => previous.find(old => old.id === plan.id && old.updatedAt === plan.updatedAt) ?? plan));
      setSolverSaveError(null);
      onToast('Solver proposal saved as a new Plan on this device.', 'success');
    } catch (error) { setSolverSaveError(error instanceof Error ? error.message : 'Could not save the proposal.'); }
  };

  const transfersUsedCount = selectedPlan ? 0 : activeSquadIds.filter((id) => !baseEntrySquadIds.includes(id)).length;
  const hitPoints = selectedPlan ? 0 : Math.max(0, transfersUsedCount - freeTransfers) * 4;

  return (
    <div className={classNames('page page--optimizer', subTab === 'chips' && 'page--chip-strategy')}>
      <div className="planner-section-picker" role="group" aria-label="Planner workspaces">
        <button type="button" className={classNames('subtab-btn', 'planner-choice--planner', subTab === 'planner' && 'is-active')}
          aria-pressed={subTab === 'planner'} onClick={() => setSubTab('planner')}>
          <Layers size={16} aria-hidden="true" /><span>Plan</span>
        </button>
        <button type="button" className={classNames('subtab-btn', 'planner-choice--chips', subTab !== 'planner' && 'is-active')}
          aria-pressed={subTab !== 'planner'} onClick={() => setSubTab('chips')}>
          <WandSparkles size={16} aria-hidden="true" /><span>Solver</span>
        </button>
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
      {subTab !== 'planner' && (
        <div className="planner-solver-modes" role="group" aria-label="Solver views">
          <button type="button" className={subTab === 'chips' ? 'is-active' : ''}
            aria-pressed={subTab === 'chips'} onClick={() => setSubTab('chips')}>
            <BarChart3 size={15} aria-hidden="true" /><span>Recommendations</span>
          </button>
          <button type="button" className={subTab === 'montecarlo' ? 'is-active' : ''}
            aria-pressed={subTab === 'montecarlo'} onClick={() => setSubTab('montecarlo')}>
            <Dices size={15} aria-hidden="true" /><span>Simulation</span>
          </button>
        </div>
      )}
      {subTab === 'montecarlo' && (
      <section className="panel" aria-label="Authoritative planning scenario" data-testid="active-saved-plan">
        <div className="panel__header"><div>
          <span className="panel__eyebrow">SHARED 10-GW PLANNING STATE</span>
          <h3>{selectedPlan ? `Active: ${selectedPlan.name}` : 'Starting squad'}</h3>
        </div><span className="badge badge--violet">{lockedIds.length} player locks</span></div>
        <div className="planner-control-row">
          <label>Planning scenario
            <select aria-label="Active saved planning scenario" value={selectedPlanId} onChange={e => selectPlan(e.target.value)}>
              <option value="__live__">Official / template · no saved plan</option>
              {savedPlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} (GW{plan.startGw}+)</option>)}
            </select>
          </label>
          <button type="button" className="button button--ghost" onClick={() => setSubTab('planner')}>Edit Plan</button>
        </div>
        
        {!selectedPlanIsCurrent && <p role="alert">This saved plan starts in GW{selectedPlan?.startGw}, but the active GW is {snapshot.meta.nextEventId}. Its scenarios are blocked until you rebase or create a current plan.</p>}
        <details className="strategy-locks"><summary>Keep players · {lockedIds.length} locked</summary><div className="planner-control-row" aria-label="Lock players against automatic transfer suggestions">
          {activeSquadPlayers.map(p => <label key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input type="checkbox" checked={lockedIds.includes(p.id)} onChange={() => togglePlayerLock(p.id)} aria-label={`Lock ${p.name} against automatic transfers`} />
            {p.name}
          </label>)}
        </div></details>
      </section>
      )}
      {subTab && <div id="planner-section-content" className="planner-section-content">
      {subTab === 'montecarlo' && <section className="panel planner-compact-controls" aria-label="Planning settings">
        <div className="planner-control-row">
          <label>Simulation draws<select aria-label="Simulation draws" value={simulationDraws} onChange={e => setSimulationDraws(Number(e.target.value))}>
            <option value={3000}>3,000 draws</option><option value={10000}>10,000 draws</option>
          </select></label>
          <label>Free transfers<select aria-label="Free transfers available" value={effectiveFreeTransfers} onChange={e => changeFreeTransfers(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5].map(ft => <option key={ft} value={ft}>{ft} FT</option>)}
          </select></label>
          <label>Planning horizon<select aria-label="Planning horizon" value={plannerHorizon} onChange={e => setPlannerHorizon(Number(e.target.value))}>
            {[3, 5, 10].map(gw => <option key={gw} value={gw}>{gw} GW</option>)}
          </select></label>
          <label>Decay / GW<select aria-label="Decay per gameweek" value={plannerDecay} onChange={e => setPlannerDecay(Number(e.target.value))}>
            {[0, 5, 10, 15, 20, 30].map(value => <option key={value} value={value}>{value}%</option>)}
          </select></label>
        </div>
        
      </section>}

      {subTab === 'montecarlo' && (simulationPending || simulationError) && <section className="panel" role={simulationError ? 'alert' : 'status'} aria-live="polite" aria-busy={simulationPending}>
        <div className="panel__header"><div><span className="panel__eyebrow">{simulationPending ? 'RUNNING SIMULATION' : 'SIMULATION UNAVAILABLE'}</span><h3>{simulationPending ? 'Comparing legal transfer and chip paths…' : simulationError}</h3></div></div>
      </section>}

      {subTab === 'montecarlo' && <section className="stat-grid stat-grid--optimizer">
        <StatCard
          label={`GW${snapshot.meta.nextEventId} XI Projection`}
          value={`${(reviewSim?.strategy.weeks[0]?.netXPts ?? result.projectedPoints - hitPoints).toFixed(1)} pts`}
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

      <div className="manual-plan-host" hidden={subTab !== 'planner'}>
        <TransferPlanModal embedded open onClose={() => {}} snapshot={snapshot} players={players}
          fallbackSquadIds={baseEntrySquadIds} entry={entry} defaultFreeTransfers={freeTransfers}
          onToast={onToast} onInspectPlayer={onInspectPlayer} onInspectInjury={onInspectInjury}
          initialActivePlan={selectedPlan} onPlansChanged={handlePlansChanged}
          plansRevision={savedPlans.map(plan => `${plan.id}:${plan.updatedAt}`).join('|')} />
      </div>

      {subTab === 'chips' && <>
        <ChipStrategyWorkspace snapshot={snapshot} players={players} result={reviewSim}
          pending={simulationPending} error={simulationError} horizon={plannerHorizon}
          mode={chipMode} requestedChips={requestedChips} savedPlan={selectedPlan}
          startingSquad={result} bankTenths={bankTenths}
          scenarioControls={<div className="strategy-scenario"><label>Squad<select aria-label="Active saved planning scenario" value={selectedPlanId} onChange={e => selectPlan(e.target.value)}><option value="__live__">{entry ? `Team #${entry.id}` : 'Template'}</option>{savedPlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label><button type="button" className="button button--ghost" onClick={() => setSubTab('planner')}>Edit Plan</button></div>}
          advancedControls={<><label className="strategy-decay">Weekly decay<select aria-label="Solver weekly decay" value={plannerDecay} onChange={event => setPlannerDecay(Number(event.target.value))}>{[0,5,10,15,20,30].map(value => <option key={value} value={value}>{value}%</option>)}</select></label><div className="strategy-lock-grid">{activeSquadPlayers.map(player => <label key={player.id}><input type="checkbox" checked={lockedIds.includes(player.id)} onChange={() => togglePlayerLock(player.id)} aria-label={`Lock ${player.name} against automatic transfers`} />{player.name}</label>)}</div></>}
          chipHistory={entry?.chipsUsed ?? []} historyKnown={entry ? entry.chipsUsed !== undefined : true} template={!entry}
          onModeChange={setChipMode} onScheduleChange={setRequestedChips}
          onHorizonChange={value => { setPlannerHorizon(value); setRequestedChips([]); }}
          freeTransfers={effectiveFreeTransfers} onFreeTransfersChange={changeFreeTransfers}
          onRun={() => setChipRequest({ input: simulationInput })}
          onCancel={() => { plannerCancelRef.current?.(); setSimulationPending(false); setSimulationError('Stopped. Run again.'); }}
          onInspectPlayer={onInspectPlayer} onSaveAsNew={saveStrategyAsNew} saveError={solverSaveError} />
        {reviewSim && !selectedPlan && plannedMoves === 0 && <details className="panel strategy-details strategy-exact"><summary>Exact comparison</summary>
          <section className="panel" aria-label="Exact no-chip 10-Gameweek transfer solver">
            <div className="panel__header"><div>
              <span className="panel__eyebrow">P0-A06 · SCIPY / HIGHS MILP</span>
              <h3>Exact-formulation transfer comparison — no chips</h3>
            </div><span className="badge badge--violet">Separate read-only result</span></div>
            <p>Runs a bounded 1–10 GW mixed-integer transfer model on a declared candidate shortlist, using the identical GW xPts supplied to the chip-aware VORTEX Planner. The mathematical formulation is exact, but an optimum is certified only if HiGHS proves it. This model does not support chips or future price changes. Original player sales use their verified selling value once; if bought back later, their new cost basis is the current market price.</p>
            <button type="button" onClick={() => { void runExactTransferComparison(); }}
              disabled={exactPending || snapshot.meta.stale || Boolean(selectedPlan) || plannedMoves > 0}
              aria-busy={exactPending}>{exactPending ? 'Solving bounded MILP…' : 'Run exact no-chip transfer comparison'}</button>
            {snapshot.meta.stale && <p role="status">Refresh current FPL data before using the MILP.</p>}
            {selectedPlan && <p role="status">Saved manual plan active: exact no-chip transfer comparison is unavailable because manual and chip commitments must not be overwritten.</p>}
            {plannedMoves > 0 && !selectedPlan && <p role="status">Reset unsaved manual transfers to use this independent starting-squad comparison.</p>}
            {exactError && <p role="alert">{exactError}</p>}
            {exactResult && exactComparison && (exactComparison.paths.length ? <div role="group" aria-label="Verified MILP transfer-path comparison">
              <p><strong>{exactComparison.paths.length} distinct feasible transfer {exactComparison.paths.length === 1 ? 'path' : 'paths'} returned</strong> (up to 3 requested within one 10-second shared solver budget). Alternatives may be unavailable when the limit is reached. Only the submitted candidate shortlist and no-chip assumptions are optimized.</p>
              <p>Choose a path to inspect its full transfer ledger. All forecasts and gains are model estimates, not guaranteed FPL points. Mathematical optimality is certified only when the corresponding HiGHS certificate says so.</p>
              <div className="chip-cards-grid" role="group" aria-label="Alternative transfer paths">
                {exactComparison.paths.map(path => <article key={path.rank} className="panel chip-sim-card">
                  <div className="chip-sim-card__head">
                    <strong>PATH {String.fromCharCode(64 + path.rank)} · Rank {path.rank}</strong>
                    <span className="badge badge--violet">{path.plan.solver.optimality_proven ? 'Certified optimal' : 'Feasible · unproven'}</span>
                  </div>
                  <p><strong>{path.plan.raw_expected_points_after_hits.toFixed(2)} xPts</strong> after hits · {path.plan.evaluation_score.toFixed(2)} discounted objective</p>
                  <p>{path.rank === 1 ? 'Highest found objective' : `${path.deltaObjective.toFixed(2)} discounted points vs Path A`} · {path.deltaRawPoints >= 0 ? '+' : ''}{path.deltaRawPoints.toFixed(2)} undiscounted xPts vs Path A</p>
                  <p>{path.totalTransfers} transfers · −{path.totalHits} hit points · Final £{path.lastBank.toFixed(1)}m bank · {path.lastFreeTransfers} FT</p>
                  <small>HiGHS gap: {path.plan.solver.mip_gap === null ? 'N/A' : (path.plan.solver.mip_gap * 100).toFixed(2) + '%'} · {path.plan.gameweeks.length} GWs · Shared runtime {exactResult.runtime_seconds.toFixed(2)}s</small>
                  <button type="button" aria-pressed={selectedExactRank === path.rank}
                    onClick={() => { setSelectedExactRank(path.rank); setReviewExactRank(null); }}>
                    {selectedExactRank === path.rank ? 'Viewing this path' : `Review Path ${String.fromCharCode(64 + path.rank)}`}
                  </button>
                </article>)}
              </div>
              {exactComparison.paths.filter(path => path.rank === selectedExactRank).map(path => <div key={path.rank}
                role="group" aria-label={`Detailed MILP path ${path.rank} transfer ledger`}>
                <h4>Path {String.fromCharCode(64 + path.rank)} · Full Gameweek decision ledger</h4>
                <div className="rollout-list">
                  {path.plan.gameweeks.map(week => <details key={week.gw} className="rollout-row">
                    <summary>GW{week.gw} · {week.transfers_out.length ? `${week.transfers_out.length} transfer(s)` : 'Roll'} · {week.expected_points_after_hits.toFixed(2)} model xPts after hits</summary>
                    <p>{week.transfers_out.length ? `OUT: ${week.transfers_out.map(id => playerMap.get(id)?.name ?? id).join(', ')} · IN: ${week.transfers_in.map(id => playerMap.get(id)?.name ?? id).join(', ')}` : 'No transfers.'}</p>
                    {path.weekFinances.filter(finance => finance.gw === week.gw).map(finance => (
                      <p key={finance.gw} aria-label={`Verified GW${week.gw} buying and selling values`}>
                        {finance.sales.length ? `SELL: ${finance.sales.map(sale =>
                          `${playerMap.get(sale.playerId)?.name ?? sale.playerId} £${sale.price.toFixed(1)}m${sale.originalBasis ? ' (original sale basis)' : ''}`).join(', ')} · BUY: ${finance.purchases.map(buy =>
                          `${playerMap.get(buy.playerId)?.name ?? buy.playerId} £${buy.price.toFixed(1)}m`).join(', ')}` : 'No player purchases or sales.'}
                      </p>
                    ))}
                    <p>FT {week.free_transfers_before} → {week.free_transfers_after} · Hits −{week.hit_cost} points · Bank £{week.bank.toFixed(1)}m · Captain {playerMap.get(week.captain)?.name ?? week.captain} · Vice {playerMap.get(week.vice_captain)?.name ?? week.vice_captain}</p>
                    <p>XI: {week.starters.map(id => playerMap.get(id)?.name ?? id).join(', ')} · Bench: {week.bench.map(id => playerMap.get(id)?.name ?? id).join(', ')}</p>
                  </details>)}
                </div>
                <p>This path is an unapplied proposal. To keep it, review the full ledger and explicitly create a <strong>new</strong> Transfer Lab plan. Existing saved plans are never replaced.</p>
                {reviewExactRank === path.rank ? <div role="group" aria-label="Confirm new Transfer Lab plan">
                  <p role="status">Confirm saving Path {String.fromCharCode(64 + path.rank)} as a separate plan. This will select the newly created plan in Transfer Lab, but it will <strong>not</strong> submit transfers or play chips in the official FPL game.</p>
                  <button type="button" onClick={saveReviewedExactPath}>Confirm: save as NEW plan</button>
                  <button type="button" onClick={() => setReviewExactRank(null)}>Cancel</button>
                </div> : <button type="button" onClick={() => setReviewExactRank(path.rank)}>Review and prepare NEW Transfer Lab plan</button>}
              </div>)}
            </div> : <p role="status">HiGHS returned no feasible transfer path within the shared time limit. No alternative is fabricated; review the input constraints before retrying.</p>)}
          </section>
        </details>}
      </>}

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

            <details className="panel strategy-details"><summary>Simulation details</summary>
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
            </details>
          </div>
        </div>
      )}
      </div>}
      <TransferPlanModal
        open={transferPlansOpen}
        onClose={() => setTransferPlansOpen(false)}
        initialActivePlan={selectedPlan}
        onPlansChanged={handlePlansChanged}
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


