"use client";

import { Card, Pill } from "@/components/ui";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { TeamBadge } from "@/components/TeamBadge";
import {
  captainDecision,
  computeRankImpacts,
  explainStats,
  perfVsSeason,
} from "@/lib/explain";
import { formatPrice, POSITIONS } from "@/lib/helpers";
import { solveLineupTS } from "@/lib/lineup";
import type {
  Fixture,
  LiveElementStats,
  PicksResponse,
  SlimElement,
  SlimTeam,
} from "@/lib/types";

const PERF_STYLE = {
  HIGH: "bg-[#84d21c]/20 text-[#84d21c]",
  AVERAGE: "bg-slate-400/20 text-slate-300",
  LOW: "bg-rose-500/20 text-rose-300",
} as const;

function multLabel(p: PicksResponse["picks"][number]): string | null {
  if (p.multiplier === 3) return "TC ×3";
  if (p.is_captain) return "C ×2";
  if (p.is_vice_captain) return "VC";
  if (p.position >= 12) return "Bench";
  return null;
}

function MiniPlayerBadge({
  el,
  teamsMap,
  extra,
}: {
  el: SlimElement | null | undefined;
  teamsMap: Map<number, SlimTeam>;
  extra?: string;
}) {
  if (!el) return <span className="text-slate-400">—</span>;
  const team = teamsMap.get(el.team);
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-white/[0.07] px-1.5 py-0.5 text-xs font-semibold text-white">
      <PlayerPhoto code={el.code} alt={el.web_name} className="h-4 w-3.5 object-cover" />
      <TeamBadge code={team?.code} shortName={team?.short_name} className="h-3.5 w-3.5" />
      <span>{el.web_name}</span>
      {extra ? <span className="text-[10px] text-[#84d21c]">{extra}</span> : null}
    </span>
  );
}

export function ExplainView({
  gw,
  picks,
  elements,
  elementsMap,
  teamsMap,
  liveMap,
  gwFixtures,
  sellingPrices,
}: {
  gw: number;
  picks: PicksResponse;
  elements: SlimElement[];
  elementsMap: Map<number, SlimElement>;
  teamsMap: Map<number, SlimTeam>;
  liveMap: Map<number, LiveElementStats>;
  gwFixtures: Fixture[];
  sellingPrices?: Record<number, number>;
}) {
  const { gained, cost } = computeRankImpacts(picks, elements, liveMap);
  const cap = captainDecision(picks, elementsMap, liveMap);
  const benchLost = picks.entry_history.points_on_bench;
  const autosubGain = picks.automatic_subs.reduce(
    (sum, s) => sum + (liveMap.get(s.element_in)?.total_points ?? 0),
    0,
  );

  // ---- Section 1.4: HINDSIGHT VERDICT calculations ----
  const actualPtsMap: Record<number, number> = {};
  for (const el of elements) {
    actualPtsMap[el.id] = liveMap.get(el.id)?.total_points ?? 0;
  }

  const squadIds = picks.picks.map((p) => p.element);
  const starters = picks.picks.filter((p) => p.position <= 11);
  const bench = picks.picks
    .filter((p) => p.position >= 12)
    .sort((a, b) => a.position - b.position);

  const hitTaken = picks.entry_history.event_transfers_cost ?? 0;
  const myRawScore = picks.picks.reduce(
    (s, p) => s + (actualPtsMap[p.element] ?? 0) * p.multiplier,
    0,
  );
  const myScore = myRawScore - hitTaken;

  // Step 1: Captain swap within actual squad
  const capGain = Math.max(0, -cap.delta);

  // Step 2: Best single Starting XI swap (same position bench -> starter)
  let bestSwapBench: SlimElement | null = null;
  let bestSwapStarter: SlimElement | null = null;
  let bestSwapGain = 0;
  for (const b of bench) {
    const bEl = elementsMap.get(b.element);
    if (!bEl) continue;
    const bPts = actualPtsMap[b.element] ?? 0;
    for (const st of starters) {
      const stEl = elementsMap.get(st.element);
      if (!stEl || stEl.element_type !== bEl.element_type) continue;
      const stPts = actualPtsMap[st.element] ?? 0;
      if (bPts - stPts > bestSwapGain) {
        bestSwapGain = bPts - stPts;
        bestSwapBench = bEl;
        bestSwapStarter = stEl;
      }
    }
  }

  // Step 3: Optimal valid formation & XI from the same 15 players
  const hindsightOptimal = solveLineupTS(
    squadIds,
    elementsMap,
    actualPtsMap,
    picks.active_chip === "bboost",
    picks.active_chip === "3xc",
  );
  const currentXiPts = starters.reduce((s, p) => s + (actualPtsMap[p.element] ?? 0), 0);
  const formationTotalXiGain = Math.max(0, hindsightOptimal.xiXPts - currentXiPts);
  const extraFormationGainBeyondSingleSwap = Math.max(
    0,
    formationTotalXiGain - bestSwapGain,
  );

  // Step 4: Bench order fix (if a starter had 0 minutes and a higher-scoring bench outfield player was behind a lower-scoring one)
  const zeroMinOutfieldStarters = starters.filter((st) => {
    const el = elementsMap.get(st.element);
    const mins = liveMap.get(st.element)?.minutes ?? 0;
    return el && el.element_type >= 2 && mins === 0;
  }).length;
  const benchOutfield = bench
    .filter((b) => (elementsMap.get(b.element)?.element_type ?? 1) >= 2)
    .map((b) => ({
      el: elementsMap.get(b.element)!,
      pts: actualPtsMap[b.element] ?? 0,
      mins: liveMap.get(b.element)?.minutes ?? 0,
    }));
  const playedBenchActualOrder = benchOutfield.filter((b) => b.mins > 0);
  const playedBenchBestOrder = [...playedBenchActualOrder].sort((a, b) => b.pts - a.pts);
  const benchOrderFixGain =
    zeroMinOutfieldStarters > 0
      ? Math.max(
          0,
          playedBenchBestOrder
            .slice(0, zeroMinOutfieldStarters)
            .reduce((s, b) => s + b.pts, 0) -
            playedBenchActualOrder
              .slice(0, zeroMinOutfieldStarters)
              .reduce((s, b) => s + b.pts, 0),
        )
      : 0;

  // Best possible score with the SAME 15-man team (optimal XI + optimal captain - any hits already taken)
  const bestSameTeamScore = Math.round(hindsightOptimal.totalXPts - hitTaken);

  // Step 5: Best single transfer available last deadline (respecting budget + selling price + max 3 per club)
  const bank = picks.entry_history.bank ?? 0;
  const clubCounts = new Map<number, number>();
  for (const id of squadIds) {
    const el = elementsMap.get(id);
    if (el) clubCounts.set(el.team, (clubCounts.get(el.team) ?? 0) + 1);
  }
  const squadSet = new Set(squadIds);
  // If the manager made 0 transfers in this GW, they had at least 1 FT available (cost 0); otherwise an extra transfer costs -4
  const extraTransferCost = (picks.entry_history.event_transfers ?? 0) === 0 ? 0 : 4;

  let bestTrOut: SlimElement | null = null;
  let bestTrIn: SlimElement | null = null;
  let bestTrRawGain = 0;

  // Pre-take top 25 scorers per position in this GW to keep search instant
  const topByPos = new Map<number, SlimElement[]>();
  for (const pos of [1, 2, 3, 4]) {
    topByPos.set(
      pos,
      elements
        .filter((e) => e.element_type === pos && !squadSet.has(e.id))
        .sort((a, b) => (actualPtsMap[b.id] ?? 0) - (actualPtsMap[a.id] ?? 0))
        .slice(0, 20),
    );
  }

  for (const st of starters) {
    const outEl = elementsMap.get(st.element);
    if (!outEl) continue;
    const sellPrice = sellingPrices?.[outEl.id] ?? outEl.now_cost;
    const budget = sellPrice + bank;
    const outPts = actualPtsMap[outEl.id] ?? 0;
    const cands = topByPos.get(outEl.element_type) ?? [];
    for (const inEl of cands) {
      if (inEl.now_cost > budget) continue;
      const clubAfter =
        (clubCounts.get(inEl.team) ?? 0) - (inEl.team === outEl.team ? 1 : 0);
      if (clubAfter >= 3) continue;
      const inPts = actualPtsMap[inEl.id] ?? 0;
      const gain = inPts - outPts;
      if (gain > bestTrRawGain) {
        bestTrRawGain = gain;
        bestTrOut = outEl;
        bestTrIn = inEl;
      }
    }
  }
  const bestTrNetGain = bestTrRawGain - extraTransferCost;
  const bestWithOneTransferScore =
    bestSameTeamScore + Math.max(0, bestTrNetGain);
  const pointsLeftOnTable = Math.max(0, bestSameTeamScore - myScore);

  // Step 6: Chip hindsight (Bench Boost vs Triple Captain vs base score)
  const benchTotalPts = bench.reduce(
    (s, b) => s + (actualPtsMap[b.element] ?? 0),
    0,
  );
  const tcExtraPts = cap.bestPoints; // extra 1x on the best player in the squad
  const chipPaidOff =
    benchTotalPts >= 12 || tcExtraPts >= 12
      ? benchTotalPts >= tcExtraPts
        ? {
            paid: true,
            text: `Bench Boost would have added +${benchTotalPts} pts (total ${myScore + benchTotalPts} pts vs base ${myScore} pts); Triple Captain on ${cap.best?.web_name ?? "best pick"} would have added +${tcExtraPts} pts.`,
          }
        : {
            paid: true,
            text: `Triple Captain on ${cap.best?.web_name ?? "best pick"} would have added +${tcExtraPts} pts (total ${myScore + tcExtraPts} pts vs base ${myScore} pts); Bench Boost would have added +${benchTotalPts} pts.`,
          }
      : {
          paid: false,
          text: `No chip would have beaten the base score by a chip-worthy margin (Bench Boost +${benchTotalPts} pts, Triple Captain +${tcExtraPts} pts vs +12 pt chip threshold; base score ${myScore} pts).`,
        };

  // League-wide best captain & highest-scoring player at each position (GKP, DEF, MID, FWD)
  const highestByPos = [1, 2, 3, 4].map((pos) => {
    const top = elements
      .filter((e) => e.element_type === pos)
      .sort((a, b) => (actualPtsMap[b.id] ?? 0) - (actualPtsMap[a.id] ?? 0))[0];
    return { pos, el: top ?? null, pts: top ? (actualPtsMap[top.id] ?? 0) : 0 };
  });
  const leagueBestCaptain = [...highestByPos].sort((a, b) => b.pts - a.pts)[0] ?? null;

  const sorted = [...picks.picks].sort((a, b) => a.position - b.position);

  return (
    <div className="flex flex-col gap-3">
      {/* Section 1.3 Heading + GW Fixtures list with badges */}
      <Card className="!p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold tracking-tight text-white">
            Gameweek {gw} Analysis
          </h2>
          <Pill className="bg-white/10 text-slate-300">
            {gwFixtures.length} fixtures
          </Pill>
        </div>
        <p className="mt-0.5 text-[10px] text-slate-400">
          Gameweek {gw} matches (Team A v Team B) &amp; hindsight breakdown
        </p>
        {gwFixtures.length > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-2">
            {gwFixtures.map((f) => {
              const h = teamsMap.get(f.team_h);
              const a = teamsMap.get(f.team_a);
              const scoreStr =
                f.started || f.finished
                  ? `${f.team_h_score ?? 0}–${f.team_a_score ?? 0}`
                  : "v";
              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px]"
                >
                  <span className="flex items-center gap-1 font-semibold text-slate-200">
                    <TeamBadge
                      code={h?.code}
                      shortName={h?.short_name}
                      className="h-3.5 w-3.5"
                    />
                    {h?.short_name ?? "HOM"}
                  </span>
                  <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-[#84d21c]">
                    {scoreStr}
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-slate-200">
                    {a?.short_name ?? "AWY"}
                    <TeamBadge
                      code={a?.code}
                      shortName={a?.short_name}
                      className="h-3.5 w-3.5"
                    />
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>

      {/* Section 1.4: HINDSIGHT VERDICT */}
      <Card className="border-fuchsia-400/30 bg-fuchsia-950/15 !p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-extrabold uppercase tracking-wider text-[#84d21c]">
            Hindsight Verdict (Same 15 Players &amp; FT State)
          </p>
          <Pill className="bg-white/10 text-slate-300">GW{gw}</Pill>
        </div>

        <ol className="flex flex-col gap-2 text-xs text-slate-200">
          {/* 1. Captain */}
          <li className="rounded-xl bg-white/[0.05] p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-bold text-slate-300">1. Captain:</span>
              <span className="font-extrabold text-[#84d21c]">
                +{capGain} pts
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span>C</span>
              <MiniPlayerBadge
                el={cap.captain}
                teamsMap={teamsMap}
                extra={`${cap.captainPoints} pts`}
              />
              <span>→</span>
              <MiniPlayerBadge
                el={cap.best}
                teamsMap={teamsMap}
                extra={`${cap.bestPoints} pts`}
              />
              <span className="text-[11px] text-slate-400">
                ({capGain > 0 ? `+${capGain} pts gained` : "already optimal"})
              </span>
            </div>
          </li>

          {/* 2. Starting XI swap */}
          <li className="rounded-xl bg-white/[0.05] p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-bold text-slate-300">2. Starting XI swap:</span>
              <span className="font-extrabold text-[#84d21c]">
                +{bestSwapGain} pts
              </span>
            </div>
            {bestSwapBench && bestSwapStarter && bestSwapGain > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span>Bench</span>
                <MiniPlayerBadge
                  el={bestSwapBench}
                  teamsMap={teamsMap}
                  extra={`${actualPtsMap[bestSwapBench.id] ?? 0} pts`}
                />
                <span>in,</span>
                <MiniPlayerBadge
                  el={bestSwapStarter}
                  teamsMap={teamsMap}
                  extra={`${actualPtsMap[bestSwapStarter.id] ?? 0} pts`}
                />
                <span>out (+{bestSwapGain} pts)</span>
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">
                No same-position bench player outscored your starters (+0 pts).
              </p>
            )}
          </li>

          {/* 3. Formation change */}
          <li className="rounded-xl bg-white/[0.05] p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-bold text-slate-300">
                3. Formation change to {hindsightOptimal.formation}:
              </span>
              <span className="font-extrabold text-[#84d21c]">
                +{formationTotalXiGain} pts total XI (+{extraFormationGainBeyondSingleSwap} beyond swap)
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Best valid XI in {hindsightOptimal.formation} scores{" "}
              {hindsightOptimal.xiXPts} raw XI pts vs your {currentXiPts} raw XI pts.
            </p>
          </li>

          {/* 4. Bench order fix */}
          <li className="rounded-xl bg-white/[0.05] p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-bold text-slate-300">4. Bench order fix:</span>
              <span className="font-extrabold text-[#84d21c]">
                +{benchOrderFixGain} pts
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {benchOrderFixGain > 0
                ? `Reordering bench to put ${playedBenchBestOrder[0]?.el.web_name ?? "top sub"} first would have gained +${benchOrderFixGain} auto-sub pts.`
                : "Bench order did not cost any auto-sub points (+0 pts)."}
            </p>
          </li>

          {/* 5. Best single transfer available last deadline */}
          <li className="rounded-xl bg-white/[0.05] p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-bold text-slate-300">
                5. Best single transfer available last deadline:
              </span>
              <span className="font-extrabold text-[#84d21c]">
                +{bestTrRawGain} pts (cost −{extraTransferCost}, net{" "}
                {bestTrNetGain >= 0 ? `+${bestTrNetGain}` : bestTrNetGain} pts)
              </span>
            </div>
            {bestTrOut && bestTrIn ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span>Out</span>
                <MiniPlayerBadge
                  el={bestTrOut}
                  teamsMap={teamsMap}
                  extra={`${actualPtsMap[bestTrOut.id] ?? 0} pts`}
                />
                <span>→ In</span>
                <MiniPlayerBadge
                  el={bestTrIn}
                  teamsMap={teamsMap}
                  extra={`${actualPtsMap[bestTrIn.id] ?? 0} pts · ${formatPrice(bestTrIn.now_cost)}`}
                />
              </div>
            ) : null}
          </li>

          {/* 6. Chip */}
          <li className="rounded-xl bg-white/[0.05] p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-bold text-slate-300">6. Chip evaluation:</span>
              <span
                className={`font-extrabold ${
                  chipPaidOff.paid ? "text-[#84d21c]" : "text-slate-400"
                }`}
              >
                {chipPaidOff.paid ? "Would have paid off" : "Hold was right"}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-300">{chipPaidOff.text}</p>
          </li>
        </ol>

        {/* Summary totals */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              My Score
            </p>
            <p className="text-lg font-extrabold text-white">{myScore} pts</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Best w/ Same Team
            </p>
            <p className="text-lg font-extrabold text-[#84d21c]">
              {bestSameTeamScore} pts
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Best w/ 1 Transfer
            </p>
            <p className="text-lg font-extrabold text-sky-300">
              {bestWithOneTransferScore} pts
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Left on the Table
            </p>
            <p className="text-lg font-extrabold text-amber-300">
              {pointsLeftOnTable} pts
            </p>
          </div>
        </div>

        {/* League-wide best captain & top scorer at each position */}
        <div className="mt-3 border-t border-white/10 pt-2.5">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            League-wide benchmarks (GW{gw})
          </p>
          {leagueBestCaptain?.el ? (
            <div className="mb-2 flex flex-wrap items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs">
              <span className="text-slate-300">League-wide best Captain:</span>
              <MiniPlayerBadge
                el={leagueBestCaptain.el}
                teamsMap={teamsMap}
                extra={`${leagueBestCaptain.pts * 2} pts (2×${leagueBestCaptain.pts})`}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {highestByPos.map(({ pos, el, pts }) => (
              <div
                key={pos}
                className="flex flex-col gap-1 rounded-lg bg-white/[0.04] p-2 text-xs"
              >
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Top {POSITIONS[pos]}
                </span>
                <MiniPlayerBadge el={el} teamsMap={teamsMap} extra={`${pts} pts`} />
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Captain decision summary */}
      <Card>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Captain &amp; bench summary
        </p>
        {cap.captain ? (
          <>
            <p className="text-sm">
              You captained{" "}
              <span className="font-bold">{cap.captain.web_name}</span> (
              {cap.captainPoints} pts × {cap.multiplier}).{" "}
              {cap.best && cap.best.id !== cap.captain.id && cap.delta < 0 ? (
                <>
                  Best available in squad was{" "}
                  <span className="font-bold">{cap.best.web_name}</span> (
                  {cap.bestPoints} pts).
                </>
              ) : (
                "That was the best pick in your squad. 🎯"
              )}
            </p>
            <p
              className={`mt-1 text-lg font-extrabold ${
                cap.delta < 0 ? "text-rose-400" : "text-[#84d21c]"
              }`}
            >
              {cap.delta < 0
                ? `${cap.delta} pts vs best captain`
                : `Optimal captaincy (+0 lost)`}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400">No captain data.</p>
        )}
        <div className="mt-2 flex gap-2 text-xs text-slate-400">
          <Pill className="bg-white/10">
            Bench points lost:{" "}
            <span className="font-bold text-slate-200">{benchLost}</span>
          </Pill>
          <Pill className="bg-white/10">
            Auto-subs gained:{" "}
            <span className="font-bold text-slate-200">+{autosubGain}</span>
          </Pill>
        </div>
      </Card>

      {/* Rank impact lists */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#84d21c]">
              ▲ Gained me rank
            </p>
            <span className="text-[9px] text-slate-500">
              proxy, not top-10k EO
            </span>
          </div>
          {gained.length === 0 ? (
            <p className="text-sm text-slate-500">No meaningful gains yet.</p>
          ) : (
            gained.map((i) => {
              const t = teamsMap.get(i.element.team);
              return (
                <div
                  key={i.element.id}
                  className="mb-1.5 flex items-center gap-2 last:mb-0"
                >
                  <PlayerPhoto
                    code={i.element.code}
                    alt=""
                    className="h-8 w-6 object-cover"
                  />
                  <TeamBadge
                    code={t?.code}
                    shortName={t?.short_name}
                    className="h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {i.element.web_name}
                      {!i.owned ? (
                        <span className="ml-1 text-[9px] text-slate-500">
                          (not owned)
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {i.gwPoints} pts · you ×{i.myMultiplier} vs field{" "}
                      {(i.eo * 100).toFixed(1)}%
                    </p>
                  </div>
                  <span className="text-sm font-bold text-[#84d21c]">
                    +{i.impact.toFixed(1)}
                  </span>
                </div>
              );
            })
          )}
        </Card>
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">
              ▼ Cost me rank
            </p>
            <span className="text-[9px] text-slate-500">
              proxy, not top-10k EO
            </span>
          </div>
          {cost.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing hurt you badly.</p>
          ) : (
            cost.map((i) => {
              const t = teamsMap.get(i.element.team);
              return (
                <div
                  key={i.element.id}
                  className="mb-1.5 flex items-center gap-2 last:mb-0"
                >
                  <PlayerPhoto
                    code={i.element.code}
                    alt=""
                    className="h-8 w-6 object-cover"
                  />
                  <TeamBadge
                    code={t?.code}
                    shortName={t?.short_name}
                    className="h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {i.element.web_name}
                      {!i.owned ? (
                        <span className="ml-1 text-[9px] text-amber-300">
                          (not owned — hauled)
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {i.gwPoints} pts · you ×{i.myMultiplier} vs field{" "}
                      {(i.eo * 100).toFixed(1)}%
                    </p>
                  </div>
                  <span className="text-sm font-bold text-rose-400">
                    {i.impact.toFixed(1)}
                  </span>
                </div>
              );
            })
          )}
        </Card>
      </div>

      {/* Per-player explanations */}
      <Card className="!p-3">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Points explained, player by player
        </p>
        <div className="flex flex-col gap-2">
          {sorted.map((p) => {
            const el = elementsMap.get(p.element);
            if (!el) return null;
            const team = teamsMap.get(el.team);
            const stats = liveMap.get(p.element);
            const rawPts = stats?.total_points ?? 0;
            const shownPts =
              rawPts * Math.max(p.multiplier, p.position >= 12 ? 1 : p.multiplier);
            const perf = perfVsSeason(rawPts, el);
            const ml = multLabel(p);
            return (
              <div
                key={p.element}
                className={`flex items-start gap-2.5 rounded-xl px-2.5 py-2 ${
                  p.position >= 12
                    ? "bg-white/[0.02] opacity-75"
                    : "bg-white/[0.05]"
                }`}
              >
                <PlayerPhoto
                  code={el.code}
                  alt={el.web_name}
                  className="mt-0.5 h-10 w-8 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TeamBadge
                      code={team?.code}
                      shortName={team?.short_name}
                      className="h-3.5 w-3.5"
                    />
                    <p className="truncate text-sm font-bold">{el.web_name}</p>
                    {ml ? (
                      <span className="rounded bg-[#37003c] px-1 py-0.5 text-[9px] font-bold text-fuchsia-200">
                        {ml}
                      </span>
                    ) : null}
                    <span
                      className={`rounded px-1 py-0.5 text-[9px] font-bold ${PERF_STYLE[perf]}`}
                    >
                      {perf}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                    {explainStats(stats, el, rawPts > 0)}
                  </p>
                  <p className="text-[9px] text-slate-500">
                    season avg {el.points_per_game}/gm
                  </p>
                </div>
                <span
                  className={`text-base font-extrabold ${
                    p.multiplier >= 2 ? "text-[#84d21c]" : "text-slate-100"
                  }`}
                >
                  {p.position >= 12 ? rawPts : shownPts}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
