"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { TeamBadge } from "@/components/TeamBadge";
import { buildStrengths, projectMatch } from "@/lib/dashboardMath";
import { POSITIONS, formatPrice, getSavedTeamId, saveTeamId } from "@/lib/helpers";
import { useJson } from "@/lib/useJson";
import type {
  Fixture,
  RecentManager,
  SlimBootstrap,
  SlimElement,
  SlimEvent,
  SlimTeam,
} from "@/lib/types";
import { TeamReviewPanel } from "./TeamReviewPanel";
import { Dot, Message, Pager, Panel, Tabs } from "./ui";

interface VideoItem {
  id: string;
  title: string;
  published: string;
  thumbnail: string;
  url: string;
}

/* ------------------------------------------------------------------ */
/* small shared pieces                                                 */
/* ------------------------------------------------------------------ */

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/* ------------------------------------------------------------------ */
/* 1. Your team (ID form  ->  full squad view)                         */
/* ------------------------------------------------------------------ */

function YourTeamPanel({
  bootstrap,
  teams,
  fixtures,
  className,
}: {
  bootstrap: SlimBootstrap;
  teams: Map<number, SlimTeam>;
  fixtures: Fixture[];
  className?: string;
}) {
  const [ready, setReady] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const { data: recent } = useJson<RecentManager[]>("/api/recent");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of browser-only state after mount */
    // /?team=1234567 also works as a shareable link
    const fromUrl = new URLSearchParams(window.location.search).get("team")?.replace(/\D/g, "");
    if (fromUrl && Number(fromUrl) > 0) saveTeamId(fromUrl);
    setSavedId(getSavedTeamId());
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function load(id: string) {
    saveTeamId(id);
    setSavedId(id);
    setEditing(false);
    setTeamId("");
    setInputError(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const cleaned = teamId.trim().replace(/\D/g, "");
    if (!cleaned || Number(cleaned) < 1) {
      setInputError("Enter your numeric FPL Team ID, e.g. 1234567");
      return;
    }
    load(cleaned);
  }

  if (!ready) {
    return (
      <Panel title="Your Team" icon={<Dot color="#84d21c" />} className={className}>
        <Message>Loading…</Message>
      </Panel>
    );
  }

  if (savedId && !editing) {
    return (
      <TeamReviewPanel
        key={savedId}
        teamId={savedId}
        bootstrap={bootstrap}
        teams={teams}
        fixtures={fixtures}
        onChange={() => setEditing(true)}
        className={className}
      />
    );
  }

  return (
    <Panel title="Your Team" icon={<Dot color="#84d21c" />} className={className}>
      <div className="flex flex-col gap-4 p-4">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label htmlFor="team-id" className="vx-gold text-xs font-semibold uppercase tracking-wider">
            Enter your FPL Team ID
          </label>
          <div className="flex gap-2">
            <input
              id="team-id"
              inputMode="numeric"
              placeholder="e.g. 1234567"
              value={teamId}
              onChange={(ev) => {
                setTeamId(ev.target.value);
                setInputError(null);
              }}
              className="vx-input min-w-0 flex-1 rounded-xl px-4 py-2.5 text-base font-semibold"
            />
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-[#cda228] to-[#84d21c] px-5 text-sm font-extrabold text-black shadow transition hover:brightness-110 active:scale-95"
            >
              Load team
            </button>
          </div>
          {inputError ? (
            <p className="vx-down text-xs">{inputError}</p>
          ) : (
            <p className="vx-muted text-xs">
              Find it on fantasy.premierleague.com → Points page → the number in the URL:
              /entry/<span className="vx-text font-semibold">XXXXXXX</span>/event/…
            </p>
          )}
          {savedId ? (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="vx-link self-start text-xs font-semibold"
            >
              ← Back to my team (#{savedId})
            </button>
          ) : null}
        </form>

        {recent && recent.length > 0 ? (
          <div>
            <h3 className="vx-faint mb-2 text-[11px] font-semibold uppercase tracking-wider">
              Recently viewed teams
            </h3>
            <div className="flex flex-col gap-1.5">
              {recent.slice(0, 5).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => load(String(m.id))}
                  className="vx-chip flex items-center justify-between rounded-xl px-3 py-2 text-left transition hover:brightness-110"
                >
                  <span className="min-w-0">
                    <span className="vx-text block truncate text-sm font-semibold">{m.teamName}</span>
                    <span className="block truncate text-[11px]">{m.playerName}</span>
                  </span>
                  <span className="vx-up text-sm font-bold">{m.totalPoints ?? "—"} pts</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Gameweek fixtures                                                 */
/* ------------------------------------------------------------------ */

function FixturesPanel({
  events,
  defaultEvent,
  fixtures,
  teams,
  className,
}: {
  events: SlimEvent[];
  defaultEvent: number;
  fixtures: Fixture[];
  teams: Map<number, SlimTeam>;
  className?: string;
}) {
  const [gw, setGw] = useState<number | null>(null);
  const active = gw ?? defaultEvent;
  const event = events.find((ev) => ev.id === active);
  const minId = events[0]?.id ?? 1;
  const maxId = events[events.length - 1]?.id ?? 38;

  const groups = useMemo(() => {
    const list = fixtures
      .filter((f) => f.event === active)
      .sort((a, b) => (a.kickoff_time ?? "9").localeCompare(b.kickoff_time ?? "9"));
    const map = new Map<string, { label: string; items: Fixture[] }>();
    for (const f of list) {
      const key = f.kickoff_time ? new Date(f.kickoff_time).toDateString() : "tbc";
      const label = f.kickoff_time
        ? new Date(f.kickoff_time).toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })
        : "Date to be confirmed";
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(f);
    }
    return [...map.values()];
  }, [fixtures, active]);

  const deadline = event
    ? new Date(event.deadline_time).toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Panel
      title={
        <span className="flex flex-col leading-tight">
          <span>GW {active} Fixtures</span>
          <span className="vx-muted text-[11px] font-medium">Deadline: {deadline}</span>
        </span>
      }
      right={
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous gameweek"
            disabled={active <= minId}
            onClick={() => setGw(active - 1)}
            className="vx-iconbtn h-8 w-8 rounded-lg disabled:opacity-40"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next gameweek"
            disabled={active >= maxId}
            onClick={() => setGw(active + 1)}
            className="vx-iconbtn h-8 w-8 rounded-lg disabled:opacity-40"
          >
            ›
          </button>
        </div>
      }
      className={className}
    >
      {groups.length === 0 ? (
        <Message>No fixtures for this gameweek.</Message>
      ) : (
        groups.map((g) => (
          <div key={g.label}>
            <div
              className="px-4 py-1.5 text-center text-xs font-extrabold text-black"
              style={{ background: "linear-gradient(90deg, #84d21c, #cda228)" }}
            >
              {g.label}
            </div>
            {g.items.map((f) => {
              const h = teams.get(f.team_h);
              const a = teams.get(f.team_a);
              const live = Boolean(f.started) && !f.finished;
              const showScore = Boolean(f.started) || f.finished;
              return (
                <div
                  key={f.id}
                  className="vx-row grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2.5"
                >
                  <div className="flex items-center justify-end gap-2 text-sm font-semibold">
                    {live ? (
                      <span className="vx-down mr-auto flex items-center gap-1 text-[11px] font-bold">
                        <span className="live-dot h-1.5 w-1.5 rounded-full bg-rose-500" />
                        {f.minutes}&apos;
                      </span>
                    ) : null}
                    <span className="vx-text truncate">{h?.name ?? "—"}</span>
                    <TeamBadge code={h?.code} shortName={h?.short_name} className="h-6 w-6 shrink-0" />
                  </div>
                  <div
                    className={`min-w-[64px] rounded-lg px-2 py-1 text-center text-sm font-extrabold ${
                      live ? "bg-rose-600 text-white" : "vx-chip"
                    }`}
                  >
                    {showScore
                      ? `${f.team_h_score ?? 0} - ${f.team_a_score ?? 0}`
                      : f.kickoff_time
                        ? new Date(f.kickoff_time).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "TBC"}
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <TeamBadge code={a?.code} shortName={a?.short_name} className="h-6 w-6 shrink-0" />
                    <span className="vx-text truncate">{a?.name ?? "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Projected goals                                                   */
/* ------------------------------------------------------------------ */

type ProjMetric = "goals" | "cs" | "win";

function ProjectedPanel({
  eventId,
  fixtures,
  teams,
  players,
  className,
}: {
  eventId: number | null;
  fixtures: Fixture[];
  teams: Map<number, SlimTeam>;
  players: SlimElement[];
  className?: string;
}) {
  const [metric, setMetric] = useState<ProjMetric>("goals");
  const [sortDirection, setSortDirection] = useState<-1 | 1>(-1);

  const strengths = useMemo(
    () => buildStrengths([...teams.values()], players, fixtures),
    [teams, players, fixtures],
  );

  const rows = useMemo(() => {
    if (eventId == null) return [];
    const out: { key: string; team: SlimTeam; opp: SlimTeam; venue: "H" | "A"; goals: number; cs: number; win: number }[] = [];
    for (const f of fixtures) {
      if (f.event !== eventId) continue;
      const h = teams.get(f.team_h);
      const a = teams.get(f.team_a);
      if (!h || !a) continue;
      const hs = strengths.get(h.id);
      const as = strengths.get(a.id);
      if (!hs || !as) continue;
      const p = projectMatch(hs, as);
      out.push({ key: `${f.id}h`, team: h, opp: a, venue: "H", goals: p.homeXg, cs: p.homeCs, win: p.homeWin });
      out.push({ key: `${f.id}a`, team: a, opp: h, venue: "A", goals: p.awayXg, cs: p.awayCs, win: p.awayWin });
    }
    return out.sort((x, y) => sortDirection * (x[metric] - y[metric]));
  }, [eventId, fixtures, teams, strengths, metric, sortDirection]);

  const max = rows.reduce((m, r) => Math.max(m, r[metric]), 0.0001);
  const fmt = (v: number) => (metric === "goals" ? v.toFixed(2) : `${Math.round(v * 100)}%`);

  return (
    <Panel
      title={<button type="button" onClick={() => setSortDirection(value => value === -1 ? 1 : -1)} aria-label={`Sort projections ${sortDirection === -1 ? "ascending" : "descending"}`}>{eventId ? `GW ${eventId} Projected Goals` : "Projected Goals"} {sortDirection === -1 ? "↓" : "↑"}</button>}
      right={
        <Tabs
          value={metric}
          onChange={setMetric}
          options={[
            { id: "goals", label: "Goals" },
            { id: "cs", label: "CS%" },
            { id: "win", label: "Win%" },
          ]}
        />
      }
      className={className}
    >
      {rows.length === 0 ? (
        <Message>No projections available for the next gameweek yet.</Message>
      ) : (
        rows.map((r, i) => (
          <div key={r.key} className="vx-row flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="vx-faint w-5 text-right text-xs">{i + 1}.</span>
            <TeamBadge code={r.team.code} shortName={r.team.short_name} className="h-6 w-6 shrink-0" />
            <span className="vx-text w-10 font-bold">{r.team.short_name}</span>
            <span className="vx-muted w-[74px] shrink-0 text-xs">
              vs {r.opp.short_name} ({r.venue})
            </span>
            <div className="min-w-0 flex-1">
              <div
                className="vx-bar rounded px-2 py-1 text-xs"
                style={{ width: `${Math.max(16, (r[metric] / max) * 100)}%` }}
              >
                {fmt(r[metric])}
              </div>
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Top players (every player, paged)                                */
/* ------------------------------------------------------------------ */

type TopMetric = "points" | "owned" | "value";
const TOP_PAGE = 10;

function PlayerLine({
  p,
  teams,
  extra,
}: {
  p: SlimElement;
  teams: Map<number, SlimTeam>;
  extra?: ReactNode;
}) {
  const t = teams.get(p.team);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PlayerPhoto code={p.code} alt={p.web_name} className="h-9 w-7 shrink-0 rounded-md" />
      <div className="min-w-0">
        <div className="vx-link truncate text-sm font-bold">
          {p.web_name} {extra}
        </div>
        <div className="vx-muted truncate text-[11px]">
          {t?.short_name} · {POSITIONS[p.element_type]} · {formatPrice(p.now_cost)}
        </div>
      </div>
    </div>
  );
}

function TopPlayersPanel({
  players,
  teams,
  className,
}: {
  players: SlimElement[];
  teams: Map<number, SlimTeam>;
  className?: string;
}) {
  const [metric, setMetric] = useState<TopMetric>("points");
  const [page, setPage] = useState(0);
  const [sortDirection, setSortDirection] = useState<-1 | 1>(-1);

  const sorted = useMemo(() => {
    const score = (p: SlimElement): number =>
      metric === "points"
        ? p.event_points
        : metric === "owned"
          ? Number(p.selected_by_percent)
          : p.now_cost > 0
            ? p.total_points / (p.now_cost / 10)
            : 0;
    return [...players]
      .map((p) => ({ p, v: score(p) }))
      .sort((a, b) => sortDirection * (a.v - b.v));
  }, [players, metric, sortDirection]);

  const max = Math.max(1, ...sorted.map(row => row.v));
  const rows = sorted.slice(page * TOP_PAGE, (page + 1) * TOP_PAGE);
  const fmt = (v: number) =>
    metric === "points" ? String(v) : metric === "owned" ? `${v.toFixed(1)}%` : v.toFixed(1);

  return (
    <Panel
      title={<button type="button" onClick={() => { setSortDirection(direction => direction === -1 ? 1 : -1); setPage(0); }} aria-label="Reverse top-player sorting">Top Players ↕</button>}
      right={
        <Tabs
          value={metric}
          onChange={(m) => {
            setMetric(m);
            setPage(0);
          }}
          options={[
            { id: "points", label: "GW Points" },
            { id: "owned", label: "Owned" },
            { id: "value", label: "Value" },
          ]}
        />
      }
      className={className}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          {rows.map(({ p, v }, i) => (
            <div
              key={p.id}
              className="vx-row grid grid-cols-[28px_minmax(0,1fr)_minmax(96px,40%)] items-center gap-2 px-3 py-2"
            >
              <span className="vx-faint text-right text-xs">{page * TOP_PAGE + i + 1}.</span>
              <PlayerLine p={p} teams={teams} />
              <div
                className="vx-bar rounded px-2 py-1.5 text-sm"
                style={{ width: `${Math.max(30, (v / max) * 100)}%` }}
              >
                {fmt(v)}
              </div>
            </div>
          ))}
        </div>
        <Pager page={page} pageSize={TOP_PAGE} total={sorted.length} onPage={setPage} />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Price & transfers (click any heading to sort)                  */
/* ------------------------------------------------------------------ */

type PriceKey = "name" | "pct" | "in" | "out" | "net";
const PAGE_SIZE = 10;
const PRICE_COLS = "minmax(140px,1.4fr) 104px 76px 76px 92px";

function priceValue(p: SlimElement, k: Exclude<PriceKey, "name">): number {
  return k === "pct"
    ? (p.price_change_percent ?? 0)
    : k === "in"
      ? p.transfers_in_event
      : k === "out"
        ? p.transfers_out_event
        : p.transfers_in_event - p.transfers_out_event;
}

/** Stacked chevrons: both lit = "sortable", one lit = current direction. */
function SortIcon({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg
      viewBox="0 0 12 16"
      aria-hidden
      className="h-4 w-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6.5 6 3l3.5 3.5" opacity={dir === "desc" ? 0.3 : 1} />
      <path d="M2.5 9.5 6 13l3.5-3.5" opacity={dir === "asc" ? 0.3 : 1} />
    </svg>
  );
}

function PricePanel({
  players,
  teams,
  className,
}: {
  players: SlimElement[];
  teams: Map<number, SlimTeam>;
  className?: string;
}) {
  const [key, setKey] = useState<PriceKey>("pct");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const list = [...players];
    if (key === "name") return list.sort((a, b) => a.web_name.localeCompare(b.web_name) * dir);
    return list.sort((a, b) => (priceValue(a, key) - priceValue(b, key)) * dir);
  }, [players, key, dir]);
  const rows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function sortBy(k: PriceKey) {
    if (k === key) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setKey(k);
      setDir(k === "name" ? 1 : -1);
    }
    setPage(0);
  }

  const head = (k: PriceKey, label: string, align: "left" | "right" = "right") => {
    const active = key === k;
    return (
      <button
        type="button"
        onClick={() => sortBy(k)}
        aria-label={`Sort by ${label}`}
        title={`Sort by ${label}`}
        data-active={active}
        className={`vx-sortbtn ${align === "left" ? "justify-self-start" : "justify-self-end"}`}
      >
        {label}
        <SortIcon dir={active ? (dir === 1 ? "asc" : "desc") : null} />
      </button>
    );
  };

  return (
    <Panel
      title="Price & Transfers"
      icon={
        <svg viewBox="0 0 24 24" aria-hidden className="vx-gold h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8h14M14 4l4 4-4 4" />
          <path d="M20 16H6M10 12l-4 4 4 4" />
        </svg>
      }
      right={<span className="vx-faint text-xs">Click a heading to sort</span>}
      className={className}
    >
      <div className="flex h-full flex-col">
        <div className="vx-scroll min-h-0 flex-1 overflow-x-auto">
          <div className="min-w-[540px]">
            <div
              className="vx-card-head grid items-center gap-2 px-3 py-2.5"
              style={{ gridTemplateColumns: PRICE_COLS }}
            >
              {head("name", "Player", "left")}
              {head("pct", "Price Δ%")}
              {head("in", "In")}
              {head("out", "Out")}
              {head("net", "Net")}
            </div>
            {rows.map((p) => {
              const pct = p.price_change_percent ?? 0;
              const net = p.transfers_in_event - p.transfers_out_event;
              return (
                <div
                  key={p.id}
                  className="vx-row grid items-center gap-2 px-3 py-2 text-sm"
                  style={{ gridTemplateColumns: PRICE_COLS }}
                >
                  <PlayerLine p={p} teams={teams} />
                  <span className={`text-right font-bold ${pct > 0 ? "vx-up" : pct < 0 ? "vx-down" : "vx-muted"}`}>
                    {pct > 0 ? "+" : ""}
                    {pct.toFixed(1)}%
                  </span>
                  <span className="vx-text text-right">{p.transfers_in_event.toLocaleString()}</span>
                  <span className="vx-text text-right">{p.transfers_out_event.toLocaleString()}</span>
                  <span className={`text-right font-bold ${net > 0 ? "vx-up" : net < 0 ? "vx-down" : "vx-muted"}`}>
                    {net > 0 ? "+" : ""}
                    {net.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={sorted.length} onPage={setPage} />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Injuries & suspensions (all, paged)                              */
/* ------------------------------------------------------------------ */

const INJ_PAGE = 10;

function InjuriesPanel({
  players,
  teams,
  className,
}: {
  players: SlimElement[];
  teams: Map<number, SlimTeam>;
  className?: string;
}) {
  const [page, setPage] = useState(0);
  const [sortDirection, setSortDirection] = useState<-1 | 1>(-1);
  const list = useMemo(
    () =>
      players
        .filter((p) => p.status !== "a" && p.status !== "n")
        .sort((a, b) => sortDirection * ((a.chance_of_playing_next_round ?? -1) - (b.chance_of_playing_next_round ?? -1))),
    [players, sortDirection],
  );
  const rows = list.slice(page * INJ_PAGE, (page + 1) * INJ_PAGE);

  return (
    <Panel
      title={<button type="button" onClick={() => { setSortDirection(direction => direction === -1 ? 1 : -1); setPage(0); }} aria-label="Reverse sorting by availability">Injuries &amp; Suspensions ↕</button>}
      icon={<span className="vx-down">⚠</span>}
      right={<span className="vx-muted text-xs font-semibold">{list.length} players</span>}
      className={className}
    >
      {list.length === 0 ? (
        <Message>No injury news right now.</Message>
      ) : (
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            {rows.map((p) => {
              const t = teams.get(p.team);
              const chance = p.chance_of_playing_next_round;
              const amber = p.status === "d";
              return (
                <div key={p.id} className="vx-row flex items-center gap-3 px-3 py-2.5">
                  <PlayerPhoto code={p.code} alt={p.web_name} className="h-10 w-8 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      <span className="vx-link font-bold">{p.web_name}</span>{" "}
                      <span className="vx-muted text-xs">
                        {t?.short_name} · {POSITIONS[p.element_type]}
                      </span>
                    </div>
                    <div className="vx-muted line-clamp-2 text-xs">
                      {p.news || "Unavailable"}
                      {chance != null ? ` · ${chance}% chance of playing` : ""}
                    </div>
                  </div>
                  <span
                    className="text-lg"
                    style={{ color: amber ? "#f59e0b" : "#ef4444" }}
                    title={amber ? "Doubtful" : "Out"}
                  >
                    ▲
                  </span>
                </div>
              );
            })}
          </div>
          <Pager page={page} pageSize={INJ_PAGE} total={list.length} onPage={setPage} />
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Videos                                                            */
/* ------------------------------------------------------------------ */

function VideosPanel() {
  const { data, error, loading } = useJson<VideoItem[]>("/api/videos", 30 * 60 * 1000);
  if (error || (!loading && (!data || data.length === 0))) return null;

  return (
    <Panel
      title="Latest FPL Videos"
      icon={
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
          <path
            fill="#FF0000"
            d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"
          />
          <path fill="#fff" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      }
      right={
        <a
          href="https://www.youtube.com/@FPLVORTEX"
          target="_blank"
          rel="noreferrer"
          className="vx-link text-xs font-semibold"
        >
          All FPL VORTEX videos →
        </a>
      }
    >
      {loading ? (
        <Message>Loading videos…</Message>
      ) : (
        <div className="vx-scroll flex gap-3 overflow-x-auto p-3">
          {data?.map((v) => (
            <a
              key={v.id}
              href={v.url}
              target="_blank"
              rel="noreferrer"
              className="vx-chip flex w-[300px] shrink-0 gap-3 rounded-xl p-2 transition hover:brightness-110"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={v.thumbnail}
                alt=""
                loading="lazy"
                className="h-[72px] w-[128px] shrink-0 rounded-lg object-cover"
              />
              <span className="min-w-0">
                <span className="vx-text line-clamp-3 block text-sm font-bold leading-snug">{v.title}</span>
                <span className="mt-1 block text-[11px]">{ago(v.published)}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

function Countdown({ deadline, label }: { deadline: string; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only state after mount
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (now == null) return null;
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return (
    <div className="vx-chip rounded-full px-3 py-1 text-xs font-bold">
      <span className="vx-gold">{label} deadline</span>{" "}
      <span className="vx-text">
        {d}d : {String(h).padStart(2, "0")}h : {String(m).padStart(2, "0")}m
      </span>
    </div>
  );
}

export function HomeDashboard() {
  const { data: bootstrap, error: bootError, refresh } = useJson<SlimBootstrap>("/api/fpl/bootstrap", 5 * 60 * 1000);
  const { data: fixtures } = useJson<Fixture[]>("/api/fpl/fixtures", 60 * 1000);
  const [tab, setTab] = useState<"dashboard" | "analysis">("dashboard");
  const teams = useMemo(() => new Map((bootstrap?.teams ?? []).map(team => [team.id, team] as const)), [bootstrap]);
  const defaultEvent = bootstrap?.currentEvent ?? bootstrap?.nextEvent ?? bootstrap?.events[0]?.id ?? 1;
  const allFixtures = useMemo(() => fixtures ?? [], [fixtures]);
  const seasonStart = bootstrap?.events[0]?.deadline_time;
  const seasonYear = seasonStart ? new Date(seasonStart).getUTCFullYear() : null;
  return (
    <main className="vx-dash vx-reference-dashboard py-5">
      <header className="vx-dashboard-heading">
        <h1><Dot color="var(--vx-green-text)" /> Dashboard</h1>
        <span>Gameweek {defaultEvent}</span>
        <span>{seasonYear ? `${seasonYear}/${String(seasonYear + 1).slice(2)}` : "Season loading"}</span>
      </header>
      <div className="vx-dashboard-subtabs"><Tabs value={tab} onChange={setTab} options={[{ id: "dashboard", label: "Overview" }, { id: "analysis", label: "Gameweek Analysis" }]} /></div>
      {tab === "analysis" ? <section className="vx-card p-8" aria-label="Gameweek Analysis"><h2 className="text-xl font-bold">Gameweek Analysis</h2><p className="vx-muted mt-3">This subtab is ready. Its detailed layout will be designed in the next step.</p></section> : bootError ?
        <section className="vx-card p-6 text-center"><p className="vx-down">{bootError}</p><button type="button" className="vx-btn mt-3" onClick={refresh}>Retry data</button></section> : !bootstrap ?
        <section className="vx-card p-10 text-center" role="status">Loading current-gameweek data…</section> :
        <div className="vx-dashboard-panels grid grid-cols-1 gap-4 md:grid-cols-2 lg:[grid-template-columns:repeat(24,minmax(0,1fr))]">
          <YourTeamPanel bootstrap={bootstrap} teams={teams} fixtures={allFixtures} className="vx-dashboard-team md:col-span-2 lg:col-span-12" />
          <FixturesPanel events={bootstrap.events} defaultEvent={defaultEvent} fixtures={allFixtures} teams={teams} className="vx-dashboard-upper lg:col-span-6" />
          <ProjectedPanel eventId={defaultEvent} fixtures={allFixtures} teams={teams} players={bootstrap.elements} className="vx-dashboard-upper lg:col-span-6" />
          <TopPlayersPanel players={bootstrap.elements} teams={teams} className="vx-dashboard-lower lg:col-span-8" />
          <PricePanel players={bootstrap.elements} teams={teams} className="vx-dashboard-lower lg:col-span-8" />
          <InjuriesPanel players={bootstrap.elements} teams={teams} className="vx-dashboard-lower lg:col-span-8" />
          <div className="md:col-span-2 lg:col-span-24"><VideosPanel /></div>
        </div>
      }
    </main>
  );
}
