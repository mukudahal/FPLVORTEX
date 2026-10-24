"use client";

import { useMemo, useState } from "react";
import { TeamBadge } from "@/components/TeamBadge";
import { fdrClasses } from "@/lib/helpers";
import { cellsFor, type FxCell, type PlanCtx } from "@/lib/planEngine";
import type { PlanTeam } from "@/lib/planTypes";

interface Props {
  ctx: PlanCtx;
  teams: PlanTeam[];
  teamsById: Map<number, PlanTeam>;
  fxMap: Map<string, FxCell[]>;
  idx: number;
  squadTeams: Map<number, number>; // team id -> players in squad
  deadlines: Record<number, string>;
}

const WINDOW = 5;

export function TickerTab({ ctx, teams, teamsById, fxMap, idx, squadTeams, deadlines }: Props) {
  const [start, setStart] = useState(idx);
  const [sort, setSort] = useState<"ease" | "az">("ease");
  const [mine, setMine] = useState(false);

  const first = ctx.gws[0];
  const gwList = useMemo(
    () => Array.from({ length: WINDOW }, (_, k) => first + start + k).filter((g) => g <= 38),
    [first, start],
  );
  const maxStart = Math.max(0, ctx.gws.length - 1);

  const rows = useMemo(() => {
    const list = teams
      .filter((t) => !mine || squadTeams.has(t.id))
      .map((t) => {
        const cells = gwList.map((g) => cellsFor(fxMap, t.id, g));
        const all = cells.flat();
        const avg = all.length ? all.reduce((s, c) => s + c.diff, 0) / all.length : 9;
        return { t, cells, avg };
      });
    return sort === "ease"
      ? list.sort((a, b) => a.avg - b.avg)
      : list.sort((a, b) => a.t.name.localeCompare(b.t.name));
  }, [teams, mine, squadTeams, gwList, fxMap, sort]);

  const btn =
    "h-9 w-9 rounded-xl border border-white/15 bg-white/5 text-sm font-bold disabled:opacity-30";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className={btn} disabled={start <= 0} onClick={() => setStart(start - 1)} aria-label="Earlier gameweeks">
          ←
        </button>
        <p className="min-w-[110px] text-center text-xs font-bold text-slate-300">
          Fixture window
          <span className="block text-sm text-white">
            GW{gwList[0]}–{gwList[gwList.length - 1]}
          </span>
        </p>
        <button type="button" className={btn} disabled={start >= maxStart} onClick={() => setStart(start + 1)} aria-label="Later gameweeks">
          →
        </button>
        <div className="ml-auto flex gap-1 rounded-xl bg-black/40 p-1 text-[11px] font-bold">
          {(
            [
              ["ease", "Easiest first"],
              ["az", "A–Z"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSort(id)}
              className={`rounded-lg px-2.5 py-1.5 ${sort === id ? "bg-[#cda228]/25 text-[#dfc373]" : "text-slate-400"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          My clubs only
        </label>
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-[10px] font-bold text-slate-300">
        {[
          ["Favourable", 1],
          ["Balanced", 3],
          ["Difficult", 4],
          ["Hardest", 5],
        ].map(([label, d]) => (
          <span key={label as string} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded ${fdrClasses(d as number)}`} />
            {label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[420px] border-collapse text-center text-[11px]">
          <thead>
            <tr className="bg-white/[0.04] text-slate-300">
              <th className="px-2 py-2 text-left">Team</th>
              {gwList.map((g) => (
                <th key={g} className="px-1 py-2">
                  GW{g}
                  <span className="block text-[9px] font-medium text-slate-500">
                    {deadlines[g]
                      ? new Date(deadlines[g]).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                      : ""}
                  </span>
                </th>
              ))}
              <th className="px-1 py-2">Avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, cells, avg }) => (
              <tr key={t.id} className="border-t border-white/5">
                <td className="px-2 py-1">
                  <div className="flex items-center gap-1.5">
                    <TeamBadge code={t.code} shortName={t.short} className="h-5 w-5" />
                    <span className="font-bold text-slate-100">{t.short}</span>
                    {squadTeams.has(t.id) ? (
                      <span className="rounded bg-[#cda228]/25 px-1 text-[9px] font-bold text-[#f0cf62]" title="Players in your squad">
                        {squadTeams.get(t.id)}
                      </span>
                    ) : null}
                  </div>
                </td>
                {cells.map((cs, i) => (
                  <td key={i} className="p-0.5">
                    {cs.length === 0 ? (
                      <div className="rounded bg-slate-900 py-2 text-slate-600">–</div>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {cs.map((c, j) => (
                          <div key={j} className={`rounded py-1.5 text-[10px] font-bold ${fdrClasses(c.diff)}`}>
                            {c.home
                              ? (teamsById.get(c.opp)?.short ?? "?")
                              : (teamsById.get(c.opp)?.short ?? "?").toLowerCase()}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                ))}
                <td className="px-1 font-bold text-slate-300">{avg > 5 ? "–" : avg.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Uppercase = home, lowercase = away. Difficulty is the official FPL fixture rating. Gold number = your players at that club.
      </p>
    </div>
  );
}
