import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrainCircuit, CalendarDays, Gauge, Trophy, Users, WandSparkles, X } from 'lucide-react';
import type { EntryData, RiskProfile } from './lib/types';
import type { RouteId } from './hooks/useHashRoute';
import { useHashRoute } from './hooks/useHashRoute';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useVortexData } from './hooks/useVortexData';
import { fetchEntry } from './lib/api';
import { buildInsights, enrichPlayers } from './lib/analytics';
import { buildFixtureMatrix } from './lib/fixtures';
import {
  RECENT_TEAM_IDS_KEY,
  removeRecentTeam,
  upsertRecentTeam,
  type RecentTeamEntry,
} from './lib/recentTeamIds';
import { CommandCenter } from './components/CommandCenter';
import { CommandPalette } from './components/CommandPalette';
import { FixtureMatrix } from './components/FixtureMatrix';
import { LeagueIntel } from './components/LeagueIntel';
import { LoadingScreen } from './components/LoadingScreen';
import { Methodology } from './components/Methodology';
import { PlayerLab } from './components/PlayerLab';
import { Sidebar } from './components/Sidebar';
import { SquadBuilder } from './components/SquadBuilder';
import { Toast } from './components/Toast';
import { Topbar } from './components/Topbar';

type ToastTone = 'success' | 'error' | 'info';
interface ToastState {
  message: string;
  tone: ToastTone;
}

export interface PendingSwap {
  outId: number;
  inId: number;
}

const MOBILE_NAV: Array<{ id: RouteId; label: string; icon: typeof Gauge }> = [
  { id: 'command', label: 'Home', icon: Gauge },
  { id: 'optimizer', label: 'Planner', icon: WandSparkles },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'fixtures', label: 'Fixtures', icon: CalendarDays },
  { id: 'league', label: 'League', icon: Trophy },
  { id: 'method', label: 'Model', icon: BrainCircuit },
];

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [playerQuery, setPlayerQuery] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => setToast({ message, tone }), []);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#070914' : '#F4F6FF');
  }, [theme]);

  useEffect(() => {
    document.title = `${route.charAt(0).toUpperCase()}${route.slice(1)} · FPL VORTEX`;
  }, [route]);

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
          setRecentTeams((prev) =>
            upsertRecentTeam(prev, {
              id: String(data.id || cleanId),
              teamName: data.teamName,
              managerName: data.name,
            }),
          );
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
  }, [teamId, entrySyncNonce, snapshot?.meta.servedAt]);

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
      setEntrySyncNonce((n) => n + 1);
      showToast(`Syncing FPL Team #${cleaned} & Review Gameweek…`, 'info');
    },
    [setRecentTeams, setTeamId, showToast],
  );

  const handleRemoveRecentTeam = useCallback(
    (idToRemove: string) => {
      setRecentTeams((prev) => removeRecentTeam(prev, idToRemove));
    },
    [setRecentTeams],
  );

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleTheme = useCallback(() => setTheme((current) => (current === 'dark' ? 'light' : 'dark')), [setTheme]);
  const handleRefresh = useCallback(() => {
    setEntrySyncNonce((n) => n + 1);
    void refresh(true);
  }, [refresh]);
  const selectPlayer = useCallback((query: string) => setPlayerQuery(query), []);

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
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const players = useMemo(() => (snapshot ? enrichPlayers(snapshot, profile) : []), [profile, snapshot]);
  const insights = useMemo(() => buildInsights(players), [players]);
  const fixtureRows = useMemo(
    () => (snapshot ? buildFixtureMatrix(snapshot.teams, snapshot.fixtures, snapshot.meta.nextEventId, 5) : []),
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
          profile={profile}
          onProfileChange={setProfile}
          onToast={showToast}
        />
      );
      break;
    case 'players':
      page = (
        <PlayerLab
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
    case 'fixtures':
      page = <FixtureMatrix snapshot={snapshot} fixtureRows={fixtureRows} players={players} onToast={showToast} />;
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
    default:
      page = (
        <CommandCenter
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
          onOpenPalette={openPalette}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />
      );
  }

  return (
    <div className="app-shell">
      <Sidebar route={route} onNavigate={navigate} snapshot={snapshot} entry={effectiveEntry} open={sidebarOpen} onClose={closeSidebar} />
      <div className="app-main">
        <Topbar
          route={route}
          snapshot={snapshot}
          refreshing={refreshing}
          lastSuccessAt={lastSuccessAt}
          theme={theme}
          onToggleTheme={toggleTheme}
          onMenu={() => setSidebarOpen(true)}
          onOpenPalette={openPalette}
          onRefresh={handleRefresh}
          onNavigate={navigate}
        />
        <main className="content" id="main-content">
          {error && (
            <div className="data-warning" role="status">
              <span className="pulse-dot is-stale" />
              <span>{error}</span>
              <button type="button" onClick={handleRefresh}>Retry live connection</button>
            </div>
          )}
          {page}
          <footer className="app-footer">
            <span>
              FPL VORTEX · <a href="https://www.youtube.com/@Fplvortex" target="_blank" rel="noreferrer">@FPLVORTEX YouTube</a>
              {effectiveEntry ? ` · Team #${effectiveEntry.id} (${effectiveEntry.teamName})` : ''}
            </span>
            <span>Season {snapshot.meta.season} · Plan smarter. Play your game.</span>
          </footer>
        </main>
      </div>

      <nav className="mobile-nav mobile-nav--six" aria-label="Mobile navigation">
        {MOBILE_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              className={route === item.id ? 'is-active' : ''}
              onClick={() => navigate(item.id)}
              aria-current={route === item.id ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <CommandPalette
        open={paletteOpen}
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
