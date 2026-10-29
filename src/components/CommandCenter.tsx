import { makeFixtureForecasts, fixtureCellIndex, difficultyColor } from '../lib/fixtureForecast';
import { marketCoverage, fixtureQuoteNotice } from '../lib/marketCoverage';
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
  Minus,
  Pencil,
  Play,
  RefreshCw,
  Shield,
  Sparkles,
  Star,
  Stethoscope,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  WandSparkles,
} from 'lucide-react';
import type { PendingSwap } from '../App';
import type { RouteId } from '../hooks/useHashRoute';
import { BRAND_LION_SRC } from '../lib/baseUrl';
import { useNow } from '../hooks/useNow';
import { SaveTableButton } from './SaveTableButton';
import type { PngTable } from '../lib/tablePng';
import { downloadPitchPng } from '../lib/pitchPng';
import { fetchVideos } from '../lib/api';
import {
  buildInsights,
  computePriceChangePrediction,
  parsePlayerInjuryDetails,
  toRepoElement,
  type PriceChangeStatus,
} from '../lib/analytics';
import { applyHistoricalStrengths, toRepoFixtures, toRepoTeams } from '../lib/fixtures';
import {
  classNames,
  countdown,
  formatCompact,
  formatNumber,
  formatPrice,
  relativeTime,
} from '../lib/format';
import { buildStrengths, projectMatch } from '../lib/repoModel/dashboardMath';
import { forecastFromGoalRates } from '../lib/repoModel/scoreDistribution';
import { resolveSquadPurchaseAndSellingPrices } from '../lib/freeTransfers';
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
import { InjuryDetailModal } from './InjuryDetailModal';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerGraphicModal } from './PlayerGraphicModal';
import { YouTubeBrandLogo } from './SocialIcons';
import { TeamIdInput } from './TeamIdInput';
import { YOUTUBE_CHANNEL_URL } from './YouTubePlayerModal';

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
  onPlayVideo?: (video?: VideoItem | null) => void;
  onToast?: (message: string, tone?: 'success' | 'error' | 'info') => void;
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

function statusSortRank(status: PriceChangeStatus): number {
  if (status === 'Likely to rise') return 2;
  if (status === 'Likely to drop') return 1;
  return 0;
}

function statusPillToneClass(status: PriceChangeStatus): string {
  if (status === 'Likely to rise') return 'is-rise';
  if (status === 'Likely to drop') return 'is-drop';
  return 'is-neutral';
}

function progressPillToneClass(pct: number): string {
  if (pct >= 95) return 'is-rise-strong';
  if (pct > 0) return 'is-rise-soft';
  if (pct <= -95) return 'is-drop-strong';
  if (pct < 0) return 'is-drop-soft';
  return 'is-neutral';
}

function formatSignedPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  if (rounded > 0) return `+${rounded.toFixed(1)}%`;
  return `${rounded.toFixed(1)}%`;
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
  players,
  insights,
  fixtureRows,
  initialVideos,
  teamId = '',
  recentTeams = [],
  onRemoveRecentTeam,
  onTeamIdChange,
  onNavigate,
  onOpenPalette,
  onRefresh,
  refreshing,
  onToast = message => window.alert(message),
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
  const [oddsSourceMode, setOddsSourceMode] = useState<'auto' | 'model'>('auto');
  const [topMetric, setTopMetric] = useState<'season' | 'nextXp' | 'gwPts' | 'horizon5'>('season');
  const [transferSort, setTransferSort] = useState<
    'trend' | 'progress' | 'predicted' | 'status' | 'price' | 'purchase' | 'selling' | 'name'
  >('trend');
  const [transferDir, setTransferDir] = useState<'desc' | 'asc'>('desc');
  const [transferPage, setTransferPage] = useState(0);
  const homePitchRef = useRef<HTMLDivElement>(null);
  const [injuryPage, setInjuryPage] = useState(0);
  const [selectedCardPlayer, rawSetSelectedCardPlayer] = useState<EnrichedPlayer | null>(null);
  const [selectedInjuryPlayer, rawSetSelectedInjuryPlayer] = useState<EnrichedPlayer | null>(null);
  const setSelectedCardPlayer = (p: EnrichedPlayer | null) => {
    if (p) rawSetSelectedInjuryPlayer(null);
    rawSetSelectedCardPlayer(p);
  };
  const setSelectedInjuryPlayer = (p: EnrichedPlayer | null) => {
    if (p) rawSetSelectedCardPlayer(null);
    rawSetSelectedInjuryPlayer(p);
  };

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
  const sharedFixtureForecasts = useMemo(() => makeFixtureForecasts(snapshot, 'vortex', [...new Set([selectedGw, ...fixtureRows.flatMap(row => row.cells.map(cell => cell.event))])]), [snapshot, selectedGw, fixtureRows]);
  const overallFor = (teamId: number, event: number) => fixtureCellIndex(sharedFixtureForecasts, teamId, event);
  const avgFor = (teamId: number, cells: typeof fixtureRows[number]['cells']) => {
    const items = cells.flatMap(cell => sharedFixtureForecasts.get(`${teamId}:${cell.event}`) ?? []);
    return items.length ? items.reduce((sum, item) => sum + (item.attackIndex + item.defenceIndex) / 2, 0) / items.length : null;
  };
  const bestFixture = [...fixtureRows].sort((a, b) => (avgFor(a.team.id, a.cells) ?? Infinity) - (avgFor(b.team.id, b.cells) ?? Infinity))[0];

  // Bookmaker-implied forecasts where priced; otherwise explicitly labelled VORTEX estimates.
  const gwMarketCoverage = useMemo(() => marketCoverage(snapshot.fixtures, selectedGw, 1), [snapshot.fixtures, selectedGw]);
  const gwMatchesAndClubs = useMemo(() => {
    const repoTeams = toRepoTeams(snapshot.teams);
    const repoElements = snapshot.players.map(toRepoElement);
    const repoFixtures = toRepoFixtures(snapshot.fixtures);
    const strengths = buildStrengths(repoTeams, repoElements, repoFixtures);
    applyHistoricalStrengths(strengths, snapshot.teams, snapshot.historicalTeamModel?.strengths);
    const fallbackStrength = { atkH: 1, atkA: 1, defWeakH: 1, defWeakA: 1 };

    let availableOddsCount = 0;
    const bookmakersUsed = new Set<string>();

    const matches = snapshot.fixtures
      .filter((fx) => fx.event === selectedGw)
      .sort((a, b) => (a.kickoffTime ?? '9999').localeCompare(b.kickoffTime ?? '9999'))
      .map((fx) => {
        const homeTeam = teamMap.get(fx.teamH);
        const awayTeam = teamMap.get(fx.teamA);
        if (fx.marketOdds) {
          availableOddsCount += 1;
          bookmakersUsed.add(fx.marketOdds.bookmaker);
        }
        const activeMarket = oddsSourceMode === 'auto' ? fx.marketOdds ?? null : null;
        const proj = activeMarket
          ? forecastFromGoalRates(activeMarket.homeXg, activeMarket.awayXg)
          : projectMatch(
            strengths.get(fx.teamH) ?? fallbackStrength,
            strengths.get(fx.teamA) ?? fallbackStrength,
          );
        return {
          fixture: fx,
          homeTeam,
          awayTeam,
          marketOdds: activeMarket,
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

    return {
      matches,
      clubs: [...clubMap.values()],
      availableOddsCount,
      bookmakerLabel: [...bookmakersUsed].slice(0, 2).join(' · ') || snapshot.meta.oddsMeta?.provider || 'Market Odds',
    };
  }, [oddsSourceMode, selectedGw, snapshot.fixtures, snapshot.meta.oddsMeta?.provider, snapshot.players, snapshot.teams, teamMap]);

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
    const difficulty = overallFor(teamIdNum, selectedGw);
    return { label: labels.join(', '), difficulty: difficulty ?? 3, isBlank: difficulty === null };
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

  // Dynamic squad Purchase Price & Selling Price lookup for the linked manager's 15 picks (zero hardcoding)
  const ownedSquadPricingMap = useMemo(() => {
    const map = new Map<number, { purchasePrice: number; sellingPrice: number }>();
    if (!hasLinkedTeam || !entry || !Array.isArray(entry.picks)) return map;

    const latestTransferCostByElement = new Map<number, number>();
    if (Array.isArray(entry.recentTransfers)) {
      const sortedNewest = [...entry.recentTransfers].sort((a, b) => b.event - a.event);
      for (const tr of sortedNewest) {
        if (
          tr.elementIn > 0 &&
          tr.elementInCost >= 35 &&
          !latestTransferCostByElement.has(tr.elementIn)
        ) {
          latestTransferCostByElement.set(tr.elementIn, tr.elementInCost);
        }
      }
    }

    for (const pick of entry.picks) {
      const p = playerMap.get(pick.element);
      if (!p) continue;
      if (
        typeof pick.purchasePrice === 'number' &&
        Number.isFinite(pick.purchasePrice) &&
        typeof pick.sellingPrice === 'number' &&
        Number.isFinite(pick.sellingPrice)
      ) {
        map.set(pick.element, {
          purchasePrice: pick.purchasePrice,
          sellingPrice: pick.sellingPrice,
        });
      } else {
        map.set(
          pick.element,
          resolveSquadPurchaseAndSellingPrices(
            p,
            undefined,
            undefined,
            latestTransferCostByElement.get(pick.element),
          ),
        );
      }
    }
    return map;
  }, [entry, hasLinkedTeam, playerMap]);

  // Price & Transfers — Dynamic Status, Progress, Predicted Progress, Ownership Trend, Current/Purchase/Selling Price
  const sortedTransfers = useMemo(() => {
    const totalManagers = snapshot.meta.totalPlayers || 11_000_000;
    const rows = players.map((p) => {
      const prediction = computePriceChangePrediction(p, totalManagers);
      const squadPrices = ownedSquadPricingMap.get(p.id);
      const trendDir: 'up' | 'down' | 'flat' =
        prediction.netTransfers > 0 ? 'up' : prediction.netTransfers < 0 ? 'down' : 'flat';
      return {
        player: p,
        status: prediction.status,
        progressPct: prediction.progressPct,
        predictedProgressPct: prediction.predictedProgressPct,
        net: prediction.netTransfers,
        trendDir,
        isOwned: Boolean(squadPrices),
        purchasePrice: squadPrices?.purchasePrice ?? null,
        sellingPrice: squadPrices?.sellingPrice ?? null,
      };
    });
    const mul = transferDir === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      if (transferSort === 'name') return mul * a.player.name.localeCompare(b.player.name);
      if (transferSort === 'trend') {
        return (
          mul * (a.net - b.net) ||
          mul * (a.predictedProgressPct - b.predictedProgressPct) ||
          b.player.ownership - a.player.ownership
        );
      }
      if (transferSort === 'price') {
        return mul * (a.player.price - b.player.price) || mul * (a.net - b.net);
      }
      if (transferSort === 'purchase') {
        if (a.purchasePrice === null && b.purchasePrice === null) return mul * (a.player.price - b.player.price);
        if (a.purchasePrice === null) return 1;
        if (b.purchasePrice === null) return -1;
        return mul * (a.purchasePrice - b.purchasePrice) || mul * (a.player.price - b.player.price);
      }
      if (transferSort === 'selling') {
        if (a.sellingPrice === null && b.sellingPrice === null) return mul * (a.player.price - b.player.price);
        if (a.sellingPrice === null) return 1;
        if (b.sellingPrice === null) return -1;
        return mul * (a.sellingPrice - b.sellingPrice) || mul * (a.player.price - b.player.price);
      }
      if (transferSort === 'status') {
        const diff = statusSortRank(a.status) - statusSortRank(b.status);
        if (diff !== 0) return mul * diff;
        return mul * (Math.abs(a.predictedProgressPct) - Math.abs(b.predictedProgressPct));
      }
      if (transferSort === 'predicted') {
        return (
          mul * (Math.abs(a.predictedProgressPct) - Math.abs(b.predictedProgressPct)) ||
          mul * (Math.abs(a.progressPct) - Math.abs(b.progressPct)) ||
          mul * (Math.abs(a.net) - Math.abs(b.net))
        );
      }
      return (
        mul * (Math.abs(a.progressPct) - Math.abs(b.progressPct)) ||
        mul * (Math.abs(a.predictedProgressPct) - Math.abs(b.predictedProgressPct)) ||
        mul * (Math.abs(a.net) - Math.abs(b.net))
      );
    });
    return rows;
  }, [ownedSquadPricingMap, players, snapshot.meta.totalPlayers, transferDir, transferSort]);

  const transferTotalPages = Math.max(1, Math.ceil(sortedTransfers.length / 10));
  const safeTransferPage = Math.min(transferPage, transferTotalPages - 1);
  const visibleTransfers = sortedTransfers.slice(safeTransferPage * 10, safeTransferPage * 10 + 10);

  // Injuries & Suspensions — prioritize active Premier League injuries, doubts & suspensions sorted by ownership
  const flaggedPlayers = useMemo(() => {
    const isDeparted = (p: EnrichedPlayer) =>
      p.status === 'u' && /joined .+ permanently|departed the club/i.test(p.news || '');
    const sevRank = (p: EnrichedPlayer) => {
      if (isDeparted(p)) return 2;
      if (['d', 'i', 's'].includes(p.status)) return 0;
      return 1;
    };
    return players
      .filter((p) => p.status !== 'a' || (p.chance !== null && p.chance < 100))
      .sort(
        (a, b) =>
          sevRank(a) - sevRank(b) ||
          b.ownership - a.ownership ||
          (a.chance ?? 50) - (b.chance ?? 50),
      );
  }, [players]);

  const injuryTotalPages = Math.max(1, Math.ceil(flaggedPlayers.length / 10));
  const safeInjuryPage = Math.min(injuryPage, injuryTotalPages - 1);
  const visibleInjuries = flaggedPlayers.slice(safeInjuryPage * 10, safeInjuryPage * 10 + 10);

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
    const injuryInfo = hasFlag ? parsePlayerInjuryDetails(p, fx.label) : null;
    const showReviewPts = isReviewMode && selectedGw <= snapshot.meta.currentEventId;
    const starterPts = p.eventPoints * (isCap ? 2 : 1);
    const benchOrderPrefix = benchSlotIdx === 0 ? 'GKP' : `${benchSlotIdx}. ${p.position}`;
    const benchTopText = showReviewPts
      ? `${benchOrderPrefix} · ${p.eventPoints} pts`
      : `${benchOrderPrefix} · ${xp.toFixed(1)} xP`;
    const starterTopText = showReviewPts
      ? `${starterPts} pts`
      : `${(xp * (isCap ? 2 : 1)).toFixed(1)} xP`;

    return (
      <div
        key={p.id}
        role="button"
        tabIndex={0}
        className={classNames('vx-pitch-player', isBench && 'vx-pitch-player--bench')}
        title={`${p.fullName} (${p.team.shortName}) · ${fx.label} — Click player image for FPL VORTEX graphic card`}
        onClick={() => setSelectedCardPlayer(p)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelectedCardPlayer(p);
          }
        }}
      >
        {isBench ? (
          <span className="vx-pitch-pos-label">{benchTopText}</span>
        ) : (
          <span className="vx-pitch-xp">{starterTopText}</span>
        )}
        <div className="vx-pitch-avatar-box">
          {injuryInfo && (
            <button
              type="button"
              className={classNames('vx-pitch-flag vx-injury-rect-sign', `is-${injuryInfo.severity}`)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedInjuryPlayer(p);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                }
              }}
              aria-label={`${p.name} injury details: ${injuryInfo.injuryType}`}
              title={`${injuryInfo.injuryType} · ${injuryInfo.expectedReturn} — Click for full injury details`}
            >
              <AlertTriangle size={11} />
              <span>!</span>
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
        <span className={classNames('vx-pitch-fix', tone, `is-${tone}`)} style={fx.isBlank ? undefined : { background: difficultyColor(fx.difficulty), color: '#071a1b' }}>{fx.label}</span>
        {isBench && (
          <span className="vx-pitch-bench-meta">
            {p.team.shortName} · £{p.price.toFixed(1)}m
          </span>
        )}
      </div>
    );
  };

  const benchSummaryPts = useMemo(
    () => pitchLineup.bench.reduce((sum, id) => sum + (playerMap.get(id)?.eventPoints ?? 0), 0),
    [pitchLineup.bench, playerMap],
  );
  const benchSummaryXp = useMemo(
    () => pitchLineup.bench.reduce((sum, id) => sum + (playerGwXp.get(id) ?? 0), 0),
    [pitchLineup.bench, playerGwXp],
  );

  const startersByPos = (pos: Position) =>
    pitchLineup.starters.filter((id) => playerMap.get(id)?.position === pos);

  const finishedMatchesCount = gwMatchesAndClubs.matches.filter((m) => m.fixture.finished).length;

  const savePitch = async () => {
    if (!homePitchRef.current) throw new Error('The pitch is not ready to save.');
    await downloadPitchPng(homePitchRef.current, `fpl-vortex-pitch-gw${selectedGw}.png`);
  };

  const homeExportTables = (): PngTable[] => {
            const tables: PngTable[] = [{ title: 'PRICE & TRANSFERS · ALL PLAYERS', headers: ['PLAYER', 'STATUS', 'PROGRESS', 'PREDICTED', 'NET TRANSFERS', 'PRICE', 'PURCHASE', 'SELLING'], widths: [150, 100, 90, 90, 115, 80, 90, 90], rows: sortedTransfers.map(row => [{ text: row.player.name }, { text: row.status }, { text: `${row.progressPct.toFixed(1)}%` }, { text: `${row.predictedProgressPct.toFixed(1)}%` }, { text: String(row.net) }, { text: formatPrice(row.player.price) }, { text: row.purchasePrice === null ? '—' : formatPrice(row.purchasePrice / 10) }, { text: row.sellingPrice === null ? '—' : formatPrice(row.sellingPrice / 10) }]) }];
            if (hasLinkedTeam && pitchLineup) tables.unshift({ title: `SQUAD · GW${selectedGw}`, headers: ['PLAYER', 'POSITION', 'FIXTURE', 'GW POINTS', 'NEXT GW xP'], widths: [160, 100, 170, 100, 100], rows: [...pitchLineup.starters, ...pitchLineup.bench].flatMap((id, index) => { const player = playerMap.get(id); if (!player) return []; return [[{ text: `${player.name}${id === pitchLineup.captainId ? ' (C)' : id === pitchLineup.viceId ? ' (V)' : ''}` }, { text: index >= 11 ? `B${index - 10} ${player.position}` : player.position }, { text: getPitchFixture(player.teamId).label }, { text: String(player.eventPoints) }, { text: ((player.gwProjections?.[nextEventId] ?? player.projection) * (id === pitchLineup.captainId ? 2 : 1)).toFixed(2) }]]; }) });
            return tables;
          };

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
                maskWhenBlurred={hasLinkedTeam}
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

          {recentTeams.length > 0 && (
            <div className="vx-saved-ids-strip" aria-label="Saved FPL Squads">
              <span className="vx-saved-ids-strip__label">
                <Clock size={12} /> Saved Squads:
              </span>
              {recentTeams.slice(0, 8).map((item, idx) => {
                const isCurrent = teamId.trim() === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={classNames('vx-saved-id-chip', isCurrent && 'is-active')}
                    onClick={() => {
                      setTeamInput(item.id);
                      onTeamIdChange?.(item.id);
                    }}
                    title={item.teamName || `Saved Squad ${idx + 1}`}
                  >
                    <strong>{item.teamName || `Saved Squad ${idx + 1}`}</strong>
                  </button>
                );
              })}
            </div>
          )}

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

        {/* PREMIUM RIGHT VISUAL ORB + COLORFUL ARTISTIC HERO SHOWCASE CARDS */}
        <div className="hero__visual hero__visual--compact hero__visual--artistic">
          <div className="vortex-orb vortex-orb--compact vortex-orb--artistic" aria-hidden="true">
            <span className="vortex-orb__aurora" />
            <span className="vortex-orb__ring vortex-orb__ring--one" />
            <span className="vortex-orb__ring vortex-orb__ring--two" />
            <span className="vortex-orb__ring vortex-orb__ring--three" />
            <div className="vortex-orb__core vortex-orb__core--premium vortex-orb__core--artistic">
              <div className="vortex-orb__crest-halo">
                <img
                  src={BRAND_LION_SRC}
                  alt=""
                  className="vortex-orb__crest"
                  width={68}
                  height={68}
                />
              </div>
              <span className="vortex-orb__gw">GW{nextEventId}</span>
              <strong className="vortex-orb__pts">{heroOrbXp.toFixed(1)}</strong>
              <small className="vortex-orb__caption">Projected XI pts</small>
            </div>
          </div>

          {captain && (
            <button
              type="button"
              className="float-card float-card--captain float-card--premium float-card--artistic float-card--interactive"
              onClick={() => {
                setSelectedInjuryPlayer(null);
                setSelectedCardPlayer(captain);
              }}
              title={`Click to view ${captain.fullName} FPL VORTEX player card`}
            >
              <div className="float-card__row">
                <div className="float-card__portrait-halo">
                  <PlayerAvatar
                    code={captain.code}
                    teamCode={captain.team.code}
                    name={captain.name}
                    fullName={captain.fullName}
                    teamShort={captain.team.shortName}
                    position={captain.position}
                    size="lg"
                  />
                </div>
                <div className="float-card__copy">
                  <span className="float-card__label float-card__label--captain">
                    <Crown size={14} /> #1 CAPTAIN
                  </span>
                  <div className="float-card__title-row">
                    <div className="float-card__title">{captain.name}</div>
                    <ClubBadge
                      teamCode={captain.team.code}
                      shortName={captain.team.shortName}
                      teamName={captain.team.name}
                      size="sm"
                    />
                  </div>
                  <div className="float-card__meta-pills">
                    <span className="float-card__xp-pill">{(captain.projection * 2).toFixed(1)} 2× xPts</span>
                    <span className="float-card__sub-pill">£{captain.price.toFixed(1)}m</span>
                  </div>
                </div>
              </div>
            </button>
          )}

          {bestFixture && (
            <button
              type="button"
              className="float-card float-card--fixture float-card--premium float-card--artistic float-card--interactive"
              onClick={() => onNavigate('fixtures')}
              title={`Explore ${bestFixture.team.name} 5-GW fixture run`}
            >
              <div className="float-card__row">
                <div className="float-card__crest-halo">
                  <ClubBadge
                    teamCode={bestFixture.team.code}
                    shortName={bestFixture.team.shortName}
                    teamName={bestFixture.team.name}
                    size="lg"
                  />
                </div>
                <div className="float-card__copy">
                  <span className="float-card__label float-card__label--fixture">
                    <Flame size={14} /> BEST 5-GW RUN
                  </span>
                  <div className="float-card__title">{bestFixture.team.name}</div>
                  <div className="float-card__meta-pills">
                    <span className="float-card__ease-pill">VORTEX index</span>
                    <span className="float-card__fdr-avg">{avgFor(bestFixture.team.id, bestFixture.cells)?.toFixed(2) ?? '—'} FDR</span>
                  </div>
                  <div className="float-card__fdr-strip" aria-hidden="true">
                    {bestFixture.cells.slice(0, 5).map((cell) => {
                      const value = overallFor(bestFixture.team.id, cell.event);
                      const tone = fdrPillTone(value ?? 3, value === null);
                      return (
                        <span key={cell.event} className={classNames('float-card__fdr-chip', tone)} style={value === null ? undefined : { background: difficultyColor(value), color: '#071a1b' }}>
                          {cell.isBlank ? '—' : cell.label.split(' ')[0]}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </button>
          )}
        </div>
      </section>

      {/* ==================== GAMEWEEK REVIEW CONTROL BAR ==================== */}
      <section className="vx-gw-bar" aria-label="Gameweek review and sync controls">
        <div className="vx-gw-bar__left">
          <span className="vx-gw-bar__dot" />
          <strong>Gameweek Review</strong>
          {hasLinkedTeam && (
            <div className="vx-seg-pills" role="group" aria-label="Review gameweek">
              <button
                type="button"
                className={classNames(selectedGw === reviewEventId && 'is-active')}
                onClick={() => setSelectedGw(reviewEventId)}
              >
                Review GW {reviewEventId}
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
        {/* COLUMN 1: GATED ON TOP FPL TEAM ID BAR -> UNLOCKS FULL SOCCER PITCH & REVIEW GW DATA */}
        <article className="panel vx-card vx-card--pitch">
          {!hasLinkedTeam ? (
            <div className="vx-pitch-gate">
              <div className="vx-pitch-gate__badge">
                <img src={BRAND_LION_SRC} alt="FPL VORTEX" width={58} height={58} />
              </div>
              <span className="panel__eyebrow">SQUAD PITCH & GAMEWEEK {reviewEventId} REVIEW</span>
              <h3>Enter your FPL Team ID above to unlock your Review Pitch</h3>
              <p>
                Use the <strong>FPL Team ID</strong> bar at the top of the page (no password needed) to load your
                15-player starting XI & bench, Review Gameweek {reviewEventId} points, overall rank, and tap any
                player for their full FPL VORTEX stats card.
              </p>

              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  topInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  topInputRef.current?.focus();
                }}
              >
                <UserCheck size={16} /> Go to Top FPL Team ID Box
              </button>

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
                  {entry!.provenance?.kind !== 'official' && (entry!.source === 'snapshot' || entry!.source === 'offline') && (
                    <small role="status">{entry!.provenance?.kind === 'demo' ? 'DEMO SQUAD' : 'ARCHIVED SQUAD'} — not a verified current FPL team; archive date unknown.</small>
                  )}
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

              {squadView === 'pitch' ? (
                <>
                <div className="save-table-bar"><SaveTableButton filename={`fpl-vortex-pitch-gw${selectedGw}.png`} onSave={savePitch} onError={message => onToast(message, 'error')} /></div>
                <div className="vx-soccer-pitch" ref={homePitchRef}>
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

                    <div className="vx-pitch-bench-wrap" aria-label="Substitutes bench">
                      <div className="vx-pitch-bench-head">
                        <span>BENCH · SUBSTITUTES</span>
                        <strong>
                          {isReviewMode && selectedGw <= snapshot.meta.currentEventId
                            ? `Bench: ${entry?.history?.pointsOnBench ?? benchSummaryPts} pts`
                            : `Bench: ${benchSummaryXp.toFixed(1)} xP`}
                        </strong>
                      </div>
                      <div className="vx-pitch-bench">
                        {pitchLineup.bench.map((id, idx) => renderPitchCard(id, true, idx))}
                      </div>
                    </div>
                  </div>
                </div>
                </>
              ) : (
                <div className="vx-squad-table-wrap">
                  <div className="save-table-bar"><SaveTableButton filename="fpl-vortex-home-tables.png" onError={message => onToast(message, 'error')} getTables={homeExportTables} /></div>
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
                        const rowHasFlag = p.status !== 'a' || (p.chance !== null && p.chance < 100);
                        const rowInjury = rowHasFlag ? parsePlayerInjuryDetails(p, fx.label) : null;
                        return (
                          <tr
                            key={p.id}
                            className={classNames('vx-clickable-row', isBench && 'is-bench-row')}
                            onClick={() => setSelectedCardPlayer(p)}
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
                                  <div className="vx-name-with-flag">
                                    <strong>
                                      {p.name} {isCap ? '(C)' : isVice ? '(V)' : ''}
                                    </strong>
                                    {rowInjury && (
                                      <button
                                        type="button"
                                        className={classNames('vx-injury-rect vx-injury-rect--sm', `is-${rowInjury.severity}`)}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedInjuryPlayer(p);
                                        }}
                                        title={`${rowInjury.injuryType} · ${rowInjury.expectedReturn}`}
                                      >
                                        <AlertTriangle size={10} />
                                        <span>{rowInjury.badgeText}</span>
                                      </button>
                                    )}
                                  </div>
                                  <small className="block-sub">
                                    {p.team.shortName} · {formatPrice(p.price)}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>
                              {isBench ? `B${idx - 10} · ${p.position}` : p.position}
                            </td>
                            <td>
                              <span className={classNames('vx-pitch-fix vx-pitch-fix--inline', tone, `is-${tone}`)} style={fx.isBlank ? undefined : { background: difficultyColor(fx.difficulty), color: '#071a1b' }}>
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
              <small className="vx-card__sub">
                {gwMatchesAndClubs.availableOddsCount > 0 && oddsSourceMode === 'auto'
                  ? `Market quotes: 1X2 ${gwMarketCoverage.complete1x2}/${gwMarketCoverage.totalFixtures} · O/U ${gwMarketCoverage.completeTotals}/${gwMarketCoverage.totalFixtures} · remaining VORTEX model`
                  : finishedMatchesCount > 0
                    ? `${finishedMatchesCount} of ${gwMatchesAndClubs.matches.length} played · Poisson Model`
                    : 'VORTEX model · no verified bookmaker prices'}
              </small>
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
                        <span title={fixtureQuoteNotice(m.marketOdds)}>{m.marketOdds ? `Implied Goals · ${m.marketOdds.bookmaker}` : 'VORTEX projected xG'}</span>
                        <strong>{m.awayXg.toFixed(2)}</strong>
                      </div>

                      {isExpanded && (
                        <div className="vx-match-probs">
                          <span>Poisson-derived probabilities</span>
                          <span>Home {(m.homeWin * 100).toFixed(0)}%</span>
                          <span>Draw {(m.draw * 100).toFixed(0)}%</span>
                          <span>Away {(m.awayWin * 100).toFixed(0)}%</span>
                          <span>
                            CS {(m.homeCs * 100).toFixed(0)}% / {(m.awayCs * 100).toFixed(0)}%
                          </span>
                          <span className="vx-match-probs__odds">{fixtureQuoteNotice(m.marketOdds)}</span>
                          {m.marketOdds && (
                            <span className="vx-match-probs__odds">
                              1X2 {m.marketOdds.oddsHome.toFixed(2)} / {m.marketOdds.oddsDraw.toFixed(2)} /{' '}
                              {m.marketOdds.oddsAway.toFixed(2)}
                              {m.marketOdds.totalLine && m.marketOdds.oddsOver && m.marketOdds.oddsUnder
                                ? ` · O/U ${m.marketOdds.totalLine}: ${m.marketOdds.oddsOver.toFixed(2)} / ${m.marketOdds.oddsUnder.toFixed(2)}`
                                : ''}
                            </span>
                          )}
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
            <SaveTableButton filename={`fpl-vortex-projections-gw${selectedGw}.png`} onError={message => onToast(message, 'error')} getTables={() => [{ title: `GW${selectedGw} CLUB PROJECTIONS · ${oddsSourceMode === 'model' ? 'MODEL' : 'MARKET WHEN AVAILABLE / MODEL FALLBACK'}`, headers: ['CLUB', 'OPPONENT', 'GOALS', 'CS %', 'WIN %'], widths: [170, 190, 100, 100, 100], rows: sortedClubs.map(club => [{ text: club.name }, { text: club.oppLabel }, { text: club.goals.toFixed(2) }, { text: `${Math.round(club.cs * 100)}%` }, { text: `${Math.round(club.win * 100)}%` }]) }]} />
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

          <footer className="vx-card__footer vx-card__footer--spread">
            <span className="vx-odds-source-badge">
              <span
                className={classNames(
                  'vx-odds-dot',
                  gwMarketCoverage.completeMarketData && oddsSourceMode === 'auto' && 'is-live',
                )}
              />
              {gwMatchesAndClubs.availableOddsCount > 0
                ? oddsSourceMode === 'auto'
                  ? `Market quotes (${gwMatchesAndClubs.bookmakerLabel}); missing fixtures use VORTEX`
                  : 'VORTEX model (market quotes paused)'
                : 'VORTEX model · no matched bookmaker odds'}
            </span>
            {gwMatchesAndClubs.availableOddsCount > 0 && (
              <div className="vx-seg-pills vx-seg-pills--xs" role="group" aria-label="Projection source">
                <button
                  type="button"
                  className={classNames(oddsSourceMode === 'auto' && 'is-active')}
                  onClick={() => setOddsSourceMode('auto')}
                >
                  Market Odds
                </button>
                <button
                  type="button"
                  className={classNames(oddsSourceMode === 'model' && 'is-active')}
                  onClick={() => setOddsSourceMode('model')}
                >
                  Model
                </button>
              </div>
            )}
          </footer>
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

          <div className="save-table-bar"><SaveTableButton filename={`fpl-vortex-top-players-gw${selectedGw}.png`} onError={message => onToast(message, 'error')} getTables={() => [{ title: `TOP PLAYERS · ${topMetric === 'season' ? 'SEASON POINTS' : topMetric === 'gwPts' ? `GW${snapshot.meta.currentEventId} POINTS` : topMetric === 'horizon5' ? '5-GW xPTS' : `GW${selectedGw} xPTS`}`, headers: ['RANK', 'PLAYER', 'CLUB', 'POSITION', 'PRICE', 'SCORE'], widths: [65, 170, 90, 90, 90, 90], rows: topPlayersList.map(({ player, score }, idx) => [{ text: String(idx + 1) }, { text: player.name }, { text: player.team.shortName }, { text: player.position }, { text: formatPrice(player.price) }, { text: topMetric === 'season' || topMetric === 'gwPts' ? String(Math.round(score)) : score.toFixed(1) }]) }]} /></div>
          <div className="vx-card__scroll vx-top-players-list">
            {topPlayersList.map(({ player, score }, idx) => {
              const pct = Math.max(6, (score / maxTopScore) * 100);
              const formattedScore =
                topMetric === 'season' || topMetric === 'gwPts' ? String(Math.round(score)) : score.toFixed(1);
              const topFlag =
                player.status !== 'a' || (player.chance !== null && player.chance < 100)
                  ? parsePlayerInjuryDetails(player, getPitchFixture(player.teamId).label)
                  : null;
              return (
                <div
                  key={player.id}
                  role="button"
                  tabIndex={0}
                  className="vx-top-player-row"
                  onClick={() => setSelectedCardPlayer(player)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedCardPlayer(player);
                    }
                  }}
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
                    <div className="vx-name-with-flag">
                      <strong>{player.name}</strong>
                      {topFlag && (
                        <button
                          type="button"
                          className={classNames('vx-injury-rect vx-injury-rect--sm', `is-${topFlag.severity}`)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedInjuryPlayer(player);
                          }}
                          aria-label={`${player.name} injury details`}
                          title={`${topFlag.injuryType} · ${topFlag.expectedReturn}`}
                        >
                          <AlertTriangle size={10} />
                          <span>{topFlag.badgeText}</span>
                        </button>
                      )}
                    </div>
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
                </div>
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

        {/* CARD 2: PRICE & TRANSFERS (HOME TAB FULL-SPECTRUM TRADING TABLE) */}
        <article className="panel vx-card vx-card--lower vx-card--transfers vx-card--transfers-wide">
          <header className="vx-card__header">
            <div className="vx-card__title-icon">
              <ArrowLeftRight size={16} className="vx-icon-mint" />
              <h3>Price & Transfers</h3>
            </div>
            <button type="button" className="vx-inline-link" onClick={() => onNavigate('players')}>
              Price changes <ArrowRight size={14} />
            </button>
          </header>

          <div className="save-table-bar"><SaveTableButton filename="fpl-vortex-home-tables.png" onError={message => onToast(message, 'error')} getTables={homeExportTables} /></div>
          <div className="vx-card__scroll vx-transfer-scroll-x">
            <table className="vx-transfer-table vx-transfer-table--predictor vx-transfer-table--home-full">
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className={classNames(transferSort === 'name' && 'is-sorted')}
                      onClick={() => toggleTransferSort('name')}
                    >
                      Player {transferSort === 'name' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="is-center">
                    <button
                      type="button"
                      className={classNames(transferSort === 'status' && 'is-sorted')}
                      onClick={() => toggleTransferSort('status')}
                    >
                      Status {transferSort === 'status' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="is-center">
                    <button
                      type="button"
                      className={classNames(transferSort === 'progress' && 'is-sorted')}
                      onClick={() => toggleTransferSort('progress')}
                    >
                      Progress {transferSort === 'progress' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="is-center">
                    <button
                      type="button"
                      className={classNames(transferSort === 'predicted' && 'is-sorted')}
                      onClick={() => toggleTransferSort('predicted')}
                    >
                      Predicted Progress {transferSort === 'predicted' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="is-center">
                    <button
                      type="button"
                      className={classNames(transferSort === 'trend' && 'is-sorted')}
                      onClick={() => toggleTransferSort('trend')}
                    >
                      Ownership Trend {transferSort === 'trend' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="is-right">
                    <button
                      type="button"
                      className={classNames(transferSort === 'price' && 'is-sorted')}
                      onClick={() => toggleTransferSort('price')}
                    >
                      Current Price {transferSort === 'price' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="is-right">
                    <button
                      type="button"
                      className={classNames(transferSort === 'purchase' && 'is-sorted')}
                      onClick={() => toggleTransferSort('purchase')}
                    >
                      Purchase Price {transferSort === 'purchase' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="is-right">
                    <button
                      type="button"
                      className={classNames(transferSort === 'selling' && 'is-sorted')}
                      onClick={() => toggleTransferSort('selling')}
                    >
                      Selling Price {transferSort === 'selling' ? (transferDir === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleTransfers.map(
                  ({
                    player,
                    status,
                    progressPct,
                    predictedProgressPct,
                    net,
                    trendDir,
                    isOwned,
                    purchasePrice,
                    sellingPrice: sellVal,
                  }) => {
                    const rowFlag =
                      player.status !== 'a' || (player.chance !== null && player.chance < 100)
                        ? parsePlayerInjuryDetails(player, getPitchFixture(player.teamId).label)
                        : null;
                    return (
                      <tr
                        key={player.id}
                        onClick={() => setSelectedCardPlayer(player)}
                        className={classNames('vx-clickable-row', isOwned && 'is-owned-row')}
                      >
                        <td>
                          <div className="vx-mini-player">
                            {isOwned && (
                              <span
                                className="vx-owned-star"
                                title="In your linked FPL squad"
                                aria-label="In your linked FPL squad"
                              >
                                <Star size={11} fill="currentColor" />
                              </span>
                            )}
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
                              <div className="vx-name-with-flag">
                                <strong>{player.name}</strong>
                                {rowFlag && (
                                  <button
                                    type="button"
                                    className={classNames('vx-injury-rect vx-injury-rect--sm', `is-${rowFlag.severity}`)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedInjuryPlayer(player);
                                    }}
                                    aria-label={`${player.name} injury details`}
                                    title={`${rowFlag.injuryType} · ${rowFlag.expectedReturn}`}
                                  >
                                    <AlertTriangle size={10} />
                                    <span>{rowFlag.badgeText}</span>
                                  </button>
                                )}
                              </div>
                              <small>
                                <ClubBadge
                                  teamCode={player.team.code}
                                  shortName={player.team.shortName}
                                  teamName={player.team.name}
                                  size="sm"
                                />
                                <span>
                                  {player.position} ·{' '}
                                  <em className={classNames('vx-net-inline', net >= 0 ? 'is-pos' : 'is-neg')}>
                                    {net > 0 ? `+${formatCompact(net)}` : formatCompact(net)}
                                  </em>
                                </span>
                              </small>
                            </div>
                          </div>
                        </td>
                        <td className="is-center">
                          <span className={classNames('vx-price-status-pill', statusPillToneClass(status))}>
                            {status}
                          </span>
                        </td>
                        <td className="is-center mono-num">
                          <span className={classNames('vx-price-pct-pill', progressPillToneClass(progressPct))}>
                            {formatSignedPct(progressPct)}
                          </span>
                        </td>
                        <td className="is-center mono-num">
                          <span className={classNames('vx-price-pct-pill', progressPillToneClass(predictedProgressPct))}>
                            {formatSignedPct(predictedProgressPct)}
                          </span>
                        </td>
                        <td className="is-center">
                          <span className={classNames('vx-ownership-trend', `is-${trendDir}`)}>
                            {trendDir === 'up' ? (
                              <TrendingUp size={14} />
                            ) : trendDir === 'down' ? (
                              <TrendingDown size={14} />
                            ) : (
                              <Minus size={14} />
                            )}
                            <span>{trendDir === 'up' ? 'Up' : trendDir === 'down' ? 'Down' : 'Flat'}</span>
                          </span>
                        </td>
                        <td className="is-right mono-num vx-price-col vx-price-col--current">
                          {formatPrice(player.price)}
                        </td>
                        <td className="is-right mono-num vx-price-col">
                          {purchasePrice !== null ? formatPrice(purchasePrice) : <span className="vx-price-dash">-</span>}
                        </td>
                        <td className="is-right mono-num vx-price-col">
                          {sellVal !== null ? formatPrice(sellVal) : <span className="vx-price-dash">-</span>}
                        </td>
                      </tr>
                    );
                  },
                )}
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

          <div className="save-table-bar"><SaveTableButton filename="fpl-vortex-injuries.png" onError={message => onToast(message, 'error')} getTables={() => [{ title: `INJURIES & SUSPENSIONS · ${flaggedPlayers.length} PLAYERS`, headers: ['PLAYER', 'CLUB', 'POSITION', 'PRICE', 'STATUS', 'DETAILS', 'RETURN', 'CHANCE'], widths: [160, 90, 90, 80, 110, 240, 160, 90], rows: flaggedPlayers.map(player => { const info = parsePlayerInjuryDetails(player, getPitchFixture(player.teamId).label); return [{ text: player.name }, { text: player.team.shortName }, { text: player.position }, { text: formatPrice(player.price) }, { text: info.statusLabel }, { text: formatInjurySummary(player) }, { text: info.expectedReturn }, { text: player.chance === null ? '—' : `${player.chance}%` }]; }) }]} /></div>
          <div className="vx-card__scroll vx-injuries-list">
            {visibleInjuries.map((player) => {
              const info = parsePlayerInjuryDetails(player, getPitchFixture(player.teamId).label);
              return (
                <div
                  key={player.id}
                  className="vx-injury-row"
                  role="group"
                  aria-label={`${player.name} availability row`}
                >
                  <button
                    type="button"
                    className="vx-injury-avatar-trigger"
                    onClick={() => setSelectedCardPlayer(player)}
                    title={`Click ${player.name} image for full FPL VORTEX player card`}
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
                  </button>
                  <button
                    type="button"
                    className="vx-injury-copy-trigger"
                    onClick={() => setSelectedInjuryPlayer(player)}
                    title="Click for full injury & expected return details"
                  >
                    <div className="vx-injury-copy">
                      <div className="vx-injury-head">
                        <strong>{player.name}</strong>
                        <ClubBadge
                          teamCode={player.team.code}
                          shortName={player.team.shortName}
                          teamName={player.team.name}
                          size="sm"
                        />
                        <span>
                          {player.position} · {formatPrice(player.price)}
                        </span>
                      </div>
                      <small>{formatInjurySummary(player)}</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={classNames('vx-warn-icon vx-injury-rect', `is-${info.severity}`)}
                    onClick={() => setSelectedInjuryPlayer(player)}
                    aria-label={`${player.name} injury detail: ${info.injuryType}`}
                    title={`${info.injuryType} · ${info.expectedReturn}`}
                  >
                    <AlertTriangle size={13} />
                    <span>{info.badgeText}</span>
                  </button>
                </div>
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
            <YouTubeBrandLogo size={22} />
            <h3>
              Latest FPL Videos ·{' '}
              <a
                href={YOUTUBE_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="vx-videos-strip__handle-link"
                title="Open @FPLVORTEX on YouTube"
              >
                @FPLVORTEX
              </a>
            </h3>
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
              href={YOUTUBE_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="vx-yt-channel-btn"
              title="Open @FPLVORTEX on YouTube"
            >
              <YouTubeBrandLogo size={18} />
              <span>@FPLVORTEX Channel</span>
              <ExternalLink size={13} />
            </a>
          </div>
        </header>

        <div className="vx-videos-scroll-row" ref={videoTrackRef}>
          {videos.map((video) => {
            const videoWatchUrl = video.url || `https://www.youtube.com/watch?v=${video.id}`;
            return (
              <div key={video.id} className="vx-video-pill" role="group" aria-label={video.title}>
                <a
                  href={videoWatchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vx-video-pill__thumb vx-video-pill__play-btn"
                  aria-label={`Watch ${video.title} on YouTube`}
                >
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
                </a>
                <div className="vx-video-pill__copy">
                  <a
                    href={videoWatchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="vx-video-pill__title-btn"
                  >
                    <strong>{video.title}</strong>
                  </a>
                  <a
                    href={YOUTUBE_CHANNEL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="vx-video-pill__channel-link"
                    title="Open @FPLVORTEX on YouTube"
                  >
                    FPL VORTEX (@FPLVORTEX)
                  </a>
                  <small>
                    <Clock size={11} /> {relativeTime(video.published)}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FPL VORTEX Broadcast Player Graphic Card Modal (Image 1 style — pure stats & fixtures, no transfer-out) */}
      <PlayerGraphicModal
        snapshot={snapshot}
        player={selectedCardPlayer}
        teams={snapshot.teams}
        fixtureRows={fixtureRows}
        reviewGw={reviewEventId}
        isCaptain={Boolean(selectedCardPlayer && hasLinkedTeam && selectedCardPlayer.id === pitchLineup.captainId)}
        isViceCaptain={Boolean(selectedCardPlayer && hasLinkedTeam && selectedCardPlayer.id === pitchLineup.viceId)}
        onClose={() => setSelectedCardPlayer(null)}
        onOpenInjuryDetail={(p) => setSelectedInjuryPlayer(p)}
      />

      {/* Rectangular Injury Sign Detail Modal (What Injury, Chance %, Expected Return Date & Bulletin) */}
      <InjuryDetailModal
        player={selectedInjuryPlayer}
        nextFixtureLabel={selectedInjuryPlayer ? getPitchFixture(selectedInjuryPlayer.teamId).label : undefined}
        nextEventId={nextEventId}
        onClose={() => setSelectedInjuryPlayer(null)}
        onOpenPlayerCard={(p) => setSelectedCardPlayer(p)}
      />
    </div>
  );
}
