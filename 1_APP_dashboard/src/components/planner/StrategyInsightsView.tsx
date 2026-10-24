"use client";

import { useMemo, useState } from "react";
import { LabPanel } from "@/components/plan/LabPanel";
import { SummaryTab } from "@/components/plan/SummaryTab";
import { TickerTab } from "@/components/plan/TickerTab";
import { applyChipToLineup, buildFxMap, lineupAt, replay, summarise, xpAt,
  type ChipMap, type LineupMap, type PlanCtx, type TransferMap } from "@/lib/planEngine";
import { readWatch, writeWatch } from "@/lib/planStorage";
import type { PlanResponse } from "@/lib/planTypes";

export function StrategyInsightsView({teamId, data, ctx, transfers, chips, captains, viceCaptains, lineups, onTransfers}: {
  teamId: string; data: PlanResponse; ctx: PlanCtx;
  transfers: TransferMap; chips: ChipMap; captains: Record<number, number>; viceCaptains: Record<number, number>; lineups: LineupMap;
  onTransfers: (transfers: TransferMap) => void;
}) {
  const [mode, setMode] = useState<"lab" | "fixtures" | "summary" | "watchlist">("lab");
  const [idx, setIdx] = useState(0);
  const [watched, setWatched] = useState<number[]>(() => typeof window === "undefined" ? [] : readWatch(teamId));
  const [search, setSearch] = useState("");
  const gw = ctx.gws[idx];
  const fxMap = useMemo(() => buildFxMap(data.fixtures), [data.fixtures]);
  const teamsById = useMemo(() => new Map(data.teams.map((team) => [team.id, team] as const)), [data.teams]);
  const state = useMemo(() => replay(ctx, transfers, gw, chips), [ctx, transfers, chips, gw]);
  const base = useMemo(() => lineupAt(ctx, state.squad, idx, lineups[gw]), [ctx, state.squad, idx, lineups, gw]);
  const captain = captains[gw] !== undefined && base.starters.includes(captains[gw]) ? captains[gw] : base.captain;
  const bonus = captain === undefined ? 0 : xpAt(ctx, captain, idx);
  const vice = viceCaptains[gw] !== undefined && viceCaptains[gw] !== captain && base.starters.includes(viceCaptains[gw])
    ? viceCaptains[gw] : base.vice !== captain ? base.vice : base.starters.find((id) => id !== captain);
  const lineup = applyChipToLineup({...base, captain, vice, capXp: bonus, total: base.xi + bonus}, chips[gw], ctx, idx);
  const summary = summarise(ctx, fxMap, state.squad, lineup, gw);
  const squadTeams = useMemo(() => {
    const counts = new Map<number, number>();
    for (const id of state.squad) {
      const team = ctx.players.get(id)?.team;
      if (team !== undefined) counts.set(team, (counts.get(team) ?? 0) + 1);
    }
    return counts;
  }, [state.squad, ctx]);

  function setWatch(id: number) {
    const next = watched.includes(id) ? watched.filter((other) => other !== id) : [...watched, id];
    setWatched(next);
    writeWatch(teamId, next);
  }
  const matching = data.players.filter((player) => player.name.toLowerCase().includes(search.toLowerCase())).slice(0, 35);

  return <section className="vx-card p-4">
    <header className="mb-4 flex flex-wrap justify-between gap-3">
      <div><h2 className="vx-text text-xl font-bold">Strategy Insights</h2>
        <p className="vx-muted text-xs">Historical strategy tools use the same squad and draft as the main planner.</p></div>
      <label className="vx-muted text-sm">Gameweek <select aria-label="Strategy gameweek" className="vx-input ml-2 rounded-lg px-2 py-1" value={idx} onChange={(event) => setIdx(Number(event.target.value))}>
        {ctx.gws.map((gameweek, index) => <option value={index} key={gameweek}>GW{gameweek}</option>)}
      </select></label>
    </header>
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="Strategy panels">
      {([ ["lab", "Optimization Lab"], ["fixtures", "Fixture Ticker"], ["summary", "GW Summary"], ["watchlist", "Watchlist"] ] as const).map(([key, label]) =>
        <button className="vx-btn vx-btn-sm" key={key} type="button" data-active={mode === key} onClick={() => setMode(key)}>{label}</button>)}
    </nav>
    {mode === "lab" ? <LabPanel ctx={ctx} state={state} transfers={transfers} idx={idx} gw={gw}
      onApplyPlan={onTransfers} onApplyMove={(outId, inId) => onTransfers({...transfers,
        [gw]: [...(transfers[gw] ?? []), {out: outId, in: inId}]})} /> : null}
    {mode === "fixtures" ? <TickerTab key={gw} ctx={ctx} teams={data.teams} teamsById={teamsById} fxMap={fxMap}
      idx={idx} squadTeams={squadTeams} deadlines={data.deadlines} /> : null}
    {mode === "summary" ? <SummaryTab ctx={ctx} teamsById={teamsById} fxMap={fxMap} gw={gw} idx={idx}
      lineup={lineup} summary={summary} ledger={state.ledger.find((item) => item.gw === gw)}
      transfers={transfers[gw] ?? []} bank={state.bank} chip={chips[gw]} /> : null}
    {mode === "watchlist" ? <div className="space-y-4">
      <label className="vx-muted block text-sm">Find players to watch
        <input className="vx-input mt-2 w-full rounded-lg p-2" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter players by name" /></label>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(search ? matching : data.players.filter((player) => watched.includes(player.id))).map((player) => <div key={player.id}
          className="vx-chip flex items-center justify-between gap-3 rounded-lg p-2 text-sm">
          <span className="vx-text truncate">{player.name} <span className="vx-muted">{player.xp[idx]?.toFixed(1) ?? "—"} xPts</span></span>
          <button type="button" className="vx-btn vx-btn-sm" onClick={() => setWatch(player.id)}
            aria-pressed={watched.includes(player.id)}>{watched.includes(player.id) ? "Remove" : "Watch"}</button>
        </div>)}
      </div>
      {!search && watched.length === 0 ? <p className="vx-muted text-sm">No watched players yet. Search to add them.</p> : null}
    </div> : null}
  </section>;
}
