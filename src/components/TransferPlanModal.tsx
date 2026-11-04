import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Bookmark,
  Check,
  ChevronLeft,
  Copy,
  FlaskConical,
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { BRAND_LION_SRC } from '../lib/baseUrl';
import { difficultyFillStyle } from '../lib/fixtureForecast';
import { classNames } from '../lib/format';
import {
  autoPlan,
  TRANSFER_LAB_HORIZON,
  CHIP_LABEL,
  CHIP_ORDER,
  lineupAt,
  replay,
  sanitize,
  sellOf,
  topMoves,
  validateSubstitution,
  xpAt,
  type AutoStep,
  type Chip,
  type TransferMap,
} from '../lib/repoModel/planEngine';
import {
  buildPlanCtxFromCache,
  buildVortexPlannerCache,
  collapseGwTransfers,
  computeLiveGwMetrics,
  createNewTransferPlan,
  deleteTransferPlan,
  getNextFixturesWithVortexFdr,
  MAX_TRANSFER_PLAN_SLOTS,
  readStoredTransferPlans,
  sanitizeStoredPlan,
  upsertTransferPlan,
  validatePendingReplacement,
  writeStoredTransferPlans,
  type StoredTransferPlan,
} from '../lib/transferPlansStore';
import type { EnrichedPlayer, EntryData, Position, Snapshot } from '../lib/types';
import { ClubBadge } from './ClubBadge';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerLab } from './PlayerLab';
import { PlanDraftDialog } from './PlanDraftDialog';
import { PlannerOverview } from './PlannerOverview';
import { buildFixtureMatrix } from '../lib/fixtures';
import { buildPublicDataHealth } from '../lib/publicDataHealth';

interface TransferPlanModalProps {
  embedded?: boolean;
  open: boolean;
  onClose: () => void;
  snapshot: Snapshot;
  players: EnrichedPlayer[];
  fallbackSquadIds: number[];
  entry?: EntryData | null;
  defaultFreeTransfers?: number;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onInspectPlayer?: (player: EnrichedPlayer) => void;
  onInspectInjury?: (player: EnrichedPlayer) => void;
  initialActivePlan?: StoredTransferPlan | null;
  plansRevision?: string;
  onPlansChanged?: (plans: StoredTransferPlan[], selectedPlanId: string | null) => void;
  initialPendingOutIds?: number[];
  initialPosFilter?: PositionFilter;
}

type ModalView = 'list' | 'editor';
type RightMainTab = 'players' | 'ticker' | 'summary' | 'solver';
type PlayersSubTab = 'all' | 'watchlist' | 'lab';
type PositionFilter = 'ALL' | Position;
type SetPieceFilter = 'any' | 'pen' | 'fk' | 'ck' | 'all_sp';
type RightSortKey =
  | 'xp_gw_desc'
  | 'xp_5gw_desc'
  | 'fdr_5gw_asc'
  | 'fdr_5gw_desc'
  | 'price_desc'
  | 'price_asc'
  | 'owned_desc';

const POS_BUTTONS: Array<{ id: PositionFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'GKP', label: 'GK' },
  { id: 'DEF', label: 'Def' },
  { id: 'MID', label: 'Mid' },
  { id: 'FWD', label: 'Fwd' },
];

const SHORT_POS_LABEL: Record<Position, string> = {
  GKP: 'GK',
  DEF: 'DEF',
  MID: 'MID',
  FWD: 'FWD',
};

export function TransferPlanModal({
  embedded = false,
  open,
  onClose,
  snapshot,
  players,
  fallbackSquadIds,
  entry,
  defaultFreeTransfers = 2,
  onToast,
  onInspectPlayer,
  onInspectInjury,
  initialActivePlan = null,
  plansRevision = '',
  onPlansChanged,
  initialPendingOutIds = [],
  initialPosFilter = 'ALL',
}: TransferPlanModalProps) {
  const [initialDraft] = useState(() => initialActivePlan ?? (embedded ? createNewTransferPlan({ snapshot, players, fallbackSquadIds, entry, defaultFreeTransfers }) : null));
  const [view, setView] = useState<ModalView>(initialDraft ? 'editor' : 'list');
  const [plans, setPlans] = useState<StoredTransferPlan[]>([]);
  const [activePlan, setActivePlanState] = useState<StoredTransferPlan | null>(initialDraft);
  const undoHistory = useRef<StoredTransferPlan[]>([]);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const setActivePlan = (next: StoredTransferPlan | null) => {
    if (embedded && activePlan && next?.id === activePlan.id) undoHistory.current = [...undoHistory.current.slice(-49), activePlan];
    setActivePlanState(next);
  };
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(initialDraft?.name ?? '');
  const [selectedGw, setSelectedGw] = useState<number>(initialActivePlan?.startGw ?? snapshot.meta.nextEventId);
  const [pendingOutIds, setPendingOutIds] = useState<number[]>(initialPendingOutIds);
  const [focusedPendingOutId, setFocusedPendingOutId] = useState<number | null>(initialPendingOutIds[0] ?? null);
  const [subSourceId, setSubSourceId] = useState<number | null>(null);
  const [badgeMode, setBadgeMode] = useState<'price' | 'xp'>('price');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Right panel tabs & filters
  const [rightTab, setRightTab] = useState<RightMainTab>('players');
  const [playersSubTab, setPlayersSubTab] = useState<PlayersSubTab>('all');
  const [posFilter, setPosFilter] = useState<PositionFilter>(initialPosFilter);
  const [teamFilter, setTeamFilter] = useState<number | 'ALL'>('ALL');
  const [maxPriceWhole, setMaxPriceWhole] = useState<number>(16);
  const [maxPriceTenths, setMaxPriceTenths] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [setPieceFilter, setSetPieceFilter] = useState<SetPieceFilter>('any');
  // Default right-table sort: High xPts in that position using OUR VORTEX model
  const [sortBy, setSortBy] = useState<RightSortKey>('xp_gw_desc');
  const [visibleLimit, setVisibleLimit] = useState<number>(35);
  const [watchlistIds, setWatchlistIds] = useState<number[]>([]);

  // Ticker tab controls
  const [tickerStartOffset, setTickerStartOffset] = useState(0);
  const [tickerSort, setTickerSort] = useState<'ease' | 'az'>('ease');
  const [tickerMineOnly, setTickerMineOnly] = useState(false);

  // Transfer Lab / Solver controls
  const [labHorizon, setLabHorizon] = useState(TRANSFER_LAB_HORIZON);
  const [labAllowHits, setLabAllowHits] = useState(false);
  const [labPreview, setLabPreview] = useState<{ transfers: TransferMap; steps: AutoStep[]; sourcePlan: string } | null>(null);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const vortexCache = useMemo(() => buildVortexPlannerCache(snapshot, players), [snapshot, players]);

  // Hydrate saved plans and watchlist when opened or when entry changes
  const storageScopeId = entry?.id ?? null;
  useEffect(() => {
    if (!open) return;
    if (typeof window !== 'undefined') {
      const stored = readStoredTransferPlans(window.localStorage, storageScopeId);
      setPlans(stored);
      try {
        const wlRaw = window.localStorage.getItem(`vortex:tpWatchlist:${storageScopeId ?? 'template'}`);
        if (wlRaw) {
          const parsed: unknown = JSON.parse(wlRaw);
          if (Array.isArray(parsed)) {
            setWatchlistIds(parsed.filter((x): x is number => typeof x === 'number' && Number.isInteger(x)));
          }
        }
      } catch {
        // Ignore storage read errors
      }
    }
    const initial = initialActivePlan ?? (embedded ? createNewTransferPlan({ snapshot, players, fallbackSquadIds, entry, defaultFreeTransfers }) : null);
    setView(initial ? 'editor' : 'list');
    setActivePlanState(initial);
    setNameInput(initial?.name ?? '');
    setSelectedGw(initial?.startGw ?? snapshot.meta.nextEventId);
    undoHistory.current = [];
    setPendingOutIds(initialPendingOutIds);
    setFocusedPendingOutId(initialPendingOutIds[0] ?? null);
    setSubSourceId(null);
    setEditingName(false);
    setMoreMenuOpen(false);
  }, [open, storageScopeId, embedded, initialActivePlan?.id]);

  // Refresh available slots after a Solver save without replacing an open draft.
  useEffect(() => {
    if (open && typeof window !== 'undefined') setPlans(readStoredTransferPlans(window.localStorage, storageScopeId));
  }, [open, storageScopeId, plansRevision]);

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  useEffect(() => {
    setVisibleLimit(35);
  }, [posFilter, teamFilter, maxPriceWhole, maxPriceTenths, searchQuery, setPieceFilter, sortBy, playersSubTab, selectedGw]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (moreMenuOpen) {
          setMoreMenuOpen(false);
          return;
        }
        if (editingName) {
          setEditingName(false);
          return;
        }
        if (subSourceId !== null) {
          setSubSourceId(null);
          return;
        }
        // Closing the selected saved editor matches the same keyboard escape
        // behavior as the plan list; unsaved edits are not silently persisted.
        if (embedded) { setPendingOutIds([]); setFocusedPendingOutId(null); } else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, moreMenuOpen, editingName, subSourceId, view, onClose, embedded]);

  useEffect(() => {
    if (!moreMenuOpen) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [moreMenuOpen]);

  const persistPlans = (nextPlans: StoredTransferPlan[], preferredPlanId?: string | null) => {
    setPlans(nextPlans);
    if (typeof window !== 'undefined') {
      writeStoredTransferPlans(window.localStorage, storageScopeId, nextPlans);
    }
    const selected = preferredPlanId === undefined ? (activePlan?.id ?? nextPlans[0]?.id ?? null) : preferredPlanId;
    onPlansChanged?.(nextPlans, selected && nextPlans.some(plan => plan.id === selected) ? selected : (nextPlans[0]?.id ?? null));
  };

  const toggleWatchlist = (id: number) => {
    setWatchlistIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            `vortex:tpWatchlist:${storageScopeId ?? 'template'}`,
            JSON.stringify(next),
          );
        } catch {
          // Ignore quota error
        }
      }
      return next;
    });
  };

  const openEditorWithPlan = (plan: StoredTransferPlan) => {
    setActivePlan(plan);
    setNameInput(plan.name);
    setSelectedGw(plan.startGw);
    setPendingOutIds([]);
    setFocusedPendingOutId(null);
    setSubSourceId(null);
    setRightTab('players');
    setPlayersSubTab('all');
    setPosFilter('ALL');
    setSortBy('xp_gw_desc');
    setLabPreview(null);
    setView('editor');
  };

  const handleCreateNewPlan = () => {
    if (plans.length >= MAX_TRANSFER_PLAN_SLOTS) {
      onToast(`All ${MAX_TRANSFER_PLAN_SLOTS} plan slots are used. Delete an existing plan first.`, 'error');
      return;
    }
    const created = createNewTransferPlan({
      snapshot,
      players,
      fallbackSquadIds,
      entry,
      existingPlansCount: plans.length,
      defaultFreeTransfers,
    });
    const res = upsertTransferPlan(plans, created);
    if (!res.ok) {
      onToast(res.error, 'error');
      return;
    }
    persistPlans(res.plans, created.id);
    openEditorWithPlan(created);
  };

  const handleSaveCurrentPlan = (exitAfterSave = false) => {
    if (!activePlan) return;
    const trimmedName = nameInput.trim() || activePlan.name;
    const updatedPlan: StoredTransferPlan = {
      ...activePlan,
      name: trimmedName,
      updatedAt: new Date().toISOString(),
    };
    const res = upsertTransferPlan(plans, updatedPlan);
    if (!res.ok) {
      onToast(res.error, 'error');
      return;
    }
    setActivePlan(updatedPlan);
    persistPlans(res.plans, updatedPlan.id);
    if (exitAfterSave) {
      setPendingOutIds([]);
      setFocusedPendingOutId(null);
      setSubSourceId(null);
      setView('list');
      onToast(`Saved "${trimmedName}".`, 'success');
    } else {
      onToast(`Saved "${trimmedName}".`, 'success');
    }
  };

  const handleDuplicatePlan = (plan: StoredTransferPlan) => {
    if (plans.length >= MAX_TRANSFER_PLAN_SLOTS) {
      onToast(`Maximum of ${MAX_TRANSFER_PLAN_SLOTS} plan slots used.`, 'error');
      return;
    }
    const nowIso = new Date().toISOString();
    const copy: StoredTransferPlan = {
      ...plan,
      id: `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${plan.name} (Copy)`.slice(0, 60),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const res = upsertTransferPlan(plans, copy);
    if (res.ok) {
      persistPlans(res.plans, copy.id);
      onToast(`Duplicated "${plan.name}".`, 'info');
    }
  };

  const handleDeletePlan = (plan: StoredTransferPlan) => {
    const next = deleteTransferPlan(plans, plan.id);
    persistPlans(next);
    onToast(`Deleted "${plan.name}".`, 'info');
  };

  // Plan context & replay for the active plan
  const planCtx = useMemo(
    () => (activePlan ? buildPlanCtxFromCache(activePlan, players, vortexCache) : null),
    [activePlan, players, vortexCache],
  );

  const safeSelectedGw = useMemo(() => {
    if (!planCtx || planCtx.gws.length === 0) return snapshot.meta.nextEventId;
    return planCtx.gws.includes(selectedGw) ? selectedGw : planCtx.gws[0];
  }, [planCtx, selectedGw, snapshot.meta.nextEventId]);

  const gwIdx = useMemo(() => {
    if (!planCtx) return 0;
    return Math.max(0, planCtx.gws.indexOf(safeSelectedGw));
  }, [planCtx, safeSelectedGw]);

  const replayState = useMemo(() => {
    if (!planCtx || !activePlan) return null;
    return replay(planCtx, activePlan.transfers, safeSelectedGw, activePlan.chips);
  }, [planCtx, activePlan, safeSelectedGw]);

  const currentLineup = useMemo(() => {
    if (!planCtx || !replayState || !activePlan) return null;
    const base = lineupAt(planCtx, replayState.squad, gwIdx, activePlan.lineups[safeSelectedGw]);
    const capCfg = activePlan.captains[safeSelectedGw];
    const captain =
      capCfg?.captain && base.starters.includes(capCfg.captain) ? capCfg.captain : base.captain;
    const vice =
      capCfg?.vice && base.starters.includes(capCfg.vice) && capCfg.vice !== captain
        ? capCfg.vice
        : base.vice;
    const capXp = captain !== undefined ? xpAt(planCtx, captain, gwIdx) : 0;
    return {
      ...base,
      captain,
      vice,
      capXp,
      total: base.xi + capXp,
    };
  }, [planCtx, replayState, activePlan, gwIdx, safeSelectedGw]);

  const liveMetrics = useMemo(() => {
    if (!planCtx || !activePlan) {
      return {
        transfersUsed: 0,
        freeTransfers: defaultFreeTransfers,
        hitCost: 0,
        effectiveBankTenths: 0,
        projectedGwXp: 0,
        ratingPct: 0,
      };
    }
    return computeLiveGwMetrics({
      ctx: planCtx,
      plan: activePlan,
      gw: safeSelectedGw,
      pendingOutIds,
      benchmarkXp: vortexCache.benchmarkOptimalXpByGw.get(safeSelectedGw) ?? 62,
    });
  }, [planCtx, activePlan, safeSelectedGw, pendingOutIds, vortexCache, defaultFreeTransfers]);

  // Valid swap targets when starter <-> bench substitution is armed
  const validSwapTargetIds = useMemo(() => {
    if (subSourceId === null || !planCtx || !currentLineup) return new Set<number>();
    const allIds = [...currentLineup.starters, ...currentLineup.bench];
    const set = new Set<number>();
    for (const candidateId of allIds) {
      if (candidateId === subSourceId || pendingOutIds.includes(candidateId)) continue;
      if (validateSubstitution(planCtx, currentLineup, subSourceId, candidateId) === null) {
        set.add(candidateId);
      }
    }
    return set;
  }, [subSourceId, planCtx, currentLineup, pendingOutIds]);

  const changeGw = (nextGw: number) => {
    setSelectedGw(nextGw);
    setPendingOutIds([]);
    setFocusedPendingOutId(null);
    setSubSourceId(null);
    setMoreMenuOpen(false);
    setLabPreview(null);
  };

  // Click any player on the pitch -> transition to Image 3 (+ / PlayerName / Replace) and filter right table!
  const handleRemovePitchPlayer = (playerId: number) => {
    const p = playerMap.get(playerId);
    if (!p) return;
    setSubSourceId(null);
    setPendingOutIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
    setFocusedPendingOutId(playerId);
    setRightTab('players');
    setPlayersSubTab('all');
    setPosFilter(p.position);
    setSortBy('xp_gw_desc');
  };

  const handleRestorePendingSlot = (outId: number) => {
    setPendingOutIds((prev) => {
      const next = prev.filter((id) => id !== outId);
      if (focusedPendingOutId === outId) {
        const fallbackNext = next[next.length - 1] ?? null;
        setFocusedPendingOutId(fallbackNext);
        if (fallbackNext !== null) {
          const fp = playerMap.get(fallbackNext);
          if (fp) setPosFilter(fp.position);
        } else {
          setPosFilter('ALL');
        }
      }
      return next;
    });
  };

  const handleFocusOrRestorePendingSlot = (outId: number) => {
    const outP = playerMap.get(outId);
    if (focusedPendingOutId === outId && pendingOutIds.length > 0) {
      // Clicking the already-focused Replace slot restores the player cleanly
      handleRestorePendingSlot(outId);
      return;
    }
    setFocusedPendingOutId(outId);
    if (outP) {
      setRightTab('players');
      setPlayersSubTab('all');
      setPosFilter(outP.position);
    }
  };

  const handleSubButtonClick = (playerId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!planCtx || !currentLineup || !activePlan) return;
    if (subSourceId === playerId) {
      setSubSourceId(null);
      return;
    }
    if (subSourceId !== null && validSwapTargetIds.has(playerId)) {
      performLineupSubstitution(subSourceId, playerId);
      return;
    }
    setSubSourceId(playerId);
  };

  const performLineupSubstitution = (firstId: number, secondId: number) => {
    if (!planCtx || !currentLineup || !activePlan) return;
    const err = validateSubstitution(planCtx, currentLineup, firstId, secondId);
    if (err) {
      onToast(err, 'error');
      return;
    }
    const order = [...currentLineup.starters, ...currentLineup.bench];
    const ai = order.indexOf(firstId);
    const bi = order.indexOf(secondId);
    if (ai >= 0 && bi >= 0) {
      [order[ai], order[bi]] = [order[bi], order[ai]];
      const starters = order.slice(0, 11);
      const ranked = [...starters].sort((a, b) => xpAt(planCtx, b, gwIdx) - xpAt(planCtx, a, gwIdx));
      const captain = currentLineup.captain && starters.includes(currentLineup.captain) ? currentLineup.captain : ranked[0];
      const vice = currentLineup.vice && starters.includes(currentLineup.vice) && currentLineup.vice !== captain ? currentLineup.vice : ranked.find(id => id !== captain);
      const nextPlan: StoredTransferPlan = {
        ...activePlan,
        lineups: { ...activePlan.lineups, [safeSelectedGw]: order },
        captains: { ...activePlan.captains, [safeSelectedGw]: { captain, vice } },
        updatedAt: new Date().toISOString(),
      };
      setActivePlan(nextPlan);
    }
    setSubSourceId(null);
  };

  const handleCycleCaptain = (playerId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activePlan || !currentLineup || !currentLineup.starters.includes(playerId)) return;
    const curCap = currentLineup.captain;
    const curVice = currentLineup.vice;
    let nextCap = curCap;
    let nextVice = curVice;
    if (curCap === playerId) {
      nextCap = curVice;
      nextVice = playerId;
    } else {
      nextVice = curCap;
      nextCap = playerId;
    }
    setActivePlan({
      ...activePlan,
      captains: {
        ...activePlan.captains,
        [safeSelectedGw]: { captain: nextCap, vice: nextVice },
      },
      updatedAt: new Date().toISOString(),
    });
  };

  // Select incoming replacement player from right table
  const handleSelectIncomingPlayer = (incoming: EnrichedPlayer) => {
    if (!planCtx || !replayState || !activePlan) return;

    // If this player is currently in pendingOutIds, restore them directly!
    if (pendingOutIds.includes(incoming.id)) {
      handleRestorePendingSlot(incoming.id);
      return;
    }

    // Find matching pending outgoing slot for incoming.position
    const matchingOutId =
      focusedPendingOutId !== null &&
      pendingOutIds.includes(focusedPendingOutId) &&
      playerMap.get(focusedPendingOutId)?.position === incoming.position
        ? focusedPendingOutId
        : pendingOutIds.find((id) => playerMap.get(id)?.position === incoming.position) ?? null;

    if (matchingOutId === null) {
      if (replayState.squad.includes(incoming.id)) {
        onInspectPlayer?.(incoming);
        return;
      }
      onToast(`Click a ${SHORT_POS_LABEL[incoming.position]} on the pitch first to replace with ${incoming.name}.`, 'info');
      return;
    }

    const validationError = validatePendingReplacement({
      ctx: planCtx,
      stateSquad: replayState.squad,
      effectiveBankTenths: liveMetrics.effectiveBankTenths,
      pendingOutIds,
      outId: matchingOutId,
      inId: incoming.id,
    });
    if (validationError) {
      onToast(validationError, 'error');
      return;
    }

    const prevOrder = currentLineup
      ? [...currentLineup.starters, ...currentLineup.bench]
      : [...replayState.squad];
    const nextOrder = prevOrder.map((id) => (id === matchingOutId ? incoming.id : id));

    const existingGwMoves = activePlan.transfers[safeSelectedGw] ?? [];
    const nextGwMoves = collapseGwTransfers(existingGwMoves, matchingOutId, incoming.id);
    const rawNextTransfers: TransferMap = { ...activePlan.transfers };
    if (nextGwMoves.length > 0) rawNextTransfers[safeSelectedGw] = nextGwMoves;
    else delete rawNextTransfers[safeSelectedGw];

    const sanitizedTransfers = sanitize(planCtx, rawNextTransfers, activePlan.chips);
    if (embedded && !planCtx.gws.every(gw => JSON.stringify(sanitizedTransfers[gw] ?? []) === JSON.stringify(rawNextTransfers[gw] ?? []))) {
      onToast('This transfer conflicts with a later saved move. Review that gameweek first.', 'error');
      return;
    }

    // Preserve captain/vice inheritance if outgoing was captain/vice
    const prevCapCfg = activePlan.captains[safeSelectedGw] ?? {
      captain: currentLineup?.captain,
      vice: currentLineup?.vice,
    };
    const nextCapCfg = {
      captain: prevCapCfg.captain === matchingOutId ? incoming.id : prevCapCfg.captain,
      vice: prevCapCfg.vice === matchingOutId ? incoming.id : prevCapCfg.vice,
    };

    const remainingPending = pendingOutIds.filter((id) => id !== matchingOutId);
    const nextFocus = remainingPending[remainingPending.length - 1] ?? null;

    setActivePlan({
      ...activePlan,
      transfers: sanitizedTransfers,
      lineups: { ...activePlan.lineups, [safeSelectedGw]: nextOrder },
      captains: { ...activePlan.captains, [safeSelectedGw]: nextCapCfg },
      updatedAt: new Date().toISOString(),
    });
    setPendingOutIds(remainingPending);
    setFocusedPendingOutId(nextFocus);
    if (nextFocus !== null) {
      const nextOutP = playerMap.get(nextFocus);
      if (nextOutP) setPosFilter(nextOutP.position);
    }
  };

  const handleToggleChip = (chip: Chip) => {
    if (!activePlan || !planCtx) return;
    const nextChips = { ...activePlan.chips };
    if (nextChips[safeSelectedGw] === chip) {
      delete nextChips[safeSelectedGw];
    } else {
      // Ensure each chip is only active once in the plan
      for (const [gwKey, existingChip] of Object.entries(nextChips)) {
        if (existingChip === chip) delete nextChips[Number(gwKey)];
      }
      nextChips[safeSelectedGw] = chip;
    }
    const cleanTransfers = sanitize(planCtx, activePlan.transfers, nextChips);
    setActivePlan({
      ...activePlan,
      chips: nextChips,
      transfers: cleanTransfers,
      updatedAt: new Date().toISOString(),
    });
    setMoreMenuOpen(false);
  };

  const handleResetGwTransfers = () => {
    if (!activePlan || !planCtx) return;
    const nextTransfers = { ...activePlan.transfers };
    delete nextTransfers[safeSelectedGw];
    const nextLineups = { ...activePlan.lineups };
    if (safeSelectedGw !== activePlan.startGw) delete nextLineups[safeSelectedGw];
    setPendingOutIds([]);
    setFocusedPendingOutId(null);
    setActivePlan({
      ...activePlan,
      transfers: sanitize(planCtx, nextTransfers, activePlan.chips),
      lineups: nextLineups,
      updatedAt: new Date().toISOString(),
    });
    setMoreMenuOpen(false);
    onToast(`Reset GW${safeSelectedGw} transfers.`, 'info');
  };

  const handleResetAllTransfers = () => {
    if (!activePlan) return;
    setPendingOutIds([]);
    setFocusedPendingOutId(null);
    setActivePlan({
      ...activePlan,
      transfers: {},
      chips: {},
      updatedAt: new Date().toISOString(),
    });
    setMoreMenuOpen(false);
    onToast('Reset all planned transfers and chips.', 'info');
  };

  const handleAutoPickXi = () => {
    if (!activePlan || !planCtx || !replayState) return;
    const auto = lineupAt(planCtx, replayState.squad, gwIdx);
    setActivePlan({
      ...activePlan,
      lineups: { ...activePlan.lineups, [safeSelectedGw]: [...auto.starters, ...auto.bench] },
      captains: { ...activePlan.captains, [safeSelectedGw]: { captain: auto.captain, vice: auto.vice } },
      updatedAt: new Date().toISOString(),
    });
    setMoreMenuOpen(false);
    onToast(`Set optimal VORTEX XI (${auto.formation}) for GW${safeSelectedGw}.`, 'success');
  };

  // Precompute Next-5 VORTEX FDR & 5-GW xPts for right-side table sorting and rendering
  const teamNext5Map = useMemo(() => {
    const map = new Map<number, ReturnType<typeof getNextFixturesWithVortexFdr>>();
    for (const team of snapshot.teams) {
      map.set(team.id, getNextFixturesWithVortexFdr(vortexCache, team.id, safeSelectedGw, 5));
    }
    return map;
  }, [snapshot.teams, vortexCache, safeSelectedGw]);

  const teamNext3Map = useMemo(() => {
    const map = new Map<number, ReturnType<typeof getNextFixturesWithVortexFdr>>();
    for (const team of snapshot.teams) {
      map.set(team.id, getNextFixturesWithVortexFdr(vortexCache, team.id, safeSelectedGw, 3));
    }
    return map;
  }, [snapshot.teams, vortexCache, safeSelectedGw]);

  const maxPriceLimitTenths = maxPriceWhole * 10 + maxPriceTenths;

  const filteredSortedPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cacheGwIdx = Math.max(0, vortexCache.gws.indexOf(safeSelectedGw));

    const getGwXp = (p: EnrichedPlayer) => vortexCache.xpByPlayerGw.get(p.id)?.[cacheGwIdx] ?? p.projection;
    const getNext5Xp = (p: EnrichedPlayer) => {
      const slice = (vortexCache.xpByPlayerGw.get(p.id) ?? []).slice(cacheGwIdx, cacheGwIdx + 5);
      return slice.length ? slice.reduce((s, v) => s + v, 0) : p.horizon5Projection;
    };
    const getNext5Fdr = (p: EnrichedPlayer) => teamNext5Map.get(p.teamId)?.avgFdr ?? 9.9;

    return players
      .filter((p) => {
        if (playersSubTab === 'watchlist' && !watchlistIds.includes(p.id)) return false;
        if (posFilter !== 'ALL' && p.position !== posFilter) return false;
        if (teamFilter !== 'ALL' && p.teamId !== teamFilter) return false;
        if (p.cost > maxPriceLimitTenths) return false;
        if (setPieceFilter === 'pen' && p.penaltiesOrder !== 1) return false;
        if (setPieceFilter === 'fk' && p.freekicksOrder !== 1) return false;
        if (setPieceFilter === 'ck' && p.cornersOrder !== 1) return false;
        if (
          setPieceFilter === 'all_sp' &&
          p.penaltiesOrder !== 1 &&
          p.freekicksOrder !== 1 &&
          p.cornersOrder !== 1
        ) {
          return false;
        }
        if (q) {
          const hay = `${p.name} ${p.fullName} ${p.team.shortName} ${p.team.name}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'xp_gw_desc':
            return getGwXp(b) - getGwXp(a) || b.cost - a.cost;
          case 'xp_5gw_desc':
            return getNext5Xp(b) - getNext5Xp(a) || getGwXp(b) - getGwXp(a);
          case 'fdr_5gw_asc':
            return getNext5Fdr(a) - getNext5Fdr(b) || getGwXp(b) - getGwXp(a);
          case 'fdr_5gw_desc':
            return getNext5Fdr(b) - getNext5Fdr(a) || getGwXp(b) - getGwXp(a);
          case 'price_desc':
            return b.cost - a.cost || getGwXp(b) - getGwXp(a);
          case 'price_asc':
            return a.cost - b.cost || getGwXp(b) - getGwXp(a);
          case 'owned_desc':
            return b.ownership - a.ownership || getGwXp(b) - getGwXp(a);
          default:
            return getGwXp(b) - getGwXp(a);
        }
      });
  }, [
    players,
    playersSubTab,
    watchlistIds,
    posFilter,
    teamFilter,
    maxPriceLimitTenths,
    setPieceFilter,
    searchQuery,
    sortBy,
    vortexCache,
    safeSelectedGw,
    teamNext5Map,
  ]);

  // Transfer Lab top single moves
  const singleTopMoves = useMemo(() => {
    if (!planCtx || !replayState) return [];
    return topMoves(planCtx, replayState, gwIdx, labHorizon, 6);
  }, [planCtx, replayState, gwIdx, labHorizon]);

  const manualSuggestions = useMemo(() => {
    if (!embedded || !planCtx || !replayState) return [];
    return [1, 4, 6].map(h => ({ horizon: Math.min(h, planCtx.gws.length - gwIdx), move: topMoves(planCtx, replayState, gwIdx, h, 1)[0] }));
  }, [embedded, planCtx, replayState, gwIdx]);
  const pickerFixtures = useMemo(() => embedded ? buildFixtureMatrix(snapshot.teams, snapshot.fixtures, snapshot.meta.nextEventId, 5, [], snapshot.historicalTeamModel?.strengths) : [], [embedded, snapshot]);

  if (!open) return null;

  const cacheGwIdx = Math.max(0, vortexCache.gws.indexOf(safeSelectedGw));
  const activeChip = activePlan?.chips[safeSelectedGw];
  const squadSet = new Set(replayState?.squad ?? []);
  const pendingSet = new Set(pendingOutIds);

  const renderPitchSlot = (playerId: number, isBench = false) => {
    const p = playerMap.get(playerId);
    if (!p) return null;

    // Image 3 state: player was clicked on the pitch -> show "+ / PlayerName / Replace"
    if (pendingSet.has(playerId)) {
      const isFocused = focusedPendingOutId === playerId;
      return (
        <div
          key={`replace-${playerId}`}
          role="button"
          tabIndex={0}
          data-replace-player-id={playerId}
          className={classNames('vx-tp-replace-slot', isFocused && 'is-focused', isBench && 'is-bench')}
          onClick={() => handleFocusOrRestorePendingSlot(playerId)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleFocusOrRestorePendingSlot(playerId);
            }
          }}
          title={
            isFocused
              ? `Select a ${SHORT_POS_LABEL[p.position]} on the right table, or click again to restore ${p.name}`
              : `Focus ${p.name} (${SHORT_POS_LABEL[p.position]}) replacement`
          }
          aria-label={`Replace ${p.name}`}
        >
          <div className="vx-tp-replace-slot__box">
            <span className="vx-tp-replace-slot__plus" aria-hidden="true">
              <Plus size={18} />
            </span>
          </div>
          <div className="vx-tp-replace-slot__meta">
            <strong>{p.name}</strong>
            <small>Replace</small>
          </div>
        </div>
      );
    }

    const sellTenths =
      planCtx && replayState ? sellOf(planCtx, replayState, p.id) : p.cost;
    const gwXp = vortexCache.xpByPlayerGw.get(p.id)?.[cacheGwIdx] ?? p.projection;
    const isCap = !isBench && currentLineup?.captain === p.id;
    const isVice = !isBench && currentLineup?.vice === p.id;
    const next3 = teamNext3Map.get(p.teamId)?.items ?? [];
    const hasInjuryFlag = p.status !== 'a' || (p.chance !== null && p.chance < 100);
    const injuryTone =
      p.status === 'i' || p.status === 's' || p.status === 'u' || p.chance === 0
        ? 'severe'
        : hasInjuryFlag
          ? 'doubt'
          : null;
    const isSubArmed = subSourceId === p.id;
    const isSubValidTarget = subSourceId !== null && validSwapTargetIds.has(p.id);

    return (
      <div
        key={p.id}
        data-tp-pitch-player={p.id}
        role="button"
        tabIndex={0}
        className={classNames(
          'vx-tp-pitch-card',
          isBench && 'is-bench',
          isSubArmed && 'is-sub-source',
          isSubValidTarget && 'is-sub-target',
          injuryTone && `is-${injuryTone}`,
        )}
        onClick={() => {
          if (subSourceId !== null) {
            if (isSubValidTarget) performLineupSubstitution(subSourceId, p.id);
            else setSubSourceId(null);
            return;
          }
          handleRemovePitchPlayer(p.id);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (subSourceId !== null) {
              if (isSubValidTarget) performLineupSubstitution(subSourceId, p.id);
              else setSubSourceId(null);
            } else {
              handleRemovePitchPlayer(p.id);
            }
          }
        }}
        aria-label={`${p.name} (${SHORT_POS_LABEL[p.position]}), £${(sellTenths / 10).toFixed(1)}m — click to replace`}
      >
        <div className="vx-tp-pitch-card__top">
          <button
            type="button"
            className={classNames('vx-tp-card-action is-sub', isSubArmed && 'is-active')}
            onClick={(e) => handleSubButtonClick(p.id, e)}
            title={`${embedded ? "Swap" : "Substitute"} ${p.name}`}
            aria-label={`${embedded ? "Swap" : "Substitute"} ${p.name}`}
          >
            <ArrowUpDown size={11} />
          </button>

          <button
            type="button"
            className="vx-tp-card-action is-remove"
            onClick={(e) => {
              e.stopPropagation();
              handleRemovePitchPlayer(p.id);
            }}
            title={`Transfer out ${p.name}`}
            aria-label={`Transfer out ${p.name}`}
          >
            <X size={11} />
          </button>

          {(isCap || isVice) && (
            <button
              type="button"
              className={classNames('vx-tp-armband', isCap ? 'is-cap' : 'is-vice')}
              onClick={(e) => handleCycleCaptain(p.id, e)}
              title="Click to swap Captain / Vice-Captain"
              aria-label={isCap ? 'Captain' : 'Vice-captain'}
            >
              {isCap ? (activeChip === 'tc' ? '3×' : 'C') : 'V'}
            </button>
          )}

          <PlayerAvatar
            code={p.code}
            teamCode={p.team.code}
            name={p.name}
            fullName={p.fullName}
            teamShort={p.team.shortName}
            position={p.position}
            size="md"
            className="vx-tp-pitch-avatar"
          />

          {(p.penaltiesOrder === 1 || p.freekicksOrder === 1 || p.cornersOrder === 1) && (
            <div className="vx-tp-sp-row" aria-hidden="true">
              {p.penaltiesOrder === 1 && <span className="vx-tp-sp is-p">P</span>}
              {p.freekicksOrder === 1 && <span className="vx-tp-sp is-fk">FK</span>}
              {p.cornersOrder === 1 && <span className="vx-tp-sp is-ck">CK</span>}
            </div>
          )}

          <span className="vx-tp-price-pill">
            {badgeMode === 'price'
              ? `£${(sellTenths / 10).toFixed(1)}`
              : `${(gwXp * (isCap ? (activeChip === 'tc' ? 3 : 2) : 1)).toFixed(1)} xP`}
          </span>
        </div>

        <div className={classNames('vx-tp-name-bar', injuryTone && `is-${injuryTone}`)}>
          <strong>{p.name}</strong>
        </div>

        <div className="vx-tp-fix-strip">
          {next3.map((fx) => (
            <span
              key={fx.gw}
              className={classNames('vx-tp-fix-cell', fx.isBlank && 'is-blank')}
              style={fx.fdr === null ? undefined : difficultyFillStyle(fx.fdr)}
              title={
                fx.isBlank
                  ? `GW${fx.gw}: Blank`
                  : `GW${fx.gw}: ${fx.oppName} (${fx.home ? 'H' : 'A'}) · VORTEX FDR ${fx.fdr?.toFixed(2)}`
              }
            >
              {fx.isBlank ? '—' : fx.home ? fx.oppShort : fx.oppShort.toLowerCase()}
              {fx.isDouble ? '+' : ''}
            </span>
          ))}
        </div>
      </div>
    );
  };

  if (embedded && activePlan && planCtx && replayState && currentLineup) {
    const source = buildPublicDataHealth(snapshot);
    const outgoing = focusedPendingOutId === null ? null : playerMap.get(focusedPendingOutId);
    const clearPending = () => { setPendingOutIds([]); setFocusedPendingOutId(null); setSubSourceId(null); };
    const freshDraft = () => {
      clearPending(); undoHistory.current = [];
      const next = createNewTransferPlan({ snapshot, players, fallbackSquadIds, entry, defaultFreeTransfers });
      setActivePlanState(next); setNameInput(next.name); setSelectedGw(next.startGw);
    };
    const saveManual = (asNew = false) => {
      if (pendingOutIds.length) { onToast('Choose a replacement or cancel the transfer first.', 'error'); return; }
      const clean = sanitize(planCtx, activePlan.transfers, activePlan.chips);
      if (!planCtx.gws.every(gw => JSON.stringify(clean[gw] ?? []) === JSON.stringify(activePlan.transfers[gw] ?? []))) {
        onToast('A planned transfer is no longer legal. Review the plan before saving.', 'error'); return;
      }
      const updated = { ...activePlan, id: asNew ? `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` : activePlan.id,
        name: nameInput.trim() || activePlan.name, updatedAt: new Date().toISOString() };
      // Read the latest device plans at the time of this explicit save, preserving unrelated slots.
      const latest = readStoredTransferPlans(window.localStorage, storageScopeId);
      const result = upsertTransferPlan(latest, updated);
      if (!result.ok) { onToast(result.error, 'error'); return; }
      const committed = result.plans.find(p => p.id === updated.id)!;
      writeStoredTransferPlans(window.localStorage, storageScopeId, result.plans);
      const restored = readStoredTransferPlans(window.localStorage, storageScopeId).find(p => p.id === committed.id);
      if (!restored || JSON.stringify(restored) !== JSON.stringify(sanitizeStoredPlan(committed))) {
        onToast('Could not save on this device. Your draft is still open.', 'error'); return;
      }
      undoHistory.current = [];
      setActivePlanState(committed); setPlans(result.plans); onPlansChanged?.(result.plans, committed.id);
      onToast('Saved on this device.', 'success');
    };
    const changeManualPlan = (id: string) => {
      if (id === '__new__') freshDraft();
      else { const next = plans.find(p => p.id === id); if (next) { undoHistory.current = []; openEditorWithPlan(next); onPlansChanged?.(plans, next.id); } }
    };
    const requestManualPlan = (id: string) => {
      if (undoHistory.current.length || nameInput !== activePlan.name) setPendingNavigation(id);
      else changeManualPlan(id);
    };
    if (activePlan.startGw !== snapshot.meta.nextEventId) return <section className="panel" aria-label="Plan needs review">
      <p role="alert">This plan starts GW{activePlan.startGw}. Current planning starts GW{snapshot.meta.nextEventId}; the saved plan is unchanged.</p>
      <button type="button" onClick={freshDraft}>New plan</button>
    </section>;
    if (outgoing) return <section className="manual-plan-picker" aria-label="Choose transfer replacement">
      <header className="manual-plan-toolbar">
        <button type="button" className="button button--ghost" autoFocus onClick={clearPending}><ArrowLeft size={16} /> Back to Plan</button>
        <PlayerAvatar code={outgoing.code} teamCode={outgoing.team.code} name={outgoing.name} fullName={outgoing.fullName} teamShort={outgoing.team.shortName} position={outgoing.position} size="md" />
        <strong>Transfer out: {outgoing.name}</strong>
        <span>£{(liveMetrics.effectiveBankTenths / 10).toFixed(1)}m available · GW{safeSelectedGw}</span>
      </header>
      <PlayerLab key={`${outgoing.id}:${safeSelectedGw}`} snapshot={snapshot} players={players} teams={snapshot.teams}
        fixtureRows={pickerFixtures} nextEventId={snapshot.meta.nextEventId} query={searchQuery} onQueryChange={setSearchQuery} onToast={onToast}
        selection={{ outgoing, gameweek: safeSelectedGw, onSelect: handleSelectIncomingPlayer,
          unavailableReason: p => p.id === outgoing.id ? "Use Back to Plan to cancel this transfer." : validatePendingReplacement({ ctx: planCtx, stateSquad: replayState.squad,
            effectiveBankTenths: liveMetrics.effectiveBankTenths, pendingOutIds, outId: outgoing.id, inId: p.id }) }} />
    </section>;
    const advicePlayer = (id: number) => {
      const p = playerMap.get(id);
      return p ? <div className="manual-advice-player"><PlayerAvatar code={p.code} teamCode={p.team.code} name={p.name} fullName={p.fullName} teamShort={p.team.shortName} position={p.position} size="md" /><strong>{p.name}</strong></div> : null;
    };
    return <section className="manual-plan" aria-label="Manual Plan" data-testid="manual-plan">
      <header className="manual-plan-toolbar">
        <label>Plan<select aria-label="Manual saved plan" value={plans.some(p => p.id === activePlan.id) ? activePlan.id : '__draft__'} onChange={e => {
          requestManualPlan(e.target.value);
        }}>
          {!plans.some(p => p.id === activePlan.id) && <option value="__draft__">Unsaved plan</option>}
          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <label>Name<input aria-label="Manual plan name" value={nameInput} maxLength={60} onChange={e => setNameInput(e.target.value)} /></label>
        <button type="button" className="button button--ghost" onClick={() => requestManualPlan('__new__')}>New plan</button>
        <button type="button" className="button button--primary" onClick={() => saveManual()}>Save plan</button>
        <button type="button" className="button button--ghost" onClick={() => saveManual(true)}>Save as new</button>
        <span className="vx-planner-data-flags" title={source.officialFpl.reason}><b className={`is-${source.officialFpl.state}`}>FPL: {source.officialFpl.state}</b><b className={`is-${source.market.state}`}>ODDS: {source.market.state}</b></span>
      </header>
      {!entry && <small className="manual-plan-source" title="Load your FPL Team ID for your squad">Template</small>}
      <div className="manual-plan-board">
        <div className="manual-plan-pitch-column">
          <div className="vx-tp-gw-nav">
            <button type="button" aria-label="Previous gameweek" disabled={gwIdx <= 0} onClick={() => changeGw(planCtx.gws[gwIdx - 1])}><ArrowLeft size={18}/></button>
            <label>Gameweek<select aria-label="Select planning gameweek" value={safeSelectedGw} onChange={e => changeGw(Number(e.target.value))}>{planCtx.gws.slice(0, 10).map(gw => <option key={gw} value={gw}>GW{gw}</option>)}</select></label>
            <button type="button" aria-label="Next gameweek" disabled={gwIdx >= Math.min(10, planCtx.gws.length) - 1} onClick={() => changeGw(planCtx.gws[gwIdx + 1])}><ArrowRight size={18}/></button>
          </div>
          <div className="manual-plan-metrics">
            <div><small>Transfers</small><strong>{liveMetrics.transfersUsed} / {liveMetrics.freeTransfers}</strong></div>
            <div><small>Hits</small><strong>−{liveMetrics.hitCost}</strong></div>
            <div><small>Bank</small><strong>£{(liveMetrics.effectiveBankTenths / 10).toFixed(1)}m</strong></div>
            <div><small>xPts</small><strong>{liveMetrics.projectedGwXp.toFixed(1)}</strong></div>
          </div>
          {subSourceId !== null && <div className="manual-swap-notice" role="status">Swap {playerMap.get(subSourceId)?.name} with a highlighted {currentLineup.starters.includes(subSourceId) ? 'bench player' : 'starter'} <button type="button" onClick={() => setSubSourceId(null)}>Cancel</button></div>}
          <div className="vx-tp-pitch vx-soccer-pitch">
            <div className="vx-pitch-top-boards"><div className="vx-pitch-board"><img src={BRAND_LION_SRC} alt=""/><span>FPL VORTEX</span></div></div>
            <div className="vx-pitch-turf vx-tp-turf">
              <div className="vx-pitch-lines" aria-hidden="true"><span className="vx-pitch-box-18"/><span className="vx-pitch-box-6"/><span className="vx-pitch-halfway"/><span className="vx-pitch-circle"/></div>
              <div className="vx-tp-formation">{(['GKP','DEF','MID','FWD'] as const).map(pos => <div className="vx-tp-pitch-row" key={pos}>{currentLineup.starters.filter(id => playerMap.get(id)?.position === pos).map(id => renderPitchSlot(id))}</div>)}</div>
              <div className="vx-tp-bench-tray">{currentLineup.bench.map((id, i) => <div className="vx-tp-bench-col" key={id}><span className="vx-tp-bench-pos">{i === 0 ? 'GK' : `Bench ${i}`}</span>{renderPitchSlot(id, true)}</div>)}</div>
            </div>
          </div>
          <div className="manual-plan-chips" aria-label="Manual chips">{CHIP_ORDER.map(chip => <button type="button" key={chip} className={classNames('button button--ghost', activeChip === chip && 'is-active')} aria-pressed={activeChip === chip} onClick={() => handleToggleChip(chip)}>{CHIP_LABEL[chip]}</button>)}</div>
          <div className="manual-plan-actions">
            <button type="button" className="button button--ghost" disabled={!undoHistory.current.length} onClick={() => { const previous = undoHistory.current.pop(); if (previous) { setActivePlanState(previous); clearPending(); } }}>Undo</button>
            <button type="button" className="button button--ghost" onClick={handleResetGwTransfers}>Reset GW</button>
            <label>Bank £m<input aria-label="Starting bank millions" type="number" min="0" step="0.1" value={activePlan.baseBankTenths / 10} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) setActivePlan({ ...activePlan, baseBankTenths: Math.round(v * 10) }); }}/></label>
            <label>FT<select aria-label="Manual starting free transfers" value={activePlan.baseFreeTransfers} onChange={e => setActivePlan({ ...activePlan, baseFreeTransfers: Number(e.target.value) })}>{[0,1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
          </div>
        </div>
        <aside className="manual-plan-advice">
          <section className="panel" aria-label="Assistant Manager"><div className="panel__header"><h3>Assistant Manager</h3></div>
            {[['Captain', currentLineup.captain], ['Vice-captain', currentLineup.vice]].map(([label, id]) => <div className="manual-advice-row" key={label}>{typeof id === 'number' && advicePlayer(id)}<div><strong>{label}</strong><span>{typeof id === 'number' ? xpAt(planCtx, id, gwIdx).toFixed(2) : '—'} model xPts</span></div></div>)}
            <div className="manual-captain-controls">{(['captain', 'vice'] as const).map(role => <label key={role}>{role === 'captain' ? 'Captain' : 'Vice'}<select aria-label={`Manual ${role}`} value={currentLineup[role] ?? ''} onChange={e => {
              const id = Number(e.target.value), other = role === 'captain' ? 'vice' : 'captain';
              const otherId = currentLineup[other] === id ? currentLineup[role] : currentLineup[other];
              setActivePlan({ ...activePlan, captains: { ...activePlan.captains, [safeSelectedGw]: { [role]: id, [other]: otherId } } });
            }}>{currentLineup.starters.map(id => <option key={id} value={id}>{playerMap.get(id)?.name}</option>)}</select></label>)}</div>
          </section>
          <section className="panel" aria-label="Director of Football"><div className="panel__header"><h3>Director of Football</h3></div>
            {manualSuggestions.map(({horizon, move}, index) => <div className="manual-director-row" key={index}>
              {move ? <>{advicePlayer(move.out)}<ArrowRight size={18} aria-label="to"/>{advicePlayer(move.in)}<div><strong>+{move.gain.toFixed(2)} xPts</strong><small>{horizon} GW · before hits</small></div></> : <span>No shortlisted upgrade · {horizon} GW</span>}
            </div>)}
          </section>
        </aside>
      </div>
      <PlannerOverview mode="fixtures" snapshot={snapshot} squad={[]} />
      {pendingNavigation && <PlanDraftDialog onCancel={() => setPendingNavigation(null)} onDiscard={() => { const id = pendingNavigation; setPendingNavigation(null); changeManualPlan(id); }} />}
    </section>;
  }

  const modalNode = (
    <div
      className="vx-tp-overlay"
      data-testid="vx-transfer-plans-modal"
      role="dialog"
      aria-modal="true"
      aria-label={view === 'list' ? 'Transfer plans' : activePlan?.name ?? 'Transfer plan editor'}
    >
      {/* ==================== VIEW 1: IMAGE 1 — TRANSFER PLANS SLOTS ==================== */}
      {view === 'list' && (
        <div className="vx-tp-list-shell">
          <header className="vx-tp-list-topbar">
            <div className="vx-tp-brand-line">
              <img src={BRAND_LION_SRC} alt="" width={28} height={28} className="vx-tp-brand-lion" />
              <strong className="vx-tp-brand-title">FPL VORTEX</strong>
              <span className="vx-tp-brand-dot" aria-hidden="true">·</span>
              <span className="vx-tp-team-label">
                {entry ? `Team ID ${entry.id}` : 'Template Squad'}
              </span>
            </div>
            <button
              type="button"
              className="vx-tp-close-window"
              onClick={onClose}
              aria-label="Close transfer plans window"
            >
              <ArrowLeft size={15} />
              <span>Back to Planner</span>
            </button>
          </header>

          <section className="vx-tp-plans-panel" aria-label="Saved transfer plans">
            <div className="vx-tp-plans-head">
              <div>
                <h2>Transfer plans</h2>
                <p>
                  {plans.length} of {MAX_TRANSFER_PLAN_SLOTS} plan slots used
                </p>
              </div>
              <button
                type="button"
                className="vx-tp-new-btn"
                data-testid="vx-tp-new-plan"
                onClick={handleCreateNewPlan}
                disabled={plans.length >= MAX_TRANSFER_PLAN_SLOTS}
              >
                <span>New</span>
                <Plus size={17} strokeWidth={2.5} />
              </button>
            </div>

            {plans.length === 0 ? (
              <div
                role="button"
                tabIndex={0}
                className="vx-tp-empty-box"
                onClick={handleCreateNewPlan}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCreateNewPlan();
                  }
                }}
              >
                <span className="vx-tp-empty-icon" aria-hidden="true">
                  <span className="vx-tp-empty-icon__circle">
                    <Plus size={16} strokeWidth={3} />
                  </span>
                </span>
                <h3>Create your first plan</h3>
                <p>
                  Import your current squad, then map transfers across the upcoming gameweeks.
                </p>
              </div>
            ) : (
              <div className="vx-tp-saved-grid">
                {plans.map((plan) => {
                  const totalMoves = Object.values(plan.transfers).reduce((sum, list) => sum + list.length, 0);
                  const chipsList = Object.entries(plan.chips);
                  const ctxPreview = buildPlanCtxFromCache(plan, players, vortexCache);
                  const previewMetrics = computeLiveGwMetrics({
                    ctx: ctxPreview,
                    plan,
                    gw: plan.startGw,
                    pendingOutIds: [],
                    benchmarkXp: vortexCache.benchmarkOptimalXpByGw.get(plan.startGw) ?? 62,
                  });

                  return (
                    <article key={plan.id} className="vx-tp-saved-card">
                      <div
                        role="button"
                        tabIndex={0}
                        className="vx-tp-saved-card__main"
                        onClick={() => openEditorWithPlan(plan)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openEditorWithPlan(plan);
                          }
                        }}
                      >
                        <div className="vx-tp-saved-card__title-row">
                          <h3>{plan.name}</h3>
                          <span className="badge badge--mint">GW{plan.startGw}+</span>
                        </div>
                        <div className="vx-tp-saved-card__stats">
                          <span>{totalMoves} transfer{totalMoves === 1 ? '' : 's'}</span>
                          <span>·</span>
                          <span>Bank £{(previewMetrics.effectiveBankTenths / 10).toFixed(1)}m</span>
                          <span>·</span>
                          <span>GW{plan.startGw} {Math.round(previewMetrics.projectedGwXp)} xP ({previewMetrics.ratingPct}%)</span>
                          {chipsList.length > 0 && (
                            <>
                              <span>·</span>
                              <span>
                                {chipsList.map(([gw, ch]) => `${ch.toUpperCase()} GW${gw}`).join(', ')}
                              </span>
                            </>
                          )}
                        </div>
                        <small className="vx-tp-saved-card__date">
                          Updated {new Date(plan.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                        </small>
                      </div>
                      <div className="vx-tp-saved-card__actions">
                        <button
                          type="button"
                          className="vx-tp-icon-btn"
                          onClick={() => openEditorWithPlan(plan)}
                          title="Open plan"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="vx-tp-icon-btn"
                          onClick={() => handleDuplicatePlan(plan)}
                          disabled={plans.length >= MAX_TRANSFER_PLAN_SLOTS}
                          title="Duplicate plan"
                          aria-label={`Duplicate ${plan.name}`}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          className="vx-tp-icon-btn is-danger"
                          onClick={() => handleDeletePlan(plan)}
                          title="Delete plan"
                          aria-label={`Delete ${plan.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ==================== VIEW 2 & 3: IMAGE 2 & IMAGE 3 — TRANSFER PLAN WORKSPACE ==================== */}
      {view === 'editor' && activePlan && planCtx && replayState && currentLineup && (
        <div className="vx-tp-editor-shell" data-testid="vx-tp-editor-view">
          <header className="vx-tp-editor-topbar">
            <button
              type="button"
              className="vx-tp-save-exit-btn"
              onClick={() => handleSaveCurrentPlan(true)}
            >
              <ChevronLeft size={16} />
              <span>Save &amp; Exit</span>
            </button>

            <div className="vx-tp-title-pill">
              {editingName ? (
                <form noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    const clean = nameInput.trim() || activePlan.name;
                    setActivePlan({ ...activePlan, name: clean });
                    setNameInput(clean);
                    setEditingName(false);
                  }}
                >
                  <input
                    ref={nameInputRef}
                    type="text"
                    maxLength={60}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onBlur={() => {
                      const clean = nameInput.trim() || activePlan.name;
                      setActivePlan({ ...activePlan, name: clean });
                      setNameInput(clean);
                      setEditingName(false);
                    }}
                    aria-label="Plan title"
                    className="vx-tp-title-input"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  className="vx-tp-title-btn"
                  onClick={() => {
                    setNameInput(activePlan.name);
                    setEditingName(true);
                  }}
                  title="Rename transfer plan"
                >
                  <strong>{activePlan.name}</strong>
                  <Pencil size={14} />
                </button>
              )}
            </div>

            <button
              type="button"
              className="vx-tp-save-btn"
              onClick={() => handleSaveCurrentPlan(false)}
            >
              <Save size={15} />
              <span>Save</span>
            </button>
            <button
              type="button"
              className="vx-tp-close-window"
              onClick={onClose}
              aria-label="Close transfer plans window"
              title="Close editor without saving unsaved edits"
            >
              <X size={17} />
            </button>
          </header>

          <div className="vx-tp-workspace-grid">
            {/* LEFT PANEL: KPI CARDS + GW SELECTOR + VORTEX PITCH */}
            <section className="vx-tp-left-panel" aria-label="Squad pitch and gameweek controls">
              <div className="vx-tp-kpi-row">
                <div className="vx-tp-kpi-box">
                  <span>TRANSFERS</span>
                  <strong>
                    {liveMetrics.transfersUsed} /{' '}
                    {activeChip === 'wc' || activeChip === 'fh' ? '∞' : liveMetrics.freeTransfers}
                  </strong>
                </div>
                <div className="vx-tp-kpi-box">
                  <span>COST</span>
                  <strong className={classNames(liveMetrics.hitCost > 0 && 'is-hit')}>
                    {liveMetrics.hitCost > 0 ? `-${liveMetrics.hitCost}` : '0'}
                  </strong>
                </div>
                <div className="vx-tp-kpi-box">
                  <span>BANK</span>
                  <strong className={classNames(liveMetrics.effectiveBankTenths < 0 && 'is-hit')}>
                    {(liveMetrics.effectiveBankTenths / 10).toFixed(1)}
                  </strong>
                </div>
                <div className="vx-tp-kpi-box">
                  <span>XP / RATING</span>
                  <strong>
                    {Math.round(liveMetrics.projectedGwXp)}{' '}
                    <em className="vx-tp-rating-accent">/ {liveMetrics.ratingPct}%</em>
                  </strong>
                </div>
              </div>

              <div className="vx-tp-gw-nav">
                <div className="vx-tp-more-wrap" ref={moreMenuRef}>
                  <button
                    type="button"
                    className="vx-tp-nav-icon-btn"
                    onClick={() => setMoreMenuOpen((v) => !v)}
                    aria-label="Plan options and chips"
                    aria-expanded={moreMenuOpen}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {moreMenuOpen && (
                    <div className="vx-tp-more-menu" role="menu">
                      <span className="vx-tp-more-menu__label">GW{safeSelectedGw} Chips</span>
                      <div className="vx-tp-chip-toggles">
                        {CHIP_ORDER.map((chip) => {
                          const isActive = activeChip === chip;
                          return (
                            <button
                              key={chip}
                              type="button"
                              className={classNames('vx-tp-chip-btn', isActive && 'is-active')}
                              onClick={() => handleToggleChip(chip)}
                            >
                              {isActive && <Check size={12} />}
                              <span>{CHIP_LABEL[chip]}</span>
                            </button>
                          );
                        })}
                      </div>
                      <hr />
                      <button type="button" onClick={handleAutoPickXi}>
                        Auto-pick Optimal VORTEX XI
                      </button>
                      <button type="button" onClick={handleResetGwTransfers}>
                        Reset GW{safeSelectedGw} Transfers
                      </button>
                      <button type="button" className="is-danger" onClick={handleResetAllTransfers}>
                        Reset Entire Plan
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="vx-tp-nav-icon-btn"
                  disabled={gwIdx <= 0}
                  onClick={() => changeGw(planCtx.gws[gwIdx - 1])}
                  aria-label="Previous gameweek"
                >
                  <ArrowLeft size={16} />
                </button>

                <label className="vx-tp-gw-select-wrap">
                  <select
                    aria-label="Select planning gameweek"
                    value={safeSelectedGw}
                    onChange={(e) => changeGw(Number(e.target.value))}
                  >
                    {planCtx.gws.map((gw) => {
                      const chipTag = activePlan.chips[gw];
                      const gwMoves = activePlan.transfers[gw]?.length ?? 0;
                      return (
                        <option key={gw} value={gw}>
                          Gameweek {gw}
                          {chipTag ? ` · ${CHIP_LABEL[chipTag]}` : ''}
                          {gwMoves > 0 ? ` (${gwMoves} T)` : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <button
                  type="button"
                  className="vx-tp-nav-icon-btn"
                  disabled={gwIdx >= planCtx.gws.length - 1}
                  onClick={() => changeGw(planCtx.gws[gwIdx + 1])}
                  aria-label="Next gameweek"
                >
                  <ArrowRight size={16} />
                </button>

                <button
                  type="button"
                  className={classNames('vx-tp-nav-icon-btn', badgeMode === 'xp' && 'is-active')}
                  onClick={() => setBadgeMode((m) => (m === 'price' ? 'xp' : 'price'))}
                  title={badgeMode === 'price' ? 'Showing selling price (£) — click for VORTEX xP' : 'Showing VORTEX xP — click for selling price (£)'}
                  aria-label="Toggle price and xP display"
                >
                  {badgeMode === 'price' ? '£' : 'xP'}
                </button>
              </div>

              {(activeChip || subSourceId !== null || pendingOutIds.length > 0) && (
                <div className="vx-tp-status-strip">
                  {activeChip && (
                    <span className="badge badge--mint">{CHIP_LABEL[activeChip]} active in GW{safeSelectedGw}</span>
                  )}
                  {subSourceId !== null && (
                    <span className="vx-tp-status-pill">
                      Swap <strong>{playerMap.get(subSourceId)?.name}</strong> with a highlighted player
                      <button type="button" onClick={() => setSubSourceId(null)}>Cancel</button>
                    </span>
                  )}
                  {pendingOutIds.length > 0 && (
                    <span className="vx-tp-status-pill">
                      Replacing{' '}
                      <strong>
                        {pendingOutIds.map((id) => playerMap.get(id)?.name).filter(Boolean).join(', ')}
                      </strong>{' '}
                      — select from right table
                      <button
                        type="button"
                        onClick={() => {
                          setPendingOutIds([]);
                          setFocusedPendingOutId(null);
                          setPosFilter('ALL');
                        }}
                      >
                        Undo
                      </button>
                    </span>
                  )}
                </div>
              )}

              {/* FPL VORTEX PITCH */}
              <div className="vx-tp-pitch">
                <div className="vx-pitch-top-boards">
                  <div className="vx-pitch-board">
                    <img src={BRAND_LION_SRC} alt="" />
                    <span>FPL VORTEX</span>
                  </div>
                  <div className="vx-pitch-goal-net" aria-hidden="true" />
                  <a
                    href="https://www.youtube.com/@Fplvortex"
                    target="_blank"
                    rel="noreferrer"
                    className="vx-pitch-board vx-pitch-board--link"
                  >
                    @FPLVORTEX
                  </a>
                </div>

                <div className="vx-pitch-turf vx-tp-turf">
                  <div className="vx-pitch-lines" aria-hidden="true">
                    <span className="vx-pitch-box-18" />
                    <span className="vx-pitch-box-6" />
                    <span className="vx-pitch-halfway" />
                    <span className="vx-pitch-circle" />
                  </div>

                  <div className="vx-tp-formation">
                    {(['GKP', 'DEF', 'MID', 'FWD'] as const).map((pos) => (
                      <div className="vx-tp-pitch-row" key={pos}>
                        {currentLineup.starters
                          .filter((id) => playerMap.get(id)?.position === pos)
                          .map((id) => renderPitchSlot(id, false))}
                      </div>
                    ))}
                  </div>

                  <div className="vx-tp-bench-tray">
                    {currentLineup.bench.map((id, bIdx) => {
                      const bp = playerMap.get(id);
                      const label = bIdx === 0 ? 'GK' : SHORT_POS_LABEL[bp?.position ?? 'MID'];
                      return (
                        <div key={`bench-col-${id}`} className="vx-tp-bench-col">
                          <span className="vx-tp-bench-pos">{label}</span>
                          {renderPitchSlot(id, true)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT PANEL: VORTEX PLAYERS (HIGH XPTS + NEXT 5 FDR), TICKER, GW SUMMARY, SOLVER */}
            <section className="vx-tp-right-panel" aria-label="Player selection and fixture intelligence">
              <div className="vx-tp-main-tabs" role="tablist" aria-label="Planner tools">
                {(
                  [
                    ['players', 'Players'],
                    ['ticker', 'Ticker'],
                    ['summary', 'GW Summary'],
                    ['solver', 'Solver'],
                  ] as const
                ).map(([tabId, label]) => (
                  <button
                    key={tabId}
                    type="button"
                    role="tab"
                    aria-selected={rightTab === tabId}
                    className={classNames(rightTab === tabId && 'is-active')}
                    onClick={() => setRightTab(tabId)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ---------------- TAB: PLAYERS / WATCHLIST / TRANSFER LAB ---------------- */}
              {rightTab === 'players' && (
                <>
                  <div className="vx-tp-sub-tabs" role="group" aria-label="Players sub-views">
                    <button
                      type="button"
                      className={classNames(playersSubTab === 'all' && 'is-active')}
                      onClick={() => setPlayersSubTab('all')}
                    >
                      Players
                    </button>
                    <button
                      type="button"
                      className={classNames(playersSubTab === 'watchlist' && 'is-active')}
                      onClick={() => setPlayersSubTab('watchlist')}
                    >
                      Watchlist{watchlistIds.length > 0 ? ` (${watchlistIds.length})` : ''}
                    </button>
                    <button
                      type="button"
                      className={classNames(playersSubTab === 'lab' && 'is-active')}
                      onClick={() => setPlayersSubTab('lab')}
                    >
                      <FlaskConical size={13} />
                      <span>Transfer Lab</span>
                    </button>
                  </div>

                  {playersSubTab !== 'lab' ? (
                    <>
                      <div className="vx-tp-filters">
                        <div className="vx-tp-filter-block">
                          <span className="vx-tp-filter-label">PLAYER TYPE</span>
                          <div className="vx-tp-pos-pills" role="group" aria-label="Player type">
                            {POS_BUTTONS.map((btn) => (
                              <button
                                key={btn.id}
                                type="button"
                                className={classNames(posFilter === btn.id && 'is-active')}
                                onClick={() => setPosFilter(btn.id)}
                                aria-pressed={posFilter === btn.id}
                              >
                                {btn.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="vx-tp-filter-grid-2">
                          <div className="vx-tp-filter-block">
                            <div className="vx-tp-filter-head">
                              <span className="vx-tp-filter-label">TEAM</span>
                              <button type="button" onClick={() => setTeamFilter('ALL')}>Reset</button>
                            </div>
                            <select
                              aria-label="Filter by team"
                              value={teamFilter}
                              onChange={(e) => setTeamFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                            >
                              <option value="ALL">All teams</option>
                              {[...snapshot.teams]
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div className="vx-tp-filter-block">
                            <div className="vx-tp-filter-head">
                              <span className="vx-tp-filter-label">MAX PRICE</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setMaxPriceWhole(16);
                                  setMaxPriceTenths(0);
                                }}
                              >
                                Reset
                              </button>
                            </div>
                            <div className="vx-tp-price-pair">
                              <select
                                aria-label="Max price pounds"
                                value={maxPriceWhole}
                                onChange={(e) => setMaxPriceWhole(Number(e.target.value))}
                              >
                                {[16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                              <select
                                aria-label="Max price tenths"
                                value={maxPriceTenths}
                                onChange={(e) => setMaxPriceTenths(Number(e.target.value))}
                              >
                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="vx-tp-filter-grid-3">
                          <div className="vx-tp-filter-block">
                            <div className="vx-tp-filter-head">
                              <span className="vx-tp-filter-label">PLAYER NAME</span>
                              <button type="button" onClick={() => setSearchQuery('')}>Reset</button>
                            </div>
                            <input
                              type="search"
                              placeholder="Search"
                              aria-label="Search player name"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                            />
                          </div>

                          <div className="vx-tp-filter-block">
                            <div className="vx-tp-filter-head">
                              <span className="vx-tp-filter-label">SET PIECES</span>
                              <button type="button" onClick={() => setSetPieceFilter('any')}>Reset</button>
                            </div>
                            <select
                              aria-label="Filter by set pieces"
                              value={setPieceFilter}
                              onChange={(e) => setSetPieceFilter(e.target.value as SetPieceFilter)}
                            >
                              <option value="any">Any player</option>
                              <option value="all_sp">Any set piece</option>
                              <option value="pen">Penalties (P)</option>
                              <option value="fk">Free kicks (FK)</option>
                              <option value="ck">Corners (CK)</option>
                            </select>
                          </div>

                          <div className="vx-tp-filter-block">
                            <div className="vx-tp-filter-head">
                              <span className="vx-tp-filter-label">SORT BY</span>
                              <button type="button" onClick={() => setSortBy('xp_gw_desc')}>Reset</button>
                            </div>
                            <select
                              aria-label="Sort players by"
                              value={sortBy}
                              onChange={(e) => setSortBy(e.target.value as RightSortKey)}
                            >
                              <option value="xp_gw_desc">xP GW{safeSelectedGw} (desc)</option>
                              <option value="xp_5gw_desc">xP Next 5 (desc)</option>
                              <option value="fdr_5gw_asc">FDR Next 5 (easiest)</option>
                              <option value="fdr_5gw_desc">FDR Next 5 (hardest)</option>
                              <option value="price_desc">Price (desc)</option>
                              <option value="price_asc">Price (asc)</option>
                              <option value="owned_desc">Owned % (desc)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="vx-tp-table-wrap">
                        <table className="vx-tp-players-table">
                          <thead>
                            <tr>
                              <th className="is-player-col">PLAYER</th>
                              <th>
                                <button
                                  type="button"
                                  onClick={() => setSortBy('owned_desc')}
                                >
                                  Owned{sortBy === 'owned_desc' ? ' ↓' : ''}
                                </button>
                              </th>
                              <th>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSortBy((prev) =>
                                      prev === 'xp_gw_desc' ? 'xp_5gw_desc' : 'xp_gw_desc',
                                    )
                                  }
                                >
                                  {sortBy === 'xp_5gw_desc' ? 'xP 5GW ↓' : `xP GW${safeSelectedGw}`}
                                  {sortBy === 'xp_gw_desc' ? ' ↓' : ''}
                                </button>
                              </th>
                              <th>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSortBy((prev) =>
                                      prev === 'price_desc' ? 'price_asc' : 'price_desc',
                                    )
                                  }
                                >
                                  £{sortBy === 'price_desc' ? ' ↓' : sortBy === 'price_asc' ? ' ↑' : ''}
                                </button>
                              </th>
                              <th className="is-next5-col">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSortBy((prev) =>
                                      prev === 'fdr_5gw_asc' ? 'fdr_5gw_desc' : 'fdr_5gw_asc',
                                    )
                                  }
                                  title="Sort by VORTEX Next 5 average fixture difficulty"
                                >
                                  NEXT 5
                                  {sortBy === 'fdr_5gw_asc' ? ' ↑' : sortBy === 'fdr_5gw_desc' ? ' ↓' : ' ↕'}
                                </button>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredSortedPlayers.slice(0, visibleLimit).map((p) => {
                              const gwXp = vortexCache.xpByPlayerGw.get(p.id)?.[cacheGwIdx] ?? p.projection;
                              const next5Xp = (vortexCache.xpByPlayerGw.get(p.id) ?? [])
                                .slice(cacheGwIdx, cacheGwIdx + 5)
                                .reduce((s, v) => s + v, 0);
                              const next5 = teamNext5Map.get(p.teamId);
                              const inSquad = squadSet.has(p.id) && !pendingSet.has(p.id);
                              const isPendingOutgoing = pendingSet.has(p.id);
                              const hasFlag = p.status !== 'a' || (p.chance !== null && p.chance < 100);
                              const isWatched = watchlistIds.includes(p.id);
                              const activeTargetOutId =
                                focusedPendingOutId && pendingOutIds.includes(focusedPendingOutId)
                                  ? focusedPendingOutId
                                  : pendingOutIds[0] ?? null;
                              const replacementError =
                                activeTargetOutId !== null && planCtx && replayState
                                  ? validatePendingReplacement({
                                      ctx: planCtx,
                                      stateSquad: replayState.squad,
                                      effectiveBankTenths: liveMetrics.effectiveBankTenths,
                                      pendingOutIds,
                                      outId: activeTargetOutId,
                                      inId: p.id,
                                    })
                                  : null;
                              const overBudgetWhenReplacing =
                                activeTargetOutId !== null && !isPendingOutgoing && replacementError !== null;

                              return (
                                <tr
                                  key={p.id}
                                  data-tp-row-player={p.id}
                                  data-tp-eligible={
                                    activeTargetOutId !== null && !isPendingOutgoing && !inSquad && replacementError === null
                                      ? 'true'
                                      : 'false'
                                  }
                                  className={classNames(
                                    'vx-tp-player-row',
                                    inSquad && 'is-in-squad',
                                    isPendingOutgoing && 'is-pending-out',
                                    overBudgetWhenReplacing && 'is-over-budget',
                                  )}
                                  onClick={() => handleSelectIncomingPlayer(p)}
                                >
                                  <td className="is-player-col">
                                    <div className="vx-tp-row-player">
                                      <button
                                        type="button"
                                        className={classNames('vx-tp-info-btn', hasFlag && 'is-flagged')}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (hasFlag && onInspectInjury) onInspectInjury(p);
                                          else onInspectPlayer?.(p);
                                        }}
                                        aria-label={`Inspect ${p.name}`}
                                        title={hasFlag ? p.news || 'Fitness concern — click for details' : `Open ${p.name} VORTEX card`}
                                      >
                                        {hasFlag ? <AlertCircle size={14} /> : <Info size={14} />}
                                      </button>

                                      <button
                                        type="button"
                                        className={classNames('vx-tp-watch-btn', isWatched && 'is-active')}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleWatchlist(p.id);
                                        }}
                                        aria-label={isWatched ? `Remove ${p.name} from watchlist` : `Add ${p.name} to watchlist`}
                                        title="Toggle watchlist"
                                      >
                                        <Bookmark size={12} />
                                      </button>

                                      <PlayerAvatar
                                        code={p.code}
                                        teamCode={p.team.code}
                                        name={p.name}
                                        fullName={p.fullName}
                                        teamShort={p.team.shortName}
                                        position={p.position}
                                        size="sm"
                                      />

                                      <div className="vx-tp-row-identity">
                                        <strong className={classNames(hasFlag && 'is-flagged')}>
                                          {p.name}
                                          {inSquad && <em className="vx-tp-owned-tag">Squad</em>}
                                          {isPendingOutgoing && <em className="vx-tp-owned-tag is-restore">Restore</em>}
                                        </strong>
                                        <small>
                                          <span>{SHORT_POS_LABEL[p.position]}</span>
                                          <span>{p.team.shortName}</span>
                                          {p.penaltiesOrder === 1 && <b className="vx-tp-sp is-p">P</b>}
                                          {p.freekicksOrder === 1 && <b className="vx-tp-sp is-fk">FK</b>}
                                          {p.cornersOrder === 1 && <b className="vx-tp-sp is-ck">CK</b>}
                                        </small>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="mono-num">{p.ownership.toFixed(1)}%</td>
                                  <td className="mono-num is-xp">
                                    <strong>
                                      {(sortBy === 'xp_5gw_desc' ? next5Xp : gwXp).toFixed(1)}
                                    </strong>
                                  </td>
                                  <td className="mono-num">{p.price.toFixed(1)}</td>
                                  <td className="is-next5-col">
                                    <div
                                      className="vx-tp-next5-strip"
                                      title={
                                        next5?.avgFdr != null
                                          ? `Next 5 VORTEX Avg FDR: ${next5.avgFdr.toFixed(2)}`
                                          : 'No upcoming fixtures'
                                      }
                                    >
                                      {(next5?.items ?? []).map((fx) => (
                                        <span
                                          key={fx.gw}
                                          className={classNames('vx-tp-next5-chip', fx.isBlank && 'is-blank')}
                                          style={fx.fdr === null ? undefined : difficultyFillStyle(fx.fdr)}
                                          title={
                                            fx.isBlank
                                              ? `GW${fx.gw}: Blank`
                                              : `GW${fx.gw}: ${fx.oppName} (${fx.home ? 'H' : 'A'}) · FDR ${fx.fdr?.toFixed(2)}`
                                          }
                                        >
                                          {fx.oppCode ? (
                                            <ClubBadge
                                              teamCode={fx.oppCode}
                                              shortName={fx.oppShort}
                                              teamName={fx.oppName}
                                              size="sm"
                                            />
                                          ) : null}
                                          <b>{fx.isBlank ? '—' : fx.home ? fx.oppShort : fx.oppShort.toLowerCase()}</b>
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {filteredSortedPlayers.length === 0 && (
                          <p className="vx-tp-empty-rows">
                            {playersSubTab === 'watchlist'
                              ? 'Your watchlist is empty. Click the bookmark icon next to any player to save them here.'
                              : 'No players match the current filters.'}
                          </p>
                        )}

                        {filteredSortedPlayers.length > visibleLimit && (
                          <button
                            type="button"
                            className="vx-tp-load-more"
                            onClick={() => setVisibleLimit((n) => n + 40)}
                          >
                            Show more players ({filteredSortedPlayers.length - visibleLimit} remaining)
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    /* TRANSFER LAB SUB-VIEW */
                    <div className="vx-tp-scroll-pane">
                      <div className="vx-tp-pane-card">
                        <h3>Best Single Upgrades Now (GW{safeSelectedGw})</h3>
                        <p>
                          Highest VORTEX xPts gain over the next {labHorizon} gameweeks within your £
                          {(replayState.bank / 10).toFixed(1)}m bank.
                        </p>
                        {singleTopMoves.length === 0 ? (
                          <p className="vx-tp-muted-box">No immediate single-transfer upgrade beats holding.</p>
                        ) : (
                          <ul className="vx-tp-move-list">
                            {singleTopMoves.map((m) => {
                              const outP = playerMap.get(m.out);
                              const inP = playerMap.get(m.in);
                              if (!outP || !inP) return null;
                              return (
                                <li key={`${m.out}-${m.in}`}>
                                  <div>
                                    <span className="is-out">{outP.name}</span> →{' '}
                                    <strong className="is-in">{inP.name}</strong>{' '}
                                    <small>({inP.team.shortName} · £{inP.price.toFixed(1)}m)</small>
                                  </div>
                                  <div className="vx-tp-move-right">
                                    <span className="badge badge--mint">+{m.gain.toFixed(1)} xP</span>
                                    <button
                                      type="button"
                                      className="vx-tp-apply-sm"
                                      onClick={() => {
                                        const existingMoves = activePlan.transfers[safeSelectedGw] ?? [];
                                        const collapsed = collapseGwTransfers(existingMoves, m.out, m.in);
                                        const nextOrder = [
                                          ...currentLineup.starters,
                                          ...currentLineup.bench,
                                        ].map((id) => (id === m.out ? m.in : id));
                                        setActivePlan({
                                          ...activePlan,
                                          transfers: sanitize(
                                            planCtx,
                                            { ...activePlan.transfers, [safeSelectedGw]: collapsed },
                                            activePlan.chips,
                                          ),
                                          lineups: { ...activePlan.lineups, [safeSelectedGw]: nextOrder },
                                          updatedAt: new Date().toISOString(),
                                        });
                                        setPendingOutIds([]);
                                        onToast(`Applied ${outP.name} → ${inP.name} in GW${safeSelectedGw}.`, 'success');
                                      }}
                                    >
                                      Apply
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ---------------- TAB: VORTEX NEXT-5+ FDR TICKER ---------------- */}
              {rightTab === 'ticker' && (() => {
                const tickerGws = planCtx.gws.slice(tickerStartOffset, tickerStartOffset + 5);
                const squadClubsCount = new Map<number, number>();
                for (const id of replayState.squad) {
                  const p = playerMap.get(id);
                  if (p) squadClubsCount.set(p.teamId, (squadClubsCount.get(p.teamId) ?? 0) + 1);
                }
                const tickerRows = snapshot.teams
                  .filter((t) => !tickerMineOnly || squadClubsCount.has(t.id))
                  .map((team) => {
                    const fxData = getNextFixturesWithVortexFdr(
                      vortexCache,
                      team.id,
                      tickerGws[0] ?? safeSelectedGw,
                      tickerGws.length,
                    );
                    return { team, ...fxData };
                  })
                  .sort((a, b) =>
                    tickerSort === 'ease'
                      ? (a.avgFdr ?? 9) - (b.avgFdr ?? 9) || a.team.shortName.localeCompare(b.team.shortName)
                      : a.team.name.localeCompare(b.team.name),
                  );

                return (
                  <div className="vx-tp-scroll-pane">
                    <div className="vx-tp-ticker-toolbar">
                      <div className="vx-tp-ticker-nav">
                        <button
                          type="button"
                          className="vx-tp-nav-icon-btn"
                          disabled={tickerStartOffset <= 0}
                          onClick={() => setTickerStartOffset((n) => Math.max(0, n - 1))}
                          aria-label="Earlier ticker gameweeks"
                        >
                          <ArrowLeft size={14} />
                        </button>
                        <strong>
                          GW{tickerGws[0]}–GW{tickerGws[tickerGws.length - 1]}
                        </strong>
                        <button
                          type="button"
                          className="vx-tp-nav-icon-btn"
                          disabled={tickerStartOffset + 5 >= planCtx.gws.length}
                          onClick={() => setTickerStartOffset((n) => n + 1)}
                          aria-label="Later ticker gameweeks"
                        >
                          <ArrowRight size={14} />
                        </button>
                      </div>

                      <div className="vx-tp-ticker-opts">
                        <button
                          type="button"
                          className={classNames('vx-tp-pill-toggle', tickerSort === 'ease' && 'is-active')}
                          onClick={() => setTickerSort('ease')}
                        >
                          Easiest FDR
                        </button>
                        <button
                          type="button"
                          className={classNames('vx-tp-pill-toggle', tickerSort === 'az' && 'is-active')}
                          onClick={() => setTickerSort('az')}
                        >
                          A–Z
                        </button>
                        <label className="vx-tp-check">
                          <input
                            type="checkbox"
                            checked={tickerMineOnly}
                            onChange={(e) => setTickerMineOnly(e.target.checked)}
                          />
                          <span>My clubs</span>
                        </label>
                      </div>
                    </div>

                    <div className="vx-tp-table-wrap">
                      <table className="vx-tp-ticker-table">
                        <thead>
                          <tr>
                            <th>TEAM</th>
                            {tickerGws.map((g) => (
                              <th key={g}>GW{g}</th>
                            ))}
                            <th>AVG</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tickerRows.map(({ team, items, avgFdr }) => (
                            <tr key={team.id}>
                              <td>
                                <div className="vx-tp-ticker-club">
                                  <ClubBadge teamCode={team.code} shortName={team.shortName} teamName={team.name} size="sm" />
                                  <strong>{team.shortName}</strong>
                                  {squadClubsCount.has(team.id) && (
                                    <span className="vx-tp-club-count">{squadClubsCount.get(team.id)}</span>
                                  )}
                                </div>
                              </td>
                              {items.map((fx) => (
                                <td key={fx.gw}>
                                  <span
                                    className={classNames('vx-tp-ticker-cell', fx.isBlank && 'is-blank')}
                                    style={fx.fdr === null ? undefined : difficultyFillStyle(fx.fdr)}
                                    title={fx.fdr === null ? 'Blank' : `VORTEX FDR ${fx.fdr.toFixed(2)}`}
                                  >
                                    {fx.isBlank ? '—' : fx.home ? fx.oppShort : fx.oppShort.toLowerCase()}
                                  </span>
                                </td>
                              ))}
                              <td>
                                {avgFdr === null ? (
                                  '—'
                                ) : (
                                  <span className="vx-tp-ticker-avg" style={difficultyFillStyle(avgFdr)}>
                                    {avgFdr.toFixed(2)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* ---------------- TAB: GW SUMMARY ---------------- */}
              {rightTab === 'summary' && (() => {
                const ledger = replayState.ledger[replayState.ledger.length - 1];
                const gwMoves = activePlan.transfers[safeSelectedGw] ?? [];
                const capPlayer = currentLineup.captain ? playerMap.get(currentLineup.captain) : null;
                const vicePlayer = currentLineup.vice ? playerMap.get(currentLineup.vice) : null;

                return (
                  <div className="vx-tp-scroll-pane">
                    <div className="vx-tp-pane-card">
                      <h3>GW{safeSelectedGw} Summary</h3>
                      <div className="vx-tp-summary-lines">
                        <div>
                          <span>Chip planned</span>
                          <strong>{activeChip ? CHIP_LABEL[activeChip] : 'None'}</strong>
                        </div>
                        <div>
                          <span>Formation</span>
                          <strong>{currentLineup.formation}</strong>
                        </div>
                        <div>
                          <span>Bank</span>
                          <strong>£{(liveMetrics.effectiveBankTenths / 10).toFixed(1)}m</strong>
                        </div>
                        <div>
                          <span>Free Transfers (GW{safeSelectedGw} → Next)</span>
                          <strong>
                            {ledger ? `${ledger.ftBefore} FT → ${ledger.ftAfter} FT` : `${activePlan.baseFreeTransfers} FT`}
                          </strong>
                        </div>
                        <div>
                          <span>Captain (2×)</span>
                          <strong>{capPlayer?.name ?? '—'}</strong>
                        </div>
                        <div>
                          <span>Vice-Captain</span>
                          <strong>{vicePlayer?.name ?? '—'}</strong>
                        </div>
                        <div>
                          <span>Projected GW{safeSelectedGw} Points</span>
                          <strong className="is-mint">
                            {liveMetrics.projectedGwXp.toFixed(1)} xPts ({liveMetrics.ratingPct}% Rating)
                          </strong>
                        </div>
                      </div>

                      <h4 className="vx-tp-subhead">GW{safeSelectedGw} Planned Transfers</h4>
                      {gwMoves.length === 0 ? (
                        <p className="vx-tp-muted-box">No committed transfers in GW{safeSelectedGw}.</p>
                      ) : (
                        <ul className="vx-tp-move-list">
                          {gwMoves.map((t, i) => {
                            const outP = playerMap.get(t.out);
                            const inP = playerMap.get(t.in);
                            return (
                              <li key={`${t.out}-${t.in}-${i}`}>
                                <div>
                                  <span className="is-out">{outP?.name ?? `#${t.out}`}</span> →{' '}
                                  <strong className="is-in">{inP?.name ?? `#${t.in}`}</strong>
                                </div>
                                <button
                                  type="button"
                                  className="vx-tp-icon-btn"
                                  onClick={() => {
                                    const filtered = gwMoves.filter((_, idx) => idx !== i);
                                    const nextTransfers = { ...activePlan.transfers };
                                    if (filtered.length > 0) nextTransfers[safeSelectedGw] = filtered;
                                    else delete nextTransfers[safeSelectedGw];
                                    setActivePlan({
                                      ...activePlan,
                                      transfers: sanitize(planCtx, nextTransfers, activePlan.chips),
                                      updatedAt: new Date().toISOString(),
                                    });
                                  }}
                                  title="Undo this transfer"
                                >
                                  <RotateCcw size={13} />
                                  <span>Undo</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ---------------- TAB: MULTI-GW VORTEX SOLVER ---------------- */}
              {rightTab === 'solver' && (
                <div className="vx-tp-scroll-pane">
                  <div className="vx-tp-pane-card">
                    <h3>Auto-Optimise Transfer Path (VORTEX Model)</h3>
                    <p>
                      Searches for a legal, high-xPts transfer path (heuristic, not a proven global optimum). Saved transfers and chip selections remain protected; only the chosen lookahead window is planned.
                    </p>
                    <div className="vx-tp-solver-controls">
                      <label>
                        <span>Lookahead</span>
                        <select
                          aria-label="Solver lookahead gameweeks"
                          value={labHorizon}
                          onChange={(e) => setLabHorizon(Number(e.target.value))}
                        >
                          <option value={3}>3 gameweeks</option>
                          <option value={5}>5 gameweeks</option>
                          <option value={8}>8 gameweeks</option>
                          <option value={10}>10 gameweeks</option>
                        </select>
                      </label>
                      <label className="vx-tp-check">
                        <input
                          type="checkbox"
                          checked={labAllowHits}
                          onChange={(e) => setLabAllowHits(e.target.checked)}
                        />
                        <span>Allow -4 hits</span>
                      </label>
                    </div>
                    <button
                      type="button"
                      className="vx-tp-run-solver"
                      onClick={() => {
                        const result = autoPlan(planCtx, activePlan.transfers, {
                          horizon: labHorizon,
                          allowHits: labAllowHits,
                          fromIdx: gwIdx,
                          chips: activePlan.chips,
                        });
                        setLabPreview({ ...result, sourcePlan: JSON.stringify([activePlan.id, activePlan.transfers, activePlan.chips]) });
                      }}
                    >
                      Run VORTEX Solver from GW{safeSelectedGw}
                    </button>

                    {labPreview && (
                      <div className="vx-tp-solver-results">
                        {labPreview.steps.length === 0 ? (
                          <p className="vx-tp-muted-box">
                            No additional legal upgrade cleared the threshold. All saved manual transfers are unchanged; this does not prove rolling is globally optimal.
                          </p>
                        ) : (
                          <>
                            <ul className="vx-tp-move-list">
                              {labPreview.steps.map((s, idx) => (
                                <li key={`${s.gw}-${s.out}-${s.in}-${idx}`}>
                                  <div>
                                    <span className="badge badge--violet">GW{s.gw}</span>{' '}
                                    <span className="is-out">{playerMap.get(s.out)?.name}</span> →{' '}
                                    <strong className="is-in">{playerMap.get(s.in)?.name}</strong>
                                    {s.hit > 0 && <small className="is-hit"> (-{s.hit})</small>}
                                  </div>
                                  <span className="badge badge--mint">+{s.gain.toFixed(1)} xP</span>
                                </li>
                              ))}
                            </ul>
                            <div className="vx-tp-solver-actions">
                              <button
                                type="button"
                                className="vx-tp-save-btn"
                                onClick={() => {
                                  if (labPreview.sourcePlan !== JSON.stringify([activePlan.id, activePlan.transfers, activePlan.chips])) {
                                    setLabPreview(null);
                                    onToast('Manual plan changed since this preview. Rerun the solver before applying.', 'error');
                                    return;
                                  }
                                  const verified = sanitize(planCtx, labPreview.transfers, activePlan.chips);
                                  if (!planCtx.gws.every(gw =>
                                    JSON.stringify(verified[gw] ?? []) === JSON.stringify(labPreview.transfers[gw] ?? [])
                                  )) {
                                    setLabPreview(null);
                                    onToast('Solver preview is stale or no longer legal. No manual decisions were changed.', 'error');
                                    return;
                                  }
                                  setActivePlan({
                                    ...activePlan,
                                    transfers: verified,
                                    updatedAt: new Date().toISOString(),
                                  });
                                  setPendingOutIds([]);
                                  setLabPreview(null);
                                  onToast('Applied legal suggestions without overwriting saved manual transfers.', 'success');
                                }}
                              >
                                Apply Plan
                              </button>
                              <button
                                type="button"
                                className="vx-tp-save-exit-btn"
                                onClick={() => setLabPreview(null)}
                              >
                                Discard
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
}


