"use client";

import { Card } from "@/components/ui";
import { chipLabel, formatRank } from "@/lib/helpers";
import type { EntryHistory, SlimEvent } from "@/lib/types";

function RankChart({ gws }: { gws: EntryHistory["current"] }) {
  const points = gws.filter((g) => g.overall_rank !== null);
  if (points.length < 2) return null;
  const W = 320;
  const H = 96;
  const ranks = points.map((g) => g.overall_rank as number);
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const span = Math.max(max - min, 1);
  const coords = points.map((g, i) => {
    const x = (i / (points.length - 1)) * (W - 16) + 8;
    // lower rank = better = higher on chart
    const y = 8 + (((g.overall_rank as number) - min) / span) * (H - 16);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <path d={path} fill="none" stroke="#84d21c" strokeWidth="2.5" strokeLinecap="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#000000" stroke="#84d21c" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

export function HistoryView({
  history,
  events,
}: {
  history: EntryHistory;
  events: SlimEvent[];
}) {
  const gws = [...history.current].sort((a, b) => a.event - b.event);
  const chipsByGw = new Map(history.chips.map((c) => [c.event, c.name]));
  const avgByGw = new Map(events.map((e) => [e.id, e.average_entry_score]));

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Overall rank progression
        </p>
        <RankChart gws={gws} />
        <div className="mt-1 flex justify-between text-[10px] text-slate-500">
          <span>GW{gws[0]?.event ?? 1}</span>
          <span>GW{gws[gws.length - 1]?.event ?? ""}</span>
        </div>
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 text-left">GW</th>
              <th className="px-2 py-2 text-right">Pts</th>
              <th className="px-2 py-2 text-right">Avg</th>
              <th className="px-2 py-2 text-right">TM</th>
              <th className="px-2 py-2 text-right">GW Rank</th>
              <th className="px-3 py-2 text-right">OR</th>
            </tr>
          </thead>
          <tbody>
            {[...gws].reverse().map((g, idx, arr) => {
              const prev = arr[idx + 1];
              const chip = chipsByGw.get(g.event);
              const avg = avgByGw.get(g.event);
              const beatAvg = avg != null && g.points - g.event_transfers_cost >= avg;
              const orUp =
                prev?.overall_rank != null && g.overall_rank != null
                  ? g.overall_rank < prev.overall_rank
                  : null;
              return (
                <tr key={g.event} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-2 font-semibold">
                    {g.event}
                    {chip ? (
                      <span className="ml-1 rounded bg-fuchsia-500/20 px-1 py-0.5 text-[9px] font-bold text-fuchsia-200">
                        {chipLabel(chip)}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={`px-2 py-2 text-right font-bold ${
                      beatAvg ? "text-[#84d21c]" : "text-slate-200"
                    }`}
                  >
                    {g.points - g.event_transfers_cost}
                    {g.event_transfers_cost > 0 ? (
                      <span className="text-[10px] text-rose-300"> (-{g.event_transfers_cost})</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-400">{avg ?? "—"}</td>
                  <td className="px-2 py-2 text-right text-slate-400">{g.event_transfers}</td>
                  <td className="px-2 py-2 text-right text-slate-300">{formatRank(g.rank)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-semibold">{formatRank(g.overall_rank)}</span>
                    {orUp !== null ? (
                      <span className={orUp ? "text-[#84d21c]" : "text-rose-400"}>
                        {" "}
                        {orUp ? "▲" : "▼"}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Chips used
        </p>
        {history.chips.length === 0 ? (
          <p className="text-sm text-slate-400">No chips played yet — all still in hand.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {history.chips.map((c, i) => (
              <span
                key={i}
                className="rounded-full bg-fuchsia-500/15 px-3 py-1 text-xs font-semibold text-fuchsia-200"
              >
                {chipLabel(c.name)} · GW{c.event}
              </span>
            ))}
          </div>
        )}
      </Card>

      {history.past.length > 0 ? (
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Past seasons
          </p>
          <div className="flex flex-col gap-1.5">
            {[...history.past].reverse().map((s) => (
              <div key={s.season_name} className="flex justify-between text-sm">
                <span className="text-slate-300">{s.season_name}</span>
                <span>
                  <span className="font-semibold">{s.total_points} pts</span>{" "}
                  <span className="text-slate-400">· OR {formatRank(s.rank)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
