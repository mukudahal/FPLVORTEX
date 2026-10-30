import { ForecastTile } from './ForecastTile';
import { SaveTableButton } from './SaveTableButton';
import type { PngTable } from '../lib/tablePng';
import { buildFixturePngTables } from '../lib/fixturePng';
import { makeFixtureForecasts } from '../lib/fixtureForecast';
import { useDeferredValue, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Check,
  CircleDollarSign,
  Copy,
  Crown,
  Dices,
  Gauge,
  Layers,
  Lock,
  LockOpen,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  WandSparkles,
} from 'lucide-react';
import type {
  EnrichedPlayer,
  EntryData,
  FixtureRow,
  Position,
  RiskProfile,
  Snapshot,
  SquadPlayer,
  SquadResult,
} from '../lib/types';
import { parsePlayerInjuryDetails, toRepoElement } from '../lib/analytics';
import { toRepoFixtures, toRepoTeams } from '../lib/fixtures';
import { classNames, formatPercent, formatPrice } from '../lib/format';
import { evaluateSquad, formationRisk, MAX_PLAYERS_PER_CLUB, optimizeSquad } from '../lib/optimize';
import type { PlannerSimulationInput, PlannerSimulationOutput } from '../lib/repoModel/compassPlanner';
import { ClubBadge } from './ClubBadge';
import { PlayerAvatar } from './PlayerAvatar';
import { PlannerOverview } from './PlannerOverview';
import { StatCard } from './StatCard';

interface SquadBuilderProps {
  snapshot: Snapshot;
  players: EnrichedPlayer[];
  fixtureRows: FixtureRow[];
  entry?: EntryData | null;
  profile: RiskProfile;
  onProfileChange: (profile: RiskProfile) => void;
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onInspectPlayer?: (player: EnrichedPlayer) => void;
  onInspectInjury?: (player: EnrichedPlayer) => void;
}

type OptimizerSubTab = 'planner' | 'chips' | 'montecarlo';
type PoolSortKey = 'optaXP5Gw' | 'projection' | 'horizon5' | 'easeSum5' | 'price' | 'ownership' | 'totalPoints' | 'name';

const DEFAULT_TEMPLATE_SQUAD = [1, 31, 332, 173, 40, 154, 427, 124, 165, 411, 346, 623, 115, 112, 289];

const PROFILES: Array<{ id: RiskProfile; label: string; hint: string; icon: ReactNode }> = [
  { id: 'balanced', label: 'Balanced (1.0× Repo)', hint: 'Exact unmodified repository xPts', icon: <Gauge size={15} /> },
  { id: 'safe', label: 'Safe Floor', hint: 'Availability & high-EO floor protection', icon: <ShieldCheck size={15} /> },
  { id: 'differential', label: 'Differential', hint: '1 + 0.15 × (1 − EO) anti-template boost', icon: <Sparkles size={15} /> },
  { id: 'upside', label: 'Ceiling', hint: 'Goal, assist & bonus upside weighting', icon: <WandSparkles size={15} /> },
];

const CHIP_META: Record<string, { label: string; badge: string; tone: string }> = {
  wildcard: { label: 'Wildcard', badge: 'WC', tone: 'mint' },
  freehit: { label: 'Free Hit', badge: 'FH', tone: 'violet' },
  bboost: { label: 'Bench Boost', badge: 'BB', tone: 'blue' },
  '3xc': { label: 'Triple Captain', badge: 'TC', tone: 'pink' },
};

function Constraint({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={classNames('constraint', ok && 'is-ok')}>
      <span>{ok ? <Check size={13} /> : <AlertTriangle size={13} />}</span>
      {children}
    </div>
  );
}

function buildSquadText(result: SquadResult, label: string): string {
  const lines = [
    `FPL VORTEX (${label}) · ${result.formation} · ${result.projectedPoints.toFixed(1)} projected pts · £${result.cost.toFixed(1)}m`,
    'STARTERS',
    ...result.starters.map(
      (player) =>
        `${player.position} ${player.name} (${player.team.shortName}) ${player.projection.toFixed(2)} xPts ${player.isCaptain ? '[C]' : ''}${player.isViceCaptain ? '[VC]' : ''}`,
    ),
    'BENCH',
    ...result.bench.map((player) => `${player.position} ${player.name} (${player.team.shortName}) ${player.projection.toFixed(2)} xPts`),
  ];
  return lines.join('\n');
}

interface PitchPlayerCardProps {
  player: SquadPlayer;
  locked: boolean;
  selectedForSwap: boolean;
  onToggleLock: (id: number) => void;
  onSelectForSwap: (id: number) => void;
  onInspectPlayer?: (player: EnrichedPlayer) => void;
  onInspectInjury?: (player: EnrichedPlayer) => void;
  compact?: boolean;
}

function PitchPlayerCard({
  player,
  locked,
  selectedForSwap,
  onToggleLock,
  onSelectForSwap,
  onInspectPlayer,
  onInspectInjury,
  compact = false,
}: PitchPlayerCardProps) {
  const hasFlag = player.status !== 'a' || (player.chance !== null && player.chance < 100);
  const injuryInfo = hasFlag ? parsePlayerInjuryDetails(player) : null;

  return (
    <article
      className={classNames(
        'pitch-player',
        compact && 'pitch-player--compact',
        !player.isStarter && 'is-bench',
        selectedForSwap && 'is-selected-swap',
      )}
      onClick={() => onSelectForSwap(player.id)}
    >
      <button
        type="button"
        className={classNames('pitch-player__lock', locked && 'is-locked')}
        onClick={(e) => {
          e.stopPropagation();
          onToggleLock(player.id);
        }}
        aria-label={`${locked ? 'Unlock' : 'Lock'} ${player.name}`}
        title={locked ? 'Unlock player' : 'Lock player in Auto-Build'}
      >
        {locked ? <Lock size={11} /> : <LockOpen size={11} />}
      </button>
      {injuryInfo && (
        <button
          type="button"
          className={classNames('vx-pitch-flag vx-injury-rect-sign pitch-player__injury-flag', `is-${injuryInfo.severity}`)}
          data-injury-trigger="1"
          onClick={(e) => {
            e.stopPropagation();
            onInspectInjury?.(player);
          }}
          aria-label={`${player.name} injury details: ${injuryInfo.injuryType}`}
          title={`${injuryInfo.injuryType} · ${injuryInfo.expectedReturn} — Click for full injury report`}
        >
          <AlertTriangle size={10} />
          <span>!</span>
        </button>
      )}
      {player.isCaptain && <span className="pitch-player__badge is-captain" title="Captain"><Crown size={10} /> C</span>}
      {player.isViceCaptain && <span className="pitch-player__badge is-vice" title="Vice-captain">V</span>}
      <button
        type="button"
        className="pitch-player__avatar-btn"
        data-player-card-trigger="1"
        onClick={(e) => {
          e.stopPropagation();
          onInspectPlayer?.(player);
        }}
        title={`Click ${player.name} image for FPL VORTEX player card`}
      >
        <PlayerAvatar
          code={player.code}
          teamCode={player.team.code}
          name={player.name}
          fullName={player.fullName}
          teamShort={player.team.shortName}
          position={player.position}
          size={compact ? 'sm' : 'md'}
        />
      </button>
      <div className="pitch-player__info">
        <strong>{player.name}</strong>
        <small>{player.team.shortName} · {formatPrice(player.price)}</small>
      </div>
      <span className="pitch-player__projection">
        {(player.projection * (player.isCaptain ? 2 : 1)).toFixed(2)}
      </span>
    </article>
  );
}

export function SquadBuilder({
  snapshot,
  players,
  fixtureRows,
  entry,
  profile,
  onProfileChange,
  onToast,
  onInspectPlayer,
  onInspectInjury,
}: SquadBuilderProps) {
  const [subTab, setSubTab] = useState<OptimizerSubTab>('planner');
  const [plannerHorizon, setPlannerHorizon] = useState(5);
  const [plannerDecay, setPlannerDecay] = useState(15);
  const [simulationDraws, setSimulationDraws] = useState(3000);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [reviewSim, setReviewSim] = useState<PlannerSimulationOutput | null>(null);
  const [simulationPending, setSimulationPending] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [squadMode, setSquadMode] = useState<'mySquad' | 'autoOptimal'>('mySquad');
  const [budget, setBudget] = useState(100);
  const [freeTransfers, setFreeTransfers] = useState<number>(entry?.freeTransfers ?? 2);
  const [lockedIds, setLockedIds] = useState<number[]>([]);
  const [customSquadIds, setCustomSquadIds] = useState<number[]>([]);
  const [selectedOutId, setSelectedOutId] = useState<number | null>(null);
  const [poolQuery, setPoolQuery] = useState('');
  const [poolPos, setPoolPos] = useState<'ALL' | Position>('ALL');
  const [sortKey, setSortKey] = useState<PoolSortKey>('optaXP5Gw');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedChipPreview, setSelectedChipPreview] = useState<'wildcard' | 'freehit' | 'bboost' | '3xc'>('wildcard');
  const [, startTransition] = useTransition();

  const deferredBudget = useDeferredValue(budget);
  const deferredQuery = useDeferredValue(poolQuery);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const fixtureByTeam = useMemo(() => new Map(fixtureRows.map((r) => [r.team.id, r])), [fixtureRows]);
  const sharedFixtureForecasts = useMemo(() => makeFixtureForecasts(snapshot, 'vortex', fixtureRows[0]?.cells.map(cell => cell.event) ?? []), [snapshot, fixtureRows]);

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
        budget: Math.round(deferredBudget * 10),
        profile,
        lockedIds,
      }),
    [deferredBudget, lockedIds, players, profile],
  );

  const activeSquadIds = useMemo(() => {
    if (squadMode === 'autoOptimal') return autoResult.squad.map((p) => p.id);
    return customSquadIds.length === 15 ? customSquadIds : baseEntrySquadIds;
  }, [autoResult.squad, baseEntrySquadIds, customSquadIds, squadMode]);

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
    if (squadMode === 'autoOptimal') {
      return Math.max(0, Math.round(deferredBudget * 10) - Math.round(result.cost * 10));
    }
    const currentSet = new Set(activeSquadIds);
    const baseSet = new Set(baseEntrySquadIds);
    const sellById = new Map((entry?.picks ?? []).map(p => [p.element, p.sellingPrice]));
    const sales = baseEntrySquadIds.filter(id => !currentSet.has(id)).reduce((sum, id) => sum + Math.round((sellById.get(id) ?? playerMap.get(id)?.price ?? 0) * 10), 0);
    const purchases = activeSquadPlayers.filter(p => !baseSet.has(p.id)).reduce((sum, p) => sum + p.cost, 0);
    return (entry?.history.bank ?? 0) + sales - purchases;
  }, [activeSquadIds, activeSquadPlayers, baseEntrySquadIds, deferredBudget, entry, playerMap, result.cost, squadMode]);

  const plannedMoves = squadMode === 'mySquad' ? activeSquadIds.filter(id => !baseEntrySquadIds.includes(id)).length : 0;
  useEffect(() => {
    if (!advancedOpen) return;
    setReviewSim(null);
    setSimulationError(null);
    setSimulationPending(false);
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
  }, [advancedOpen, activeSquadIds, bankTenths, freeTransfers, plannedMoves, players, snapshot, plannerHorizon, plannerDecay, simulationDraws, lockedIds, entry, playerMap]);

  // Clickable automatic column sorting (following `7_skills/fpl-team-planner.skill`)
  const handleSortBy = (key: PoolSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const selectedOutPlayer = selectedOutId ? playerMap.get(selectedOutId) ?? null : null;

  const sortedPool = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const activeSet = new Set(activeSquadIds);
    const effectiveFilterPos = selectedOutPlayer ? selectedOutPlayer.position : poolPos;

    const list = players.filter((p) => {
      if (activeSet.has(p.id)) return false;
      if (effectiveFilterPos !== 'ALL' && p.position !== effectiveFilterPos) return false;
      if (needle) {
        const hay = `${p.name} ${p.fullName} ${p.team.name} ${p.team.shortName}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'easeSum5':
          cmp = a.modelBreakdown.fiveGwEaseScore - b.modelBreakdown.fiveGwEaseScore;
          break;
        case 'price':
          cmp = a.cost - b.cost;
          break;
        case 'ownership':
          cmp = a.ownership - b.ownership;
          break;
        case 'totalPoints':
          cmp = a.totalPoints - b.totalPoints;
          break;
        case 'projection':
          cmp = a.projection - b.projection;
          break;
        case 'horizon5':
          cmp = a.horizon5Projection - b.horizon5Projection;
          break;
        case 'optaXP5Gw':
        default:
          cmp = a.modelBreakdown.optaXP5Gw - b.modelBreakdown.optaXP5Gw;
          break;
      }
      if (cmp !== 0) return cmp * dir;
      return b.modelBreakdown.optaXP5Gw - a.modelBreakdown.optaXP5Gw;
    });
    return list;
  }, [activeSquadIds, deferredQuery, players, poolPos, selectedOutPlayer, sortDir, sortKey]);

  const swapInPlayer = (incoming: EnrichedPlayer) => {
    const currentIds = [...activeSquadIds];
    let outId = selectedOutId;
    if (!outId || playerMap.get(outId)?.position !== incoming.position) {
      // Pick lowest-projected unlocked player in same position
      const candidatesOut = currentIds
        .map((id) => playerMap.get(id))
        .filter((p): p is EnrichedPlayer => p !== undefined && p.position === incoming.position && !lockedIds.includes(p.id))
        .sort((a, b) => a.projection - b.projection);
      outId = candidatesOut[0]?.id ?? null;
    }
    if (!outId) {
      onToast(`Unlock a ${incoming.position} first before swapping.`, 'info');
      return;
    }
    const outP = playerMap.get(outId);
    if (!outP) return;

    // Validate <= 3 per club
    const clubCountAfter = currentIds
      .filter((id) => id !== outId)
      .filter((id) => playerMap.get(id)?.teamId === incoming.teamId).length;
    if (clubCountAfter >= MAX_PLAYERS_PER_CLUB) {
      onToast(`Max 3 players from ${incoming.team.shortName} allowed.`, 'error');
      return;
    }

    const nextIds = currentIds.map((id) => (id === outId ? incoming.id : id));
    setSquadMode('mySquad');
    setCustomSquadIds(nextIds);
    setSelectedOutId(null);
    onToast(`Swapped ${outP.name} → ${incoming.name} (${incoming.projection >= outP.projection ? '+' : ''}${(incoming.projection - outP.projection).toFixed(2)} xPts).`, 'success');
  };

  const applySolverOption = (optionId: 'roll' | 'transfer1' | 'transfer2') => {
    if (!reviewSim) return;
    const nextSq =
      optionId === 'transfer2' ? reviewSim.squad2 : optionId === 'transfer1' ? reviewSim.squad1 : reviewSim.squad0;
    setSquadMode('mySquad');
    setCustomSquadIds(nextSq);
    onToast(`Applied ${optionId === 'roll' ? 'Roll (0 moves)' : optionId === 'transfer1' ? 'Optimal 1-FT move' : 'Optimal 2-move plan'} to pitch.`, 'success');
  };

  const toggleLock = (id: number) => {
    setLockedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 8) {
        onToast('You can lock up to 8 players at once.', 'info');
        return current;
      }
      return [...current, id];
    });
  };

  const copySquad = async () => {
    try {
      await navigator.clipboard.writeText(
        buildSquadText(result, squadMode === 'mySquad' ? (entry?.teamName ?? 'My Squad') : 'Auto Optimal XV'),
      );
      onToast('Squad copied to clipboard.', 'success');
    } catch {
      onToast('Clipboard access was blocked by the browser.', 'error');
    }
  };

  const clubCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const player of result.squad) {
      counts.set(player.team.shortName, (counts.get(player.team.shortName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [result.squad]);

  const maxPerClubUsed = Math.max(0, ...clubCounts.map(([, count]) => count));
  const startersByPosition = {
    GKP: result.starters.filter((player) => player.position === 'GKP'),
    DEF: result.starters.filter((player) => player.position === 'DEF'),
    MID: result.starters.filter((player) => player.position === 'MID'),
    FWD: result.starters.filter((player) => player.position === 'FWD'),
  };
  const transfersUsedCount = activeSquadIds.filter((id) => !baseEntrySquadIds.includes(id)).length;
  const hitPoints = squadMode === 'mySquad' ? Math.max(0, transfersUsedCount - freeTransfers) * 4 : 0;

  const activeChipSim = reviewSim?.chipSimulations.find((c) => c.chip === selectedChipPreview) ?? null;
  const optimizerTables = (): PngTable[] => {
    const tables: PngTable[] = [buildFixturePngTables(snapshot, snapshot.meta.nextEventId, snapshot.meta.nextEventId + plannerHorizon - 1)[0], { title: 'SUGGESTED TRANSFER TARGETS', headers: ['PLAYER', 'CLUB / POS', 'NEXT 5 FIXTURES', 'PRICE', 'EO%', 'POINTS', 'GW xPTS', 'LEGACY xP'], widths: [155, 100, 260, 70, 65, 70, 75, 80], rows: players.filter(player => !activeSquadIds.includes(player.id)).map(player => [{ text: player.name }, { text: `${player.team.shortName} ${player.position}` }, { text: fixtureByTeam.get(player.teamId)?.cells.map(cell => { const items = sharedFixtureForecasts.get(`${player.teamId}:${cell.event}`) ?? []; return `GW${cell.event}: ${cell.label}${items.length ? ' ' + items.map(item => `A ${item.attackIndex.toFixed(2)} D ${item.defenceIndex.toFixed(2)}`).join(' / ') : ''}`; }).join('\n') ?? '—' }, { text: formatPrice(player.price) }, { text: formatPercent(player.ownership) }, { text: String(player.totalPoints) }, { text: player.projection.toFixed(2) }, { text: player.modelBreakdown.optaXP5Gw.toFixed(1) }]) }];
    if (reviewSim) {
      tables.push({ title: 'CHIP EXPECTED-POINTS MATRIX', headers: ['GW', 'BASE xPTS', 'WILDCARD', 'FREE HIT', 'BENCH BOOST', 'TRIPLE CAPTAIN', 'OPTIMAL CAPTAIN'], widths: [70, 100, 110, 110, 110, 120, 150], rows: reviewSim.chipMatrixByGw.map(row => [{ text: `GW${row.gw}` }, { text: row.baseXPts.toFixed(2) }, { text: row.wildcardGain.toFixed(2) }, { text: row.freehitGain.toFixed(2) }, { text: row.bboostGain.toFixed(2) }, { text: row.tripleCapGain.toFixed(2) }, { text: playerMap.get(reviewSim.chipSimulations.find(c => c.chip === '3xc')?.topGws.find(g => g.gw === row.gw)?.captainId ?? result.captain.id)?.name ?? '—' }]) });
      tables.push({ title: 'MONTE CARLO · CAPTAIN RISK', headers: ['CAPTAIN', 'MEAN 2×', 'P90 2×', 'HAUL %', 'BLANK %'], widths: [150, 100, 100, 100, 100], rows: reviewSim.monteCarlo.captains.map(cap => [{ text: playerMap.get(cap.id)?.name ?? `#${cap.id}` }, { text: (cap.mean * 2).toFixed(2) }, { text: (cap.p90 * 2).toFixed(1) }, { text: `${(cap.pHaul * 100).toFixed(1)}%` }, { text: `${(cap.pBlank * 100).toFixed(1)}%` }]) });
    }
    return tables;
  };

  return (
    <div className="page page--optimizer">
      <PlannerOverview snapshot={snapshot} squad={activeSquadPlayers} onInspectPlayer={onInspectPlayer} onToast={onToast} horizon={plannerHorizon} onHorizonChange={setPlannerHorizon} decay={plannerDecay} onDecayChange={setPlannerDecay} />
      <details className="vx-planner-legacy" onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
        <summary>Advanced tools · transfers & chips</summary>
      {/* Sub-navigation bar: Team Planner | Chip Strategy (FPLReview style) | Monte Carlo (3,000 Draws) */}
      <section className="panel optimizer-header-panel">
        <div className="save-table-bar"><SaveTableButton getTables={optimizerTables} filename="fpl-vortex-optimizer-tables.png" onError={message => onToast(message, 'error')} /></div>
        <div className="optimizer-top-row">
          <div className="subtab-bar" role="tablist" aria-label="Optimizer & simulation modes">
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'planner'}
              className={classNames('subtab-btn', subTab === 'planner' && 'is-active')}
              onClick={() => setSubTab('planner')}
            >
              <Layers size={16} />
              <span>1. Team Planner & Solver</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'chips'}
              className={classNames('subtab-btn', subTab === 'chips' && 'is-active')}
              onClick={() => setSubTab('chips')}
            >
              <BarChart3 size={16} />
              <span>2. Chip Strategy & EV Matrix</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'montecarlo'}
              className={classNames('subtab-btn', subTab === 'montecarlo' && 'is-active')}
              onClick={() => setSubTab('montecarlo')}
            >
              <Dices size={16} />
              <span>3. Monte Carlo ({simulationDraws.toLocaleString()} Draws)</span>
            </button>
          </div>

          <div className="optimizer-mode-pills">
            <button
              type="button"
              className={classNames('button', squadMode === 'mySquad' ? 'button--primary' : 'button--ghost')}
              onClick={() => setSquadMode('mySquad')}
            >
              <Users size={15} /> {entry?.teamName ?? 'My Squad'}
            </button>
            <button
              type="button"
              className={classNames('button', squadMode === 'autoOptimal' ? 'button--primary' : 'button--ghost')}
              onClick={() => setSquadMode('autoOptimal')}
            >
              <WandSparkles size={15} /> Auto-Build £{budget.toFixed(1)}m XV
            </button>
            {squadMode === 'mySquad' && transfersUsedCount > 0 && (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  setCustomSquadIds(baseEntrySquadIds);
                  setSelectedOutId(null);
                  onToast('Reset to base GW squad.', 'info');
                }}
              >
                <RotateCcw size={14} /> Reset ({transfersUsedCount} {transfersUsedCount === 1 ? 'move' : 'moves'})
              </button>
            )}
            <button type="button" className="button button--subtle" onClick={copySquad}>
              <Copy size={15} /> Copy XV
            </button>
          </div>
        </div>

        <div className="optimizer-controls-inline">
          <div className="profile-switcher" role="radiogroup" aria-label="Optimization strategy">
            {PROFILES.map((item) => (
              <button
                type="button"
                key={item.id}
                role="radio"
                aria-checked={profile === item.id}
                className={classNames('profile-option', profile === item.id && 'is-active')}
                onClick={() => startTransition(() => onProfileChange(item.id))}
              >
                <span className="profile-option__head">{item.icon} {item.label}</span>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>

          <div className="ft-budget-controls">
            <label className="ft-select-box">
              <span>Simulation draws</span>
              <select value={simulationDraws} onChange={event => setSimulationDraws(Number(event.target.value))} aria-label="Simulation draws">
                {[3000, 10000].map(draws => <option key={draws} value={draws}>{draws.toLocaleString()} draws</option>)}
              </select>
            </label>
            <label className="ft-select-box">
              <span>Free Transfers</span>
              <select
                value={freeTransfers}
                onChange={(e) => setFreeTransfers(Number(e.target.value))}
                aria-label="Free transfers available"
              >
                {[0, 1, 2, 3, 4, 5].map((ft) => (
                  <option key={ft} value={ft}>{ft} FT</option>
                ))}
              </select>
            </label>
            {squadMode === 'autoOptimal' && (
              <label className="ft-select-box">
                <span>Budget Cap: {formatPrice(budget)}</span>
                <input
                  type="range"
                  min={84}
                  max={105}
                  step={0.5}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                />
              </label>
            )}
          </div>
        </div>
      </section>

      {(simulationPending || simulationError) && <section className="panel" role={simulationError ? 'alert' : 'status'} aria-live="polite" aria-busy={simulationPending}>
        <div className="panel__header"><div><span className="panel__eyebrow">{simulationPending ? 'RUNNING SIMULATION' : 'SIMULATION UNAVAILABLE'}</span><h3>{simulationPending ? 'Comparing legal transfer and chip paths…' : simulationError}</h3></div></div>
      </section>}

      <section className="stat-grid stat-grid--optimizer">
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
              : 'HOLD CHIPS'
          }
          detail={
            reviewSim
              ? `Peak swing +${reviewSim.recommendedChipDecision.bestFutureGain.toFixed(1)} xPts · ${formationRisk(result)}`
              : 'Evaluating half-season'
          }
          icon={<ShieldCheck size={18} />}
          tone="blue"
        />
      </section>

      {/* ==================== TAB 1: TEAM PLANNER & TRANSFER SOLVER ==================== */}
      {subTab === 'planner' && (
        <>
          {reviewSim && (
            <section className="option-cards-grid" aria-label="Roll vs transfer solver comparison">
              {reviewSim.options.map((opt) => (
                <article
                  key={opt.id}
                  className={classNames('panel option-card', opt.winner && 'option-card--winner')}
                >
                  <div className="option-card__head">
                    <span className={classNames('badge', opt.winner ? 'badge--mint' : 'badge--violet')}>
                      {opt.winner ? '★ Engine Winner' : opt.action}
                    </span>
                    <strong>{opt.nextGwXPts.toFixed(2)} GW xPts</strong>
                  </div>
                  <h4>{opt.label}</h4>
                  <p>{opt.why}</p>
                  <div className="option-card__foot">
                    <span>{reviewSim.gws.length}-GW Horizon: <strong>{opt.horizonXPts.toFixed(1)} xPts</strong></span>
                    <button
                      type="button"
                      className="button button--ghost button--sm"
                      disabled={simulationPending || (opt.id !== 'roll' && opt.transfers.length === 0)}
                      onClick={() => applySolverOption(opt.id as 'roll' | 'transfer1' | 'transfer2')}
                    >
                      Load on pitch
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}

          <div className="planner-workspace">
            {/* Left column (14/24): Sortable Player Pool Table (`7_skills/fpl-team-planner.skill`) */}
            <section className="panel planner-pool-panel" aria-label="Suggested transfer targets">
              <div className="panel__header">
                <div>
                  <span className="panel__eyebrow">
                    SUGGESTED TARGETS · {selectedOutPlayer ? `REPLACING ${selectedOutPlayer.name.toUpperCase()} (${selectedOutPlayer.position})` : 'ALL POSITIONS'}
                  </span>
                  <h3>Click any column heading to sort ({sortedPool.length} available)</h3>
                </div>
                {selectedOutPlayer && (
                  <button type="button" className="button button--ghost button--sm" onClick={() => setSelectedOutId(null)}>
                    Clear {selectedOutPlayer.name} filter
                  </button>
                )}
              </div>

              <div className="planner-pool-filters">
                <label className="search-input search-input--compact">
                  <Search size={15} />
                  <input
                    type="search"
                    value={poolQuery}
                    onChange={(e) => setPoolQuery(e.target.value)}
                    placeholder="Filter player or club…"
                  />
                </label>
                <div className="pos-pills">
                  {(['ALL', 'GKP', 'DEF', 'MID', 'FWD'] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      className={classNames(
                        'pos-pill',
                        (selectedOutPlayer ? selectedOutPlayer.position === pos : poolPos === pos) && 'is-active',
                      )}
                      onClick={() => {
                        setSelectedOutId(null);
                        setPoolPos(pos);
                      }}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              <div className="planner-table-scroll">
                <table className="planner-pool-table">
                  <thead>
                    <tr>
                      <th>
                        <button type="button" className="sortable-th" onClick={() => handleSortBy('name')}>
                          Player <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sortable-th" onClick={() => handleSortBy('easeSum5')}>
                          Next 5 Fixtures <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sortable-th" onClick={() => handleSortBy('price')}>
                          £ <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sortable-th" onClick={() => handleSortBy('ownership')}>
                          EO% <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sortable-th" onClick={() => handleSortBy('totalPoints')}>
                          Pts <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sortable-th" onClick={() => handleSortBy('projection')}>
                          GW xP <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sortable-th" onClick={() => handleSortBy('optaXP5Gw')}>
                          Opta xP <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>Move</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPool.slice(0, 35).map((player) => {
                      const fxRow = fixtureByTeam.get(player.teamId);
                      const poolFlag =
                        player.status !== 'a' || (player.chance !== null && player.chance < 100)
                          ? parsePlayerInjuryDetails(player)
                          : null;
                      return (
                        <tr
                          key={player.id}
                          className="vx-clickable-row"
                          data-player-card-trigger="1"
                          onClick={() => onInspectPlayer?.(player)}
                        >
                          <td>
                            <div className="player-cell player-cell--avatar">
                              <PlayerAvatar
                                code={player.code}
                                teamCode={player.team.code}
                                name={player.name}
                                fullName={player.fullName}
                                teamShort={player.team.shortName}
                                position={player.position}
                                size="sm"
                              />
                              <div>
                                <div className="vx-name-with-flag">
                                  <strong>{player.name}</strong>
                                  {poolFlag && (
                                    <button
                                      type="button"
                                      className={classNames('vx-injury-rect vx-injury-rect--sm', `is-${poolFlag.severity}`)}
                                      data-injury-trigger="1"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onInspectInjury?.(player);
                                      }}
                                    >
                                      <AlertTriangle size={10} />
                                      <span>{poolFlag.badgeText}</span>
                                    </button>
                                  )}
                                </div>
                                <small>{player.team.shortName} · {player.position}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="fixchip-row">
                              {(fxRow?.cells ?? []).map(cell => {
                                const items = sharedFixtureForecasts.get(`${player.teamId}:${cell.event}`) ?? [];
                                return items.length ? items.map(item => <ForecastTile key={item.fixture.id} item={item} mode="difficulty" showLabels />) : <span key={cell.event} className="optimizer-fixture-blank" title={`GW${cell.event}: ${cell.label}`}>—</span>;
                              })}
                            </div>
                          </td>
                          <td className="mono-num">{formatPrice(player.price)}</td>
                          <td className="mono-num">{formatPercent(player.ownership)}</td>
                          <td className="mono-num">{player.totalPoints}</td>
                          <td><strong className="score-pill is-strong">{player.projection.toFixed(2)}</strong></td>
                          <td><strong className="score-pill is-elite">{player.modelBreakdown.optaXP5Gw.toFixed(1)}</strong></td>
                          <td>
                            <button
                              type="button"
                              className="button button--subtle button--xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                swapInPlayer(player);
                              }}
                            >
                              Swap in
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Right column (10/24): Resized Interactive Pitch & Constraints */}
            <section className="pitch-panel planner-pitch-panel" aria-label="Squad pitch view">
              <div className="pitch-panel__header">
                <div>
                  <span className="panel__eyebrow">
                    {squadMode === 'mySquad'
                      ? entry
                        ? `${entry.teamName.toUpperCase()} PITCH`
                        : 'TEMPLATE XV PITCH'
                      : 'OPTIMAL XV PITCH'}{' '}
                    · {result.formation}
                  </span>
                  <h3>Click any player to filter replacements</h3>
                </div>
                <div className="pitch-panel__badges">
                  <span className="badge badge--mint">C: {result.captain.name}</span>
                  <span className="badge badge--violet">VC: {result.viceCaptain.name}</span>
                </div>
              </div>

              <div className="pitch pitch--planner">
                <div className="pitch__halfway" />
                <div className="pitch__circle" />
                <div className="pitch__box pitch__box--top" />
                <div className="pitch__box pitch__box--bottom" />

                <div className="pitch__row pitch__row--gkp">
                  {startersByPosition.GKP.map((player) => (
                    <PitchPlayerCard
                      key={player.id}
                      player={player}
                      locked={lockedIds.includes(player.id)}
                      selectedForSwap={selectedOutId === player.id}
                      onToggleLock={toggleLock}
                      onSelectForSwap={(id) => setSelectedOutId((cur) => (cur === id ? null : id))}
                      onInspectPlayer={onInspectPlayer}
                      onInspectInjury={onInspectInjury}
                    />
                  ))}
                </div>
                <div className="pitch__row">
                  {startersByPosition.DEF.map((player) => (
                    <PitchPlayerCard
                      key={player.id}
                      player={player}
                      locked={lockedIds.includes(player.id)}
                      selectedForSwap={selectedOutId === player.id}
                      onToggleLock={toggleLock}
                      onSelectForSwap={(id) => setSelectedOutId((cur) => (cur === id ? null : id))}
                      onInspectPlayer={onInspectPlayer}
                      onInspectInjury={onInspectInjury}
                    />
                  ))}
                </div>
                <div className="pitch__row">
                  {startersByPosition.MID.map((player) => (
                    <PitchPlayerCard
                      key={player.id}
                      player={player}
                      locked={lockedIds.includes(player.id)}
                      selectedForSwap={selectedOutId === player.id}
                      onToggleLock={toggleLock}
                      onSelectForSwap={(id) => setSelectedOutId((cur) => (cur === id ? null : id))}
                      onInspectPlayer={onInspectPlayer}
                      onInspectInjury={onInspectInjury}
                    />
                  ))}
                </div>
                <div className="pitch__row pitch__row--fwd">
                  {startersByPosition.FWD.map((player) => (
                    <PitchPlayerCard
                      key={player.id}
                      player={player}
                      locked={lockedIds.includes(player.id)}
                      selectedForSwap={selectedOutId === player.id}
                      onToggleLock={toggleLock}
                      onSelectForSwap={(id) => setSelectedOutId((cur) => (cur === id ? null : id))}
                      onInspectPlayer={onInspectPlayer}
                      onInspectInjury={onInspectInjury}
                    />
                  ))}
                </div>
              </div>

              <div className="bench">
                <div className="bench__header">
                  <span>BENCH ORDER</span>
                  <small>Auto-sub priority · click image for card or card to swap</small>
                </div>
                <div className="bench__players">
                  {result.bench.map((player) => (
                    <PitchPlayerCard
                      key={player.id}
                      player={player}
                      locked={lockedIds.includes(player.id)}
                      selectedForSwap={selectedOutId === player.id}
                      onToggleLock={toggleLock}
                      onSelectForSwap={(id) => setSelectedOutId((cur) => (cur === id ? null : id))}
                      onInspectPlayer={onInspectPlayer}
                      onInspectInjury={onInspectInjury}
                      compact
                    />
                  ))}
                </div>
              </div>

              <div className="constraint-list constraint-list--inline">
                <Constraint ok={result.squad.length === 15}>15 players (2-5-5-3)</Constraint>
                <Constraint ok={bankTenths >= 0}>
                  {bankTenths >= 0 ? `Within budget (${formatPrice(bankTenths / 10)} ITB)` : `Over budget by ${formatPrice(Math.abs(bankTenths) / 10)}`}
                </Constraint>
                <Constraint ok={maxPerClubUsed <= MAX_PLAYERS_PER_CLUB}>Max {maxPerClubUsed}/3 per club</Constraint>
              </div>
            </section>
          </div>
        </>
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
                        {path.probBeatsHold !== null && (
                          <span className={classNames('badge', path.probBeatsHold >= 0.5 ? 'badge--mint' : 'badge--violet')}>
                            {(path.probBeatsHold * 100).toFixed(1)}% Beat unchanged squad
                          </span>
                        )}
                        <strong className="score-pill is-elite">Mean {path.mean.toFixed(1)} pts</strong>
                      </div>
                    </div>
                    <small>{path.deltaMean === null ? 'Unchanged-squad baseline' : `Net gain ${path.deltaMean >= 0 ? '+' : ''}${path.deltaMean.toFixed(1)} pts · paired 80% gain range ${path.deltaP10?.toFixed(1)} to ${path.deltaP90?.toFixed(1)} · ties ${((path.probDrawsHold ?? 0) * 100).toFixed(1)}%`}</small>
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
                  <h3>2× Captaincy haul & blank probabilities</h3>
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
                      <th>P(Haul ≥ 9 pts)</th>
                      <th>P(Blank ≤ 2 pts)</th>
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
      </details>
    </div>
  );
}
