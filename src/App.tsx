import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Gauge, Trophy, Users, WandSparkles, X } from 'lucide-react';
import type { RiskProfile } from './lib/types';
import type { RouteId } from './hooks/useHashRoute';
import { useHashRoute } from './hooks/useHashRoute';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useVortexData } from './hooks/useVortexData';
import { buildInsights, enrichPlayers } from './lib/analytics';
import { buildFixtureMatrix } from './lib/fixtures';
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

const MOBILE_NAV: Array<{ id: RouteId; label: string; icon: typeof Gauge }> = [
  { id: 'command', label: 'Home', icon: Gauge },
  { id: 'optimizer', label: 'Squad', icon: WandSparkles },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'fixtures', label: 'Fixtures', icon: CalendarDays },
  { id: 'league', label: 'League', icon: Trophy },
];

export default function App() {
  const { snapshot, loading, refreshing, error, lastSuccessAt, refresh } = useVortexData();
  const [route, navigate] = useHashRoute();
  const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('vortex:theme', 'dark');
  const [profile, setProfile] = useLocalStorage<RiskProfile>('vortex:profile', 'balanced');
  const [teamId, setTeamId] = useLocalStorage('vortex:teamId', '');
  const [leagueId, setLeagueId] = useLocalStorage('vortex:leagueId', '314');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [playerQuery, setPlayerQuery] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#070914' : '#F4F6FF');
  }, [theme]);

  useEffect(() => {
    document.title = `${route.charAt(0).toUpperCase()}${route.slice(1)} · FPL VORTEX`;
  }, [route]);

  useEffect(() => {
    if (snapshot && !teamId && snapshot.meta.exampleEntryId) {
      setTeamId(String(snapshot.meta.exampleEntryId));
    }
  }, [setTeamId, snapshot, teamId]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleTheme = useCallback(() => setTheme((current) => (current === 'dark' ? 'light' : 'dark')), [setTheme]);
  const handleRefresh = useCallback(() => void refresh(true), [refresh]);
  const selectPlayer = useCallback((query: string) => setPlayerQuery(query), []);
  const showToast = useCallback((message: string, tone: ToastTone = 'success') => setToast({ message, tone }), []);
  const closeToast = useCallback(() => setToast(null), []);

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
      page = <SquadBuilder players={players} profile={profile} onProfileChange={setProfile} onToast={showToast} />;
      break;
    case 'players':
      page = (
        <PlayerLab
          players={players}
          teams={snapshot.teams}
          fixtureRows={fixtureRows}
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
          onTeamIdChange={setTeamId}
          onLeagueIdChange={setLeagueId}
          profile={profile}
          onToast={showToast}
        />
      );
      break;
    case 'method':
      page = <Methodology snapshot={snapshot} lastSuccessAt={lastSuccessAt} refreshing={refreshing} onRefresh={handleRefresh} />;
      break;
    default:
      page = (
        <CommandCenter
          snapshot={snapshot}
          players={players}
          insights={insights}
          fixtureRows={fixtureRows}
          profile={profile}
          onNavigate={navigate}
          onOpenPalette={openPalette}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />
      );
  }

  return (
    <div className="app-shell">
      <Sidebar route={route} onNavigate={navigate} snapshot={snapshot} open={sidebarOpen} onClose={closeSidebar} />
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
            <span>FPL VORTEX · independent Fantasy Premier League analytics</span>
            <span>Data refreshes automatically · {snapshot.meta.season}</span>
          </footer>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
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
              <Icon size={19} />
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
