import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  CalendarDays,
  Command,
  Gauge,
  Search,
  Trophy,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import type { EnrichedPlayer, Snapshot } from '../lib/types';
import type { RouteId } from '../hooks/useHashRoute';
import { normalizeSearchText, searchPlayers } from '../lib/analytics';
import { classNames } from '../lib/format';

interface PaletteItem {
  id: string;
  label: string;
  subLabel: string;
  icon: ReactNode;
  group: 'Pages' | 'Players' | 'Clubs';
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  players: EnrichedPlayer[];
  snapshot: Snapshot | null;
  onNavigate: (route: RouteId) => void;
  onSelectPlayer: (query: string) => void;
}

const PAGE_ITEMS: Array<{ id: RouteId; label: string; subLabel: string; keywords: string; icon: ReactNode }> = [
  { id: 'command', label: 'HOME', subLabel: 'Dashboard · Fixtures, projections, transfers, injuries & videos', keywords: 'dashboard home overview goals projections clean sheets news updates injury video price market', icon: <Gauge size={17} /> },
  { id: 'review', label: 'REVIEW', subLabel: 'Gameweek review · Team ID, squad, captain picks & saved squad highlights', keywords: 'gameweek deadline review squad connect team id captain pitch saved squad', icon: <CalendarDays size={17} /> },
  { id: 'optimizer', label: 'PLANNER', subLabel: 'Team planner · Squad, transfers, chips, wildcard & Monte Carlo', keywords: 'planner squad builder pitch wildcard free hit bench boost triple captain transfer team fdr', icon: <WandSparkles size={17} /> },
  { id: 'players', label: 'PLAYERS', subLabel: 'All FPL players · Search, compare, expected points & player stats', keywords: 'players stats footballers player lab compare positions xpts xg injuries ownership', icon: <Users size={17} /> },
  { id: 'fixtures', label: 'FIXTURES', subLabel: 'All clubs · Fixtures, difficulty ratings, goals & clean-sheet odds', keywords: 'fixture fdr matrix schedule odds win probability clean sheet cs%', icon: <CalendarDays size={17} /> },
  { id: 'league', label: 'LEAGUE', subLabel: 'Your FPL team · Manager ID, mini-leagues, rivals & standings', keywords: 'connect team manager id league rivals standings ranking score', icon: <Trophy size={17} /> },
  { id: 'method', label: 'METHOD', subLabel: 'Methods · Data sources, prediction models & automation', keywords: 'methodology model source data provenance calibration forecast automate explanation', icon: <BrainCircuit size={17} /> },
];

export function CommandPalette({ open, query, onQueryChange, onClose, players, snapshot, onNavigate, onSelectPlayer }: CommandPaletteProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const needle = normalizeSearchText(query);
    const pages = PAGE_ITEMS.filter(
      (item) => !needle || normalizeSearchText([item.label, item.subLabel, item.keywords].join(' ')).includes(needle),
    ).map((item) => ({
      id: `page-${item.id}`,
      label: item.label,
      subLabel: item.subLabel,
      icon: item.icon,
      group: 'Pages' as const,
      action: () => {
        onNavigate(item.id);
        onClose();
      },
    }));
    const foundPlayers = searchPlayers(players, query, needle ? players.length : 4).map((player) => ({
      id: `player-${player.id}`,
      label: player.name,
      subLabel: `${player.team.shortName} · ${player.position} · ${player.projection.toFixed(1)} projected pts`,
      icon: <Users size={17} />,
      group: 'Players' as const,
      action: () => {
        onSelectPlayer(player.name);
        onNavigate('players');
        onClose();
      },
    }));
    const clubs = (snapshot?.teams ?? [])
      .filter((team) => !needle || normalizeSearchText(team.name).includes(needle) || normalizeSearchText(team.shortName).includes(needle))
      .slice(0, needle ? (snapshot?.teams.length ?? 20) : 2)
      .map((team) => ({
        id: `club-${team.id}`,
        label: team.name,
        subLabel: `${team.shortName} · open Player Lab filtered by club`,
        icon: <span className="palette-club-icon">{team.shortName.slice(0, 3)}</span>,
        group: 'Clubs' as const,
        action: () => {
          onSelectPlayer(team.name);
          onNavigate('players');
          onClose();
        },
      }));
    return [...pages, ...foundPlayers, ...clubs];
  }, [onClose, onNavigate, onSelectPlayer, players, query, snapshot?.teams]);

  useEffect(() => {
    if (activeIndex >= items.length) setActiveIndex(Math.max(0, items.length - 1));
  }, [activeIndex, items.length]);

  if (!open) return null;

  const grouped = ['Pages', 'Players', 'Clubs'] as const;
  return (
    <div className="palette-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search FPL VORTEX"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-palette__search">
          <Search size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((current) => (current + 1) % Math.max(1, items.length));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((current) => (current - 1 + items.length) % Math.max(1, items.length));
              }
              if (event.key === 'Enter') items[activeIndex]?.action();
            }}
            placeholder="Search every player, club, tab and tool…"
            aria-label="Search all players, teams and site pages"
          />
          <button type="button" onClick={onClose} aria-label="Close search"><X size={17} /></button>
        </div>
        <div className="command-palette__results">
          {grouped.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (!groupItems.length) return null;
            return (
              <div className="command-palette__group" key={group}>
                <span className="command-palette__group-label">{group}{query.trim() ? ` (${groupItems.length})` : ''}</span>
                {groupItems.map((item) => {
                  const index = items.indexOf(item);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={classNames('palette-result', index === activeIndex && 'is-active')}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={item.action}
                    >
                      <span className="palette-result__icon">{item.icon}</span>
                      <span className="palette-result__text">
                        <strong>{item.label}</strong>
                        <small>{item.subLabel}</small>
                      </span>
                      <ArrowRight size={15} />
                    </button>
                  );
                })}
              </div>
            );
          })}
          {!items.length && (
            <div className="command-palette__empty">
              <Command size={22} />
              <strong>No matches found</strong>
              <span>Try a player surname, club name, or a tool like “optimizer”.</span>
            </div>
          )}
        </div>
        <footer className="command-palette__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </footer>
      </section>
    </div>
  );
}
