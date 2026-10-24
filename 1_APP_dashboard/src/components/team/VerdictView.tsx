"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Pill } from "@/components/ui";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { TeamBadge } from "@/components/TeamBadge";
import { MonteCarloPanel } from "./MonteCarloPanel";
import { chipLabel, formatPrice, POSITIONS } from "@/lib/helpers";
import type {
  EntryResponse,
  OptimizerResponse,
  PicksResponse,
  SlimElement,
  SlimEvent,
  SlimTeam,
} from "@/lib/types";

function useCountdown(deadline: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return "Deadline passed";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
}

export function VerdictView({
  entry,
  picks,
  elements,
  elementsMap,
  teamsMap,
  events,
  optimizer,
  nextGw,
  onRetry,
}: {
  entry: EntryResponse;
  picks?: PicksResponse | null;
  elements: SlimElement[];
  elementsMap: Map<number, SlimElement>;
  teamsMap: Map<number, SlimTeam>;
  events: SlimEvent[];
  optimizer: OptimizerResponse;
  nextGw: number | null;
  onRetry?: () => void;
}) {
  const gw = nextGw ?? optimizer.nextGw;
  const nextEvent = events.find((e) => e.id === gw) ?? null;
  const countdown = useCountdown(nextEvent?.deadline_time ?? null);

  const resolvedPicks = picks ?? optimizer.currentPicks ?? null;
  const squadIds = useMemo(() => {
    if (resolvedPicks?.picks?.length) {
      return resolvedPicks.picks.map((p) => p.element);
    }
    return optimizer.optimizedNextGw?.squad ?? [];
  }, [resolvedPicks, optimizer.optimizedNextGw]);
  const squadSet = useMemo(() => new Set(squadIds), [squadIds]);

  // Mini-league position check (Leading vs Chasing)
  const privateLeagues = (entry.entry.leagues?.classic ?? []).filter(
    (l) => l.league_type === "x",
  );
  const primaryLeague =
    privateLeagues[0] ?? entry.entry.leagues?.classic?.[0] ?? null;
  const isLeadingMiniLeague = (primaryLeague?.entry_rank ?? 2) === 1;

  // Captain rankings: safe template (high ownership + high xPts) vs differential (<15% owned + high xPts)
  const squadRankedByXPts = useMemo(() => {
    return squadIds
      .map((id) => {
        const el = elementsMap.get(id);
        const bd = optimizer.xPtsNextGw[id];
        return el && bd ? { el, bd, owned: parseFloat(el.selected_by_percent) || 0 } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.bd.xPts - a.bd.xPts);
  }, [squadIds, elementsMap, optimizer.xPtsNextGw]);

  const safeCap =
    [...squadRankedByXPts]
      .filter((x) => x.owned >= 15)
      .sort((a, b) => b.bd.xPts * (1 + b.owned / 200) - a.bd.xPts * (1 + a.owned / 200))[0] ??
    squadRankedByXPts[0] ??
    null;

  const diffCap =
    squadRankedByXPts.find((x) => x.owned < 20 && x.el.id !== safeCap?.el.id) ??
    squadRankedByXPts[1] ??
    null;

  // Best differential to add (<10% owned) & safest template cover (>25% owned) outside squad
  const { bestDifferentialAdd, safestTemplateAdd } = useMemo(() => {
    const candidates = elements
      .filter((e) => e.element_type <= 4 && !squadSet.has(e.id) && e.status === "a")
      .map((el) => ({
        el,
        bd: optimizer.xPtsNextGw[el.id],
        owned: parseFloat(el.selected_by_percent) || 0,
      }))
      .filter((x) => !!x.bd);

    const diff =
      [...candidates]
        .filter((x) => x.owned <= 10)
        .sort((a, b) => (b.bd?.xPts ?? 0) - (a.bd?.xPts ?? 0))[0] ?? null;
    const tmpl =
      [...candidates]
        .filter((x) => x.owned >= 22)
        .sort((a, b) => (b.bd?.xPts ?? 0) - (a.bd?.xPts ?? 0))[0] ?? null;
    return { bestDifferentialAdd: diff, safestTemplateAdd: tmpl };
  }, [elements, squadSet, optimizer.xPtsNextGw]);

  // Next 48h squad injury & price watch items
  const watch48h = useMemo(() => {
    return squadIds
      .map((id) => elementsMap.get(id))
      .filter((e): e is SlimElement => !!e)
      .filter(
        (e) =>
          e.status !== "a" ||
          Boolean(e.news) ||
          Math.abs(Number(e.price_change_percent ?? 0)) >= 55,
      );
  }, [squadIds, elementsMap]);

  const bestMoveOption = optimizer.options.find((o) => o.id === "transfer1");
  const shownMoves =
    optimizer.recommendedDecision === "TRANSFER" &&
    optimizer.winner?.transfers?.length
      ? optimizer.winner.transfers
      : (bestMoveOption?.transfers ?? []);
  const bestMove = shownMoves[0] ?? null;
  const outEl = bestMove ? elementsMap.get(bestMove.outId) : null;
  const inEl = bestMove ? elementsMap.get(bestMove.inId) : null;
  const outTeam = outEl ? teamsMap.get(outEl.team) : undefined;
  const inTeam = inEl ? teamsMap.get(inEl.team) : undefined;

  const expiringChips = (optimizer.chipSimulations ?? []).filter(
    (c) => c.available && c.expiresGw <= 19,
  );

  // Explicit Empty State if required solver or squad data is missing
  if (
    !optimizer.options?.length ||
    !optimizer.winner ||
    !optimizer.optimizedNextGw ||
    !optimizer.backtest ||
    squadIds.length === 0
  ) {
    const missing: string[] = [];
    if (!optimizer.options?.length) missing.push("solver option comparisons");
    if (!optimizer.winner) missing.push("solver winner");
    if (!optimizer.optimizedNextGw) missing.push("optimized XI");
    if (!optimizer.backtest) missing.push("model backtest");
    if (squadIds.length === 0) missing.push(`squad picks for GW${optimizer.currentGw}`);
    if (elements.length === 0) missing.push("FPL player bootstrap list");
    return (
      <Card className="my-4 border-amber-400/40 bg-amber-400/10 text-center">
        <p className="text-sm font-bold text-amber-200">
          Verdict data is incomplete
        </p>
        <p className="mt-1 text-xs text-amber-100/90">
          Missing data: {missing.join(", ")}.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-full bg-gradient-to-r from-[#cda228] to-[#84d21c] px-4 py-1.5 text-xs font-extrabold text-[#000000]"
          >
            Retry Verdict
          </button>
        ) : null}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Deadline Countdown */}
      <Card className="border-[#84d21c]/30 bg-[#84d21c]/5 text-center">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          <span>GW{gw} Deadline Countdown</span>
          <Pill className="bg-white/10 text-slate-300">
            Estimate · {optimizer.optimizedNextGw.confidence}% confidence
          </Pill>
        </div>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#84d21c]">
          {countdown ?? "—"}
        </p>
        {nextEvent ? (
          <p className="text-[10px] text-slate-400">
            {new Date(nextEvent.deadline_time).toLocaleString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        ) : null}
      </Card>

      {/* Section 2.1: Transfer Decision Block */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              2.1 Transfer Decision ({optimizer.solverEngine})
            </p>
            <h2 className="text-xl font-extrabold tracking-tight">
              Decision:{" "}
              <span
                className={
                  optimizer.recommendedDecision === "TRANSFER"
                    ? "text-[#84d21c]"
                    : "text-amber-300"
                }
              >
                {optimizer.recommendedDecision}
              </span>
            </h2>
          </div>
          <div className="text-right text-xs">
            <p className="text-slate-300">
              FTs now:{" "}
              <span className="font-extrabold text-white">
                {optimizer.freeTransfersNow}
              </span>
            </p>
            <p className="text-slate-400">
              FTs after GW{gw}:{" "}
              <span className="font-bold text-[#84d21c]">
                {optimizer.recommendedDecision === "ROLL"
                  ? optimizer.freeTransfersAfterRoll
                  : optimizer.freeTransfersAfterMove}
              </span>
            </p>
          </div>
        </div>

        {optimizer.recommendedDecision === "ROLL" ? (
          <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            <p className="font-bold text-amber-300">
              ✅ No change needed — optimizer confirms ROLL is optimal.
            </p>
            <p className="mt-0.5 leading-snug">
              Best move gains{" "}
              <span className="font-bold">
                +{(bestMoveOption?.xPtsGainVsRoll ?? 0).toFixed(2)} xPts
              </span>{" "}
              (net{" "}
              <span className="font-bold">
                +{(bestMoveOption?.netGainVsRoll ?? 0).toFixed(2)} xPts
              </span>
              ), below the computed roll threshold of{" "}
              <span className="font-bold">
                +{optimizer.rollThresholdXPts.toFixed(2)} xPts
              </span>
              , so banking the transfer is worth more.
            </p>
            <p className="mt-1 text-[11px] text-amber-200/90">
              Value of banked transfer next GW (GW{gw + 1} with{" "}
              {optimizer.freeTransfersAfterRoll} FTs):{" "}
              <span className="font-bold">
                +{optimizer.bankedTransferValueNextGw.toFixed(2)} xPts
              </span>{" "}
              vs using it now (
              <span className="font-bold">
                +{(bestMoveOption?.netGainVsRoll ?? 0).toFixed(2)} xPts
              </span>
              ).
            </p>
          </div>
        ) : (
          <div className="mb-3 rounded-xl border border-[#84d21c]/30 bg-[#84d21c]/10 px-3 py-2 text-xs text-emerald-100">
            <p className="font-bold text-[#84d21c]">
              Recommended move beats the +{(optimizer.rollThresholdXPts ?? 0).toFixed(2)} xPts roll threshold:
            </p>
            <p className="mt-0.5">
              Using your transfer now nets{" "}
              <span className="font-bold">
                +{((optimizer.winner?.netGainVsRoll ?? 0)).toFixed(2)} xPts
              </span>{" "}
              (after −{optimizer.winner?.hitCost ?? 0} hit) vs banking (+
              {(optimizer.bankedTransferValueNextGw ?? 0).toFixed(2)} xPts value next GW).
            </p>
          </div>
        )}

        {/* Best transfer(s) found card with photos, badges, selling price */}
        {shownMoves.length > 0 && outEl && inEl ? (
          <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {optimizer.recommendedDecision === "TRANSFER"
                ? `Recommended transfer${shownMoves.length > 1 ? "s" : ""} found by solver (Estimate)`
                : "Best single transfer found by solver (below roll threshold)"}
            </p>
            <div className="flex flex-col gap-2">
              {shownMoves.map((mv, idx) => {
                const oE = elementsMap.get(mv.outId);
                const iE = elementsMap.get(mv.inId);
                if (!oE || !iE) return null;
                const oT = teamsMap.get(oE.team);
                const iT = teamsMap.get(iE.team);
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <PlayerPhoto
                        code={oE.code}
                        alt={oE.web_name}
                        className="h-10 w-8 object-cover"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <TeamBadge
                            code={oT?.code}
                            shortName={oT?.short_name}
                            className="h-3.5 w-3.5"
                          />
                          <span className="truncate font-bold text-rose-300">
                            OUT: {oE.web_name}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Sell {formatPrice(mv.sellingPrice)} ·{" "}
                          {mv.xPtsOutNextGw.toFixed(1)} xPts
                        </p>
                      </div>
                    </div>
                    <span className="font-bold text-slate-500">→</span>
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
                      <div className="min-w-0">
                        <div className="flex items-center justify-end gap-1">
                          <TeamBadge
                            code={iT?.code}
                            shortName={iT?.short_name}
                            className="h-3.5 w-3.5"
                          />
                          <span className="truncate font-bold text-[#84d21c]">
                            IN: {iE.web_name}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Buy {formatPrice(mv.buyPrice)} ·{" "}
                          {mv.xPtsInNextGw.toFixed(1)} xPts
                        </p>
                      </div>
                      <PlayerPhoto
                        code={iE.code}
                        alt={iE.web_name}
                        className="h-10 w-8 object-cover"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap justify-between border-t border-white/10 pt-1.5 text-[11px] text-slate-300">
              <span>
                GW{gw} gain:{" "}
                <strong className="text-[#84d21c]">
                  +
                  {shownMoves
                    .reduce((s, m) => s + m.xPtsGainNextGw, 0)
                    .toFixed(2)}{" "}
                  xPts
                </strong>
              </span>
              <span>
                {optimizer.horizon}-GW horizon gain:{" "}
                <strong className="text-[#84d21c]">
                  +
                  {shownMoves
                    .reduce((s, m) => s + m.xPtsGainHorizon, 0)
                    .toFixed(2)}{" "}
                  xPts
                </strong>
              </span>
              <span>
                Net after hit:{" "}
                <strong className="text-white">
                  +
                  {(optimizer.recommendedDecision === "TRANSFER"
                    ? (optimizer.winner?.netGainVsRoll ?? 0)
                    : (bestMoveOption?.netGainVsRoll ?? 0)
                  ).toFixed(2)}{" "}
                  xPts
                </strong>
              </span>
            </div>
          </div>
        ) : null}

        {/* Section 0.2 Option Comparison Table: (a) Roll, (b) 1 transfer, (c) 2 transfers with hit, (d) Chip */}
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Solver Option Comparison (Net Gain = xPts Gain − Hit Cost)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[9px] uppercase tracking-wider text-slate-500">
                <th className="py-1.5 text-left">Option</th>
                <th className="py-1.5 text-right">GW{gw} xPts</th>
                <th className="py-1.5 text-right">xPts Gain</th>
                <th className="py-1.5 text-right">Hit</th>
                <th className="py-1.5 text-right">Net Gain</th>
              </tr>
            </thead>
            <tbody>
              {optimizer.options.map((opt) => (
                <tr
                  key={opt.id}
                  className={`border-b border-white/5 last:border-0 ${
                    opt.winner ? "bg-[#84d21c]/10 font-bold" : ""
                  }`}
                >
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span>{opt.label}</span>
                      {opt.winner ? (
                        <span className="rounded bg-[#84d21c] px-1 py-0.5 text-[8px] font-extrabold text-[#000000]">
                          WINNER
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-1.5 text-right">
                    {opt.nextGwXPts != null ? Number(opt.nextGwXPts).toFixed(1) : "—"}
                  </td>
                  <td className="py-1.5 text-right text-slate-300">
                    {opt.xPtsGainVsRoll != null
                      ? `${opt.xPtsGainVsRoll >= 0 ? "+" : ""}${Number(opt.xPtsGainVsRoll).toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="py-1.5 text-right text-rose-300">
                    {opt.hitCost > 0 ? `−${opt.hitCost}` : "0"}
                  </td>
                  <td
                    className={`py-1.5 text-right font-bold ${
                      (opt.netGainVsRoll ?? 0) >= 0 ? "text-[#84d21c]" : "text-rose-400"
                    }`}
                  >
                    {opt.netGainVsRoll != null
                      ? `${opt.netGainVsRoll >= 0 ? "+" : ""}${Number(opt.netGainVsRoll).toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Section 2.2: Chip Decision Block */}
      <Card>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            2.2 Chip Decision Block
          </p>
          <Pill
            className={
              optimizer.recommendedChipDecision.action === "PLAY"
                ? "bg-fuchsia-500/25 text-fuchsia-200"
                : "bg-white/10 text-slate-300"
            }
          >
            {optimizer.recommendedChipDecision.action === "PLAY"
              ? `PLAY ${(chipLabel(optimizer.recommendedChipDecision.chip) ?? "CHIP").toUpperCase()}`
              : "HOLD"}
          </Pill>
        </div>
        <h3 className="text-base font-extrabold">
          {optimizer.recommendedChipDecision.action === "PLAY"
            ? `PLAY ${chipLabel(optimizer.recommendedChipDecision.chip)}`
            : "HOLD CHIPS"}
        </h3>
        <p className="mt-1 text-xs leading-snug text-slate-300">
          {optimizer.recommendedChipDecision.why}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-white/[0.04] p-2">
            <p className="text-[9px] uppercase text-slate-400">
              If played now (GW{gw})
            </p>
            <p className="text-sm font-bold text-slate-200">
              +{(Number(optimizer.recommendedChipDecision?.gainNow) || 0).toFixed(1)} xPts (Estimate)
            </p>
          </div>
          <div className="rounded-lg bg-white/[0.04] p-2">
            <p className="text-[9px] uppercase text-slate-400">
              Best future window (GW{optimizer.recommendedChipDecision?.bestFutureGw ?? "—"})
            </p>
            <p className="text-sm font-bold text-[#84d21c]">
              +{(Number(optimizer.recommendedChipDecision?.bestFutureGain) || 0).toFixed(1)} xPts (
              {chipLabel(optimizer.recommendedChipDecision?.bestFutureChip) ?? "—"})
            </p>
          </div>
        </div>
        {expiringChips.length > 0 ? (
          <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] text-amber-200">
            ⏳ First-half chip expiry deadline:{" "}
            <strong>
              {expiringChips.map((c) => chipLabel(c.chip)).join(", ")}
            </strong>{" "}
            must be used by{" "}
            <strong>
              GW{expiringChips[0].expiresGw} (
              {expiringChips[0].expiryDeadline
                ? new Date(expiringChips[0].expiryDeadline).toLocaleDateString(
                    undefined,
                    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
                  )
                : "GW19 deadline"}
              )
            </strong>
            .
          </div>
        ) : null}
      </Card>

      {/* Section 2.3: Action Plan (Captain Safe vs Differential, Chasing vs Leading target, 48h Watch) */}
      <Card>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          2.3 Tactical Action Plan (Captain, Strategy &amp; 48h Watch)
        </p>

        {/* Safe vs Differential Captain */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {safeCap ? (
            <div className="rounded-xl bg-white/[0.05] p-2.5">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="font-bold uppercase text-[#84d21c]">
                  Safe Template Captain
                </span>
                <span>{safeCap.bd.confidence}% conf.</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <PlayerPhoto
                  code={safeCap.el.code}
                  alt={safeCap.el.web_name}
                  className="h-10 w-8 object-cover"
                />
                <TeamBadge
                  code={teamsMap.get(safeCap.el.team)?.code}
                  shortName={teamsMap.get(safeCap.el.team)?.short_name}
                  className="h-4 w-4"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    Ⓒ {safeCap.el.web_name}
                  </p>
                  <p className="text-[10px] text-slate-300">
                    <strong>{safeCap.bd.xPts.toFixed(1)} xPts</strong> (Estimate) ·
                    FPL ep {safeCap.bd.epNext.toFixed(1)} · {safeCap.owned}% owned
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {diffCap ? (
            <div className="rounded-xl bg-white/[0.05] p-2.5">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="font-bold uppercase text-fuchsia-300">
                  Differential Captain
                </span>
                <span>{diffCap.bd.confidence}% conf.</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <PlayerPhoto
                  code={diffCap.el.code}
                  alt={diffCap.el.web_name}
                  className="h-10 w-8 object-cover"
                />
                <TeamBadge
                  code={teamsMap.get(diffCap.el.team)?.code}
                  shortName={teamsMap.get(diffCap.el.team)?.short_name}
                  className="h-4 w-4"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    Ⓥ {diffCap.el.web_name}
                  </p>
                  <p className="text-[10px] text-slate-300">
                    <strong>{diffCap.bd.xPts.toFixed(1)} xPts</strong> (Estimate) ·
                    FPL ep {diffCap.bd.epNext.toFixed(1)} · {diffCap.owned}% owned
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Mini-league Chasing vs Leading target */}
        <div className="mt-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-xs">
          <p className="font-bold text-slate-200">
            Mini-league stance:{" "}
            <span className="text-[#84d21c]">
              {isLeadingMiniLeague
                ? `Leading (${primaryLeague?.name ?? "League"} #1) — Protect rank`
                : `Chasing (${primaryLeague ? `${primaryLeague.name} #${primaryLeague.entry_rank ?? "—"}` : "Overall climb"}) — Seek upside`}
            </span>
          </p>
          {isLeadingMiniLeague && safestTemplateAdd ? (
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-slate-300">
                Safest template cover:{" "}
                <strong>{safestTemplateAdd.el.web_name}</strong> (
                {POSITIONS[safestTemplateAdd.el.element_type]},{" "}
                {formatPrice(safestTemplateAdd.el.now_cost)},{" "}
                {safestTemplateAdd.owned}% owned)
              </span>
              <span className="font-bold text-[#84d21c]">
                {safestTemplateAdd.bd?.xPts.toFixed(1)} xPts
              </span>
            </div>
          ) : bestDifferentialAdd ? (
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-slate-300">
                Best differential to add:{" "}
                <strong>{bestDifferentialAdd.el.web_name}</strong> (
                {POSITIONS[bestDifferentialAdd.el.element_type]},{" "}
                {formatPrice(bestDifferentialAdd.el.now_cost)}, only{" "}
                {bestDifferentialAdd.owned}% owned)
              </span>
              <span className="font-bold text-[#84d21c]">
                {bestDifferentialAdd.bd?.xPts.toFixed(1)} xPts
              </span>
            </div>
          ) : null}
        </div>

        {/* Next 48h squad injury & price watch */}
        <div className="mt-2.5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Next 48 Hours Squad Watch (Injuries &amp; Price Moves)
          </p>
          {watch48h.length === 0 ? (
            <p className="text-xs text-slate-400">
              All 15 squad players are fit and outside the ±55% overnight price-change zone.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {watch48h.map((el) => {
                const t = teamsMap.get(el.team);
                const pct = Number(el.price_change_percent ?? 0) || 0;
                return (
                  <div
                    key={el.id}
                    className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs"
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      <PlayerPhoto
                        code={el.code}
                        alt={el.web_name}
                        className="h-6 w-5 object-cover"
                      />
                      <TeamBadge
                        code={t?.code}
                        shortName={t?.short_name}
                        className="h-3.5 w-3.5"
                      />
                      {el.web_name}
                    </span>
                    <span className="text-[11px] text-amber-200">
                      {el.news
                        ? `${el.news} (${el.chance_of_playing_next_round ?? "?"}%)`
                        : pct > 0
                          ? `Price ▲ ${pct.toFixed(0)}% progress`
                          : `Price ▼ ${pct.toFixed(0)}% progress`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Section 0.2 Monte Carlo risk view */}
      {optimizer.monteCarlo ? (
        <MonteCarloPanel monteCarlo={optimizer.monteCarlo} elementsMap={elementsMap} />
      ) : null}

      {/* Section 0.1 Model Accuracy Panel */}
      <Card className="!p-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Section 0.1 Core xPts Model Accuracy (Backtest)
          </p>
          <Pill
            className={
              optimizer.backtest?.quality === "good"
                ? "bg-[#84d21c]/15 text-[#84d21c]"
                : optimizer.backtest?.quality === "moderate"
                  ? "bg-amber-400/20 text-amber-200"
                  : "bg-rose-500/20 text-rose-200"
            }
          >
            MAE {(optimizer.backtest?.mae ?? 0).toFixed(2)} pts · Estimate
          </Pill>
        </div>
        <p className="mt-1 text-xs text-slate-300">
          {optimizer.backtest?.verdict ?? "Backtest calibrating."}
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-[10px]">
          <div className="rounded bg-white/[0.04] p-1.5">
            <span className="block text-slate-500">Our MAE</span>
            <strong className="text-white">{optimizer.backtest?.mae ?? "—"} pts</strong>
          </div>
          <div className="rounded bg-white/[0.04] p-1.5">
            <span className="block text-slate-500">Baseline MAE</span>
            <strong className="text-slate-300">
              {optimizer.backtest?.epNextMae ?? "—"} pts
            </strong>
          </div>
          <div className="rounded bg-white/[0.04] p-1.5">
            <span className="block text-slate-500">Within ±2</span>
            <strong className="text-[#84d21c]">
              {optimizer.backtest?.within2PtsPct ?? "—"}%
            </strong>
          </div>
          <div className="rounded bg-white/[0.04] p-1.5">
            <span className="block text-slate-500">Solver time</span>
            <strong className="text-slate-200">{optimizer.solverRunMs} ms</strong>
          </div>
        </div>
      </Card>

      {/* Section 2.4: One-line Summary + Confidence % */}
      <Card className="border-[#84d21c]/40 bg-[#84d21c]/10 !p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-white">
            Summary: {optimizer.optimizedNextGw?.whyLine ?? "Not enough data"}
          </p>
          <Pill className="shrink-0 bg-[#84d21c] text-[#000000]">
            {optimizer.optimizedNextGw?.confidence ?? "—"}% Estimate
          </Pill>
        </div>
      </Card>
    </div>
  );
}
