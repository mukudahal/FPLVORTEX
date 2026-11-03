import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BrainCircuit, CalendarDays, Gauge, Trophy, Users, WandSparkles, X } from 'lucide-react';
import type { EnrichedPlayer, EntryData, RiskProfile } from './lib/types';
import { BRAND_LION_SRC } from './lib/baseUrl';
import type { RouteId } from './hooks/useHashRoute';
import { useHashRoute } from './hooks/useHashRoute';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useVortexData } from './hooks/useVortexData';
import {
  deleteSavedTeamOnServer,
  fetchEntry,
  fetchSavedTeams,
  saveTeamOnServer,
} from './lib/api';
import { buildInsights, enrichPlayers } from './lib/analytics';
import { buildFixtureMatrix } from './lib/fixtures';
import {
  RECENT_TEAM_IDS_KEY,
  mergeRecentTeamLists,
  readFallbackStoredTeams,
  removeRecentTeam,
  upsertRecentTeam,
  writeFallbackStoredTeams,
  type RecentTeamEntry,
} from './lib/recentTeamIds';
import { CommandCenter } from './components/CommandCenter';
import { CommandPalette } from './components/CommandPalette';
import { InjuryDetailModal } from './components/InjuryDetailModal';
import { LoadingScreen } from './components/LoadingScreen';
import { PlayerGraphicModal } from './components/PlayerGraphicModal';
import { XBrandLogo, YouTubeBrandLogo } from './components/SocialIcons';
import { Toast } from './components/Toast';
import { Topbar } from './components/Topbar';
import { YOUTUBE_CHANNEL_URL } from './components/YouTubePlayerModal';

const FixtureMatrix = lazy(() => import('./components/FixtureMatrix').then(m => ({ default: m.FixtureMatrix })));
const LeagueIntel = lazy(() => import('./components/LeagueIntel').then(m => ({ default: m.LeagueIntel })));
const Methodology = lazy(() => import('./components/Methodology').then(m => ({ default: m.Methodology })));
const PlayerLab = lazy(() => import('./components/PlayerLab').then(m => ({ default: m.PlayerLab })));
const PlayerComparisonWorkspace = lazy(() => import('./components/PlayerComparisonWorkspace').then(m => ({ default: m.PlayerComparisonWorkspace })));
const SquadBuilder = lazy(() => import('./components/SquadBuilder').then(m => ({ default: m.SquadBuilder })));

type ToastTone = 'success' | 'error' | 'info';
interface ToastState {
  message: string;
  tone: ToastTone;
}

export interface PendingSwap {
  outId: number;
  inId: number;
}

const ROUTE_PILLS: Array<{ id: RouteId; label: string; icon: typeof Gauge }> = [
  { id: 'command', label: 'DASHBOARD', icon: Gauge },
  { id: 'optimizer', label: 'PLANNER', icon: WandSparkles },
  { id: 'players', label: 'PLAYERS', icon: Users },
  { id: 'fixtures', label: 'FIXTURES', icon: CalendarDays },
  { id: 'league', label: 'LEAGUE', icon: Trophy },
  { id: 'method', label: 'METHOD', icon: BrainCircuit },
];

const MOBILE_NAV = ROUTE_PILLS;

export default function App() {
  const { snapshot, loading, refreshing, error, lastSuccessAt, refresh } = useVortexData();
  const [route, navigate] = useHashRoute();
  const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('vortex:theme', 'dark');
  const [profile, setProfile] = useLocalStorage<RiskProfile>('vortex:profile', 'balanced');
  // Starts empty ('') until the user explicitly inputs their FPL Team ID at the top!
  const [teamId, setTeamId] = useLocalStorage<string>('vortex:linkedManagerId', '');
  const [recentTeams, setRecentTeams] = useLocalStorage<RecentTeamEntry[]>(RECENT_TEAM_IDS_KEY, []);
  const [leagueId, setLeagueId] = useLocalStorage('vortex:leagueId', '314');
  const [pendingSwapsByTeam, setPendingSwapsByTeam] = useLocalStorage<Record<string, PendingSwap[]>>(
    'vortex:pendingSwapsByTeam',
    {},
  );
  const [activeEntry, setActiveEntry] = useState<EntryData | null>(null);
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entrySyncNonce, setEntrySyncNonce] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRevision, setSearchRevision] = useState(0);
  const [playerQuery, setPlayerQuery] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [globalCardPlayer, setGlobalCardPlayer] = useState<EnrichedPlayer | null>(null);
  const [globalInjuryPlayer, setGlobalInjuryPlayer] = useState<EnrichedPlayer | null>(null);

  const handleInspectPlayer = useCallback((player: EnrichedPlayer) => {
    setGlobalInjuryPlayer(null);
    setGlobalCardPlayer(player);
  }, []);

  const handleInspectInjury = useCallback((player: EnrichedPlayer) => {
    setGlobalCardPlayer(null);
    setGlobalInjuryPlayer(player);
  }, []);

  useEffect(() => {
    setGlobalCardPlayer(null);
    setGlobalInjuryPlayer(null);
  }, [route]);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => setToast({ message, tone }), []);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#070914' : '#f4f6ff');
  }, [theme]);

  useEffect(() => {
    document.title = `${route.charAt(0).toUpperCase()}${route.slice(1)} · FPL VORTEX`;
  }, [route]);

  // Hydrate saved FPL Team IDs from cookie/sessionStorage + server cache on mount so every ID ever entered persists
  useEffect(() => {
    const fallbackItems = readFallbackStoredTeams();
    if (fallbackItems.length > 0) {
      setRecentTeams((prev) => mergeRecentTeamLists(prev, fallbackItems));
    }
    const controller = new AbortController();
    fetchSavedTeams(controller.signal)
      .then((serverTeams) => {
        if (!controller.signal.aborted && serverTeams.length > 0) {
          setRecentTeams((prev) => mergeRecentTeamLists(prev, serverTeams));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [setRecentTeams]);

  // Mirror recentTeams into sessionStorage + cookie fallback whenever it changes
  useEffect(() => {
    writeFallbackStoredTeams(recentTeams);
  }, [recentTeams]);

  useEffect(() => {
    const cleanId = (teamId || '').trim();
    if (!cleanId) {
      setActiveEntry(null);
      setEntryError(null);
      setEntryLoading(false);
      return;
    }
    if (!/^[1-9]\d{0,11}$/.test(cleanId)) {
      setActiveEntry(null);
      setEntryError('Enter a valid numeric FPL Team ID (starting from 1).');
      setEntryLoading(false);
      return;
    }
    const controller = new AbortController();
    setEntryLoading(true);
    setEntryError(null);
    fetchEntry(cleanId, controller.signal, { refresh: entrySyncNonce > 0 })
      .then((data) => {
        if (!controller.signal.aborted) {
          setActiveEntry(data);
          setEntryError(null);
          const payload = {
            id: cleanId,
            teamName: data.teamName,
            managerName: data.name,
          };
          setRecentTeams((prev) => upsertRecentTeam(prev, payload));
          void saveTeamOnServer(payload);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setActiveEntry(null);
          setEntryError(err instanceof Error ? err.message : 'Could not load that FPL Team ID.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setEntryLoading(false);
      });
    return () => controller.abort();
  }, [teamId, entrySyncNonce, snapshot?.meta.servedAt, setRecentTeams]);

  const handleLoadTeam = useCallback(
    (nextId: string) => {
      const cleaned = nextId.trim();
      if (!cleaned) {
        setTeamId('');
        setActiveEntry(null);
        setEntryError(null);
        return;
      }
      if (!/^[1-9]\d{0,11}$/.test(cleaned)) {
        setEntryError('Use a numeric FPL Team ID (found in your official FPL Points URL).');
        showToast('Enter a valid numeric FPL Team ID.', 'error');
        return;
      }
      setTeamId(cleaned);
      setRecentTeams((prev) => upsertRecentTeam(prev, { id: cleaned }));
      void saveTeamOnServer({ id: cleaned });
      setEntrySyncNonce((n) => n + 1);
      showToast(`Syncing official FPL Team #${cleaned}…`, 'info');
    },
    [setRecentTeams, setTeamId, showToast],
  );

  const handleRemoveRecentTeam = useCallback(
    (idToRemove: string) => {
      setRecentTeams((prev) => removeRecentTeam(prev, idToRemove));
      void deleteSavedTeamOnServer(idToRemove);
    },
    [setRecentTeams],
  );

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setSearchQuery('');
  }, []);
  const toggleTheme = useCallback(() => setTheme((current) => (current === 'dark' ? 'light' : 'dark')), [setTheme]);
  const handleRefresh = useCallback(() => {
    setEntrySyncNonce((n) => n + 1);
    void refresh(true);
  }, [refresh]);
  const selectPlayer = useCallback((query: string) => {
    setPlayerQuery(query);
    setSearchRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key === '/' && !isTyping) {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const players = useMemo(() => (snapshot ? enrichPlayers(snapshot, profile) : []), [profile, snapshot]);
  const insights = useMemo(() => buildInsights(players), [players]);
  const fixtureRows = useMemo(
    () => (snapshot ? buildFixtureMatrix(snapshot.teams, snapshot.fixtures, snapshot.meta.nextEventId, 5, [], snapshot.historicalTeamModel?.strengths) : []),
    [snapshot],
  );

  const activeSwaps = useMemo(() => {
    if (!activeEntry) return [] as PendingSwap[];
    return pendingSwapsByTeam[String(activeEntry.id)] ?? [];
  }, [activeEntry, pendingSwapsByTeam]);

  // Apply any user-synced pre-deadline app transfers cleanly onto activeEntry
  const effectiveEntry = useMemo<EntryData | null>(() => {
    if (!activeEntry) return null;
    if (activeSwaps.length === 0) return activeEntry;
    const playerMap = new Map(players.map((p) => [p.id, p]));
    const nextPicks = activeEntry.picks.map((pk) => ({ ...pk }));
    let bankDeltaTenths = 0;
    for (const swap of activeSwaps) {
      const slot = nextPicks.find((pk) => pk.element === swap.outId);
      const outP = playerMap.get(swap.outId);
      const inP = playerMap.get(swap.inId);
      if (slot && inP && !nextPicks.some((pk) => pk.element === swap.inId)) {
        slot.element = swap.inId;
        if (outP) {
          bankDeltaTenths += Math.round((outP.price - inP.price) * 10);
        }
      }
    }
    const nextPlayers = nextPicks
      .map((pk) => playerMap.get(pk.element))
      .filter((p): p is (typeof players)[number] => Boolean(p));
    const projectedPoints = nextPicks.reduce((sum, pk) => {
      const p = playerMap.get(pk.element);
      if (!p) return sum;
      const mult = pk.isCaptain ? 2 : pk.multiplier > 0 ? 1 : 0;
      return sum + p.projection * mult;
    }, 0);
    return {
      ...activeEntry,
      picks: nextPicks,
      players: nextPlayers,
      projectedPoints: Math.round(projectedPoints * 10) / 10,
      freeTransfers: Math.max(0, activeEntry.freeTransfers - activeSwaps.length),
      history: {
        ...activeEntry.history,
        bank: Math.max(0, activeEntry.history.bank + bankDeltaTenths),
        eventTransfers: activeEntry.history.eventTransfers + activeSwaps.length,
      },
    };
  }, [activeEntry, activeSwaps, players]);

  const handleAddPendingSwap = useCallback(
    (outId: number, inId: number) => {
      if (!activeEntry) return;
      const key = String(activeEntry.id);
      setPendingSwapsByTeam((prev) => {
        const list = prev[key] ?? [];
        // Collapse chained swaps (A->B then B->C becomes A->C; A->B then B->A cancels)
        const chainIdx = list.findIndex((s) => s.inId === outId);
        let nextList: PendingSwap[];
        if (chainIdx >= 0) {
          const origOut = list[chainIdx].outId;
          nextList = origOut === inId
            ? list.filter((_, i) => i !== chainIdx)
            : list.map((s, i) => (i === chainIdx ? { outId: origOut, inId } : s));
        } else {
          nextList = [...list.filter((s) => s.outId !== outId), { outId, inId }];
        }
        return { ...prev, [key]: nextList };
      });
      showToast('Synced pending transfer to your squad & Review pitch.', 'success');
    },
    [activeEntry, setPendingSwapsByTeam, showToast],
  );

  const handleClearPendingSwaps = useCallback(() => {
    if (!activeEntry) return;
    const key = String(activeEntry.id);
    setPendingSwapsByTeam((prev) => ({ ...prev, [key]: [] }));
    showToast('Reset to official locked gameweek squad.', 'info');
  }, [activeEntry, setPendingSwapsByTeam, showToast]);

  if (loading && !snapshot) return <LoadingScreen />;

  if (!snapshot) {
    return (
      <div className="fatal-error" role="alert">
        <div className="fatal-error__card">
          <span className="fatal-error__icon"><X size={26} /></span>
          <h1>Data engine unavailable</h1>
          <p>{error ?? 'No FPL snapshot could be loaded.'}</p>
          <button type="button" className="button button--primary" onClick={() => void refresh(true)}>Try again</button>
        </div>
      </div>
    );
  }

  let page: React.ReactNode;
  switch (route) {
    case 'optimizer':
      page = (
        <SquadBuilder
          snapshot={snapshot}
          players={players}
          fixtureRows={fixtureRows}
          entry={effectiveEntry}
          teamId={teamId}
          recentTeams={recentTeams}
          entryLoading={entryLoading}
          entryError={entryError}
          onLoadTeam={handleLoadTeam}
          profile={profile}
          onProfileChange={setProfile}
          onToast={showToast}
          onInspectPlayer={handleInspectPlayer}
          onInspectInjury={handleInspectInjury}
        />
      );
      break;
    case 'players':
      page = (
        <PlayerLab
          key={searchRevision}
          snapshot={snapshot}
          players={players}
          teams={snapshot.teams}
          fixtureRows={fixtureRows}
          nextEventId={snapshot.meta.nextEventId}
          query={playerQuery}
          onQueryChange={setPlayerQuery}
          onToast={showToast}
        />
      );
      break;
    case 'compare':
      page = <PlayerComparisonWorkspace players={players} teams={snapshot.teams} snapshot={snapshot} />;
      break;
    case 'fixtures':
      page = (
        <FixtureMatrix
          snapshot={snapshot}
          fixtureRows={fixtureRows}
          players={players}
          onToast={showToast}
          onInspectPlayer={handleInspectPlayer}
        />
      );
      break;
    case 'league':
      page = (
        <LeagueIntel
          snapshot={snapshot}
          players={players}
          teamId={teamId}
          leagueId={leagueId}
          recentTeams={recentTeams}
          onRemoveRecentTeam={handleRemoveRecentTeam}
          onTeamIdChange={handleLoadTeam}
          onLeagueIdChange={setLeagueId}
          profile={profile}
          onToast={showToast}
          onInspectPlayer={handleInspectPlayer}
          onInspectInjury={handleInspectInjury}
        />
      );
      break;
    case 'method':
      page = (
        <Methodology
          snapshot={snapshot}
          players={players}
          lastSuccessAt={lastSuccessAt}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      );
      break;
    case 'review':
    default:
      page = (
        <CommandCenter
          mode={route === 'review' ? 'review' : 'home'}
          snapshot={snapshot}
          entry={effectiveEntry}
          entryLoading={entryLoading}
          entryError={entryError}
          pendingSwaps={activeSwaps}
          onAddPendingSwap={handleAddPendingSwap}
          onClearPendingSwaps={handleClearPendingSwaps}
          players={players}
          insights={insights}
          fixtureRows={fixtureRows}
          profile={profile}
          teamId={teamId}
          recentTeams={recentTeams}
          onRemoveRecentTeam={handleRemoveRecentTeam}
          onTeamIdChange={handleLoadTeam}
          onSelectPlayer={(q) => {
            selectPlayer(q);
            navigate('players');
          }}
          onNavigate={navigate}
          onToast={showToast}
        />
      );
  }

  return (
    <div className="app-shell">
      <div className="app-main">
        <Topbar
          snapshot={snapshot}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          theme={theme}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onToggleTheme={toggleTheme}
          onOpenPalette={openPalette}
          onNavigate={navigate}
        />
        <nav className="vortex-route-pills" aria-label="Main navigation">
          {ROUTE_PILLS.map((tab) => {
            const Icon = tab.icon;
            const isActive = route === tab.id || (route === 'review' && tab.id === 'command');
            return (
              <button
                type="button"
                key={tab.id}
                className={`vortex-route-pill ${isActive ? 'is-active' : ''}`}
                onClick={() => navigate(tab.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={16} className="vortex-route-pill__icon" />
                <span className="vortex-route-pill__label">{tab.label}</span>
              </button>
            );
          })}
        </nav>
        <main className="content" id="main-content">


          {error && (
            <div className="data-warning" role="status">
              <span className="pulse-dot is-stale" />
              <span>{error}</span>
              <button type="button" onClick={handleRefresh}>Retry live connection</button>
            </div>
          )}
          <Suspense fallback={<LoadingScreen />}>{page}</Suspense>
          <footer className="app-footer">
            <div className="app-footer__brand-social">
              <img src={BRAND_LION_SRC} alt="" className="app-footer__lion" width={26} height={26} />
              <strong className="app-footer__title">FPL VORTEX</strong>
              <a
                href={YOUTUBE_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="app-footer__social-link is-yt"
                title="Open @FPLVORTEX on YouTube"
              >
                <YouTubeBrandLogo size={20} />
                <span>@FPLVORTEX</span>
              </a>
              <a
                href="https://x.com/FplVortexM"
                target="_blank"
                rel="noopener noreferrer"
                className="app-footer__social-link is-x"
                title="Open @FplVortexM on X"
              >
                <XBrandLogo size={14} />
                <span>@FplVortexM</span>
              </a>
            </div>
            <span className="app-footer__tagline">Season {snapshot.meta.season} · Plan smarter. Play your game.</span>
          </footer>
        </main>
      </div>

      <nav className="mobile-nav mobile-nav--seven" aria-label="Mobile navigation">
        {MOBILE_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              className={route === item.id || (route === 'review' && item.id === 'command') ? 'is-active' : ''}
              onClick={() => navigate(item.id)}
              aria-current={route === item.id || (route === 'review' && item.id === 'command') ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <PlayerGraphicModal
        snapshot={snapshot}
        player={globalCardPlayer}
        teams={snapshot.teams}
        fixtureRows={fixtureRows}
        reviewGw={effectiveEntry?.currentEvent ?? snapshot.meta.currentEventId}
        isCaptain={Boolean(
          globalCardPlayer &&
            effectiveEntry?.picks.some((pk) => pk.element === globalCardPlayer.id && pk.isCaptain),
        )}
        isViceCaptain={Boolean(
          globalCardPlayer &&
            effectiveEntry?.picks.some((pk) => pk.element === globalCardPlayer.id && pk.isViceCaptain),
        )}
        onClose={() => setGlobalCardPlayer(null)}
        onOpenInjuryDetail={handleInspectInjury}
      />

      <InjuryDetailModal
        player={globalInjuryPlayer}
        nextFixtureLabel={
          globalInjuryPlayer
            ? fixtureRows.find((r) => r.team.id === globalInjuryPlayer.teamId)?.cells[0]?.label
            : undefined
        }
        nextEventId={snapshot.meta.nextEventId}
        onClose={() => setGlobalInjuryPlayer(null)}
        onOpenPlayerCard={handleInspectPlayer}
      />

      <CommandPalette
        open={paletteOpen}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onClose={closePalette}
        players={players}
        snapshot={snapshot}
        onNavigate={navigate}
        onSelectPlayer={selectPlayer}
      />
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={closeToast} />}
    </div>
  );
}

