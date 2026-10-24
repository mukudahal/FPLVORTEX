"use client";

import { useMemo, useState } from "react";
import { Dot, Message, Panel } from "@/components/home/ui";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import type { PlanResponse } from "@/lib/planTypes";
import type { OptimizerResponse } from "@/lib/types";
import { money } from "./shared";

interface SolveState {
  loading: boolean;
  error: string | null;
  data: OptimizerResponse | null;
}

const f1 = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));
const sg = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "gold" }) {
  return (
    <div className="vx-chip rounded-xl px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider">{label}</div>
      <div
        className={`text-xl font-extrabold ${
          tone === "up" ? "vx-up" : tone === "down" ? "vx-down" : tone === "gold" ? "vx-gold" : "vx-text"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function SolverView({ teamId, plan }: { teamId: string; plan: PlanResponse }) {
  const [horizon, setHorizon] = useState(5);
  const [s, setS] = useState<SolveState>({ loading: false, error: null, data: null });
  const players = useMemo(() => new Map(plan.players.map((p) => [p.id, p] as const)), [plan.players]);
  const name = (id: number) => players.get(id)?.name ?? `#${id}`;
  const maxDepth = Math.min(10, plan.gws.length);

  async function solve() {
    setS({ loading: true, error: null, data: null });
    try {
      const res = await fetch(`/api/optimizer/${teamId}?horizon=${horizon}`, { cache: "no-store" });
      const body = (await res.json()) as OptimizerResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setS({ loading: false, error: null, data: body });
    } catch (e) {
      setS({ loading: false, error: e instanceof Error ? e.message : "Solve failed.", data: null });
    }
  }

  const d = s.data;

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Transfer Solve"
        icon={<Dot color="#84d21c" />}
        right={<span className="vx-muted text-xs">Solves from GW {plan.nextGw}</span>}
      >
        <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="depth" className="vx-text text-sm font-extrabold uppercase tracking-wide">
                Transfer depth{" "}
                <span className="vx-muted text-xs font-medium normal-case">
                  (up to GW {plan.gws[maxDepth - 1]})
                </span>
              </label>
              <span className="vx-gold text-3xl font-extrabold">
                {horizon} <span className="vx-muted text-sm font-medium">GWs</span>
              </span>
            </div>
            <input
              id="depth"
              type="range"
              min={1}
              max={maxDepth}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="mt-3 w-full accent-[#84d21c]"
            />
            <div className="vx-muted mt-1 flex justify-between text-xs">
              <span>1</span>
              <span>{maxDepth}</span>
            </div>
            <p className="vx-muted mt-3 text-xs leading-relaxed">
              The solver weighs free transfers, hits, selling prices, club limits and the xPts model across the
              chosen horizon, then stress-tests the options with a Monte-Carlo simulation.
            </p>
          </div>
          <button
            type="button"
            onClick={solve}
            disabled={s.loading}
            className="rounded-xl bg-gradient-to-r from-[#cda228] to-[#84d21c] px-8 py-4 text-base font-extrabold text-black shadow-lg transition hover:brightness-110 active:scale-95 disabled:opacity-60"
          >
            {s.loading ? "Solving…" : "⚡ START SOLVE"}
          </button>
        </div>
      </Panel>

      {s.error ? (
        <div className="vx-card p-6 text-center">
          <p className="vx-down text-sm">{s.error}</p>
        </div>
      ) : null}
      {s.loading ? <Message>Running the optimizer and simulations — this can take a few seconds…</Message> : null}

      {d ? (
        <>
          <Panel
            title="Recommendation"
            icon={<Dot color="#cda228" />}
            right={
              <span className="vx-muted text-xs">
                {d.solverEngine} · {d.solverRunMs} ms{d.cached ? " · cached" : ""}
              </span>
            }
          >
            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="rounded-lg px-3 py-1 text-sm font-extrabold text-black"
                  style={{ background: d.recommendedDecision === "TRANSFER" ? "#84d21c" : "#cda228" }}
                >
                  {d.recommendedDecision}
                </span>
                <span className="vx-text text-sm font-bold">{d.winner.label}</span>
              </div>
              <p className="vx-muted text-sm leading-relaxed">{d.optimizedNextGw.whyLine}</p>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="Net gain vs roll" value={sg(d.winner.netGainVsRoll)} tone={d.winner.netGainVsRoll > 0 ? "up" : "down"} />
                <Stat label={`Next ${d.horizon} GWs xPts`} value={f1(d.winner.horizonXPts)} />
                <Stat label="Hit cost" value={d.winner.hitCost ? `-${d.winner.hitCost}` : "0"} tone={d.winner.hitCost ? "down" : undefined} />
                <Stat label="Free transfers after" value={String(d.freeTransfersAfterMove)} />
              </div>

              {d.optimizedNextGw.transfers.length === 0 ? (
                <p className="vx-muted text-sm">No transfer recommended — bank the free transfer.</p>
              ) : (
                <div>
                  <h3 className="vx-faint mb-2 text-[11px] font-semibold uppercase tracking-wider">
                    Transfers for GW {d.nextGw}
                  </h3>
                  {d.optimizedNextGw.transfers.map((t) => {
                    const o = players.get(t.outId);
                    const n = players.get(t.inId);
                    return (
                      <div key={`${t.outId}-${t.inId}`} className="vx-row flex items-center gap-3 py-2">
                        {o ? <PlayerPhoto code={o.code} alt={o.name} className="h-10 w-8 shrink-0 rounded-md" /> : null}
                        <div className="min-w-0">
                          <div className="vx-down text-sm font-bold">{name(t.outId)}</div>
                          <div className="vx-muted text-[11px]">sell {money(t.sellingPrice)}</div>
                        </div>
                        <span className="vx-muted">→</span>
                        {n ? <PlayerPhoto code={n.code} alt={n.name} className="h-10 w-8 shrink-0 rounded-md" /> : null}
                        <div className="min-w-0 flex-1">
                          <div className="vx-up text-sm font-bold">{name(t.inId)}</div>
                          <div className="vx-muted text-[11px]">buy {money(t.buyPrice)}</div>
                        </div>
                        <div className="text-right">
                          <div className="vx-up text-sm font-extrabold">{sg(t.xPtsGainHorizon)}</div>
                          <div className="vx-muted text-[10px]">over {d.horizon} GWs</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="Captain" value={name(d.optimizedNextGw.captainId)} tone="gold" />
                <Stat label="Vice" value={name(d.optimizedNextGw.viceId)} />
                <Stat label="Formation" value={d.optimizedNextGw.formation} />
                <Stat label="GW xPts (after hit)" value={f1(d.optimizedNextGw.totalXPts)} tone="up" />
              </div>
            </div>
          </Panel>

          <Panel title="Options compared" icon={<Dot color="#84d21c" />}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="vx-card-head vx-muted text-left text-[11px] font-bold">
                    <th className="px-3 py-2">Option</th>
                    <th className="px-3 py-2">Moves</th>
                    <th className="px-3 py-2 text-right">Hit</th>
                    <th className="px-3 py-2 text-right">GW xPts</th>
                    <th className="px-3 py-2 text-right">Horizon xPts</th>
                    <th className="px-3 py-2 text-right">Net vs roll</th>
                  </tr>
                </thead>
                <tbody>
                  {d.options.map((o) => (
                    <tr key={o.id} className="vx-row" style={o.winner ? { background: "rgba(132,210,28,.08)" } : undefined}>
                      <td className="vx-text px-3 py-2 font-bold">
                        {o.label} {o.winner ? <span className="vx-up text-[10px]">★ best</span> : null}
                      </td>
                      <td className="vx-muted px-3 py-2 text-xs">
                        {o.transfers.length === 0
                          ? "—"
                          : o.transfers.map((t) => `${name(t.outId)} → ${name(t.inId)}`).join(", ")}
                      </td>
                      <td className="vx-text px-3 py-2 text-right">{o.hitCost ? `-${o.hitCost}` : "0"}</td>
                      <td className="vx-text px-3 py-2 text-right">{f1(o.nextGwXPts)}</td>
                      <td className="vx-text px-3 py-2 text-right">{f1(o.horizonXPts)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${o.netGainVsRoll > 0 ? "vx-up" : o.netGainVsRoll < 0 ? "vx-down" : "vx-muted"}`}>
                        {sg(o.netGainVsRoll)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Multi-gameweek plan" icon={<Dot color="#cda228" />}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="vx-card-head vx-muted text-left text-[11px] font-bold">
                    <th className="px-3 py-2">GW</th>
                    <th className="px-3 py-2">Transfers</th>
                    <th className="px-3 py-2">Chip</th>
                    <th className="px-3 py-2">Captain</th>
                    <th className="px-3 py-2 text-right">FT after</th>
                    <th className="px-3 py-2 text-right">Bank</th>
                    <th className="px-3 py-2 text-right">xPts</th>
                  </tr>
                </thead>
                <tbody>
                  {d.multiGwPlan.map((g) => (
                    <tr key={g.gw} className="vx-row">
                      <td className="vx-text px-3 py-2 font-bold">GW{g.gw}</td>
                      <td className="vx-muted px-3 py-2 text-xs">
                        {g.transfers.length === 0
                          ? "Roll"
                          : g.transfers.map((t) => `${name(t.outId)} → ${name(t.inId)}`).join(", ")}
                        {g.hitCost ? <span className="vx-down"> (-{g.hitCost})</span> : null}
                      </td>
                      <td className="vx-text px-3 py-2">{g.chip ?? "—"}</td>
                      <td className="vx-text px-3 py-2">{name(g.captainId)}</td>
                      <td className="vx-text px-3 py-2 text-right">{g.ftAfter}</td>
                      <td className="vx-text px-3 py-2 text-right">{money(g.bankAfter)}</td>
                      <td className="vx-gold px-3 py-2 text-right font-extrabold">{f1(g.projectedXPts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Chip decision" icon={<Dot color="#84d21c" />}>
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2">
                <span
                  className="rounded-lg px-3 py-1 text-sm font-extrabold text-black"
                  style={{ background: d.recommendedChipDecision.action === "PLAY" ? "#84d21c" : "#cda228" }}
                >
                  {d.recommendedChipDecision.action}
                  {d.recommendedChipDecision.chip ? ` ${d.recommendedChipDecision.chip}` : ""}
                </span>
                {d.recommendedChipDecision.bestFutureGw ? (
                  <span className="vx-muted text-xs">
                    Best future window: GW{d.recommendedChipDecision.bestFutureGw}{" "}
                    {d.recommendedChipDecision.bestFutureChip} ({sg(d.recommendedChipDecision.bestFutureGain)} xPts)
                  </span>
                ) : null}
              </div>
              <p className="vx-muted text-sm leading-relaxed">{d.recommendedChipDecision.why}</p>
            </div>
          </Panel>

          {d.monteCarlo ? (
            <Panel
              title="Monte-Carlo simulation"
              icon={<Dot color="#cda228" />}
              right={<span className="vx-muted text-xs">{d.monteCarlo.draws.toLocaleString()} simulated draws</span>}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="vx-card-head vx-muted text-left text-[11px] font-bold">
                      <th className="px-3 py-2">Path</th>
                      <th className="px-3 py-2 text-right">Mean</th>
                      <th className="px-3 py-2 text-right">P10 – P90</th>
                      <th className="px-3 py-2 text-right">Gain vs hold</th>
                      <th className="px-3 py-2 text-right">Beats hold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.monteCarlo.paths.map((p) => (
                      <tr
                        key={p.id}
                        className="vx-row"
                        style={p.id === d.monteCarlo?.recommendedPathId ? { background: "rgba(132,210,28,.08)" } : undefined}
                      >
                        <td className="vx-text px-3 py-2 font-bold">{p.label}</td>
                        <td className="vx-text px-3 py-2 text-right">{f1(p.mean)}</td>
                        <td className="vx-muted px-3 py-2 text-right">
                          {f1(p.p10)} – {f1(p.p90)}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${(p.deltaMean ?? 0) > 0 ? "vx-up" : (p.deltaMean ?? 0) < 0 ? "vx-down" : "vx-muted"}`}>
                          {p.deltaMean == null ? "—" : sg(p.deltaMean)}
                        </td>
                        <td className="vx-text px-3 py-2 text-right">
                          {p.probBeatsHold == null ? "—" : `${Math.round(p.probBeatsHold * 100)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {d.monteCarlo.captains.length > 0 ? (
                <div className="overflow-x-auto" style={{ borderTop: "1px solid var(--vx-border)" }}>
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="vx-card-head vx-muted text-left text-[11px] font-bold">
                        <th className="px-3 py-2">Captain option</th>
                        <th className="px-3 py-2 text-right">Mean</th>
                        <th className="px-3 py-2 text-right">P10 – P90</th>
                        <th className="px-3 py-2 text-right">Haul 9+</th>
                        <th className="px-3 py-2 text-right">Blank ≤2</th>
                        <th className="px-3 py-2 text-right">Beats pick</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.monteCarlo.captains.map((c) => (
                        <tr key={c.id} className="vx-row">
                          <td className="vx-text px-3 py-2 font-bold">{name(c.id)}</td>
                          <td className="vx-text px-3 py-2 text-right">{f1(c.mean)}</td>
                          <td className="vx-muted px-3 py-2 text-right">
                            {f1(c.p10)} – {f1(c.p90)}
                          </td>
                          <td className="vx-up px-3 py-2 text-right">{Math.round(c.pHaul * 100)}%</td>
                          <td className="vx-down px-3 py-2 text-right">{Math.round(c.pBlank * 100)}%</td>
                          <td className="vx-text px-3 py-2 text-right">
                            {c.pBeatsPick == null ? "pick" : `${Math.round(c.pBeatsPick * 100)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <ul className="vx-muted list-disc space-y-1 px-8 py-3 text-xs">
                {d.monteCarlo.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
