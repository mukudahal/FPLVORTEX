"use client";

import { useState } from "react";
import { Card, Pill } from "@/components/ui";
import { Pitch, type PitchCardItem } from "@/components/Pitch";
import { chipLabel, formatPrice } from "@/lib/helpers";
import type {
  OptimizerResponse,
  SlimElement,
  SlimTeam,
} from "@/lib/types";

export function ChipsView({
  optimizer,
  elementsMap,
  teamsMap,
}: {
  optimizer: OptimizerResponse;
  elementsMap: Map<number, SlimElement>;
  teamsMap: Map<number, SlimTeam>;
}) {
  const [openPitchChip, setOpenPitchChip] = useState<string | null>(
    optimizer.chipSimulations.find((c) => c.available)?.chip ?? "bboost",
  );

  const expiringFirstHalf = optimizer.chipSimulations.filter(
    (c) => c.available && c.expiresGw <= 19,
  );

  const doSteps = optimizer.next6DaysPlan.filter((s) => s.type === "do");
  const dontSteps = optimizer.next6DaysPlan.filter((s) => s.type === "dont");

  return (
    <div className="flex flex-col gap-3">
      {/* Section 4.5: First-half chip expiry warning */}
      {expiringFirstHalf.length > 0 ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
            ⏳ First-Half Chip Window Warning (GW1–GW19)
          </p>
          <p className="mt-1 text-xs text-amber-100">
            Remaining first-half chips (
            <strong>
              {expiringFirstHalf.map((c) => chipLabel(c.chip)).join(", ")}
            </strong>
            ) expire at the{" "}
            <strong>
              GW{expiringFirstHalf[0].expiresGw} deadline (
              {expiringFirstHalf[0].expiryDeadline
                ? new Date(expiringFirstHalf[0].expiryDeadline).toLocaleDateString(
                    undefined,
                    { day: "numeric", month: "short", year: "numeric" },
                  )
                : "GW19"}
              )
            </strong>
            . Unused first-half chips do not roll into GW20.
          </p>
        </div>
      ) : null}

      {/* Section 4.1 - 4.3: Per-chip simulations, Top 4 GW bar chart, and Best GW Pitch */}
      {optimizer.chipSimulations.map((sim) => {
        const maxGain = Math.max(
          ...sim.topGws.map((g) => Math.max(0.5, g.gain)),
          1,
        );
        const isPitchOpen = openPitchChip === sim.chip;
        const bestPitch = sim.bestPitch;
        const bestGwXPts = bestPitch
          ? optimizer.xPtsByGw[bestPitch.gw] ?? {}
          : {};

        const benchLabels = ["1. GK", "2. 1st", "3. 2nd", "4. 3rd"];
        const toCard = (id: number, benchIdx?: number): PitchCardItem | null => {
          const el = elementsMap.get(id);
          if (!el) return null;
          const team = teamsMap.get(el.team);
          const xp = bestGwXPts[id] ?? 0;
          const isCap = bestPitch?.captainId === id;
          const isVice = bestPitch?.viceId === id;
          const isTC = sim.chip === "3xc" && isCap;
          const mult = isTC ? 3 : isCap ? 2 : 1;
          return {
            element: el,
            team,
            isCaptain: isCap,
            isViceCaptain: isVice,
            isTripleCaptain: isTC,
            benchLabel:
              benchIdx !== undefined ? benchLabels[benchIdx] : undefined,
            primaryLabel: `${(xp * (benchIdx !== undefined ? 1 : mult)).toFixed(1)} xPts`,
            primaryTone:
              isCap || sim.chip === "bboost" ? "green" : "white",
            secondaryLabel: `${team?.short_name ?? ""} · ${formatPrice(el.now_cost)}`,
          };
        };

        const pitchStarters = (bestPitch?.starters ?? [])
          .map((id) => toCard(id))
          .filter((c): c is PitchCardItem => c !== null);
        const pitchBench = (bestPitch?.bench ?? [])
          .map((id, i) => toCard(id, i))
          .filter((c): c is PitchCardItem => c !== null);

        return (
          <Card key={sim.chip} className="!p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-white">
                    {chipLabel(sim.chip)}
                  </h3>
                  {sim.available ? (
                    <Pill className="bg-[#84d21c]/15 text-[#84d21c]">
                      Available (by GW{sim.expiresGw})
                    </Pill>
                  ) : (
                    <Pill className="bg-slate-500/20 text-slate-400">
                      Used GW{sim.usedGw}
                    </Pill>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-300">{sim.verdictLine}</p>
              </div>
              {sim.available && sim.bestGw ? (
                <div className="text-right">
                  <span className="rounded-lg bg-fuchsia-500/20 px-2.5 py-1 text-xs font-extrabold text-fuchsia-200">
                    Best: GW{sim.bestGw} (+{sim.bestGain.toFixed(1)} xPts Est.)
                  </span>
                </div>
              ) : null}
            </div>

            {/* Section 4.2: Top 4 GWs Bar Chart */}
            {sim.available && sim.topGws.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Top {sim.topGws.length} Gameweeks Ranked by xPts Gain (Estimate)
                </p>
                {sim.topGws.map((g, idx) => {
                  const widthPct = Math.max(
                    10,
                    Math.min(100, Math.round((Math.max(0, g.gain) / maxGain) * 100)),
                  );
                  const isBest = idx === 0;
                  return (
                    <div
                      key={g.gw}
                      className={`rounded-xl border p-2 text-xs ${
                        isBest
                          ? "border-[#84d21c]/40 bg-[#84d21c]/5"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-white">
                            GW{g.gw}
                          </span>
                          {isBest ? (
                            <span className="rounded bg-[#84d21c] px-1.5 py-0.5 text-[9px] font-extrabold text-[#000000]">
                              Best
                            </span>
                          ) : null}
                          <span className="text-[10px] text-slate-400">
                            ({g.xPtsWithChip.toFixed(1)} vs {g.xPtsNoChip.toFixed(1)} no-chip)
                          </span>
                        </div>
                        <span className="font-extrabold text-[#84d21c]">
                          +{g.gain.toFixed(1)} xPts
                        </span>
                      </div>

                      {/* Horizontal bar */}
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${
                            isBest ? "bg-[#84d21c]" : "bg-fuchsia-400"
                          }`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>

                      <p className="mt-1 text-[10px] text-slate-300">
                        {g.reason}
                      </p>
                    </div>
                  );
                })}

                {/* Section 4.3: Toggle / display Recommended Start 11 + Bench on Pitch */}
                {bestPitch ? (
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPitchChip(isPitchOpen ? null : sim.chip)
                      }
                      className="w-full rounded-xl border border-white/15 bg-white/[0.05] py-2 text-xs font-bold text-slate-200 hover:bg-white/10"
                    >
                      {isPitchOpen
                        ? `Hide GW${bestPitch.gw} Recommended ${chipLabel(sim.chip)} Squad ▴`
                        : `Show GW${bestPitch.gw} Recommended ${chipLabel(sim.chip)} Pitch (Start 11 + Bench) ▾`}
                    </button>

                    {isPitchOpen ? (
                      <div className="mt-2">
                        <div className="mb-2 flex items-center justify-between px-1 text-xs">
                          <span className="font-bold text-slate-300">
                            GW{bestPitch.gw} {chipLabel(sim.chip)} Recommended XI &amp; Bench
                          </span>
                          <span className="font-extrabold text-[#84d21c]">
                            {bestPitch.xPtsWithChip.toFixed(1)} xPts (Estimate)
                          </span>
                        </div>
                        <Pitch
                          starters={pitchStarters}
                          bench={pitchBench}
                          benchTitle={
                            sim.chip === "bboost"
                              ? "Bench Boost Active — All 4 Bench Players Score!"
                              : "Recommended Bench Order"
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        );
      })}

      {/* Section 4.4: Next 6 Days Plan (DO and DON'T lists with dates) */}
      <Card className="!p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-white">
            Next 6 Days Tactical Plan (Live Data)
          </h3>
          <Pill className="bg-white/10 text-slate-300">DO &amp; DON&apos;T</Pill>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* DO list */}
          <div className="rounded-xl border border-[#84d21c]/30 bg-[#84d21c]/5 p-2.5">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-[#84d21c]">
              ✅ DO List
            </p>
            <div className="flex flex-col gap-2">
              {doSteps.map((s, i) => (
                <div key={i} className="rounded-lg bg-black/30 p-2 text-xs">
                  <span className="inline-block rounded bg-[#84d21c]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#84d21c]">
                    {s.dateLabel}
                  </span>
                  <p className="mt-1 leading-snug text-slate-200">{s.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* DON'T list */}
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-2.5">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-rose-300">
              🚫 DON&apos;T List
            </p>
            <div className="flex flex-col gap-2">
              {dontSteps.map((s, i) => (
                <div key={i} className="rounded-lg bg-black/30 p-2 text-xs">
                  <span className="inline-block rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">
                    {s.dateLabel}
                  </span>
                  <p className="mt-1 leading-snug text-slate-200">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
