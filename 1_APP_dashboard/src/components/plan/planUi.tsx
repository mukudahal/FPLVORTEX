"use client";

import { TeamBadge } from "@/components/TeamBadge";
import { fdrClasses } from "@/lib/helpers";
import type { FxCell } from "@/lib/planEngine";
import type { PlanPlayer, PlanTeam } from "@/lib/planTypes";

export const KIT: Record<string, string> = {
  ARS: "#d11a2a", AVL: "#7b1e3a", BOU: "#c8102e", BRE: "#d6202f", BHA: "#1f5fbf",
  BUR: "#6c1d45", CHE: "#1d4ed8", CRY: "#1d4ed8", EVE: "#1e40af", FUL: "#475569",
  IPS: "#2563eb", LEE: "#d4b106", LEI: "#1d4ed8", LIV: "#c8102e", MCI: "#5a9fd4",
  MUN: "#da291c", NEW: "#374151", NFO: "#c8102e", SOU: "#d71920", SUN: "#d71920",
  TOT: "#1e3a8a", WHU: "#7a263a", WOL: "#d97706", HUL: "#e08a00", COV: "#4fa3d9",
};

export const kitColor = (short: string | undefined): string =>
  (short && KIT[short]) || "#334155";

export const fdrBar = (diff: number): string =>
  ["bg-slate-600", "bg-emerald-500", "bg-green-400", "bg-slate-400", "bg-rose-400", "bg-rose-600"][
    diff >= 1 && diff <= 5 ? diff : 0
  ];

export const money = (tenths: number): string => (tenths / 10).toFixed(1);

export const POS = ["", "GKP", "DEF", "MID", "FWD"];

export const inputCls =
  "w-full appearance-none rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm font-semibold text-slate-100 placeholder:text-slate-500 focus:border-[#cda228] focus:outline-none";

/** One gameweek in the "Next 5" strip: badge + difficulty bar (stacked on doubles). */
export function FdrCell({
  cells,
  teamsById,
}: {
  cells: FxCell[] | null;
  teamsById: Map<number, PlanTeam>;
}) {
  if (cells === null) return <div className="w-6" />;
  if (cells.length === 0) {
    return (
      <div className="flex w-6 flex-col items-center gap-0.5">
        <span className="flex h-4 w-4 items-center justify-center text-[10px] text-slate-600">–</span>
        <span className="h-[3px] w-5 rounded-full bg-slate-800" />
      </div>
    );
  }
  return (
    <div className="flex w-6 flex-col items-center gap-0.5">
      {cells.slice(0, 2).map((c, i) => {
        const t = teamsById.get(c.opp);
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span title={`${t?.short ?? "?"} (${c.home ? "H" : "A"}) · FDR ${c.diff}`}>
              <TeamBadge code={t?.code} shortName={t?.short} className="h-4 w-4" />
            </span>
            <span className={`h-[3px] w-5 rounded-full ${fdrBar(c.diff)}`} />
          </div>
        );
      })}
    </div>
  );
}

/** Text fixture pills (home = UPPER, away = lower), coloured by difficulty. */
export function FixturePills({
  slots,
  teamsById,
}: {
  slots: FxCell[][];
  teamsById: Map<number, PlanTeam>;
}) {
  return (
    <div className="flex w-full overflow-hidden rounded-b-md">
      {slots.map((cells, i) => {
        if (cells.length === 0) {
          return (
            <span key={i} className="flex-1 bg-slate-800 py-0.5 text-center text-[8px] font-bold leading-none text-slate-500">
              –
            </span>
          );
        }
        const c = cells[0];
        const short = teamsById.get(c.opp)?.short ?? "?";
        return (
          <span
            key={i}
            className={`flex-1 truncate px-0.5 py-0.5 text-center text-[8px] font-bold leading-none ${fdrClasses(c.diff)}`}
            title={cells.map((x) => `${teamsById.get(x.opp)?.short ?? "?"} (${x.home ? "H" : "A"})`).join(" + ")}
          >
            {c.home ? short : short.toLowerCase()}
            {cells.length > 1 ? "²" : ""}
          </span>
        );
      })}
    </div>
  );
}

/** P / FK / CK chips for first-choice takers. */
export function SetPieceBadges({ p, tiny = false }: { p: PlanPlayer; tiny?: boolean }) {
  const base = tiny
    ? "rounded px-[3px] text-[7px] leading-[11px]"
    : "rounded px-1 text-[9px] leading-[14px]";
  return (
    <>
      {p.pen === 1 ? (
        <span className={`${base} border border-[#cda228]/70 bg-black/60 font-extrabold text-[#f0cf62]`}>P</span>
      ) : null}
      {p.fk === 1 ? (
        <span className={`${base} border border-cyan-300/60 bg-black/60 font-extrabold text-cyan-200`}>FK</span>
      ) : null}
      {p.ck === 1 ? (
        <span className={`${base} border border-slate-300/60 bg-black/60 font-extrabold text-slate-100`}>CK</span>
      ) : null}
    </>
  );
}
