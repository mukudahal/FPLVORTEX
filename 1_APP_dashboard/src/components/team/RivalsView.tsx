"use client";

import { useMemo, useState } from "react";
import { Card, ErrorBox, Pill, Spinner } from "@/components/ui";
import { useJson } from "@/lib/useJson";
import { chipLabel } from "@/lib/helpers";
import type {
  EntryResponse,
  LeagueStandings,
  RivalData,
  SlimElement,
} from "@/lib/types";

function GapChart({
  mine,
  rival,
}: {
  mine: { event: number; total_points: number }[];
  rival: { event: number; total_points: number }[];
}) {
  const rivalMap = new Map(rival.map((r) => [r.event, r.total_points]));
  const pts = mine
    .filter((m) => rivalMap.has(m.event))
    .map((m) => ({ event: m.event, gap: m.total_points - (rivalMap.get(m.event) ?? 0) }));
  if (pts.length < 2) return null;
  const W = 300;
  const H = 70;
  const maxAbs = Math.max(...pts.map((p) => Math.abs(p.gap)), 5);
  const x = (i: number) => (i / (pts.length - 1)) * (W - 12) + 6;
  const y = (g: number) => H / 2 - (g / maxAbs) * (H / 2 - 8);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.gap)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#475569" strokeDasharray="3 3" />
      <path d={path} fill="none" stroke="#84d21c" strokeWidth="2" />
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.gap)} r="2.5" fill={p.gap >= 0 ? "#84d21c" : "#fb7185"} />
      ))}
    </svg>
  );
}

export function RivalsView({
  entry,
  myPicks,
  elementsMap,
  currentGw,
}: {
  entry: EntryResponse;
  myPicks: number[];
  elementsMap: Map<number, SlimElement>;
  currentGw: number;
}) {
  const leagues = (entry.entry.leagues?.classic ?? []).filter(
    (l) => l.league_type === "x",
  );
  const fallbackLeagues = (entry.entry.leagues?.classic ?? []).slice(0, 6);
  const options = leagues.length > 0 ? leagues : fallbackLeagues;
  const [leagueId, setLeagueId] = useState<number | null>(options[0]?.id ?? null);

  const standings = useJson<LeagueStandings>(
    leagueId ? `/api/fpl/league/${leagueId}` : null,
  );

  const myEntryId = entry.entry.id;
  const rivalMetas = useMemo(() => {
    const results = standings.data?.standings.results ?? [];
    const myRow = results.find((r) => r.entry === myEntryId);
    const rivals = results.filter((r) => r.entry !== myEntryId).slice(0, 4);
    return { myRow, rivals };
  }, [standings.data, myEntryId]);

  const rivalsUrl = useMemo(() => {
    if (rivalMetas.rivals.length === 0) return null;
    const payload = JSON.stringify(
      rivalMetas.rivals.map((r) => ({
        entry: r.entry,
        name: r.entry_name,
        playerName: r.player_name,
        total: r.total,
        rank: r.rank,
      })),
    );
    return `/api/rivals?gw=${currentGw}&rivals=${encodeURIComponent(payload)}`;
  }, [rivalMetas.rivals, currentGw]);

  const rivals = useJson<RivalData[]>(rivalsUrl);
  const myTotal = entry.entry.summary_overall_points ?? 0;
  const mySet = useMemo(() => new Set(myPicks), [myPicks]);
  const myHistory = entry.history.current.map((h) => ({
    event: h.event,
    total_points: h.total_points,
  }));

  if (options.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-400">
          This team isn&apos;t in any classic mini-leagues.
        </p>
      </Card>
    );
  }

  const iAmLeading =
    rivalMetas.myRow != null &&
    rivalMetas.rivals.every((r) => r.rank > (rivalMetas.myRow?.rank ?? 999));

  return (
    <div className="flex flex-col gap-3">
      <select
        value={leagueId ?? ""}
        onChange={(e) => setLeagueId(Number(e.target.value))}
        className="w-full rounded-xl border border-white/15 bg-[#171227] px-3 py-2.5 text-sm font-semibold focus:border-[#84d21c] focus:outline-none"
      >
        {options.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} {l.entry_rank ? `(you: #${l.entry_rank})` : ""}
          </option>
        ))}
      </select>

      {standings.loading ? <Spinner label="Loading standings…" /> : null}
      {standings.error ? (
        <ErrorBox message={standings.error} onRetry={standings.refresh} />
      ) : null}

      {standings.data ? (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[9px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-1 py-2 text-left">Team</th>
                <th className="px-1 py-2 text-right">GW</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {standings.data.standings.results.slice(0, 10).map((r) => (
                <tr
                  key={r.entry}
                  className={`border-b border-white/5 last:border-0 ${
                    r.entry === myEntryId ? "bg-[#84d21c]/10 font-bold" : ""
                  }`}
                >
                  <td className="px-3 py-1.5">
                    {r.rank}
                    {r.last_rank > r.rank ? (
                      <span className="text-[#84d21c]"> ▲</span>
                    ) : r.last_rank < r.rank ? (
                      <span className="text-rose-400"> ▼</span>
                    ) : null}
                  </td>
                  <td className="px-1 py-1.5">
                    <p className="max-w-[150px] truncate">{r.entry_name}</p>
                    <p className="max-w-[150px] truncate text-[9px] font-normal text-slate-500">
                      {r.player_name}
                    </p>
                  </td>
                  <td className="px-1 py-1.5 text-right">{r.event_total}</td>
                  <td className="px-3 py-1.5 text-right">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {/* Strategy banner */}
      {standings.data && rivalMetas.myRow ? (
        <Card className="border-fuchsia-400/30 bg-fuchsia-500/10">
          <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-200">
            Win strategy
          </p>
          <p className="mt-1 text-sm text-slate-200">
            {iAmLeading
              ? "You're leading — protect the lead. Cover your rivals' best differentials, favour high-ownership template players, and only take hits to shield against their captaincy punts."
              : "You're chasing — you need variance. Target differentials your rivals don't own (see below), consider a differential captain, and time a chip they've already burned."}
          </p>
        </Card>
      ) : null}

      {rivals.loading ? <Spinner label="Scouting rivals…" /> : null}

      {(rivals.data ?? []).map((r) => {
        const rivalSet = new Set((r.picks ?? []).map((p) => p.element));
        const overlap = [...mySet].filter((id) => rivalSet.has(id));
        const theirDiffs = [...rivalSet].filter((id) => !mySet.has(id));
        const myDiffs = [...mySet].filter((id) => !rivalSet.has(id));
        const theirCap = (r.picks ?? []).find((p) => p.is_captain);
        const gap = myTotal - r.total;
        return (
          <Card key={r.entry} className="!p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{r.name}</p>
                <p className="truncate text-[10px] text-slate-500">
                  {r.playerName} · league #{r.rank}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`text-lg font-extrabold ${
                    gap >= 0 ? "text-[#84d21c]" : "text-rose-400"
                  }`}
                >
                  {gap >= 0 ? "+" : ""}
                  {gap}
                </p>
                <p className="text-[9px] text-slate-500">pts vs you</p>
              </div>
            </div>

            <GapChart mine={myHistory} rival={r.history} />
            <p className="-mt-1 text-center text-[9px] text-slate-600">
              gap by GW (above line = you ahead)
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
              <Pill className="bg-white/10 text-slate-300">
                overlap {overlap.length}/15
              </Pill>
              {theirCap ? (
                <Pill className="bg-white/10 text-slate-300">
                  their C: {elementsMap.get(theirCap.element)?.web_name ?? "?"}
                </Pill>
              ) : null}
              {r.activeChip ? (
                <Pill className="bg-fuchsia-500/20 text-fuchsia-200">
                  {chipLabel(r.activeChip)} active
                </Pill>
              ) : null}
              <Pill className="bg-white/10 text-slate-300">
                chips used: {r.chipsUsed.length > 0
                  ? r.chipsUsed.map((c) => chipLabel(c.name)).join(", ")
                  : "none"}
              </Pill>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-lg bg-rose-500/10 p-2">
                <p className="mb-1 font-bold text-rose-300">They have, you don&apos;t</p>
                {theirDiffs.slice(0, 5).map((id) => (
                  <p key={id} className="truncate text-slate-300">
                    {elementsMap.get(id)?.web_name ?? `#${id}`}
                    <span className="text-slate-500">
                      {" "}
                      · form {elementsMap.get(id)?.form}
                    </span>
                  </p>
                ))}
                {theirDiffs.length === 0 ? (
                  <p className="text-slate-500">None</p>
                ) : null}
              </div>
              <div className="rounded-lg bg-[#84d21c]/10 p-2">
                <p className="mb-1 font-bold text-[#84d21c]">You have, they don&apos;t</p>
                {myDiffs.slice(0, 5).map((id) => (
                  <p key={id} className="truncate text-slate-300">
                    {elementsMap.get(id)?.web_name ?? `#${id}`}
                    <span className="text-slate-500">
                      {" "}
                      · form {elementsMap.get(id)?.form}
                    </span>
                  </p>
                ))}
                {myDiffs.length === 0 ? <p className="text-slate-500">None</p> : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
