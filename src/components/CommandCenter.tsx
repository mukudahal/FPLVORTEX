import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Crown,
  ExternalLink,
  Flame,
  LayoutGrid,
  List,
  Pencil,
  Play,
  Shield,
  Sparkles,
  Stethoscope,
  Target,
  Trophy,
  Users,
  WandSparkles,
  Zap,
} from 'lucide-react';
import type { EnrichedPlayer, EntryData, FixtureRow, Position, RiskProfile, Snapshot, VideoItem } from '../lib/types';
import type { RouteId } from '../hooks/useHashRoute';
import { useNow } from '../hooks/useNow';
import { fetchVideos } from '../lib/api';
import { buildInsights, toRepoElement } from '../lib/analytics';
import { toRepoFixtures, toRepoTeams } from '../lib/fixtures';
import {
  classNames,
  clamp,
  countdown,
  formatCompact,
  formatNumber,
  formatPrice,
  relativeTime,
} from '../lib/format';
import { buildStrengths, projectMatch } from '../lib/repoModel/dashboardMath';
import { selectOptimalXI } from '../lib/repoModel/scoring';
import { ClubBadge } from './ClubBadge';
import { PlayerAvatar } from './PlayerAvatar';

interface CommandCenterProps {
  snapshot: Snapshot;
  entry?: EntryData | null;
  players: EnrichedPlayer[];
  insights: ReturnType<typeof buildInsights>;
  fixtureRows: FixtureRow[];
  initialVideos?: VideoItem[];
  profile: RiskProfile;
  teamId?: string;
  onTeamIdChange?: (id: string) => void;
  onSelectPlayer?: (query: string) => void;
  onNavigate: (route: RouteId) => void;
  onOpenPalette: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const DEFAULT_145784_SQUAD = [1, 31, 332, 173, 40, 154, 427, 124, 165, 411, 346, 623, 115, 112, 289];

const CLUB_BAR_COLORS: Record<string, string> = {
  ARS: '#EF0107',
  AVL: '#95BFE5',
  BHA: '#0057B8',
  BOU: '#DA291C',
  BRE: '#E30613',
  CHE: '#034694',
  COV: '#59B5E6',
  CRY: '#1B458F',
  EVE: '#274488',
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
  // Scale transfer pressure relative to ownership threshold into (-99.4%, +99.4%)
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

const SEED_VORTEX_VIDEOS: VideoItem[] = [
  {
    id: 'TCP2HYD9djk',
    title: 'FPL GW8 Free Hit Team: Best Picks, Fixtures & Captain | FPL VORTEX',
    published: '2026-10-22T19:50:44Z',
    thumbnail: 'https://i.ytimg.com/vi/TCP2HYD9djk/maxresdefault.jpg',
    url: 'https://www.youtube.com/watch?v=TCP2HYD9djk',
  },
  {
    id: 'BbpBksRewHc',
    title: 'FPL GW8 Final Decisions: Transfers, Bench & Captain | FPL VORTEX',
    published: '2026-10-22T03:17:00Z',
    thumbnail: 'https://i.ytimg.com/vi/BbpBksRewHc/maxresdefault.jpg',
    url: 'https://www.youtube.com/watch?v=BbpBksRewHc',
  },
  {
    id: '65WusHtnHZg',
    title: 'FPL GW8 Final Decisions: Transfers, Bench & Captain | FPL VORTEX',
    published: '2026-10-21T18:27:00Z',
    thumbnail: 'https://i.ytimg.com/vi/65WusHtnHZg/maxresdefault.jpg',
    url: 'https://www.youtube.com/watch?v=65WusHtnHZg',
  },
  {
    id: '34q4AyADyZc',
    title: 'October 19 | Day 2 | Expected Minutes, Rank Pressure & Differentials #FPL #FantasyPremierLeague',
    published: '2026-10-19T22:48:22Z',
    thumbnail: 'https://i.ytimg.com/vi/34q4AyADyZc/maxresdefault.jpg',
    url: 'https://www.youtube.com/watch?v=34q4AyADyZc',
  },
];

export function CommandCenter({
  snapshot,
  entry,
  players,
  insights,
  fixtureRows,
  initialVideos,
  teamId = '145784',
  onTeamIdChange,
  onSelectPlayer,
  onNavigate,
  onOpenPalette,
  onRefresh,
  refreshing,
}: CommandCenterProps) {
  const now = useNow(1000);
  const [videos, setVideos] = useState<VideoItem[]>(initialVideos?.length ? initialVideos.slice(0, 8) : SEED_VORTEX_VIDEOS);
  const [selectedGw, setSelectedGw] = useState<number>(snapshot.meta.nextEventId || 9);
  const [squadView, setSquadView] = useState<'pitch' | 'table'>('pitch');
  const [editingTeam, setEditingTeam] = useState(false);
  const [teamInput, setTeamInput] = useState(teamId);
  const [expandedFixtureId, setExpandedFixtureId] = useState<number | null>(null);
  const [projMetric, setProjMetric] = useState<'goals' | 'cs' | 'win'>('goals');
  const [topMetric, setTopMetric] = useState<'season' | 'nextXp' | 'gwPts' | 'horizon5'>('season');
  const [transferSort, setTransferSort] = useState<'delta' | 'name' | 'in' | 'out' | 'net'>('delta');
  const [transferDir, setTransferDir] = useState<'desc' | 'asc'>('desc');
  const [transferPage, setTransferPage] = useState(0);
  const [injuryPage, setInjuryPage] = useState(0);
  const [inspectedFlagPlayer, setInspectedFlagPlayer] = useState<EnrichedPlayer | null>(null);

  useEffect(() => {
    setSelectedGw(snapshot.meta.nextEventId || 9);
  }, [snapshot.meta.nextEventId]);

  useEffect(() => {
    setTeamInput(teamId);
  }, [teamId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchVideos(controller.signal)
      .then((res) => {
        if (res.videos.length > 0) setVideos(res.videos.slice(0, 8));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const nextEvent = snapshot.gameweeks.find((event) => event.id === snapshot.meta.nextEventId);
  const deadline = useMemo(() => countdown(nextEvent?.deadlineTime), [nextEvent?.deadlineTime, now]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const teamMap = useMemo(() => new Map(snapshot.teams.map((t) => [t.id, t])), [snapshot.teams]);

  const squadIds = useMemo(() => {
    if (entry && entry.picks.length === 15) {
      return entry.picks.map((p) => p.element);
    }
    const valid = DEFAULT_145784_SQUAD.filter((id) => playerMap.has(id));
    return valid.length === 15 ? valid : players.slice(0, 15).map((p) => p.id);
  }, [entry, playerMap, players]);

  // Projected points for any player in selectedGw (uses Tier-1 GW projection when available)
  const playerGwXp = useMemo(() => {
    const out = new Map<number, number>();
    for (const p of players) {
      const xp = p.gwProjections?.[selectedGw] ?? p.projection;
      out.set(p.id, xp);
    }
    return out;
  }, [players, selectedGw]);

  // Solve optimal XI for selectedGw (or preserve manager's exact GW picks when viewing entry.currentEvent)
  const pitchLineup = useMemo(() => {
    const validSquad = squadIds.filter((id) => playerMap.has(id));
    if (validSquad.length < 11) {
      return {
        starters: [] as number[],
        bench: [] as number[],
        captainId: 0,
        viceId: 0,
        totalXp: 0,
      };
    }

    if (entry && entry.currentEvent === selectedGw && entry.picks.length === 15) {
      const sortedPicks = [...entry.picks].sort((a, b) => a.position - b.position);
      const starters = sortedPicks.filter((pk) => pk.position <= 11).map((pk) => pk.element);
      const bench = sortedPicks.filter((pk) => pk.position > 11).map((pk) => pk.element);
      const cap = sortedPicks.find((pk) => pk.isCaptain)?.element ?? starters[0];
      const vice = sortedPicks.find((pk) => pk.isViceCaptain)?.element ?? starters[1];
      const totalXp = starters.reduce(
        (sum, id) => sum + (playerGwXp.get(id) ?? 0) * (id === cap ? 2 : 1),
        0,
      );
      return { starters, bench, captainId: cap, viceId: vice, totalXp };
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
    };
  }, [entry, playerGwXp, playerMap, selectedGw, squadIds]);

  // Hero always shows nextEventId XI projection + top captain + best 5-GW fixture run
  const heroLineupXp = useMemo(() => {
    const validSquad = squadIds.filter((id) => playerMap.has(id));
    if (validSquad.length < 11) return 0;
    const nextGw = snapshot.meta.nextEventId;
    return selectOptimalXI(
      validSquad,
      (id) => posToNum(playerMap.get(id)?.position ?? 'MID'),
      (id) => playerMap.get(id)?.gwProjections?.[nextGw] ?? playerMap.get(id)?.projection ?? 0,
    ).total;
  }, [playerMap, snapshot.meta.nextEventId, squadIds]);

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
          awayWin: proj.awayWin,
          draw: proj.draw,
        };
      });

    // Club-level rows (20 clubs) for `GW Projected Goals / CS% / Win%`
    const clubRows = new Map<
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
        const prevH = clubRows.get(m.homeTeam.id);
        clubRows.set(m.homeTeam.id, {
          teamId: m.homeTeam.id,
          shortName: m.homeTeam.shortName,
          name: m.homeTeam.name,
          code: m.homeTeam.code,
          oppLabel: prevH ? `${prevH.oppLabel}, ${m.awayTeam.shortName} (H)` : `${m.awayTeam.shortName} (H)`,
          goals: (prevH?.goals ?? 0) + m.homeXg,
          cs: prevH ? (prevH.cs + m.homeCs) / 2 : m.homeCs,
          win: prevH ? (prevH.win + m.homeWin) / 2 : m.homeWin,
        });

        const prevA = clubRows.get(m.awayTeam.id);
        clubRows.set(m.awayTeam.id, {
          teamId: m.awayTeam.id,
          shortName: m.awayTeam.shortName,
          name: m.awayTeam.name,
          code: m.awayTeam.code,
          oppLabel: prevA ? `${prevA.oppLabel}, ${m.homeTeam.shortName} (A)` : `${m.homeTeam.shortName} (A)`,
          goals: (prevA?.goals ?? 0) + m.awayXg,
          cs: prevA ? (prevA.cs + m.awayCs) / 2 : m.awayCs,
          win: prevA ? (prevA.win + m.awayWin) / 2 : m.awayWin,
        });
      }
    }

    // Include any blank-GW clubs with 0
    for (const t of snapshot.teams) {
      if (!clubRows.has(t.id)) {
        clubRows.set(t.id, {
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
      clubs: [...clubRows.values()],
    };
  }, [selectedGw, snapshot.fixtures, snapshot.players, snapshot.teams, teamMap]);

  // Group GW matches by formatted date banner
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
      const last = groups.at(-1);
      if (last && last.dateLabel === dateLabel) {
        last.items.push(m);
      } else {
        groups.push({ dateLabel, items: [m] });
      }
    }
    return groups;
  }, [gwMatchesAndClubs.matches]);

  // Sorted club ranking for Column 3
  const sortedClubs = useMemo(() => {
    const list = [...gwMatchesAndClubs.clubs];
    list.sort((a, b) => b[projMetric] - a[projMetric] || a.shortName.localeCompare(b.shortName));
    return list;
  }, [gwMatchesAndClubs.clubs, projMetric]);

  const maxClubVal = Math.max(...sortedClubs.map((c) => c[projMetric]), 0.01);

  // Fixture badge info for any player on the Pitch in selectedGw
  const getPitchFixture = (teamIdNum: number) => {
    const teamMatches = gwMatchesAndClubs.matches.filter(
      (m) => m.fixture.teamH === teamIdNum || m.fixture.teamA === teamIdNum,
    );
    if (teamMatches.length === 0) {
      return { label: 'BLANK', difficulty: 5, isBlank: true };
    }
    const labels = teamMatches.map((m) => {
      const isHome = m.fixture.teamH === teamIdNum;
      const opp = isHome ? m.awayTeam?.shortName : m.homeTeam?.shortName;
      return `${opp ?? 'OPP'} (${isHome ? 'H' : 'A'})`;
    });
    const maxDiff = Math.max(
      ...teamMatches.map((m) =>
        m.fixture.teamH === teamIdNum ? m.fixture.teamHDifficulty : m.fixture.teamADifficulty,
      ),
    );
    return { label: labels.join(', '), difficulty: maxDiff, isBlank: false };
  };

  // Lower Row Card 1: Top Players
  const topPlayersList = useMemo(() => {
    const scoreOf = (p: EnrichedPlayer) => {
      if (topMetric === 'season') return p.totalPoints;
      if (topMetric === 'gwPts') return p.eventPoints;
      if (topMetric === 'horizon5') return p.horizon5Projection;
      return playerGwXp.get(p.id) ?? p.projection;
    };
    const sorted = [...players].sort((a, b) => scoreOf(b) - scoreOf(a) || b.projection - a.projection);
    return sorted.slice(0, 10).map((p) => ({ player: p, score: scoreOf(p) }));
  }, [playerGwXp, players, topMetric]);

  const maxTopScore = Math.max(...topPlayersList.map((item) => item.score), 1);

  // Lower Row Card 2: Price & Transfers
  const priceTransferRows = useMemo(() => {
    const enrichedWithDelta = players.map((p) => ({
      player: p,
      deltaPct: computePriceDeltaPct(p),
      net: p.transfersInEvent - p.transfersOutEvent,
    }));
    const mul = transferDir === 'desc' ? -1 : 1;
    enrichedWithDelta.sort((a, b) => {
      if (transferSort === 'name') return mul * -a.player.name.localeCompare(b.player.name);
      if (transferSort === 'in') return mul * (a.player.transfersInEvent - b.player.transfersInEvent);
      if (transferSort === 'out') return mul * (a.player.transfersOutEvent - b.player.transfersOutEvent);
      if (transferSort === 'net') return mul * (a.net - b.net);
      // Default 'delta': sort by absolute magnitude so biggest risers AND fallers appear at top (just like reference!)
      return mul * (Math.abs(a.deltaPct) - Math.abs(b.deltaPct)) || b.player.transfersInEvent - a.player.transfersInEvent;
    });
    return enrichedWithDelta;
  }, [players, transferDir, transferSort]);

  const transferTotalPages = Math.max(1, Math.ceil(priceTransferRows.length / 10));
  const safeTransferPage = clamp(transferPage, 0, transferTotalPages - 1);
  const visibleTransfers = priceTransferRows.slice(safeTransferPage * 10, safeTransferPage * 10 + 10);

  const toggleTransferSort = (col: typeof transferSort) => {
    if (transferSort === col) {
      setTransferDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setTransferSort(col);
      setTransferDir('desc');
    }
    setTransferPage(0);
  };

  // Lower Row Card 3: Injuries & Suspensions
  const flaggedPlayers = useMemo(() => {
    return players
      .filter((p) => p.status !== 'a' || (p.chance !== null && p.chance < 100) || Boolean(p.news?.trim()))
      .sort((a, b) => b.ownership - a.ownership || b.projection - a.projection);
  }, [players]);

  const injuryTotalPages = Math.max(1, Math.ceil(flaggedPlayers.length / 10));
  const safeInjuryPage = clamp(injuryPage, 0, injuryTotalPages - 1);
  const visibleInjuries = flaggedPlayers.slice(safeInjuryPage * 10, safeInjuryPage * 10 + 10);

  const handleTeamSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = teamInput.trim();
    if (/^\d{1,12}$/.test(cleaned)) {
      onTeamIdChange?.(cleaned);
      setEditingTeam(false);
    }
  };

  const renderPitchCard = (playerId: number, isBench = false) => {
    const p = playerMap.get(playerId);
    if (!p) return null;
    const fx = getPitchFixture(p.teamId);
    const tone = fdrPillTone(fx.difficulty, fx.isBlank);
    const xp = playerGwXp.get(p.id) ?? p.projection;
    const isCap = !isBench && p.id === pitchLineup.captainId;
    const isVice = !isBench && p.id === pitchLineup.viceId;
    const hasFlag = p.status !== 'a' || (p.chance !== null && p.chance < 100);
    const isSevere = p.status === 'i' || p.status === 's' || p.status === 'u' || p.chance === 0;

    return (
      <div
        key={p.id}
        className={classNames('vx-pitch-player', isBench && 'vx-pitch-player--bench')}
        title={`${p.name} (${p.team.shortName}) · ${fx.label} · ${xp.toFixed(2)} xPts`}
        onClick={() => onSelectPlayer?.(p.name)}
      >
        {isBench ? (
          <span className="vx-pitch-pos-label">{p.position}</span>
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
              <AlertTriangle size={11} />
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
            size={isBench ? 'md' : 'lg'}
            className="vx-pitch-portrait"
          />
        </div>
        <strong className="vx-pitch-name">{p.name}</strong>
        <span className={classNames('vx-pitch-fix', `is-${tone}`)}>{fx.label}</span>
      </div>
    );
  };

  const startersByPos = (pos: Position) =>
    pitchLineup.starters.filter((id) => playerMap.get(id)?.position === pos);

  const finishedMatchesCount = gwMatchesAndClubs.matches.filter((m) => m.fixture.finished).length;

  return (
    <div className="page page--command">
      {/* ==================== 1. TOP VORTEX HERO (IMAGE 1) ==================== */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__noise" />
        <div className="hero__content">
          <div className="eyebrow">
            <Sparkles size={14} /> FPL VORTEX · @FPLVORTEX · {snapshot.meta.season}
          </div>
          <h2 id="hero-title">Every transfer, captain and fixture — pulled into focus.</h2>
          <p>
            VORTEX scores all {formatNumber(snapshot.players.length)} Premier League players against upcoming fixtures,
            expected goals, clean-sheet odds, and transfer momentum so your deadline calls stay sharp.
          </p>
          <div className="hero__actions">
            <button type="button" className="button button--primary button--large" onClick={() => onNavigate('optimizer')}>
              <WandSparkles size={18} /> Planner, Chips & Simulation <ArrowRight size={17} />
            </button>
            <button type="button" className="button button--ghost button--large" onClick={onOpenPalette}>
              <Target size={18} /> Search {formatNumber(snapshot.players.length)} players
            </button>
          </div>
          <div className="hero__trust">
            <span><Users size={15} /> <strong>{formatNumber(snapshot.players.length)}</strong> players</span>
            <span><Trophy size={15} /> OR <strong>{formatNumber(entry?.overallRank ?? 237000)}</strong></span>
            <span>
              <CircleDollarSign size={15} /> <strong>{entry?.freeTransfers ?? 4} FT</strong> · £
              {((entry?.history.bank ?? 4) / 10).toFixed(1)}m bank
            </span>
          </div>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <div className="vortex-orb">
            <span className="vortex-orb__ring vortex-orb__ring--one" />
            <span className="vortex-orb__ring vortex-orb__ring--two" />
            <span className="vortex-orb__ring vortex-orb__ring--three" />
            <div className="vortex-orb__core">
              <img
                src="/player-images/brand/fpl-vortex-lion.jpg"
                alt=""
                className="vortex-orb__crest"
              />
              <span>GW{snapshot.meta.nextEventId}</span>
              <strong>{heroLineupXp > 0 ? heroLineupXp.toFixed(1) : '57.0'}</strong>
              <small>projected XI pts</small>
            </div>
          </div>

          {captain && (
            <div className="float-card float-card--captain">
              <div className="float-card__row">
                <PlayerAvatar
                  code={captain.code}
                  teamCode={captain.team.code}
                  name={captain.name}
                  fullName={captain.fullName}
                  teamShort={captain.team.shortName}
                  position={captain.position}
                  size="sm"
                />
                <div className="float-card__copy">
                  <span className="float-card__label"><Crown size={12} /> #1 Captain</span>
                  <strong>{captain.name}</strong>
                  <small>{captain.team.shortName} · {(captain.projection * 2).toFixed(1)} 2× xPts</small>
                </div>
              </div>
            </div>
          )}

          {bestFixture && (
            <div className="float-card float-card--fixture">
              <div className="float-card__row">
                <ClubBadge
                  teamCode={bestFixture.team.code}
                  shortName={bestFixture.team.shortName}
                  teamName={bestFixture.team.name}
                  size="md"
                />
                <div className="float-card__copy">
                  <span className="float-card__label"><Flame size={12} /> Best 5-GW run</span>
                  <strong>{bestFixture.team.name}</strong>
                  <small>Ease {bestFixture.easeSum5} · {bestFixture.next5.toFixed(2)} FDR</small>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ==================== GAMEWEEK STEPPER & DEADLINE BAR ==================== */}
      <section className="vx-gw-bar" aria-label="Gameweek selector and deadline">
        <div className="vx-gw-bar__left">
          <span className="vx-gw-bar__dot" />
          <strong>Dashboard</strong>
          <span className="vx-gw-bar__season">{snapshot.meta.season}</span>
        </div>

        <div className="vx-gw-stepper">
          <button
            type="button"
            className="icon-button vx-gw-stepper__btn"
            onClick={() => setSelectedGw((gw) => Math.max(1, gw - 1))}
            disabled={selectedGw <= 1}
            aria-label="Previous gameweek"
          >
            <ChevronLeft size={16} />
          </button>
          <label className="vx-gw-stepper__select-wrap">
            <select
              value={selectedGw}
              onChange={(e) => setSelectedGw(Number(e.target.value))}
              aria-label="Select gameweek"
            >
              {snapshot.gameweeks.map((gw) => (
                <option key={gw.id} value={gw.id}>
                  Gameweek {gw.id}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <button
            type="button"
            className="icon-button vx-gw-stepper__btn"
            onClick={() => setSelectedGw((gw) => Math.min(38, gw + 1))}
            disabled={selectedGw >= 38}
            aria-label="Next gameweek"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="vx-gw-bar__right">
          <span className="vx-deadline-chip">
            Next deadline: <strong>{deadline.label}</strong>
          </span>
          <button type="button" className="button button--subtle button--sm" onClick={onRefresh} disabled={refreshing}>
            <Zap size={14} /> {refreshing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </section>

      {/* ==================== 2. MAIN 3-COLUMN VORTEX HUB (IMAGE 3) ==================== */}
      <section className="vx-hub-upper" aria-label="Squad pitch, fixtures and projected goals">
        {/* COLUMN 1: SOCCER PITCH CARD */}
        <article className="panel vx-card vx-card--pitch">
          <header className="vx-card__header vx-pitch-header">
            <div className="vx-pitch-header__identity">
              <strong>{entry?.teamName ?? 'FPLVORTEX'}</strong>
              {!editingTeam ? (
                <button
                  type="button"
                  className="vx-team-id-trigger"
                  onClick={() => setEditingTeam(true)}
                  title="Change FPL Team ID"
                >
                  <span>Team ID: {entry?.id ?? 145784}</span>
                  <Pencil size={11} />
                </button>
              ) : (
                <form className="vx-team-id-form" onSubmit={handleTeamSubmit}>
                  <input
                    value={teamInput}
                    onChange={(e) => setTeamInput(e.target.value)}
                    placeholder="Team ID"
                    aria-label="FPL Team ID"
                    autoFocus
                  />
                  <button type="submit" className="button button--primary button--xs">Load</button>
                  <button type="button" className="button button--ghost button--xs" onClick={() => setEditingTeam(false)}>
                    Cancel
                  </button>
                </form>
              )}
            </div>

            <div className="vx-pitch-header__center">
              <strong>{pitchLineup.totalXp.toFixed(1)}</strong>
              <span>GW {selectedGw} xP</span>
            </div>

            <div className="vx-pitch-header__actions">
              <button type="button" className="vx-inline-link" onClick={() => onNavigate('optimizer')}>
                Plan team <ArrowRight size={13} />
              </button>
              <div className="vx-view-toggle" role="group" aria-label="Squad view">
                <button
                  type="button"
                  className={classNames(squadView === 'pitch' && 'is-active')}
                  onClick={() => setSquadView('pitch')}
                  aria-label="Pitch view"
                  title="Pitch view"
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  type="button"
                  className={classNames(squadView === 'table' && 'is-active')}
                  onClick={() => setSquadView('table')}
                  aria-label="Table view"
                  title="Table view"
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          </header>

          {squadView === 'pitch' ? (
            <div className="vx-soccer-pitch">
              {/* Top Stadium Sponsor Boards with User's Lion Logo & Channel */}
              <div className="vx-pitch-top-boards">
                <div className="vx-pitch-board">
                  <img src="/player-images/brand/fpl-vortex-lion.jpg" alt="" width={18} height={18} />
                  <span>FPL VORTEX</span>
                </div>
                <div className="vx-pitch-goal-net" aria-hidden="true" />
                <a
                  href="https://www.youtube.com/@Fplvortex"
                  target="_blank"
                  rel="noreferrer"
                  className="vx-pitch-board vx-pitch-board--link"
                >
                  <span>@FPLVORTEX</span>
                </a>
              </div>

              {/* Crisp White Turf Markings */}
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

                {/* 4-Man Bench Tray inside bottom of pitch */}
                <div className="vx-pitch-bench">
                  {pitchLineup.bench.map((id) => renderPitchCard(id, true))}
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
                    <th>GW {selectedGw} xP</th>
                    <th>5-GW xP</th>
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
                      <tr key={p.id} className={classNames(isBench && 'is-bench-row')}>
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
                              <small>{p.team.shortName} · {formatPrice(p.price)}</small>
                            </div>
                          </div>
                        </td>
                        <td>{p.position}</td>
                        <td>
                          <span className={classNames('vx-pitch-fix vx-pitch-fix--inline', `is-${tone}`)}>
                            {fx.label}
                          </span>
                        </td>
                        <td className="mono-num">
                          <strong>{((playerGwXp.get(p.id) ?? p.projection) * (isCap ? 2 : 1)).toFixed(2)}</strong>
                        </td>
                        <td className="mono-num">{p.horizon5Projection.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
              All matches <ArrowRight size={13} />
            </button>
          </header>

          <div className="vx-card__scroll">
            {groupedMatches.map((group) => (
              <div key={group.dateLabel} className="vx-fixture-group">
                <div className="vx-fixture-date-banner">{group.dateLabel}</div>
                {group.items.map((m) => {
                  const homeShort = m.homeTeam?.shortName ?? 'HOM';
                  const awayShort = m.awayTeam?.shortName ?? 'AWY';
                  const kickoffLabel = m.fixture.started || m.fixture.finished
                    ? `${m.fixture.teamHScore ?? 0} – ${m.fixture.teamAScore ?? 0}`
                    : m.fixture.kickoffTime
                      ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
                          new Date(m.fixture.kickoffTime),
                        )
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
                          <ChevronDown size={13} className={classNames('vx-match-chevron', isExpanded && 'is-open')} />
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
                          <span>CS {(m.homeCs * 100).toFixed(0)}% / {(m.awayCs * 100).toFixed(0)}%</span>
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
              <Shield size={15} />
              <h3>
                GW {selectedGw}{' '}
                {projMetric === 'goals' ? 'Projected Goals' : projMetric === 'cs' ? 'Clean Sheet %' : 'Win Odds'}
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

      {/* ==================== 3. LOWER 3-COLUMN INTELLIGENCE GRID (IMAGE 2) ==================== */}
      <section className="vx-hub-lower" aria-label="Top players, price changes and injuries">
        {/* CARD 1: TOP PLAYERS */}
        <article className="panel vx-card vx-card--lower">
          <header className="vx-card__header">
            <div className="vx-card__title-icon">
              <Trophy size={15} className="vx-icon-amber" />
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
                    size="sm"
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
              All player stats <ArrowRight size={13} />
            </button>
            <small>{formatNumber(players.length)} players</small>
          </footer>
        </article>

        {/* CARD 2: PRICE & TRANSFERS */}
        <article className="panel vx-card vx-card--lower">
          <header className="vx-card__header">
            <div className="vx-card__title-icon">
              <ArrowLeftRight size={15} className="vx-icon-mint" />
              <h3>Price & Transfers</h3>
            </div>
            <button type="button" className="vx-inline-link" onClick={() => onNavigate('players')}>
              Price changes <ArrowRight size={13} />
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
                          size="sm"
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
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="icon-button vx-pager__btn"
                disabled={safeTransferPage >= transferTotalPages - 1}
                onClick={() => setTransferPage((p) => Math.min(transferTotalPages - 1, p + 1))}
                aria-label="Next transfer page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </footer>
        </article>

        {/* CARD 3: INJURIES & SUSPENSIONS */}
        <article className="panel vx-card vx-card--lower">
          <header className="vx-card__header">
            <div className="vx-card__title-icon">
              <Stethoscope size={15} className="vx-icon-pink" />
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
                    size="sm"
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
                    <AlertTriangle size={15} />
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
              <ChevronLeft size={13} /> Prev
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
              Next <ChevronRight size={13} />
            </button>
          </footer>
        </article>
      </section>

      {/* ==================== 4. LATEST @FPLVORTEX YOUTUBE VIDEOS STRIP (IMAGE 2 BOTTOM) ==================== */}
      <section className="panel vx-videos-strip" aria-label="Latest FPL VORTEX YouTube videos">
        <header className="vx-card__header">
          <div className="vx-card__title-icon">
            <span className="vx-yt-badge">
              <Play size={11} fill="currentColor" />
            </span>
            <h3>Latest FPL Videos · @FPLVORTEX</h3>
          </div>
          <a
            href="https://www.youtube.com/@Fplvortex"
            target="_blank"
            rel="noreferrer"
            className="vx-yt-channel-btn"
          >
            <img src="/player-images/brand/fpl-vortex-lion.jpg" alt="" width={20} height={20} />
            <span>youtube.com/@Fplvortex</span>
            <ExternalLink size={13} />
          </a>
        </header>

        <div className="vx-videos-carousel">
          {videos.map((video) => (
            <a
              key={video.id}
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="vx-video-tile"
            >
              <div className="vx-video-tile__thumb">
                <img src={video.thumbnail} alt={video.title} loading="lazy" />
                <span className="vx-video-tile__play">
                  <Play size={12} fill="currentColor" /> Watch
                </span>
              </div>
              <div className="vx-video-tile__body">
                <strong>{video.title}</strong>
                <span>FPL VORTEX (@FPLVORTEX)</span>
                <small>{relativeTime(video.published)}</small>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Availability Detail Modal when clicking a warning triangle */}
      {inspectedFlagPlayer && (
        <div
          className="palette-overlay"
          role="presentation"
          onMouseDown={() => setInspectedFlagPlayer(null)}
        >
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
                  {inspectedFlagPlayer.team.name} · {inspectedFlagPlayer.position} · {formatPrice(inspectedFlagPlayer.price)}
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
    </div>
  );
}
