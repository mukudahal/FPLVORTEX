"use client";

import { useMemo, useState } from "react";
import { MarketPanel } from "@/components/planner/MarketPanel";
import { selectOptimalXI, pointsHit } from "@/lib/scoring";
import { planChipOpportunities } from "@/lib/strategyEngine";
import { injuryAvailabilityList } from "@/lib/marketLeague";
import type { PlanResponse } from "@/lib/planTypes";
import type { SlimBootstrap, SlimTeam } from "@/lib/types";

const one = (value: number) => Number.isFinite(value) ? value.toFixed(1) : "—";

export function SimulationLab({ plan, onApply }: { plan: PlanResponse; onApply: (gw: number, outId: number, inId: number) => void }) {
  const [outId, setOutId] = useState<number>(plan.picks[0]?.element ?? 0);
  const [inId, setInId] = useState<number>(0);
  const [horizon, setHorizon] = useState<number>(Math.min(5, plan.gws.length));
  const owned = useMemo(() => new Set(plan.picks.map((pick) => pick.element)), [plan.picks]);
  const players = useMemo(() => new Map(plan.players.map((player) => [player.id, player] as const)), [plan.players]);
  const from = players.get(outId);
  const replacements = plan.players.filter((player) => player.type === from?.type && !owned.has(player.id)).sort((a,b) => b.xp.slice(0,horizon).reduce((sum,p)=>sum+p,0)-a.xp.slice(0,horizon).reduce((sum,p)=>sum+p,0)).slice(0, 75);
  const target = players.get(inId);
  const priceAvailable = (plan.sellingPrices[outId] ?? from?.cost ?? 0) + plan.bank;
  const enoughBank = Boolean(target && target.cost <= priceAvailable);
  const projectedGain = from && target ? target.xp.slice(0,horizon).reduce((sum,p)=>sum+p,0) - from.xp.slice(0,horizon).reduce((sum,p)=>sum+p,0) : null;
  const hits = pointsHit(1, plan.freeTransfers);
  return <section className="premium-surface"><div className="premium-section-header"><h2>Transfer Scenario Simulator</h2><p>Compare same-position player swaps over a shared projected horizon. This is not a full squad Monte Carlo; use the Optimization Lab for formation-aware paths.</p></div><div className="premium-section-body space-y-4">
    <div className="premium-controlbar"><label>Sell<select value={outId} onChange={(ev) => {setOutId(Number(ev.target.value));setInId(0);}}>{plan.picks.map((pick) => <option key={pick.element} value={pick.element}>{players.get(pick.element)?.name ?? pick.element}</option>)}</select></label>
      <label>Buy<select value={inId} onChange={(ev) => setInId(Number(ev.target.value))}><option value={0}>Select player</option>{replacements.map((player) => <option key={player.id} value={player.id}>{player.name} · £{one(player.cost / 10)}m</option>)}</select></label>
      <label>Horizon<select value={horizon} onChange={(ev) => setHorizon(Number(ev.target.value))}>{[1,3,5,8,10].filter((value) => value <= plan.gws.length).map((value) => <option key={value} value={value}>{value} GWs</option>)}</select></label>
    </div><div className="premium-kpi-grid"><div className="premium-stat"><span>Gross xPts change</span><strong>{projectedGain === null ? "—" : `${projectedGain >= 0 ? "+" : ""}${one(projectedGain)}`}</strong></div><div className="premium-stat"><span>Transfer hit</span><strong>{hits} pts</strong></div><div className="premium-stat"><span>Net xPts change</span><strong>{projectedGain === null ? "—" : one(projectedGain - hits)}</strong></div><div className="premium-stat"><span>Affordability</span><strong>{target ? enoughBank ? "In budget" : "Over budget" : "—"}</strong></div></div>
    {target && from && target.team !== from.team ? <p className="premium-feedback">Club cap and whole-squad validation are enforced when applying the move through the main planner.</p> : null}
    <button className="vx-btn vx-btn-primary" disabled={!target || !enoughBank} onClick={() => onApply(plan.gws[0], outId, inId)}>Add this transfer to my draft</button>
  </div></section>;
}

export function ChipCalendar({ plan }: { plan: PlanResponse }) {
  const opportunities = useMemo(() => {
    const players = new Map(plan.players.map((player) => [player.id, player] as const));
    const ids = plan.picks.map((pick) => pick.element);
    return plan.gws.flatMap((gw, index) => {
      const selected = selectOptimalXI(ids, (id) => players.get(id)?.type ?? 0, (id) => players.get(id)?.xp[index] ?? 0);
      return [
        { gw, chip: "tc" as const, estimatedIncrementalPoints: selected.capXp },
        { gw, chip: "bb" as const, estimatedIncrementalPoints: selected.benchXp },
      ];
    });
  }, [plan]);
  const recommendations = useMemo(() => planChipOpportunities(opportunities), [opportunities]);
  return <section className="premium-surface"><div className="premium-section-header"><h2>Chip Strategy Calendar — GW1–GW38</h2><p>One chip per GW; two sets, divided by the GW19 deadline. This view calculates TC/BB incremental upside from the current unchanged squad; WC/FH timing requires full transfer optimization.</p></div>
    <div className="premium-section-body"><div className="premium-kpi-grid"><div className="premium-stat"><span>Modelled first GW</span><strong>GW{plan.gws[0]}</strong></div><div className="premium-stat"><span>Modelled horizon</span><strong>{plan.gws.length} GW</strong></div><div className="premium-stat"><span>First-half chips expire</span><strong>GW19</strong></div><div className="premium-stat"><span>Second-half chips start</span><strong>GW20</strong></div></div>
      <div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Gameweek</th><th>TC additional xPts</th><th>BB additional xPts</th><th>Model recommendation</th></tr></thead><tbody>{plan.gws.map((gw) => <tr key={gw}><td>GW{gw}</td><td>{one(opportunities.find((row) => row.gw===gw && row.chip==='tc')?.estimatedIncrementalPoints ?? 0)}</td><td>{one(opportunities.find((row) => row.gw===gw && row.chip==='bb')?.estimatedIncrementalPoints ?? 0)}</td><td>{recommendations.filter((row) => row.gw===gw).map((row) => row.chip.toUpperCase()).join(", ") || "—"}</td></tr>)}</tbody></table></div>
      <div className="premium-feedback">Chip suggestions are provisional until prior chip usage, injuries, player rotation and future scheduled doubles are included. Only active, eligible chips may be submitted in FPL itself.</div>
    </div></section>;
}

export function PriceIncreases({ plan, bootstrap, teams }: {plan: PlanResponse; bootstrap: SlimBootstrap | null; teams: Map<number,SlimTeam>}) {
  return <div><p className="premium-feedback">Official prices and public demand change frequently. Any momentum or price-pressure indicator is not a verified probability or guaranteed overnight price change.</p>
    <MarketPanel squad={plan.picks.map((p)=>p.element)} elements={bootstrap?.elements ?? null} teams={teams} /></div>;
}

export function InjuryDesk({ bootstrap }: { bootstrap: SlimBootstrap | null }) {
  const [search, setSearch] = useState("");
  const injuries = useMemo(() => injuryAvailabilityList(bootstrap?.elements ?? []), [bootstrap]);
  return <section className="premium-surface"><div className="premium-section-header"><h2>Injury List & Availability</h2><p>Published FPL flags, return uncertainty, suspensions and news. Probabilities are shown only if FPL supplies a playing-chance field.</p></div><div className="premium-section-body">
    <div className="premium-controlbar"><label>Find flagged player<input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Player name"/></label></div>
    <div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Player</th><th>Flag</th><th>Playing chance</th><th>Updated</th><th>News</th></tr></thead><tbody>{injuries.filter((row)=>row.name.toLowerCase().includes(search.toLowerCase())).slice(0,125).map((row)=><tr key={row.id}><td>{row.name}</td><td>{row.status}</td><td>{row.chanceNextGw === null ? "Unknown" : `${row.chanceNextGw}%`}</td><td>{row.updatedAt?.slice(0,10) ?? "—"}</td><td>{row.news}</td></tr>)}</tbody></table></div></div></section>;
}
