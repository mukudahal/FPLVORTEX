"use client";

import type { ReactNode } from "react";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { TeamBadge } from "@/components/TeamBadge";
import { formatRank, statusInfo } from "@/lib/helpers";
import type { SlimElement, SlimTeam } from "@/lib/types";

export interface PitchCardItem {
  element: SlimElement;
  team?: SlimTeam;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  isTripleCaptain?: boolean;
  isNew?: boolean;
  benchLabel?: string; // e.g. "1. GK", "2. 1st", "3. 2nd", "4. 3rd"
  primaryLabel: string; // e.g. "12 pts" or "6.4 xPts" or "92%"
  primaryTone?: "green" | "white" | "muted" | "amber";
  secondaryLabel?: string; // e.g. "£6.5m · ARS (H)"
  selected?: boolean;
  onClick?: () => void;
}

export function PlayerCard({ item }: { item: PitchCardItem }) {
  const {
    element,
    team,
    isCaptain,
    isViceCaptain,
    isTripleCaptain,
    isNew,
    benchLabel,
    primaryLabel,
    primaryTone = "white",
    secondaryLabel,
    selected,
    onClick,
  } = item;

  const status = statusInfo(element.status);
  const toneClass =
    primaryTone === "green"
      ? "bg-[#84d21c] text-[#000000]"
      : primaryTone === "amber"
        ? "bg-amber-300 text-slate-950"
        : primaryTone === "white"
          ? "bg-white text-[#000000]"
          : "bg-slate-200/90 text-slate-800";

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`relative flex w-[64px] flex-col items-center text-left transition sm:w-[74px] ${
        onClick ? "cursor-pointer hover:scale-105 active:scale-95" : ""
      } ${selected ? "rounded-lg ring-2 ring-[#84d21c]" : ""}`}
    >
      {benchLabel ? (
        <span className="mb-0.5 rounded bg-black/50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-300">
          {benchLabel}
        </span>
      ) : null}

      {/* Captain / Vice armband */}
      {isCaptain || isViceCaptain ? (
        <span
          className={`absolute -left-1 top-3 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-extrabold shadow ${
            isCaptain
              ? "bg-slate-950 text-[#84d21c] ring-1 ring-[#84d21c]"
              : "bg-slate-200 text-slate-900"
          }`}
        >
          {isCaptain ? (isTripleCaptain ? "TC" : "C") : "V"}
        </span>
      ) : null}

      {/* NEW transfer badge */}
      {isNew ? (
        <span className="absolute -right-1 top-3 z-10 rounded-full bg-[#84d21c] px-1 text-[8px] font-extrabold text-[#000000] shadow">
          NEW
        </span>
      ) : status ? (
        <span
          className={`absolute -right-1 top-3 z-10 rounded-full px-1 text-[8px] font-bold ${status.className}`}
          title={element.news}
        >
          !
        </span>
      ) : null}

      {/* Team badge bottom-left of photo */}
      {team ? (
        <span className="absolute left-0.5 top-9 z-10 rounded-full bg-black/60 p-0.5 shadow">
          <TeamBadge
            code={team.code}
            shortName={team.short_name}
            className="h-3.5 w-3.5"
          />
        </span>
      ) : null}

      <PlayerPhoto
        code={element.code}
        alt={element.web_name}
        className="h-12 w-auto drop-shadow-md sm:h-14"
      />

      <div className="w-full overflow-hidden rounded-md text-center text-[10px] leading-tight shadow">
        <div className="truncate bg-[#37003c] px-1 py-0.5 font-semibold text-white">
          {element.web_name}
        </div>
        <div className={`truncate px-1 py-0.5 font-bold ${toneClass}`}>
          {primaryLabel}
        </div>
        {secondaryLabel ? (
          <div className="truncate bg-[#1a1429] px-1 py-0.5 text-[8px] font-medium text-slate-300">
            {secondaryLabel}
          </div>
        ) : null}
      </div>
    </Wrapper>
  );
}

export interface GoalkeeperSideStats {
  gwPoints: number | string;
  overallRank: number | null;
  previousOverallRank: number | null;
}

export function Pitch({
  starters,
  bench,
  gkSideStats,
  footer,
  benchTitle = "Bench (ordered)",
}: {
  starters: PitchCardItem[];
  bench?: PitchCardItem[];
  gkSideStats?: GoalkeeperSideStats;
  footer?: ReactNode;
  benchTitle?: string;
}) {
  const rows = [1, 2, 3, 4].map((type) =>
    starters.filter((s) => s.element.element_type === type),
  );

  // Rank delta: prevRank - currRank (> 0 means rank improved / moved up)
  const rankDelta =
    gkSideStats &&
    gkSideStats.overallRank !== null &&
    gkSideStats.previousOverallRank !== null
      ? gkSideStats.previousOverallRank - gkSideStats.overallRank
      : null;

  return (
    <div>
      <div className="pitch-bg rounded-2xl border border-white/10 px-1.5 py-4 shadow-xl">
        <div className="flex flex-col gap-4">
          {rows.map((row, idx) => {
            if (row.length === 0) return null;
            // Row 0 is Goalkeeper: render gkSideStats beside the goalkeeper if provided (Section 1.2)
            if (idx === 0 && gkSideStats) {
              return (
                <div
                  key={idx}
                  className="relative flex items-center justify-center gap-3 px-2"
                >
                  {row.map((item) => (
                    <PlayerCard key={item.element.id} item={item} />
                  ))}
                  <div className="rounded-xl border border-white/15 bg-[#120e21]/90 px-3 py-2 text-left shadow-lg backdrop-blur">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                      GW Points
                    </div>
                    <div className="text-lg font-extrabold leading-tight text-[#84d21c]">
                      {gkSideStats.gwPoints} pts
                    </div>
                    <div className="mt-1 border-t border-white/10 pt-1">
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                        Overall Rank
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
                        <span>{formatRank(gkSideStats.overallRank)}</span>
                        {rankDelta === null || rankDelta === 0 ? (
                          <span
                            className="text-[11px] font-semibold text-slate-400"
                            title="No change vs previous GW"
                          >
                            —
                          </span>
                        ) : rankDelta > 0 ? (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-[#84d21c]"
                            title={`Improved by ${rankDelta.toLocaleString()} places`}
                          >
                            ▲ +{formatRank(rankDelta)}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-rose-400"
                            title={`Dropped by ${Math.abs(rankDelta).toLocaleString()} places`}
                          >
                            ▼ -{formatRank(Math.abs(rankDelta))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={idx} className="flex items-start justify-evenly">
                {row.map((item) => (
                  <PlayerCard key={item.element.id} item={item} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {bench && bench.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {benchTitle}
          </p>
          <div className="flex items-start justify-evenly">
            {bench.map((item) => (
              <PlayerCard key={item.element.id} item={item} />
            ))}
          </div>
          {footer ? <div className="mt-2">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
