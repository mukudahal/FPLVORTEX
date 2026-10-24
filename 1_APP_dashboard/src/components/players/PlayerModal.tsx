"use client";

import { useEffect } from "react";
import { Pill, Spinner } from "@/components/ui";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { useJson } from "@/lib/useJson";
import {
  fdrClasses,
  formatPrice,
  kickoffLabel,
  POSITIONS,
  statusInfo,
} from "@/lib/helpers";
import type { ElementSummary, SlimElement, SlimTeam } from "@/lib/types";

export function PlayerModal({
  player,
  teamsMap,
  onClose,
}: {
  player: SlimElement;
  teamsMap: Map<number, SlimTeam>;
  onClose: () => void;
}) {
  const { data, loading } = useJson<ElementSummary>(
    `/api/fpl/element/${player.id}`,
  );

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const team = teamsMap.get(player.team);
  const status = statusInfo(player.status);
  const recent = data ? [...data.history].slice(-6).reverse() : [];
  const upcoming = data ? data.fixtures.slice(0, 5) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#171227] p-5 pb-10 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-4">
          <PlayerPhoto
            code={player.code}
            alt={player.web_name}
            className="h-20 w-auto"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold leading-tight">
              {player.first_name} {player.second_name}
            </h2>
            <p className="text-sm text-slate-400">
              {team?.name} · {POSITIONS[player.element_type]} ·{" "}
              {formatPrice(player.now_cost)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Pill className="bg-white/10">{player.total_points} pts</Pill>
              <Pill className="bg-white/10">Form {player.form}</Pill>
              <Pill className="bg-white/10">{player.selected_by_percent}% owned</Pill>
              {status ? <Pill className={status.className}>{status.label}</Pill> : null}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full bg-white/10 px-2.5 py-1 text-sm text-slate-300 hover:bg-white/20"
          >
            ✕
          </button>
        </div>

        {player.news ? (
          <p className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            {player.news}
          </p>
        ) : null}

        <div className="mb-4 grid grid-cols-4 gap-2 text-center">
          {[
            ["Mins", player.minutes.toLocaleString()],
            ["Goals", player.goals_scored],
            ["Assists", player.assists],
            ["xGI", player.expected_goal_involvements],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-white/[0.05] px-2 py-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
              <p className="text-sm font-bold">{value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <Spinner label="Loading history…" />
        ) : data ? (
          <>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Upcoming fixtures
            </h3>
            <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
              {upcoming.map((f) => {
                const oppId = f.is_home ? f.team_a : f.team_h;
                const opp = teamsMap.get(oppId);
                return (
                  <div
                    key={f.id}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-center ${fdrClasses(f.difficulty)}`}
                  >
                    <p className="text-xs font-bold">
                      {opp?.short_name ?? "?"} ({f.is_home ? "H" : "A"})
                    </p>
                    <p className="text-[9px] opacity-80">
                      GW{f.event ?? "?"} · {kickoffLabel(f.kickoff_time).split(",")[0]}
                    </p>
                  </div>
                );
              })}
              {upcoming.length === 0 ? (
                <p className="text-xs text-slate-500">No upcoming fixtures.</p>
              ) : null}
            </div>

            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Recent gameweeks
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[9px] uppercase tracking-wider text-slate-500">
                  <th className="py-1.5 text-left">GW</th>
                  <th className="py-1.5 text-left">Opp</th>
                  <th className="py-1.5 text-right">Min</th>
                  <th className="py-1.5 text-right">G</th>
                  <th className="py-1.5 text-right">A</th>
                  <th className="py-1.5 text-right">Bonus</th>
                  <th className="py-1.5 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((h, i) => {
                  const opp = teamsMap.get(h.opponent_team);
                  return (
                    <tr key={i} className="border-b border-white/5 last:border-0">
                      <td className="py-1.5">{h.round}</td>
                      <td className="py-1.5">
                        {opp?.short_name ?? "?"} ({h.was_home ? "H" : "A"})
                      </td>
                      <td className="py-1.5 text-right">{h.minutes}</td>
                      <td className="py-1.5 text-right">{h.goals_scored}</td>
                      <td className="py-1.5 text-right">{h.assists}</td>
                      <td className="py-1.5 text-right">{h.bonus}</td>
                      <td className="py-1.5 text-right font-bold text-[#84d21c]">
                        {h.total_points}
                      </td>
                    </tr>
                  );
                })}
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-3 text-center text-slate-500">
                      No appearances yet this season.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {data.history_past.length > 0 ? (
              <p className="mt-3 text-[11px] text-slate-500">
                Last season:{" "}
                {data.history_past[data.history_past.length - 1].total_points} pts,{" "}
                {data.history_past[data.history_past.length - 1].goals_scored}G{" "}
                {data.history_past[data.history_past.length - 1].assists}A
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
