"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HomePitch, type HomePitchCardData } from "./HomePitch";
import { formatRank, saveTeamId } from "@/lib/helpers";
import { useJson } from "@/lib/useJson";
import type {
  EntryResponse,
  Fixture,
  LiveResponse,
  PicksResponse,
  SlimBootstrap,
  SlimElement,
  SlimTeam,
} from "@/lib/types";
import { Panel } from "./ui";

type Pick = PicksResponse["picks"][number];
type LiveStats = LiveResponse["elements"][number]["stats"];

type Card = HomePitchCardData;

function fixtureLabel(
  teamId: number,
  gwFixtures: Fixture[],
  teams: Map<number, SlimTeam>,
): { label: string; live: boolean; done: boolean } {
  const fx = gwFixtures.filter((f) => f.team_h === teamId || f.team_a === teamId);
  if (fx.length === 0) return { label: "BLANK", live: false, done: false };
  const label = fx
    .map((f) => {
      const home = f.team_h === teamId;
      const opp = teams.get(home ? f.team_a : f.team_h);
      return `${opp?.short_name ?? "?"} (${home ? "H" : "A"})`;
    })
    .join(", ");
  return {
    label,
    live: fx.some((f) => f.started && !f.finished && !f.finished_provisional),
    done: fx.every((f) => f.finished || f.finished_provisional),
  };
}

export function TeamReviewPanel({
  teamId,
  bootstrap,
  teams,
  fixtures,
  onChange,
  className,
}: {
  teamId: string;
  bootstrap: SlimBootstrap;
  teams: Map<number, SlimTeam>;
  fixtures: Fixture[];
  onChange: () => void;
  className?: string;
}) {
  const entry = useJson<EntryResponse>(`/api/fpl/entry/${teamId}`, 120_000);
  const currentGw = entry.data?.entry.current_event ?? bootstrap.currentEvent;
  const [gw, setGw] = useState<number | null>(null);
  const viewGw = gw ?? currentGw;
  const event = bootstrap.events.find((e) => e.id === viewGw);
  const isLive = viewGw !== null && viewGw === currentGw && Boolean(event) && !event?.finished;

  const picks = useJson<PicksResponse>(
    viewGw ? `/api/fpl/entry/${teamId}/picks/${viewGw}` : null,
    isLive ? 60_000 : 0,
  );
  const live = useJson<LiveResponse>(viewGw ? `/api/fpl/live/${viewGw}` : null, isLive ? 60_000 : 0);

  useEffect(() => {
    if (entry.data) saveTeamId(teamId);
  }, [entry.data, teamId]);

  const elements = useMemo(
    () => new Map(bootstrap.elements.map((e) => [e.id, e] as const)),
    [bootstrap.elements],
  );
  const liveMap = useMemo(() => {
    const m = new Map<number, LiveStats>();
    live.data?.elements.forEach((e) => m.set(e.id, e.stats));
    return m;
  }, [live.data]);
  const gwFixtures = useMemo(() => fixtures.filter((f) => f.event === viewGw), [fixtures, viewGw]);

  const cards = useMemo(() => {
    const build = (pick: Pick, bench: boolean): Card | null => {
      const element = elements.get(pick.element);
      if (!element) return null;
      const fx = fixtureLabel(element.team, gwFixtures, teams);
      const stats = liveMap.get(element.id);
      const played = (stats?.minutes ?? 0) > 0;
      const showPoints = played || fx.done || fx.live;
      const mult = bench ? 1 : Math.max(pick.multiplier, 1);
      return {
        element,
        pick,
        points: (stats?.total_points ?? 0) * mult,
        showPoints,
        fixtureLabel: fx.label,
        live: fx.live,
      };
    };
    const all = picks.data?.picks ?? [];
    const starters = all
      .filter((p) => p.position <= 11)
      .map((p) => build(p, false))
      .filter((c): c is Card => c !== null);
    const bench = all
      .filter((p) => p.position >= 12)
      .sort((a, b) => a.position - b.position)
      .map((p) => build(p, true))
      .filter((c): c is Card => c !== null);
    return { starters, bench };
  }, [picks.data, elements, gwFixtures, liveMap, teams]);

  const livePoints = useMemo(() => {
    if (!picks.data) return null;
    let total = 0;
    for (const p of picks.data.picks) {
      const s = liveMap.get(p.element);
      if (s) total += s.total_points * p.multiplier;
    }
    return total - picks.data.entry_history.event_transfers_cost;
  }, [picks.data, liveMap]);

  const hist = entry.data?.history.current ?? [];
  const cur = hist.find((h) => h.event === viewGw);
  const prev = hist.find((h) => h.event === (viewGw ?? 0) - 1);
  const gwPoints =
    isLive && livePoints !== null
      ? livePoints
      : (picks.data?.entry_history.points ?? cur?.points ?? null);
  const overallRank =
    cur?.overall_rank ??
    picks.data?.entry_history.overall_rank ??
    entry.data?.entry.summary_overall_rank ??
    null;
  const rankDelta =
    prev?.overall_rank != null && overallRank != null ? prev.overall_rank - overallRank : null;
  const gwRank = cur?.rank ?? picks.data?.entry_history.rank ?? null;

  const minGw = entry.data?.entry.started_event ?? 1;
  const maxGw = currentGw ?? 38;
  const e = entry.data?.entry;

  const stat = (label: string, value: React.ReactNode, tone?: "up" | "down" | "gold") => (
    <div className="px-1 py-3 text-center">
      <div
        className={`text-xl font-extrabold ${
          tone === "up" ? "vx-up" : tone === "down" ? "vx-down" : tone === "gold" ? "vx-gold" : "vx-text"
        }`}
      >
        {value}
      </div>
      <div className="vx-muted text-[11px] font-medium">{label}</div>
    </div>
  );

  const title = (
    <span className="flex flex-col leading-tight">
      <span className="text-base">{e?.name ?? "Your team"}</span>
      <span className="vx-muted text-[11px] font-medium">
        Current-gameweek review{" "}
        <button type="button" onClick={onChange} className="vx-link font-semibold">
          · change
        </button>
      </span>
    </span>
  );

  const right = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous gameweek"
          disabled={!viewGw || viewGw <= minGw}
          onClick={() => viewGw && setGw(viewGw - 1)}
          className="vx-iconbtn h-8 w-8 rounded-lg disabled:opacity-40"
        >
          ‹
        </button>
        <span className="vx-text min-w-[104px] text-center text-sm font-bold">Gameweek {viewGw ?? "—"}</span>
        <button
          type="button"
          aria-label="Next gameweek"
          disabled={!viewGw || viewGw >= maxGw}
          onClick={() => viewGw && setGw(viewGw + 1)}
          className="vx-iconbtn h-8 w-8 rounded-lg disabled:opacity-40"
        >
          ›
        </button>
      </div>
      <Link
        href={`/team/${teamId}?tab=analysis&gw=${viewGw ?? currentGw}`}
        className="rounded-lg bg-gradient-to-r from-[#cda228] to-[#84d21c] px-3 py-1.5 text-xs font-extrabold text-black shadow transition hover:brightness-110"
      >
        Full analysis
      </Link>
      <Link href={`/plan/${teamId}`} className="vx-chip rounded-lg px-3 py-1.5 text-xs font-bold hover:brightness-110">
        GW plan
      </Link>
    </div>
  );

  return (
    <Panel title={title} right={right} className={className}>
      {entry.loading ? (
        <p className="vx-muted px-4 py-10 text-center text-sm">Loading your team…</p>
      ) : entry.error || !entry.data ? (
        <div className="px-4 py-10 text-center">
          <p className="vx-down text-sm">{entry.error ?? "Could not load this team."}</p>
          <button
            type="button"
            onClick={onChange}
            className="mt-3 rounded-full bg-[#cda228]/20 px-4 py-1.5 text-sm font-semibold vx-gold hover:bg-[#cda228]/30"
          >
            Try another Team ID
          </button>
        </div>
      ) : (
        <div>
          <div className="vx-card-head grid grid-cols-5 divide-x" style={{ borderColor: "var(--vx-border)" }}>
            {stat("Avg Points", event?.average_entry_score ?? "—")}
            {stat("GW Points", gwPoints ?? "—", "up")}
            {stat(
              "Overall Rank",
              <span>
                {formatRank(overallRank)}
                {rankDelta ? (
                  <span className={`ml-1 text-xs ${rankDelta > 0 ? "vx-up" : "vx-down"}`}>
                    {rankDelta > 0 ? "▲" : "▼"}
                  </span>
                ) : null}
              </span>,
            )}
            {stat(
              "OR Change",
              rankDelta == null ? "—" : `${rankDelta > 0 ? "+" : rankDelta < 0 ? "-" : ""}${formatRank(Math.abs(rankDelta))}`,
              rankDelta == null || rankDelta === 0 ? undefined : rankDelta > 0 ? "up" : "down",
            )}
            {stat("GW Rank", formatRank(gwRank))}
          </div>

          <div className="p-3">
            {picks.error ? (
              <p className="vx-down py-8 text-center text-sm">{picks.error}</p>
            ) : !picks.data ? (
              <p className="vx-muted py-12 text-center text-sm">Loading squad…</p>
            ) : (
              <>
                <HomePitch starters={cards.starters} bench={cards.bench} footer={picks.data.automatic_subs.length ? <span>Auto-subs: {picks.data.automatic_subs.map(sub=>`${elements.get(sub.element_in)?.web_name ?? "?"} ↔ ${elements.get(sub.element_out)?.web_name ?? "?"}`).join(", ")}</span> : undefined}/>
                {picks.data.active_chip ? (
                  <p className="vx-gold mt-2 text-center text-xs font-bold">
                    ★ {picks.data.active_chip === "wildcard" ? "Wildcard" : picks.data.active_chip} active this gameweek
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
