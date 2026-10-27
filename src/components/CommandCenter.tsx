import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crown,
  ExternalLink,
  Flame,
  LayoutGrid,
  List,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Stethoscope,
  Target,
  Trophy,
  UserCheck,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import type { PendingSwap } from '../App';
import type { RouteId } from '../hooks/useHashRoute';
import { BRAND_LION_SRC } from '../lib/baseUrl';
import { useNow } from '../hooks/useNow';
import { fetchVideos } from '../lib/api';
import { buildInsights, toRepoElement } from '../lib/analytics';
import { toRepoFixtures, toRepoTeams } from '../lib/fixtures';
import {
  classNames,
  countdown,
  formatCompact,
  formatNumber,
  formatPrice,
  relativeTime,
} from '../lib/format';
import { buildStrengths, projectMatch } from '../lib/repoModel/dashboardMath';
import { selectOptimalXI } from '../lib/repoModel/scoring';
import type {
  EnrichedPlayer,
  EntryData,
  FixtureRow,
  Position,
  RiskProfile,
  Snapshot,
  VideoItem,
} from '../lib/types';
import type { RecentTeamEntry } from '../lib/recentTeamIds';
import { ClubBadge } from './ClubBadge';
import { PlayerAvatar } from './PlayerAvatar';
import { TeamIdInput } from './TeamIdInput';

interface CommandCenterProps {
  snapshot: Snapshot;
  entry?: EntryData | null;
  entryLoading?: boolean;
  entryError?: string | null;
  pendingSwaps?: PendingSwap[];
  onAddPendingSwap?: (outId: number, inId: number) => void;
  onClearPendingSwaps?: () => void;
  players: EnrichedPlayer[];
  insights: ReturnType<typeof buildInsights>;
  fixtureRows: FixtureRow[];
  initialVideos?: VideoItem[];
  profile: RiskProfile;
  teamId?: string;
  recentTeams?: RecentTeamEntry[];
  onRemoveRecentTeam?: (idToRemove: string) => void;
  onTeamIdChange?: (id: string) => void;
  onSelectPlayer?: (query: string) => void;
  onNavigate: (route: RouteId) => void;
  onOpenPalette: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const DEFAULT_SAMPLE_SQUAD = [1, 149, 256, 369, 444, 16, 48, 82, 136, 224, 240, 297, 381, 411, 560];

const CLUB_BAR_COLORS: Record<string, string> = {
  ARS: '#EF0107',
  AVL: '#95BFE5',
  BHA: '#0057B8',
  BOU: '#DA291C',
  BRE: '#E30613',
  CHE: '#2563EB',
  COV: '#38BDF8',
  CRY: '#3B82F6',
  EVE: '#1D4ED8',
  FUL: '#94A3B8',
  HUL: '#F59E0B',
  IPS: '#3A64A3',
  LEE: '#FACC15',
  LIV: '#C8102E',
  MCI: '#6CABDD',
  MUN: '#DA291C',
  NEW: '#38BDF8',
  NFO: '#E53233',
  SUN: '#EB172B',
  TOT: '#818CF8',
};

const SEED_VORTEX_VIDEOS: VideoItem[] = [
  {
    id: 'TCP2HYD9djk',
    title: 'FPL GW8 Free Hit Team: Best Picks, Fixtures & Captain | FPL VORTEX',
    published: '2026-10-22T19:50:44Z',
    thumbnail: 'https://i.ytimg.com/vi/TCP2HYD9djk/mqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=TCP2HYD9djk',
  },
  {
    id: 'BbpBksRewHc',
    title: 'FPL GW8 Final Decisions: Transfers, Bench & Captain | FPL VORTEX',
    published: '2026-10-22T03:17:00Z',
    thumbnail: 'https://i.ytimg.com/vi/BbpBksRewHc/mqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=BbpBksRewHc',
  },
  {
    id: '65WusHtnHZg',
    title: 'FPL GW8 Final Decisions: Transfers, Bench & Captain | FPL VORTEX',
    published: '2026-10-21T18:27:00Z',
    thumbnail: 'https://i.ytimg.com/vi/65WusHtnHZg/mqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=65WusHtnHZg',
  },
  {
    id: '34q4AyADyZc',
    title: 'October 19 | Day 2 | Expected Minutes, Rank Pressure & Differentials',
    published: '2026-10-19T22:48:22Z',
    thumbnail: 'https://i.ytimg.com/vi/34q4AyADyZc/mqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=34q4AyADyZc',
  },
];

function posToNum(pos: Position): 1 | 2 | 3 | 4 {
  if (pos === 'GKP') return 1;
  if (pos === 'DEF') return 2;
  if (pos === 'MID') return 3;
  return 4;
}

function fdrPillTone(difficulty: number, isBlank: boolean): 'easy' | 'medium' | 'hard' | 'blank' {
  if (isBlank) return 'blank';
  if (difficulty <= 2) return 'easy';
  if (difficulty >= 4) return 'hard';
  return 'medium';
}

function computePriceDeltaPct(player: EnrichedPlayer): number {
  const net = player.transfersInEvent - player.transfersOutEvent;
  const totalVol = player.transfersInEvent + player.transfersOutEvent;
  if (totalVol === 0) return 0;
  const threshold = Math.max(1800, player.ownership * 1450 + 900);
  const raw = Math.tanh(net / threshold) * 99.4;
  return Math.round(raw * 10) / 10;
}

function formatInjurySummary(player: EnrichedPlayer): string {
  if (player.news && player.news.trim().length > 0) return player.news.trim();
  const chanceTxt = player.chance !== null ? ` · ${player.chance}% chance of playing` : '';
  if (player.status === 'i') return `Injury concern${chanceTxt}`;
  if (player.status === 'd') return `Fitness doubt${chanceTxt || ' · 75% chance of playing'}`;
  if (player.status === 's') return 'Suspended';
  if (player.status === 'u' || player.status === 'n') return 'Unavailable';
  return `Monitoring workload${chanceTxt}`;
}

export function CommandCenter({
  snapshot,
  entry,
  entryLoading = false,
  entryError = null,
  pendingSwaps = [],
  onAddPendingSwap,
  onClearPendingSwaps,
  players,
  insights,
  fixtureRows,
  initialVideos,
  teamId = '',
  recentTeams = [],
  onRemoveRecentTeam,
  onTeamIdChange,
  onSelectPlayer,
  onNavigate,
  onOpenPalette,
  onRefresh,
  refreshing,
}: CommandCenterProps) {
  const now = useNow(1000);
  const videoTrackRef = useRef<HTMLDivElement | null>(null);
  const topInputRef = useRef<HTMLInputElement | null>(null);

  const reviewEventId = entry?.currentEvent ?? snapshot.meta.currentEventId ?? 8;
  const nextEventId = snapshot.meta.nextEventId || 9;
  const hasLinkedTeam = Boolean(teamId.trim() && entry);

  const [videos, setVideos] = useState<VideoItem[]>(
    initialVideos?.length ? initialVideos.slice(0, 30) : SEED_VORTEX_VIDEOS,
  );
  // Default to the Review Gameweek (`entry.currentEvent`) when a team is loaded, or nextEventId before linking!
  const [selectedGw, setSelectedGw] = useState<number>(hasLinkedTeam ? reviewEventId : nextEventId);
  const [squadView, setSquadView] = useState<'pitch' | 'table'>('pitch');
  const [teamInput, setTeamInput] = useState(teamId);
  const [expandedFixtureId, setExpandedFixtureId] = useState<number | null>(null);
  const [projMetric, setProjMetric] = useState<'goals' | 'cs' | 'win'>('goals');
  const [topMetric, setTopMetric] = useState<'season' | 'nextXp' | 'gwPts' | 'horizon5'>('season');
  const [transferSort, setTransferSort] = useState<'delta' | 'name' | 'in' | 'out' | 'net'>('delta');
  const [transferDir, setTransferDir] = useState<'desc' | 'asc'>('desc');
  const [transferPage, setTransferPage] = useState(0);
  const [injuryPage, setInjuryPage] = useState(0);
  const [inspectedFlagPlayer, setInspectedFlagPlayer] = useState<EnrichedPlayer | null>(null);
  const [swapOutPlayer, setSwapOutPlayer] = useState<EnrichedPlayer | null>(null);
  const [swapSearch, setSwapSearch] = useState('');

  // Whenever an FPL ID finishes loading, jump cleanly to its Review Gameweek so the user sees their Review GW immediately
  useEffect(() => {
    if (entry?.currentEvent) {
      setSelectedGw(entry.currentEvent);
    }
  }, [entry?.id, entry?.currentEvent]);

  useEffect(() => {
    setTeamInput(teamId);
  }, [teamId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchVideos(controller.signal)
      .then((res) => {
        if (res.videos.length > 0) setVideos(res.videos.slice(0, 30));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const nextEvent = snapshot.gameweeks.find((event) => event.id === nextEventId);
  const reviewEventObj = snapshot.gameweeks.find((event) => event.id === reviewEventId);
  const deadline = useMemo(() => countdown(nextEvent?.deadlineTime), [nextEvent?.deadlineTime, now]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const teamMap = useMemo(() => new Map(snapshot.teams.map((t) => [t.id, t])), [snapshot.teams]);

  const squadIds = useMemo(() => {
    if (entry && entry.picks.length === 15) {
      return entry.picks.map((p) => p.element);
    }
    const valid = DEFAULT_SAMPLE_SQUAD.filter((id) => playerMap.has(id));
    return valid.length === 15 ? valid : players.slice(0, 15).map((p) => p.id);
  }, [entry, playerMap, players]);

  const playerGwXp = useMemo(() => {
    const out = new Map<number, number>();
    for (const p of players) {
      const xp = p.gwProjections?.[selectedGw] ?? p.projection;
      out.set(p.id, xp);
    }
    return out;
  }, [players, selectedGw]);

  const isReviewMode = hasLinkedTeam && selectedGw <= reviewEventId;

  const pitchLineup = useMemo(() => {
    const validSquad = squadIds.filter((id) => playerMap.has(id));
    if (validSquad.length < 11) {
      return {
        starters: [] as number[],
        bench: [] as number[],
        captainId: 0,
        viceId: 0,
        totalXp: 0,
        nextGwXp: 0,
      };
    }

    const nextGwOptimal = selectOptimalXI(
      validSquad,
      (id) => posToNum(playerMap.get(id)?.position ?? 'MID'),
      (id) => playerMap.get(id)?.gwProjections?.[nextEventId] ?? playerMap.get(id)?.projection ?? 0,
    );

    if (entry && selectedGw <= entry.currentEvent && entry.picks.length === 15) {
      const sortedPicks = [...entry.picks].sort((a, b) => a.position - b.position);
      const starters = sortedPicks.filter((pk) => pk.position <= 11).map((pk) => pk.element);
      const bench = sortedPicks.filter((pk) => pk.position > 11).map((pk) => pk.element);
      const cap = sortedPicks.find((pk) => pk.isCaptain)?.element ?? starters[0];
      const vice = sortedPicks.find((pk) => pk.isViceCaptain)?.element ?? starters[1];
      const totalXp = starters.reduce(
        (sum, id) => sum + (playerGwXp.get(id) ?? 0) * (id === cap ? 2 : 1),
        0,
      );
      return { starters, bench, captainId: cap, viceId: vice, totalXp, nextGwXp: nextGwOptimal.total };
    }

    const optimal = selectOptimalXI(
      validSquad,
      (id) => posToNum(playerMap.get(id)?.position ?? 'MID'),
      (id) => playerGwXp.get(id) ?? 0,
    );
    return {
      starters: optimal.starters,
      bench: optimal.bench,
      captainId: optimal.captain ?? optimal.starters[0] ?? 0,
      viceId: optimal.vice ?? optimal.starters[1] ?? 0,
      totalXp: optimal.total,
      nextGwXp: nextGwOptimal.total,
    };
  }, [entry, nextEventId, playerGwXp, playerMap, selectedGw, squadIds]);

  const heroOrbXp = useMemo(() => {
    if (hasLinkedTeam && pitchLineup.nextGwXp > 0) return pitchLineup.nextGwXp;
    const valid = DEFAULT_SAMPLE_SQUAD.filter((id) => playerMap.has(id));
    if (valid.length < 11) return 57.0;
    return selectOptimalXI(
      valid,
      (id) => posToNum(playerMap.get(id)?.position ?? 'MID'),
      (id) => playerMap.get(id)?.gwProjections?.[nextEventId] ?? playerMap.get(id)?.projection ?? 0,
    ).total;
  }, [hasLinkedTeam, nextEventId, pitchLineup.nextGwXp, playerMap]);

  const captain = insights.captainCandidates[0];
  const bestFixture = fixtureRows[0];

  // Match-level Poisson projections for selectedGw (`site/model/dashboardMath.ts`)
  const gwMatchesAndClubs = useMemo(() => {
    const repoTeams = toRepoTeams(snapshot.teams);
    const repoElements = snapshot.players.map(toRepoElement);
    const repoFixtures = toRepoFixtures(snapshot.fixtures);
    const strengths = buildStrengths(repoTeams, repoElements, repoFixtures);
    const fallbackStrength = { atkH: 1, atkA: 1, defWeakH: 1, defWeakA: 1 };

    const matches = snapshot.fixtures
      .filter((fx) => fx.event === selectedGw)
      .sort((a, b) => (a.kickoffTime ?? '9999').localeCompare(b.kickoffTime ?? '9999'))
      .map((fx) => {
        const homeTeam = teamMap.get(fx.teamH);
        const awayTeam = teamMap.get(fx.teamA);
        const proj = projectMatch(
          strengths.get(fx.teamH) ?? fallbackStrength,
          strengths.get(fx.teamA) ?? fallbackStrength,
        );
        return {
          fixture: fx,
          homeTeam,
          awayTeam,
          homeXg: proj.homeXg,
          awayXg: proj.awayXg,
          homeCs: proj.homeCs,
          awayCs: proj.awayCs,
          homeWin: proj.homeWin,
          draw: proj.draw,
          awayWin: proj.awayWin,
        };
      });

    const clubMap = new Map<
      number,
      {
        teamId: number;
        shortName: string;
        name: string;
        code: number;
        oppLabel: string;
        goals: number;
        cs: number;
        win: number;
      }
    >();

    for (const m of matches) {
      if (m.homeTeam && m.awayTeam) {
        const prevH = clubMap.get(m.homeTeam.id);
        clubMap.set(m.homeTeam.id, {
          teamId: m.homeTeam.id,
          shortName: m.homeTeam.shortName,
          name: m.homeTeam.name,
          code: m.homeTeam.code,
          oppLabel: prevH ? `${prevH.oppLabel}, ${m.awayTeam.shortName} (H)` : `${m.awayTeam.shortName} (H)`,
          goals: (prevH?.goals ?? 0) + m.homeXg,
          cs: prevH ? Math.max(prevH.cs, m.homeCs) : m.homeCs,
          win: prevH ? Math.max(prevH.win, m.homeWin) : m.homeWin,
        });

        const prevA = clubMap.get(m.awayTeam.id);
        clubMap.set(m.awayTeam.id, {
          teamId: m.awayTeam.id,
          shortName: m.awayTeam.shortName,
          name: m.awayTeam.name,
          code: m.awayTeam.code,
          oppLabel: prevA ? `${prevA.oppLabel}, ${m.homeTeam.shortName} (A)` : `${m.homeTeam.shortName} (A)`,
          goals: (prevA?.goals ?? 0) + m.awayXg,
          cs: prevA ? Math.max(prevA.cs, m.awayCs) : m.awayCs,
          win: prevA ? Math.max(prevA.win, m.awayWin) : m.awayWin,
        });
      }
    }

    for (const t of snapshot.teams) {
      if (!clubMap.has(t.id)) {
        clubMap.set(t.id, {
          teamId: t.id,
          shortName: t.shortName,
          name: t.name,
          code: t.code,
          oppLabel: 'BLANK',
          goals: 0,
          cs: 0,
          win: 0,
        });
      }
    }

    return { matches, clubs: [...clubMap.values()] };
  }, [selectedGw, snapshot.fixtures, snapshot.players, snapshot.teams, teamMap]);

  const groupedMatches = useMemo(() => {
    const groups: Array<{ dateLabel: string; items: typeof gwMatchesAndClubs.matches }> = [];
    for (const m of gwMatchesAndClubs.matches) {
      const dateLabel = m.fixture.kickoffTime
        ? new Intl.DateTimeFormat('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }).format(new Date(m.fixture.kickoffTime))
        : 'Kickoff TBC';
      const last = groups[groups.length - 1];
      if (last && last.dateLabel === dateLabel) {
        last.items.push(m);
      } else {
        groups.push({ dateLabel, items: [m] });
      }
    }
    return groups;
  }, [gwMatchesAndClubs.matches]);

  const sortedClubs = useMemo(() => {
    return [...gwMatchesAndClubs.clubs].sort((a, b) => b[projMetric] - a[projMetric]);
  }, [gwMatchesAndClubs.clubs, projMetric]);

  const maxClubVal = useMemo(
    () => Math.max(0.01, ...sortedClubs.map((c) => c[projMetric])),
    [projMetric, sortedClubs],
  );

  const getPitchFixture = (teamIdNum: number) => {
    const fxs = snapshot.fixtures.filter(
      (fx) => fx.event === selectedGw && (fx.teamH === teamIdNum || fx.teamA === teamIdNum),
    );
    if (fxs.length === 0) return { label: 'BLANK', difficulty: 4, isBlank: true };
    const labels = fxs.map((fx) => {
      const isHome = fx.teamH === teamIdNum;
      const opp = teamMap.get(isHome ? fx.teamA : fx.teamH)?.shortName ?? 'OPP';
      return `${opp} (${isHome ? 'H' : 'A'})`;
    });
    const maxDiff = Math.max(
      ...fxs.map((fx) => (fx.teamH === teamIdNum ? fx.teamHDifficulty : fx.teamADifficulty)),
    );
    return { label: labels.join(', '), difficulty: maxDiff, isBlank: false };
  };

  // Top Players (top 10)
  const topPlayersList = useMemo(() => {
    const getVal = (p: EnrichedPlayer) => {
      if (topMetric === 'season') return p.totalPoints;
      if (topMetric === 'gwPts') return p.eventPoints;
      if (topMetric === 'horizon5') return p.horizon5Projection;
      return playerGwXp.get(p.id) ?? p.projection;
    };
    return [...players]
      .sort((a, b) => getVal(b) - getVal(a) || b.totalPoints - a.totalPoints)
      .slice(0, 10)
      .map((p) => ({ player: p, score: getVal(p) }));
  }, [playerGwXp, players, topMetric]);

  const maxTopScore = Math.max(1, ...topPlayersList.map((r) => r.score));

  // Price & Transfers
  const sortedTransfers = useMemo(() => {
    const rows = players.map((p) => ({
      player: p,
      deltaPct: computePriceDeltaPct(p),
      net: p.transfersInEvent - p.transfersOutEvent,
    }));
    const mul = transferDir === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      if (transferSort === 'name') return mul * a.player.name.localeCompare(b.player.name);
      if (transferSort === 'in') return mul * (a.player.transfersInEvent - b.player.transfersInEvent);
      if (transferSort === 'out') return mul * (a.player.transfersOutEvent - b.player.transfersOutEvent);
      if (transferSort === 'net') return mul * (a.net - b.net);
      return mul * (Math.abs(a.deltaPct) - Math.abs(b.deltaPct)) || mul * (Math.abs(a.net) - Math.abs(b.net));
    });
    return rows;
  }, [players, transferDir, transferSort]);

  const transferTotalPages = Math.max(1, Math.ceil(sortedTransfers.length / 10));
  const safeTransferPage = Math.min(transferPage, transferTotalPages - 1);
  const visibleTransfers = sortedTransfers.slice(safeTransferPage * 10, safeTransferPage * 10 + 10);

  // Injuries & Suspensions
  const flaggedPlayers = useMemo(() => {
    const sevRank = (p: EnrichedPlayer) => (['d', 'i', 's'].includes(p.status) ? 0 : 1);
    return players
      .filter((p) => p.status !== 'a' || (p.chance !== null && p.chance < 100))
      .sort(
        (a, b) =>
          sevRank(a) - sevRank(b) ||
          (b.chance ?? 50) - (a.chance ?? 50) ||
          b.ownership - a.ownership,
      );
  }, [players]);

  const injuryTotalPages = Math.max(1, Math.ceil(flaggedPlayers.length / 10));
  const safeInjuryPage = Math.min(injuryPage, injuryTotalPages - 1);
  const visibleInjuries = flaggedPlayers.slice(safeInjuryPage * 10, safeInjuryPage * 10 + 10);

  // Swap candidate list for syncing official FPL app transfers
  const swapCandidates = useMemo(() => {
    if (!swapOutPlayer) return [];
    const currentSet = new Set(squadIds);
    const q = swapSearch.trim().toLowerCase();
    return players
      .filter((p) => p.position === swapOutPlayer.position && !currentSet.has(p.id))
      .filter((p) => !q || `${p.name} ${p.fullName} ${p.team.shortName} ${p.team.name}`.toLowerCase().includes(q))
      .sort((a, b) => b.projection - a.projection)
      .slice(0, 12);
  }, [players, squadIds, swapOutPlayer, swapSearch]);

  const handleTeamSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = teamInput.trim();
    onTeamIdChange?.(cleaned);
  };

  const toggleTransferSort = (col: typeof transferSort) => {
    if (transferSort === col) {
      setTransferDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setTransferSort(col);
      setTransferDir('desc');
    }
    setTransferPage(0);
  };

  const scrollVideos = (direction: -1 | 1) => {
    if (!videoTrackRef.current) return;
    videoTrackRef.current.scrollBy({ left: direction * 640, behavior: 'smooth' });
  };

  const renderPitchCard = (playerId: number, isBench: boolean, benchSlotIdx = 0) => {
    const p = playerMap.get(playerId);
    if (!p) return null;
    const fx = getPitchFixture(p.teamId);
    const tone = fdrPillTone(fx.difficulty, fx.isBlank);
    const xp = playerGwXp.get(p.id) ?? p.projection;
    const isCap = !isBench && p.id === pitchLineup.captainId;
    const isVice = !isBench && p.id === pitchLineup.viceId;
    const hasFlag = p.status !== 'a' || (p.chance !== null && p.chance < 100);
    const isSevere = p.status === 'i' || p.status === 's' || p.status === 'u' || p.chance === 0;

    // In Review Gameweek mode, display actual GW points when matches were played; otherwise opponent + difficulty
    const bottomText =
      isReviewMode && selectedGw === snapshot.meta.currentEventId
        ? `${p.eventPoints * (isCap ? 2 : 1)} pts · ${fx.label}`
        : fx.label;

    return (
      <div
        key={p.id}
        className={classNames('vx-pitch-player', isBench && 'vx-pitch-player--bench')}
        title={`${p.fullName} (${p.team.shortName}) · ${fx.label} · ${xp.toFixed(2)} xPts — Click to sync transfer or inspect`}
        onClick={() => setSwapOutPlayer(p)}
      >
        {isBench ? (
          <span className="vx-pitch-pos-label">{benchSlotIdx === 0 ? 'GKP' : p.position}</span>
        ) : (
          <span className="vx-pitch-xp">{(xp * (isCap ? 2 : 1)).toFixed(1)} xP</span>
        )}
        <div className="vx-pitch-avatar-box">
          {hasFlag && (
            <button
              type="button"
              className={classNames('vx-pitch-flag', isSevere && 'is-severe')}
              onClick={(e) => {
                e.stopPropagation();
                setInspectedFlagPlayer(p);
              }}
              aria-label={`${p.name} availability notice`}
              title={formatInjurySummary(p)}
            >
              <AlertTriangle size={12} />
            </button>
          )}
          {isCap && <span className="vx-pitch-armband is-cap">C</span>}
          {isVice && <span className="vx-pitch-armband is-vice">V</span>}
          <PlayerAvatar
            code={p.code}
            teamCode={p.team.code}
            name={p.name}
            fullName={p.fullName}
            teamShort={p.team.shortName}
            position={p.position}
            size="md"
            className="vx-pitch-portrait"
          />
        </div>
        <strong className="vx-pitch-name">{p.name}</strong>
        <span className={classNames('vx-pitch-fix', `is-${tone}`)}>{bottomText}</span>
      </div>
    );
  };

  const startersByPos = (pos: Position) =>
    pitchLineup.starters.filter((id) => playerMap.get(id)?.position === pos);

  const finishedMatchesCount = gwMatchesAndClubs.matches.filter((m) => m.fixture.finished).length;

  return (
    <div className="page page--command">
      {/* ==================== 1. COMPACT HALF-PAGE VORTEX HERO + TOP FPL TEAM ID BAR ==================== */}
      <section className="hero hero--compact" aria-labelledby="hero-title">
        <div className="hero__noise" />
        <div className="hero__content hero__content--compact">
          <div className="eyebrow">
            <Sparkles size={14} /> FPL VORTEX · @FPLVORTEX · {snapshot.meta.season}
          </div>
          <h2 id="hero-title">Every transfer, captain and fixture — pulled into focus.</h2>

          {/* PROMINENT TOP FPL TEAM ID CONNECT BAR */}
          <form className="vx-top-id-bar" onSubmit={handleTeamSubmit} aria-label="Connect your FPL Team ID">
            <div className="vx-top-id-bar__field">
              <label htmlFor="fpl-team-id-top" className="vx-top-id-bar__label">
                <UserCheck size={16} />
                <span>FPL Team ID</span>
              </label>
              <TeamIdInput
                ref={topInputRef}
                id="fpl-team-id-top"
                value={teamInput}
                onChange={setTeamInput}
                recentTeams={recentTeams}
                onRemoveRecent={onRemoveRecentTeam}
                onSelectRecent={(selectedId) => {
                  setTeamInput(selectedId);
                  onTeamIdChange?.(selectedId);
                }}
              />
            </div>
            <button type="submit" className="button button--primary" disabled={entryLoading}>
              {entryLoading ? 'Loading…' : hasLinkedTeam ? 'Reload Squad' : 'Load Squad & Review'}
            </button>
            {hasLinkedTeam && (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  setTeamInput('');
                  onTeamIdChange?.('');
                }}
                title="Disconnect current FPL Team ID"
              >
                Change / Clear
              </button>
            )}
          </form>

          {entryError && (
            <p className="vx-top-id-error" role="alert">
              <AlertTriangle size={14} /> {entryError}
            </p>
          )}

          <div className="hero__actions hero__actions--compact">
            <button type="button" className="button button--primary" onClick={() => onNavigate('optimizer')}>
              <WandSparkles size={17} /> Planner, Chips & Simulation <ArrowRight size={16} />
            </button>
            <button type="button" className="button button--ghost" onClick={onOpenPalette}>
              <Target size={17} /> Search {formatNumber(snapshot.players.length)} players
            </button>
          </div>

          <div className="hero__trust hero__trust--premium">
            <span>
              <Users size={16} /> <strong>{formatNumber(snapshot.players.length)}</strong> Premier League players
            </span>
            <span>
              <Clock size={16} /> GW{nextEventId} deadline <strong>{deadline.label}</strong>
            </span>
            {hasLinkedTeam && entry && (
              <span>
                <Trophy size={16} /> <strong>{entry.teamName}</strong> · OR{' '}
                <strong>{entry.overallRank ? formatNumber(entry.overallRank) : '—'}</strong> ·{' '}
                <strong>{entry.freeTransfers} FT</strong>
              </span>
            )}
          </div>
        </div>

        {/* PREMIUM RIGHT VISUAL ORB + HIGH-CONTRAST FLOAT CARDS */}
        <div className="hero__visual hero__visual--compact" aria-hidden="true">
          <div className="vortex-orb vortex-orb--compact">
            <span className="vortex-orb__ring vortex-orb__ring--one" />
            <span className="vortex-orb__ring vortex-orb__ring--two" />
            <span className="vortex-orb__ring vortex-orb__ring--three" />
            <div className="vortex-orb__core vortex-orb__core--premium">
              <img
                src={BRAND_LION_SRC}
                alt=""
                className="vortex-orb__crest"
              />
              <span className="vortex-orb__gw">GW{nextEventId}</span>
              <strong className="vortex-orb__pts">{heroOrbXp.toFixed(1)}</strong>
              <small className="vortex-orb__caption">Projected XI pts</small>
            </div>
          </div>

          {captain && (
            <div className="float-card float-card--captain float-card--premium">
              <div className="float-card__row">
                <PlayerAvatar
                  code={captain.code}
                  teamCode={captain.team.code}
                  name={captain.name}
                  fullName={captain.fullName}
                  teamShort={captain.team.shortName}
                  position={captain.position}
                  size="md"
                />
                <div className="float-card__copy">
                  <span className="float-card__label">
                    <Crown size={13} /> #1 CAPTAIN
                  </span>
                  <div className="float-card__title">{captain.name}</div>
                  <div className="float-card__meta">
                    {captain.team.shortName} · {(captain.projection * 2).toFixed(1)} 2× xPts
                  </div>
                </div>
              </div>
            </div>
          )}

          {bestFixture && (
            <div className="float-card float-card--fixture float-card--premium">
              <div className="float-card__row">
                <ClubBadge
                  teamCode={bestFixture.team.code}
                  shortName={bestFixture.team.shortName}
                  teamName={bestFixture.team.name}
                  size="lg"
                />
                <div className="float-card__copy">
                  <span className="float-card__label">
                    <Flame size={13} /> BEST 5-GW RUN
                  </span>
                  <div className="float-card__title">{bestFixture.team.name}</div>
                  <div className="float-card__meta">
                    Ease +{bestFixture.easeSum5} · {bestFixture.next5.toFixed(2)} FDR
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ==================== GAMEWEEK REVIEW & FORECAST CONTROL BAR ==================== */}
      <section className="vx-gw-bar" aria-label="Review gameweek and sync controls">
        <div className="vx-gw-bar__left">
          <span className="vx-gw-bar__dot" />
          <strong>Gameweek Hub</strong>
          {hasLinkedTeam && (
            <div className="vx-seg-pills" role="group" aria-label="Review vs Forecast mode">
              <button
                type="button"
                className={classNames(selectedGw === reviewEventId && 'is-active')}
                onClick={() => setSelectedGw(reviewEventId)}
              >
                Review GW {reviewEventId}
              </button>
              <button
                type="button"
                className={classNames(selectedGw === nextEventId && 'is-active')}
                onClick={() => setSelectedGw(nextEventId)}
              >
                Forecast GW {nextEventId}
              </button>
            </div>
          )}
        </div>

        <div className="vx-gw-stepper">
          <button
            type="button"
            className="icon-button vx-gw-stepper__btn"
            onClick={() => setSelectedGw((gw) => Math.max(1, gw - 1))}
            disabled={selectedGw <= 1}
            aria-label="Previous gameweek"
          >
            <ChevronLeft size={17} />
          </button>
          <label className="vx-gw-stepper__select-wrap">
            <select
              value={selectedGw}
              onChange={(e) => setSelectedGw(Number(e.target.value))}
              aria-label="Select review gameweek"
            >
              {snapshot.gameweeks.map((gw) => (
                <option key={gw.id} value={gw.id}>
                  Gameweek {gw.id}
                  {gw.id === reviewEventId ? ' (Review GW)' : gw.id === nextEventId ? ' (Next GW)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </label>
          <button
            type="button"
            className="icon-button vx-gw-stepper__btn"
            onClick={() => setSelectedGw((gw) => Math.min(38, gw + 1))}
            disabled={selectedGw >= 38}
            aria-label="Next gameweek"
          >
            <ChevronRight size={17} />
          </button>
        </div>

        <div className="vx-gw-bar__right">
          {hasLinkedTeam && (
            <button
              type="button"
              className="button button--ghost button--sm"
              onClick={() => {
                const firstStarter = playerMap.get(pitchLineup.starters[0]);
                if (firstStarter) setSwapOutPlayer(firstStarter);
              }}
              title="Official FPL hides pre-deadline transfers on public endpoints until the deadline locks. Click to apply any transfer you already made in the FPL app."
            >
              <ArrowLeftRight size={14} /> Sync App Transfer
              {pendingSwaps.length > 0 ? ` (${pendingSwaps.length})` : ''}
            </button>
          )}
          <button
            type="button"
            className="button button--subtle button--sm"
            onClick={onRefresh}
            disabled={refreshing || entryLoading}
          >
            <RefreshCw size={14} className={classNames((refreshing || entryLoading) && 'spin')} />{' '}
            {refreshing || entryLoading ? 'Syncing…' : 'Sync Official FPL'}
          </button>
        </div>
      </section>

      {/* ==================== 2. UPPER 3-COLUMN VORTEX HUB (IMAGE 1 — STAYS AT TOP!) ==================== */}
      <section className="vx-hub-upper" aria-label="Squad review pitch, fixtures and projected goals">
        {/* COLUMN 1: GATED ON FPL TEAM ID INPUT -> UNLOCKS FULL SOCCER PITCH & REVIEW GW DATA */}
        <article className="panel vx-card vx-card--pitch">
          {!hasLinkedTeam ? (
            <div className="vx-pitch-gate">
              <div className="vx-pitch-gate__badge">
                <img src={BRAND_LION_SRC} alt="FPL VORTEX" width={58} height={58} />
              </div>
              <span className="panel__eyebrow">SQUAD PITCH & GAMEWEEK {reviewEventId} REVIEW</span>
              <h3>Enter your FPL Team ID to view your Soccer Pitch & Review Gameweek</h3>
              <p>
                Connect your public FPL Team ID (no password needed) to load your 15-player starting XI & bench,
                Review Gameweek {reviewEventId} points, overall rank, free transfers, and Gameweek {nextEventId} xP
                forecast.
              </p>

              <form className="vx-pitch-gate__form" onSubmit={handleTeamSubmit}>
                <TeamIdInput
                  value={teamInput}
                  onChange={setTeamInput}
                  recentTeams={recentTeams}
                  onRemoveRecent={onRemoveRecentTeam}
                  onSelectRecent={(selectedId) => {
                    setTeamInput(selectedId);
                    onTeamIdChange?.(selectedId);
                  }}
                  ariaLabel="FPL Team ID"
                />
                <button type="submit" className="button button--primary" disabled={entryLoading}>
                  {entryLoading ? 'Loading…' : 'Load My Squad'}
                </button>
              </form>

              <div className="vx-pitch-gate__note">
                <strong>Where is my FPL ID?</strong> Open <em>fantasy.premierleague.com</em> → <em>Points</em>. Your
                ID is the number in <code>/entry/…/event/…</code>.
              </div>
            </div>
          ) : (
            <>
              <header className="vx-card__header vx-pitch-header">
                <div className="vx-pitch-header__identity">
                  <strong>{entry!.teamName}</strong>
                  <button
                    type="button"
                    className="vx-team-id-trigger"
                    onClick={() => topInputRef.current?.focus()}
                    title="Change FPL Team ID at top"
                  >
                    <span>Team ID: {entry!.id}</span>
                    <Pencil size={12} />
                  </button>
                </div>

                <div className="vx-pitch-header__center">
                  <strong>
                    {isReviewMode ? entry!.history.points : pitchLineup.totalXp.toFixed(1)}
                  </strong>
                  <span>
                    {isReviewMode ? `GW ${selectedGw} Review Pts` : `GW ${selectedGw} xP`}
                  </span>
                </div>

                <div className="vx-pitch-header__actions">
                  <button type="button" className="vx-inline-link" onClick={() => onNavigate('optimizer')}>
                    Plan team <ArrowRight size={14} />
                  </button>
                  <div className="vx-view-toggle" role="group" aria-label="Squad view">
                    <button
                      type="button"
                      className={classNames(squadView === 'pitch' && 'is-active')}
                      onClick={() => setSquadView('pitch')}
                      aria-label="Pitch view"
                      title="Pitch view"
                    >
                      <LayoutGrid size={15} />
                    </button>
                    <button
                      type="button"
                      className={classNames(squadView === 'table' && 'is-active')}
                      onClick={() => setSquadView('table')}
                      aria-label="Table view"
                      title="Table view"
                    >
                      <List size={15} />
                    </button>
                  </div>
                </div>
              </header>

              {/* 5-STAT REVIEW GAMEWEEK DATA STRIP */}
              <div className="vx-review-strip" aria-label="Review gameweek summary">
                <div>
                  <strong>{entry!.history.points}</strong>
                  <small>GW {entry!.currentEvent} Pts</small>
                </div>
                <div>
                  <strong>{reviewEventObj?.averageEntryScore || '—'}</strong>
                  <small>GW {entry!.currentEvent} Avg</small>
                </div>
                <div>
                  <strong>{entry!.overallRank ? formatCompact(entry!.overallRank) : '—'}</strong>
                  <small>Overall Rank</small>
                </div>
                <div>
                  <strong>{pitchLineup.nextGwXp.toFixed(1)}</strong>
                  <small>GW {nextEventId} xP</small>
                </div>
                <div>
                  <strong>
                    {entry!.freeTransfers} FT · £{(entry!.history.bank / 10).toFixed(1)}m
                  </strong>
                  <small>Transfers & Bank</small>
                </div>
              </div>

              {/* SYNC NOTICE FOR PRE-DEADLINE OFFICIAL APP TRANSFERS */}
              <div className="vx-sync-banner">
                <span>
                  <span className="vx-sync-dot" />
                  {pendingSwaps.length > 0 ? (
                    <>
                      <strong>{pendingSwaps.length} app transfer{pendingSwaps.length > 1 ? 's' : ''} applied</strong>{' '}
                      on top of official GW {entry!.currentEvent} squad.
                    </>
                  ) : (
                    <>
                      Official FPL locks public squad feeds at <strong>GW {entry!.currentEvent}</strong> until GW{' '}
                      {nextEventId} deadline. Made a transfer in the FPL app? Click any player below to sync it.
                    </>
                  )}
                </span>
                {pendingSwaps.length > 0 && (
                  <button type="button" className="vx-inline-link" onClick={onClearPendingSwaps}>
                    Reset
                  </button>
                )}
              </div>

              {squadView === 'pitch' ? (
                <div className="vx-soccer-pitch">
                  <div className="vx-pitch-top-boards">
                    <div className="vx-pitch-board">
                      <img src={BRAND_LION_SRC} alt="" width={20} height={20} />
                      <span>FPL VORTEX</span>
                    </div>
                    <div className="vx-pitch-goal-net" aria-hidden="true" />
                    <a
                      href="https://www.youtube.com/@Fplvortex"
                      target="_blank"
                      rel="noreferrer"
                      className="vx-pitch-board vx-pitch-board--link"
                    >
                      <span>@FPLVORTEX · GW {selectedGw}</span>
                    </a>
                  </div>

                  <div className="vx-pitch-turf">
                    <div className="vx-pitch-lines" aria-hidden="true">
                      <span className="vx-pitch-box-18" />
                      <span className="vx-pitch-box-6" />
                      <span className="vx-pitch-halfway" />
                      <span className="vx-pitch-circle" />
                    </div>

                    <div className="vx-pitch-formation">
                      <div className="vx-pitch-row">{startersByPos('GKP').map((id) => renderPitchCard(id, false))}</div>
                      <div className="vx-pitch-row">{startersByPos('DEF').map((id) => renderPitchCard(id, false))}</div>
                      <div className="vx-pitch-row">{startersByPos('MID').map((id) => renderPitchCard(id, false))}</div>
                      <div className="vx-pitch-row">{startersByPos('FWD').map((id) => renderPitchCard(id, false))}</div>
                    </div>

                    <div className="vx-pitch-bench">
                      {pitchLineup.bench.map((id, idx) => renderPitchCard(id, true, idx))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="vx-squad-table-wrap">
                  <table className="vx-compact-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Pos</th>
                        <th>Fixture</th>
                        <th>GW {entry!.currentEvent} Pts</th>
                        <th>GW {nextEventId} xP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...pitchLineup.starters, ...pitchLineup.bench].map((id, idx) => {
                        const p = playerMap.get(id);
                        if (!p) return null;
                        const fx = getPitchFixture(p.teamId);
                        const tone = fdrPillTone(fx.difficulty, fx.isBlank);
                        const isBench = idx >= 11;
                        const isCap = p.id === pitchLineup.captainId;
                        const isVice = p.id === pitchLineup.viceId;
                        return (
                          <tr
                            key={p.id}
                            className={classNames('vx-clickable-row', isBench && 'is-bench-row')}
                            onClick={() => setSwapOutPlayer(p)}
                          >
                            <td>
                              <div className="vx-mini-player">
                                <PlayerAvatar
                                  code={p.code}
                                  teamCode={p.team.code}
                                  name={p.name}
                                  fullName={p.fullName}
                                  teamShort={p.team.shortName}
                                  position={p.position}
                                  size="sm"
                                />
                                <div>
                                  <strong>
                                    {p.name} {isCap ? '(C)' : isVice ? '(V)' : ''}
                                  </strong>
                                  <small className="block-sub">
                                    {p.team.shortName} · {formatPrice(p.price)}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>{p.position}</td>
                            <td>
                              <span className={classNames('vx-pitch-fix vx-pitch-fix--inline', `is-${tone}`)}>
                                {fx.label}
                              </span>
                            </td>
                            <td className="mono-num">{p.eventPoints}</td>
                            <td className="mono-num">
                              <strong>
                                {((p.gwProjections?.[nextEventId] ?? p.projection) * (isCap ? 2 : 1)).toFixed(2)}
                              </strong>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </article>

        {/* COLUMN 2: GW FIXTURES CARD */}
        <article className="panel vx-card vx-card--fixtures">
          <header className="vx-card__header">
            <div>
              <h3>GW {selectedGw} Fixtures</h3>
              {finishedMatchesCount > 0 && (
                <small className="vx-card__sub">
                  {finishedMatchesCount} of {gwMatchesAndClubs.matches.length} played
                </small>
              )}
            </div>
            <button type="button" className="vx-inline-link" onClick={() => onNavigate('fixtures')}>
              All matches <ArrowRight size={14} />
            </button>
          </header>

          <div className="vx-card__scroll">
            {groupedMatches.map((group) => (
              <div key={group.dateLabel} className="vx-fixture-group">
                <div className="vx-fixture-date-banner">{group.dateLabel}</div>
                {group.items.map((m) => {
                  const homeShort = m.homeTeam?.shortName ?? 'HOM';
                  const awayShort = m.awayTeam?.shortName ?? 'AWY';
                  const kickoffLabel =
                    m.fixture.started || m.fixture.finished
                      ? `${m.fixture.teamHScore ?? 0} – ${m.fixture.teamAScore ?? 0}`
                      : m.fixture.kickoffTime
                        ? new Intl.DateTimeFormat('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          }).format(new Date(m.fixture.kickoffTime))
                        : 'TBC';
                  const isExpanded = expandedFixtureId === m.fixture.id;
                  const homeBarColor = CLUB_BAR_COLORS[homeShort] ?? '#5BF5D6';
                  const awayBarColor = CLUB_BAR_COLORS[awayShort] ?? '#7772FF';

                  return (
                    <div key={m.fixture.id} className="vx-match-item">
                      <button
                        type="button"
                        className="vx-match-row"
                        onClick={() => setExpandedFixtureId(isExpanded ? null : m.fixture.id)}
                      >
                        <span className="vx-match-team is-home">
                          <strong>{homeShort}</strong>
                          {m.homeTeam && (
                            <ClubBadge
                              teamCode={m.homeTeam.code}
                              shortName={homeShort}
                              teamName={m.homeTeam.name}
                              size="sm"
                            />
                          )}
                        </span>
                        <span className={classNames('vx-match-pill', m.fixture.finished && 'is-finished')}>
                          {kickoffLabel}
                        </span>
                        <span className="vx-match-team is-away">
                          {m.awayTeam && (
                            <ClubBadge
                              teamCode={m.awayTeam.code}
                              shortName={awayShort}
                              teamName={m.awayTeam.name}
                              size="sm"
                            />
                          )}
                          <strong>{awayShort}</strong>
                          <ChevronDown size={14} className={classNames('vx-match-chevron', isExpanded && 'is-open')} />
                        </span>
                      </button>

                      <div className="vx-xg-split-bar" aria-hidden="true">
                        <span style={{ flex: Math.max(0.15, m.homeXg), background: homeBarColor }} />
                        <span style={{ flex: Math.max(0.15, m.awayXg), background: awayBarColor }} />
                      </div>
                      <div className="vx-xg-labels">
                        <strong>{m.homeXg.toFixed(2)}</strong>
                        <span>Projected xG</span>
                        <strong>{m.awayXg.toFixed(2)}</strong>
                      </div>

                      {isExpanded && (
                        <div className="vx-match-probs">
                          <span>Home {(m.homeWin * 100).toFixed(0)}%</span>
                          <span>Draw {(m.draw * 100).toFixed(0)}%</span>
                          <span>Away {(m.awayWin * 100).toFixed(0)}%</span>
                          <span>
                            CS {(m.homeCs * 100).toFixed(0)}% / {(m.awayCs * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </article>

        {/* COLUMN 3: GW PROJECTED GOALS / CS% / WIN% CARD */}
        <article className="panel vx-card vx-card--goals">
          <header className="vx-card__header vx-card__header--wrap">
            <div className="vx-card__title-icon">
              <Shield size={16} className="vx-icon-mint" />
              <h3>
                GW {selectedGw}{' '}
                {projMetric === 'goals' ? 'Projected Goals' : projMetric === 'cs' ? 'Clean Sheet %' : 'Win %'}
              </h3>
            </div>
            <div className="vx-seg-pills" role="group" aria-label="Club projection metric">
              <button
                type="button"
                className={classNames(projMetric === 'goals' && 'is-active')}
                onClick={() => setProjMetric('goals')}
              >
                Goals
              </button>
              <button
                type="button"
                className={classNames(projMetric === 'cs' && 'is-active')}
                onClick={() => setProjMetric('cs')}
              >
                CS%
              </button>
              <button
                type="button"
                className={classNames(projMetric === 'win' && 'is-active')}
                onClick={() => setProjMetric('win')}
              >
                Win%
              </button>
            </div>
          </header>

          <div className="vx-card__scroll vx-club-bars">
            {sortedClubs.map((club, index) => {
              const val = club[projMetric];
              const pctWidth = Math.max(4, (val / maxClubVal) * 100);
              return (
                <div key={club.teamId} className="vx-club-bar-row">
                  <span className="vx-row-idx">{index + 1}.</span>
                  <ClubBadge teamCode={club.code} shortName={club.shortName} teamName={club.name} size="sm" />
                  <strong className="vx-club-short">{club.shortName}</strong>
                  <small className="vx-club-opp">{club.oppLabel}</small>
                  <div className="vx-bar-track" aria-hidden="true">
                    <span className="vx-bar-fill" style={{ width: `${pctWidth}%` }} />
                  </div>
                  <strong className="vx-club-val mono-num">
                    {projMetric === 'goals' ? val.toFixed(2) : `${(val * 100).toFixed(0)}%`}
                  </strong>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      {/* ==================== 3. LOWER 3-COLUMN INTELLIGENCE GRID (IMAGE 2 TOP) ==================== */}
      <section className="vx-hub-lower" aria-label="Top players, price changes and injuries">
        {/* CARD 1: TOP PLAYERS */}
        <article className="panel vx-card vx-card--lower">
          <header className="vx-card__header">
            <div className="vx-card__title-icon">
              <Trophy size={16} className="vx-icon-amber" />
              <h3>Top Players</h3>
            </div>
            <select
              className="vx-mini-select"
              value={topMetric}
              onChange={(e) => setTopMetric(e.target.value as typeof topMetric)}
              aria-label="Top players metric"
            >
              <option value="season">Season points</option>
              <option value="nextXp">GW {selectedGw} xPts</option>
              <option value="gwPts">GW {snapshot.meta.currentEventId} points</option>
              <option value="horizon5">5-GW xPts</option>
            </select>
          </header>

          <div className="vx-card__scroll vx-top-players-list">
            {topPlayersList.map(({ player, score }, idx) => {
              const pct = Math.max(6, (score / maxTopScore) * 100);
              const formattedScore =
                topMetric === 'season' || topMetric === 'gwPts' ? String(Math.round(score)) : score.toFixed(1);
              return (
                <button
                  type="button"
                  key={player.id}
                  className="vx-top-player-row"
                  onClick={() => onSelectPlayer?.(player.name)}
                >
                  <span className="vx-row-idx">{idx + 1}.</span>
                  <PlayerAvatar
                    code={player.code}
                    teamCode={player.team.code}
                    name={player.name}
                    fullName={player.fullName}
                    teamShort={player.team.shortName}
                    position={player.position}
                    size="md"
                    className="vx-list-avatar"
                  />
                  <div className="vx-player-meta">
                    <strong>{player.name}</strong>
                    <small>
                      <ClubBadge
                        teamCode={player.team.code}
                        shortName={player.team.shortName}
                        teamName={player.team.name}
                        size="sm"
                      />
                      <span>
                        {player.position} · {formatPrice(player.price)}
                      </span>
                    </small>
                  </div>
                  <div className="vx-bar-track" aria-hidden="true">
                    <span className="vx-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <strong className="vx-top-score mono-num">{formattedScore}</strong>
                </button>
              );
            })}
          </div>

          <footer className="vx-card__footer">
            <button type="button" className="vx-inline-link" onClick={() => onNavigate('players')}>
              All player stats <ArrowRight size={14} />
            </button>
            <small>{formatNumber(players.length)} players</small>
          </footer>
        </article>

        {/* CARD 2: PRICE & TRANSFERS */}
        <article className="panel vx-card vx-card--lower">
          <header className="vx-card__header">
            <div className="vx-card__title-icon">
              <ArrowLeftRight size={16} className="vx-icon-mint" />
              <h3>Price & Transfers</h3>
            </div>
            <button type="button" className="vx-inline-link" onClick={() => onNavigate('players')}>
              Price changes <ArrowRight size={14} />
            </button>
          </header>

          <div className="vx-card__scroll">
            <table className="vx-transfer-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => toggleTransferSort('name')}>
                      Player {transferSort === 'name' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="is-right">
                    <button type="button" onClick={() => toggleTransferSort('delta')}>
                      Price Δ% {transferSort === 'delta' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="is-right">
                    <button type="button" onClick={() => toggleTransferSort('in')}>
                      In {transferSort === 'in' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="is-right">
                    <button type="button" onClick={() => toggleTransferSort('out')}>
                      Out {transferSort === 'out' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="is-right">
                    <button type="button" onClick={() => toggleTransferSort('net')}>
                      Net {transferSort === 'net' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleTransfers.map(({ player, deltaPct, net }) => (
                  <tr key={player.id} onClick={() => onSelectPlayer?.(player.name)} className="vx-clickable-row">
                    <td>
                      <div className="vx-mini-player">
                        <PlayerAvatar
                          code={player.code}
                          teamCode={player.team.code}
                          name={player.name}
                          fullName={player.fullName}
                          teamShort={player.team.shortName}
                          position={player.position}
                          size="md"
                          className="vx-list-avatar"
                        />
                        <div className="vx-player-meta">
                          <strong>{player.name}</strong>
                          <small>
                            <ClubBadge
                              teamCode={player.team.code}
                              shortName={player.team.shortName}
                              teamName={player.team.name}
                              size="sm"
                            />
                            <span>
                              {player.position} · {formatPrice(player.price)}
                            </span>
                          </small>
                        </div>
                      </div>
                    </td>
                    <td className={classNames('is-right mono-num', deltaPct >= 0 ? 'is-positive' : 'is-negative')}>
                      {deltaPct > 0 ? '+' : ''}
                      {deltaPct.toFixed(1)}%
                    </td>
                    <td className="is-right mono-num">{formatCompact(player.transfersInEvent)}</td>
                    <td className="is-right mono-num">{formatCompact(player.transfersOutEvent)}</td>
                    <td className={classNames('is-right mono-num', net >= 0 ? 'is-positive' : 'is-negative')}>
                      {net > 0 ? `+${formatCompact(net)}` : formatCompact(net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="vx-card__footer">
            <small>{formatNumber(players.length)} players</small>
            <div className="vx-pager">
              <small>
                Page {safeTransferPage + 1} of {transferTotalPages}
              </small>
              <button
                type="button"
                className="icon-button vx-pager__btn"
                disabled={safeTransferPage <= 0}
                onClick={() => setTransferPage((p) => Math.max(0, p - 1))}
                aria-label="Previous transfer page"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                className="icon-button vx-pager__btn"
                disabled={safeTransferPage >= transferTotalPages - 1}
                onClick={() => setTransferPage((p) => Math.min(transferTotalPages - 1, p + 1))}
                aria-label="Next transfer page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </footer>
        </article>

        {/* CARD 3: INJURIES & SUSPENSIONS */}
        <article className="panel vx-card vx-card--lower">
          <header className="vx-card__header">
            <div className="vx-card__title-icon">
              <Stethoscope size={16} className="vx-icon-pink" />
              <h3>Injuries & Suspensions</h3>
            </div>
            <small className="vx-card__sub">{flaggedPlayers.length} players</small>
          </header>

          <div className="vx-card__scroll vx-injuries-list">
            {visibleInjuries.map((player) => {
              const isSevere =
                player.status === 'i' || player.status === 's' || player.status === 'u' || player.chance === 0;
              return (
                <button
                  type="button"
                  key={player.id}
                  className="vx-injury-row"
                  onClick={() => setInspectedFlagPlayer(player)}
                >
                  <PlayerAvatar
                    code={player.code}
                    teamCode={player.team.code}
                    name={player.name}
                    fullName={player.fullName}
                    teamShort={player.team.shortName}
                    position={player.position}
                    size="md"
                    className="vx-list-avatar"
                  />
                  <div className="vx-injury-copy">
                    <div className="vx-injury-head">
                      <strong>{player.name}</strong>
                      <ClubBadge
                        teamCode={player.team.code}
                        shortName={player.team.shortName}
                        teamName={player.team.name}
                        size="sm"
                      />
                      <span>{player.position}</span>
                    </div>
                    <small>{formatInjurySummary(player)}</small>
                  </div>
                  <span className={classNames('vx-warn-icon', isSevere && 'is-severe')}>
                    <AlertTriangle size={16} />
                  </span>
                </button>
              );
            })}
          </div>

          <footer className="vx-card__footer vx-card__footer--spread">
            <button
              type="button"
              className="button button--ghost button--xs"
              disabled={safeInjuryPage <= 0}
              onClick={() => setInjuryPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <small>
              {safeInjuryPage + 1} / {injuryTotalPages}
            </small>
            <button
              type="button"
              className="button button--ghost button--xs"
              disabled={safeInjuryPage >= injuryTotalPages - 1}
              onClick={() => setInjuryPage((p) => Math.min(injuryTotalPages - 1, p + 1))}
            >
              Next <ChevronRight size={14} />
            </button>
          </footer>
        </article>
      </section>

      {/* ==================== 4. COMPACT HORIZONTAL SCROLLABLE YOUTUBE STRIP (IMAGE 2 BOTTOM) ==================== */}
      <section className="panel vx-videos-strip" aria-label="Latest FPL VORTEX YouTube videos">
        <header className="vx-card__header vx-videos-strip__header">
          <div className="vx-card__title-icon">
            <span className="vx-yt-badge">
              <Play size={12} fill="currentColor" />
            </span>
            <h3>Latest FPL Videos · @FPLVORTEX</h3>
          </div>

          <div className="vx-videos-strip__actions">
            <div className="vx-pager" role="group" aria-label="Scroll videos">
              <button
                type="button"
                className="icon-button vx-pager__btn"
                onClick={() => scrollVideos(-1)}
                aria-label="Scroll videos left"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="icon-button vx-pager__btn"
                onClick={() => scrollVideos(1)}
                aria-label="Scroll videos right"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <a
              href="https://www.youtube.com/@Fplvortex"
              target="_blank"
              rel="noreferrer"
              className="vx-yt-channel-btn"
            >
              <img src={BRAND_LION_SRC} alt="" width={20} height={20} />
              <span>@FPLVORTEX Channel</span>
              <ExternalLink size={13} />
            </a>
          </div>
        </header>

        <div className="vx-videos-scroll-row" ref={videoTrackRef}>
          {videos.map((video) => (
            <a
              key={video.id}
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="vx-video-pill"
            >
              <div className="vx-video-pill__thumb">
                <img
                  src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                  alt={video.title}
                  loading="lazy"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (!img.dataset.fallback) {
                      img.dataset.fallback = '1';
                      img.src = BRAND_LION_SRC;
                    }
                  }}
                />
                <span className="vx-video-pill__badge">
                  <Play size={10} fill="currentColor" /> Watch
                </span>
              </div>
              <div className="vx-video-pill__copy">
                <strong>{video.title}</strong>
                <span>FPL VORTEX (@FPLVORTEX)</span>
                <small>
                  <Clock size={11} /> {relativeTime(video.published)}
                </small>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Availability Detail Modal */}
      {inspectedFlagPlayer && (
        <div className="palette-overlay" role="presentation" onMouseDown={() => setInspectedFlagPlayer(null)}>
          <section
            className="vx-flag-modal panel"
            role="dialog"
            aria-modal="true"
            aria-label={`${inspectedFlagPlayer.name} availability`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="vx-flag-modal__head">
              <PlayerAvatar
                code={inspectedFlagPlayer.code}
                teamCode={inspectedFlagPlayer.team.code}
                name={inspectedFlagPlayer.name}
                fullName={inspectedFlagPlayer.fullName}
                teamShort={inspectedFlagPlayer.team.shortName}
                position={inspectedFlagPlayer.position}
                size="lg"
              />
              <div>
                <span className="panel__eyebrow">
                  {inspectedFlagPlayer.team.name} · {inspectedFlagPlayer.position} ·{' '}
                  {formatPrice(inspectedFlagPlayer.price)}
                </span>
                <h3>{inspectedFlagPlayer.fullName}</h3>
                <p>{formatInjurySummary(inspectedFlagPlayer)}</p>
              </div>
            </div>
            <div className="vx-flag-modal__stats">
              <div>
                <span>GW {selectedGw} xP</span>
                <strong>{(playerGwXp.get(inspectedFlagPlayer.id) ?? inspectedFlagPlayer.projection).toFixed(2)}</strong>
              </div>
              <div>
                <span>5-GW xP</span>
                <strong>{inspectedFlagPlayer.horizon5Projection.toFixed(1)}</strong>
              </div>
              <div>
                <span>Expected Mins</span>
                <strong>{Math.round(inspectedFlagPlayer.modelBreakdown.expectedMinutes)}m</strong>
              </div>
              <div>
                <span>Ownership</span>
                <strong>{inspectedFlagPlayer.ownership.toFixed(1)}%</strong>
              </div>
            </div>
            <div className="vx-flag-modal__actions">
              <button
                type="button"
                className="button button--primary button--sm"
                onClick={() => {
                  const name = inspectedFlagPlayer.name;
                  setInspectedFlagPlayer(null);
                  onSelectPlayer?.(name);
                }}
              >
                Open in Player Lab <ArrowRight size={14} />
              </button>
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => setInspectedFlagPlayer(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Sync App Transfer Modal (when clicking a player on pitch or "Sync App Transfer") */}
      {swapOutPlayer && hasLinkedTeam && (
        <div className="palette-overlay" role="presentation" onMouseDown={() => setSwapOutPlayer(null)}>
          <section
            className="vx-swap-modal panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Sync transfer for ${swapOutPlayer.name}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="vx-swap-modal__head">
              <div>
                <span className="panel__eyebrow">SYNC OFFICIAL FPL APP TRANSFER · {swapOutPlayer.position}</span>
                <h3>Replace {swapOutPlayer.name} ({formatPrice(swapOutPlayer.price)})</h3>
                <p>
                  Official FPL hides upcoming-GW transfers on public endpoints before the deadline. Select the{' '}
                  {swapOutPlayer.position} you brought in on the FPL app to sync your pitch & planner immediately.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSwapOutPlayer(null)}
                aria-label="Close transfer sync"
              >
                <X size={18} />
              </button>
            </header>

            <label className="vx-swap-modal__search">
              <Search size={15} />
              <input
                type="text"
                placeholder={`Search ${swapOutPlayer.position} replacement by name or club…`}
                value={swapSearch}
                onChange={(e) => setSwapSearch(e.target.value)}
                autoFocus
              />
            </label>

            <div className="vx-swap-modal__list">
              {swapCandidates.map((cand) => (
                <button
                  type="button"
                  key={cand.id}
                  className="vx-swap-modal__row"
                  onClick={() => {
                    onAddPendingSwap?.(swapOutPlayer.id, cand.id);
                    setSwapOutPlayer(null);
                    setSwapSearch('');
                  }}
                >
                  <PlayerAvatar
                    code={cand.code}
                    teamCode={cand.team.code}
                    name={cand.name}
                    fullName={cand.fullName}
                    teamShort={cand.team.shortName}
                    position={cand.position}
                    size="sm"
                  />
                  <div className="vx-player-meta">
                    <strong>{cand.name}</strong>
                    <small>
                      <ClubBadge
                        teamCode={cand.team.code}
                        shortName={cand.team.shortName}
                        teamName={cand.team.name}
                        size="sm"
                      />
                      <span>
                        {cand.team.shortName} · {formatPrice(cand.price)}
                      </span>
                    </small>
                  </div>
                  <span className="vx-swap-modal__xp mono-num">
                    {(cand.gwProjections?.[nextEventId] ?? cand.projection).toFixed(2)} xP
                  </span>
                </button>
              ))}
            </div>

            <footer className="vx-flag-modal__actions">
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => {
                  const name = swapOutPlayer.name;
                  setSwapOutPlayer(null);
                  onSelectPlayer?.(name);
                }}
              >
                Inspect {swapOutPlayer.name} in Player Lab
              </button>
              <button type="button" className="button button--ghost button--sm" onClick={() => setSwapOutPlayer(null)}>
                Cancel
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
