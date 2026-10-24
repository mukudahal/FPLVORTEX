"use client";

import type { CSSProperties, ReactNode } from "react";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import type { PicksResponse, SlimElement } from "@/lib/types";
type Pick = PicksResponse["picks"][number];

export interface HomePitchCardData {
  element: SlimElement;
  pick: Pick;
  points: number;
  showPoints: boolean;
  fixtureLabel: string;
  live: boolean;
  comparisonLabel?: string;
}

/** Shared score bands for the Home and Analysis pitches. */
function pointsStyle(pts: number, live: boolean): CSSProperties {
  if (live && pts <= 2) return { background: "#84d21c", color: "#000" };
  if (pts <= 2) return { background: "linear-gradient(90deg,#d946ef,#fb923c)", color: "#0f172a" };
  if (pts <= 5) return { background: "#e5e7eb", color: "#0f172a" };
  if (pts <= 8) return { background: "#84d21c", color: "#000" };
  return { background: "#14d19b", color: "#000" };
}

function PitchCard({ c, benchLabel }: { c: HomePitchCardData; benchLabel?: string }) {
  const { element, pick } = c;
  const flagged = element.status !== "a";
  const isC = pick.is_captain;
  const isV = pick.is_vice_captain;
  return (
    <div className="home-pitch-card relative w-[18%] min-w-[58px] max-w-[118px] text-center">
      {benchLabel ? (
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,.75)" }}>
          {benchLabel}
        </div>
      ) : null}
      {isC || isV ? (
        <span
          className="absolute -left-1 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold shadow"
          style={{
            top: benchLabel ? 18 : 2,
            background: "#0b1220",
            color: "#fff",
            border: "1px solid rgba(255,255,255,.7)",
          }}
        >
          {isC ? (pick.multiplier === 3 ? "TC" : "C") : "V"}
        </span>
      ) : null}
      {flagged ? (
        <span
          className="absolute -right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-extrabold shadow"
          style={{
            top: benchLabel ? 18 : 2,
            background: element.status === "d" ? "#fbbf24" : "#f43f5e",
            color: element.status === "d" ? "#422006" : "#fff",
          }}
          title={element.news}
        >
          !
        </span>
      ) : null}
      <div className="overflow-hidden rounded-t-lg" style={{ background: "rgba(0,0,0,.28)" }}>
        <PlayerPhoto
          code={element.code}
          alt={element.web_name}
          className="mx-auto h-[58px] w-auto sm:h-[72px]"
        />
      </div>
      <div
        className="home-pitch-card-name truncate px-1 py-0.5 text-[11px] font-extrabold sm:text-xs"
        style={{ background: "#fff", color: "#0f172a" }}
      >
        {element.web_name}
      </div>
      <div
        className="home-pitch-card-score truncate rounded-b-lg px-1 py-0.5 text-[11px] font-bold sm:text-xs"
        style={
          c.showPoints
            ? pointsStyle(c.points, c.live)
            : { background: "#e2e8f0", color: "#334155" }
        }
      >
        {c.showPoints ? c.points : c.fixtureLabel}
      </div>
      {c.comparisonLabel ? <div className="home-pitch-comparison">{c.comparisonLabel}</div> : null}
    </div>
  );
}

export function HomePitch({starters,bench,footer,className=""}: {
  starters: HomePitchCardData[];
  bench: HomePitchCardData[];
  footer?: ReactNode;
  className?: string;
}) {
  const rows = [1,2,3,4].map(type=>starters.filter(c=>c.element.element_type===type));
  return <div className={`home-pitch ${className}`}>
    <div className="pitch-bg relative overflow-hidden rounded-xl px-2 py-5 shadow-lg">
      <div className="pointer-events-none absolute inset-3 rounded-md" style={{border:"1px solid rgba(255,255,255,.45)"}}/>
      <div className="pointer-events-none absolute inset-x-3 top-1/2" style={{borderTop:"1px solid rgba(255,255,255,.45)"}}/>
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{border:"1px solid rgba(255,255,255,.45)"}}/>
      <div className="relative flex flex-col gap-5">{rows.map((row,i)=>row.length?<div key={i} className="flex items-start justify-evenly">{row.map(c=><PitchCard key={c.element.id} c={c}/>)}</div>:null)}</div>
    </div>
    <div className="mt-3 rounded-xl px-2 py-3" style={{background:"#0e3a20"}}>
      <div className="flex items-start justify-evenly">{bench.map((c,i)=><PitchCard key={c.element.id} c={c} benchLabel={i===0?"GK":`Sub ${i}`}/>)}</div>
      {footer?<div className="mt-2 text-center text-xs text-white/80">{footer}</div>:null}
    </div>
  </div>;
}
