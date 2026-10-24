"use client";

import { Card, Pill, StatBox } from "@/components/ui";
import { Pitch, type PitchCardItem } from "@/components/Pitch";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { TeamBadge } from "@/components/TeamBadge";
import { formatPrice } from "@/lib/helpers";
import type {
  OptimizerResponse,
  SlimElement,
  SlimTeam,
} from "@/lib/types";

export function AutoOptimizedView({
  optimizer,
  elementsMap,
  teamsMap,
  horizon,
  onChangeHorizon,
  onOpenVerdict,
  onOpenPlanner,
}: {
  optimizer: OptimizerResponse;
  elementsMap: Map<number, SlimElement>;
  teamsMap: Map<number, SlimTeam>;
  horizon: number;
  onChangeHorizon: (h: number) => void;
  onOpenVerdict?: () => void;
  onOpenPlanner?: () => void;
}) {
  const opt = optimizer.optimizedNextGw;
  const gw = optimizer.nextGw;
  const newSet = new Set(opt.newPlayerIds);
  const benchLabels = ["1. GK", "2. 1st Sub", "3. 2nd Sub", "4. 3rd Sub"];

  const toCard = (id: number, benchIdx?: number): PitchCardItem | null => {
    const el = elementsMap.get(id);
    if (!el) return null;
    const team = teamsMap.get(el.team);
    const bd = optimizer.xPtsNextGw[id];
    const xp = bd?.xPts ?? 0;
    const isCap = opt.captainId === id;
    const isVice = opt.viceId === id;
    const isBench = benchIdx !== undefined;
    const mult = !isBench && isCap ? 2 : 1;

    return {
      element: el,
      team,
      isCaptain: isCap,
      isViceCaptain: isVice,
      isNew: newSet.has(id),
      benchLabel: isBench ? benchLabels[benchIdx] : undefined,
      primaryLabel: `${(xp * mult).toFixed(1)} xPts`,
      primaryTone: isCap ? "green" : newSet.has(id) ? "amber" : "white",
      secondaryLabel: `${bd?.fixturesLabel ?? team?.short_name ?? ""} · ${formatPrice(el.now_cost)}`,
    };
  };

  const starters = opt.starters
    .map((id) => toCard(id))
    .filter((c): c is PitchCardItem => c !== null);

  const bench = opt.bench
    .map((id, i) => toCard(id, i))
    .filter((c): c is PitchCardItem => c !== null);

  const capEl = elementsMap.get(opt.captainId);

  return (
    <div className="flex flex-col gap-3">
      {/* Headline Banner */}
      <Card className="border-[#84d21c]/35 bg-[#84d21c]/[0.06] !p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              GW{gw} Solver Recommendation · {optimizer.solverEngine}
            </p>
            <h2 className="text-xl font-extrabold tracking-tight text-[#84d21c]">
              {optimizer.recommendedDecision === "ROLL"
                ? "ROLL TRANSFER"
                : `MAKE ${opt.transfers.length} TRANSFER${opt.transfers.length > 1 ? "S" : ""}`}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <Pill className="bg-[#84d21c] text-[#000000]">
              Estimate · {opt.confidence}% confidence
            </Pill>
          </div>
        </div>

        {/* Horizon selector (default 5, adjustable 1..10) */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-xs">
          <span className="text-slate-300">
            Optimization Horizon:{" "}
            <strong className="text-white">{horizon} GWs</strong> · Formation{" "}
            <strong className="text-white">{opt.formation}</strong>
          </span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 5, 8, 10].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onChangeHorizon(h)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                  horizon === h
                    ? "bg-[#84d21c] text-[#000000]"
                    : "bg-white/10 text-slate-300 hover:bg-white/20"
                }`}
              >
                {h}GW
              </button>
            ))}
          </div>
        </div>

        {/* Why line linking to Verdict numbers */}
        <p className="mt-2 text-xs leading-snug text-slate-200">{opt.whyLine}</p>
        {onOpenVerdict || onOpenPlanner ? (
          <div className="mt-2 flex gap-2">
            {onOpenVerdict ? (
              <button
                type="button"
                onClick={onOpenVerdict}
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
              >
                See full Verdict numbers →
              </button>
            ) : null}
            {onOpenPlanner ? (
              <button
                type="button"
                onClick={onOpenPlanner}
                className="rounded-lg border border-[#84d21c]/40 bg-[#84d21c]/10 px-2.5 py-1 text-[11px] font-semibold text-[#84d21c] hover:bg-[#84d21c]/20"
              >
                Customize in Planner →
              </button>
            ) : null}
          </div>
        ) : null}
      </Card>

      {/* Expected Points Breakdown: XI, Captain, Total */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox
          label="Starting XI xPts"
          value={`${opt.xiXPts.toFixed(1)}`}
          sub="11 starters (Estimate)"
        />
        <StatBox
          label={`Captain (${capEl?.web_name ?? "C"})`}
          value={`+${opt.captainXPts.toFixed(1)}`}
          sub={`2× (${(opt.captainXPts * 2).toFixed(1)} total)`}
        />
        <StatBox
          label={`GW${gw} Total xPts`}
          value={`${opt.totalXPts.toFixed(1)}`}
          accent
          sub={
            opt.hitCost > 0
              ? `Includes −${opt.hitCost} hit`
              : `Bench: ${opt.benchXPts.toFixed(1)} xPts`
          }
        />
      </div>

      {/* Advised Transfers Card (if TRANSFER) */}
      {opt.transfers.length > 0 ? (
        <Card className="!p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[#84d21c]">
              Advised Transfer{opt.transfers.length > 1 ? "s" : ""} (Marked NEW on Pitch)
            </p>
            <Pill className="bg-white/10 text-slate-200">
              Cost: {opt.hitCost > 0 ? `−${opt.hitCost} pts` : "Free (0 pts)"} · Net{" "}
              {optimizer.winner.netGainVsRoll >= 0 ? "+" : ""}
              {optimizer.winner.netGainVsRoll.toFixed(2)} xPts
            </Pill>
          </div>
          <div className="flex flex-col gap-2">
            {opt.transfers.map((m, i) => {
              const outEl = elementsMap.get(m.outId);
              const inEl = elementsMap.get(m.inId);
              const outT = outEl ? teamsMap.get(outEl.team) : undefined;
              const inT = inEl ? teamsMap.get(inEl.team) : undefined;
              if (!outEl || !inEl) return null;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.05] p-2.5 text-xs"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <PlayerPhoto
                      code={outEl.code}
                      alt={outEl.web_name}
                      className="h-10 w-8 object-cover"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <TeamBadge
                          code={outT?.code}
                          shortName={outT?.short_name}
                          className="h-3.5 w-3.5"
                        />
                        <span className="truncate font-bold text-rose-300">
                          OUT: {outEl.web_name}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Sell {formatPrice(m.sellingPrice)} ·{" "}
                        {m.xPtsOutNextGw.toFixed(1)} xPts
                      </p>
                    </div>
                  </div>
                  <div className="text-center">
                    <span className="rounded bg-[#84d21c]/20 px-1.5 py-0.5 text-[10px] font-extrabold text-[#84d21c]">
                      +{m.xPtsGainNextGw.toFixed(1)} GW
                    </span>
                    <p className="mt-0.5 text-[9px] text-slate-400">
                      +{m.xPtsGainHorizon.toFixed(1)} ({horizon}GW)
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
                    <div className="min-w-0">
                      <div className="flex items-center justify-end gap-1">
                        <TeamBadge
                          code={inT?.code}
                          shortName={inT?.short_name}
                          className="h-3.5 w-3.5"
                        />
                        <span className="truncate font-bold text-[#84d21c]">
                          IN: {inEl.web_name}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Buy {formatPrice(m.buyPrice)} ·{" "}
                        {m.xPtsInNextGw.toFixed(1)} xPts
                      </p>
                    </div>
                    <PlayerPhoto
                      code={inEl.code}
                      alt={inEl.web_name}
                      className="h-10 w-8 object-cover"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {/* Pitch View: Start 11 + Numbered Bench */}
      <Pitch
        starters={starters}
        bench={bench}
        benchTitle="Optimized Bench Order (1. GK · 2. 1st Sub · 3. 2nd Sub · 4. 3rd Sub)"
      />
    </div>
  );
}
