"use client";

import { useMemo, useState } from "react";
import { Card, Pill } from "@/components/ui";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import type {
  McBand,
  McPathSummary,
  MonteCarloSummary,
  SlimElement,
} from "@/lib/types";

const pct = (p: number | null | undefined) =>
  p === null || p === undefined ? "n/a" : `${Math.round(p * 100)}%`;

const signed = (n: number | null | undefined, digits = 1) => {
  if (n === null || n === undefined) return "n/a";
  return `${n >= 0 ? "+" : "\u2212"}${Math.abs(n).toFixed(digits)}`;
};

/** Plain-language read of a probability of beating the hold option. */
function edgeLabel(p: number | null): { text: string; className: string } {
  if (p === null) return { text: "Baseline", className: "bg-white/10 text-slate-300" };
  if (p >= 0.7) return { text: "Strong edge", className: "bg-[#84d21c]/15 text-[#84d21c]" };
  if (p >= 0.58) return { text: "Moderate edge", className: "bg-[#84d21c]/15 text-[#84d21c]" };
  if (p >= 0.45) return { text: "Too close to call", className: "bg-amber-400/20 text-amber-200" };
  return { text: "Holding looks better", className: "bg-rose-500/20 text-rose-200" };
}

function barColor(p: number): string {
  if (p >= 0.58) return "bg-[#84d21c]";
  if (p >= 0.45) return "bg-amber-400";
  return "bg-rose-500";
}

function FanChart({ bands, label }: { bands: McBand[]; label: string }) {
  const W = 320;
  const H = 132;
  const left = 34;
  const right = 10;
  const top = 10;
  const bottom = 22;

  const lo = Math.min(0, ...bands.map((b) => b.p10));
  const hi = Math.max(0, ...bands.map((b) => b.p90));
  const pad = Math.max(1, (hi - lo) * 0.08);
  const yMin = lo - pad;
  const yMax = hi + pad;

  const n = bands.length;
  const x = (i: number) =>
    n === 1 ? (left + W - right) / 2 : left + (i * (W - left - right)) / (n - 1);
  const y = (v: number) => top + ((yMax - v) * (H - top - bottom)) / (yMax - yMin);

  const upper = bands.map((b, i) => `${x(i)},${y(b.p90)}`);
  const lower = bands.map((b, i) => `${x(i)},${y(b.p10)}`).reverse();
  const meanLine = bands.map((b, i) => `${x(i)},${y(b.mean)}`).join(" ");
  const last = bands[n - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${label}. Final gameweek: average ${signed(last.mean)} points, 80% range ${signed(last.p10)} to ${signed(last.p90)}.`}
      className="h-auto w-full"
    >
      {/* zero line: below it the move is behind holding */}
      <line
        x1={left}
        x2={W - right}
        y1={y(0)}
        y2={y(0)}
        stroke="currentColor"
        strokeDasharray="3 3"
        className="text-slate-500"
      />
      {n > 1 ? (
        <polygon points={[...upper, ...lower].join(" ")} className="fill-[#84d21c]/20" />
      ) : (
        <line
          x1={x(0)}
          x2={x(0)}
          y1={y(bands[0].p90)}
          y2={y(bands[0].p10)}
          strokeWidth={6}
          strokeLinecap="round"
          className="stroke-[#84d21c]/30"
        />
      )}
      {n > 1 ? (
        <polyline points={meanLine} fill="none" strokeWidth={2} className="stroke-[#84d21c]" />
      ) : null}
      {bands.map((b, i) => (
        <circle key={b.gw} cx={x(i)} cy={y(b.mean)} r={2.5} className="fill-[#84d21c]" />
      ))}

      {/* y-axis labels */}
      <text x={left - 4} y={y(yMax - pad) + 3} textAnchor="end" className="fill-slate-500 text-[9px]">
        {signed(yMax - pad, 0)}
      </text>
      <text x={left - 4} y={y(0) + 3} textAnchor="end" className="fill-slate-400 text-[9px]">
        0
      </text>
      <text x={left - 4} y={y(yMin + pad) + 3} textAnchor="end" className="fill-slate-500 text-[9px]">
        {signed(yMin + pad, 0)}
      </text>

      {/* x-axis labels */}
      <text x={x(0)} y={H - 6} textAnchor={n === 1 ? "middle" : "start"} className="fill-slate-500 text-[9px]">
        GW{bands[0].gw}
      </text>
      {n > 1 ? (
        <text x={x(n - 1)} y={H - 6} textAnchor="end" className="fill-slate-500 text-[9px]">
          GW{bands[n - 1].gw}
        </text>
      ) : null}
    </svg>
  );
}

export function MonteCarloPanel({
  monteCarlo,
  elementsMap,
}: {
  monteCarlo: MonteCarloSummary;
  elementsMap: Map<number, SlimElement>;
}) {
  const { paths, captains, recommendedPathId, horizon, draws } = monteCarlo;
  const hold = paths.find((p) => p.id === "hold") ?? null;
  const alternatives = useMemo(() => paths.filter((p) => p.id !== "hold"), [paths]);
  const recommended = paths.find((p) => p.id === recommendedPathId) ?? hold;

  const defaultChart =
    alternatives.find((p) => p.id === recommendedPathId)?.id ?? alternatives[0]?.id ?? null;
  const [chartId, setChartId] = useState<string | null>(defaultChart);
  const chartPath: McPathSummary | null =
    alternatives.find((p) => p.id === chartId) ?? alternatives[0] ?? null;

  let headline: string;
  if (alternatives.length === 0) {
    headline = "No alternative to holding was found, so there is nothing to compare.";
  } else if (recommended && recommended.id !== "hold") {
    headline = `${recommended.label} beats holding in ${pct(recommended.probBeatsHold)} of simulated futures. The average gain is ${signed(recommended.deltaMean)} points over the next ${horizon} gameweek${horizon === 1 ? "" : "s"}, and 80% of outcomes fall between ${signed(recommended.deltaP10)} and ${signed(recommended.deltaP90)}.`;
  } else {
    const best = [...alternatives].sort(
      (a, b) => (b.probBeatsHold ?? 0) - (a.probBeatsHold ?? 0),
    )[0];
    headline = `Holding is the recommended move. The best alternative, ${best.label.toLowerCase()}, beats it in ${pct(best.probBeatsHold)} of simulated futures.`;
  }

  return (
    <Card className="!p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Section 0.2 Monte Carlo Risk View
        </p>
        <Pill className="bg-white/10 text-slate-300">
          {draws.toLocaleString()} simulated futures, {horizon} GW{horizon === 1 ? "" : "s"}
        </Pill>
      </div>

      <p className="mt-2 text-xs leading-snug text-slate-200">{headline}</p>

      {/* Strategy comparison */}
      <div className="mt-3 space-y-2">
        {alternatives.map((p) => {
          const edge = edgeLabel(p.probBeatsHold);
          const prob = p.probBeatsHold ?? 0;
          const isRec = p.id === recommendedPathId;
          return (
            <div
              key={p.id}
              className={`rounded-xl p-2.5 ${isRec ? "bg-[#84d21c]/10 ring-1 ring-[#84d21c]/40" : "bg-white/[0.05]"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold text-white">{p.label}</span>
                  {isRec ? <Pill className="bg-[#84d21c] text-[#000000]">Recommended</Pill> : null}
                  {p.hitCost > 0 ? (
                    <Pill className="bg-amber-400/20 text-amber-200">
                      {"\u2212"}{p.hitCost} pt hit included
                    </Pill>
                  ) : null}
                </div>
                <Pill className={edge.className}>{edge.text}</Pill>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <div
                  className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10"
                  role="img"
                  aria-label={`Chance of beating holding: ${pct(p.probBeatsHold)}`}
                >
                  <div className={`h-full rounded-full ${barColor(prob)}`} style={{ width: `${Math.round(prob * 100)}%` }} />
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/50" />
                </div>
                <strong className="w-10 text-right text-sm text-white">{pct(p.probBeatsHold)}</strong>
              </div>

              <p className="mt-1.5 text-[11px] text-slate-300">
                Average gain <strong className="text-white">{signed(p.deltaMean)} pts</strong> over holding. 80% of
                outcomes between {signed(p.deltaP10)} and {signed(p.deltaP90)}.
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Raw simulation said {pct(p.probBeatsHoldRaw)}; shown value is corrected after reliability testing.
              </p>
            </div>
          );
        })}

        {hold ? (
          <p className="px-1 text-[11px] text-slate-400">
            Holding and rolling: about {hold.mean.toFixed(0)} points over {horizon} gameweek
            {horizon === 1 ? "" : "s"} (80% range {hold.p10.toFixed(0)} to {hold.p90.toFixed(0)}).
          </p>
        ) : null}
      </div>

      {/* Fan chart */}
      {chartPath?.cumDelta ? (
        <div className="mt-3 rounded-xl bg-white/[0.04] p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <p className="text-[11px] font-semibold text-slate-200">
              Gain over holding, building up week by week
            </p>
            {alternatives.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1">
                {alternatives.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setChartId(p.id)}
                    aria-pressed={chartPath.id === p.id}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                      chartPath.id === p.id
                        ? "bg-[#84d21c] text-[#000000]"
                        : "bg-white/10 text-slate-300 hover:bg-white/20"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <FanChart bands={chartPath.cumDelta} label={`${chartPath.label}: cumulative points gained over holding`} />
          <p className="text-[10px] text-slate-500">
            The line is the average and the shaded band covers 80% of outcomes. Above the dashed zero line you are
            ahead of holding.
          </p>
        </div>
      ) : null}

      {/* Captain risk */}
      {captains.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold text-slate-200">
            Captain risk for the next gameweek
          </p>
          <div className="space-y-1.5">
            {captains.map((c) => {
              const el = elementsMap.get(c.id);
              return (
                <div key={c.id} className="flex items-center gap-2 rounded-xl bg-white/[0.05] p-2">
                  {el ? (
                    <PlayerPhoto code={el.code} alt={el.web_name} className="h-9 w-7 shrink-0 object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-white">{el?.web_name ?? `Player ${c.id}`}</p>
                      {c.isPick ? <Pill className="bg-[#84d21c] text-[#000000]">Pick</Pill> : null}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Average {c.mean.toFixed(1)} pts, 80% range {c.p10.toFixed(0)} to {c.p90.toFixed(0)}
                    </p>
                  </div>
                  <div className="grid shrink-0 grid-cols-3 gap-1.5 text-center text-[10px]">
                    <div className="rounded bg-white/[0.04] px-1.5 py-1">
                      <span className="block text-slate-500">Haul 9+</span>
                      <strong className="text-[#84d21c]">{pct(c.pHaul)}</strong>
                    </div>
                    <div className="rounded bg-white/[0.04] px-1.5 py-1">
                      <span className="block text-slate-500">Blank</span>
                      <strong className="text-rose-200">{pct(c.pBlank)}</strong>
                    </div>
                    <div className="rounded bg-white/[0.04] px-1.5 py-1">
                      <span className="block text-slate-500">Beats pick</span>
                      <strong className="text-slate-200">{c.isPick ? "n/a" : pct(c.pBeatsPick)}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Blank means 2 points or fewer before the captain bonus.</p>
        </div>
      ) : null}

      <details className="mt-3 text-[10px] text-slate-500">
        <summary className="cursor-pointer text-slate-400">How these numbers are built</summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          {monteCarlo.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
          <li>
            Each strategy keeps its squad for the whole horizon, and the chance of beating holding is pulled toward 50%
            because testing showed the raw simulation was too confident. Treat it all as an estimate.
          </li>
        </ul>
      </details>
    </Card>
  );
}
