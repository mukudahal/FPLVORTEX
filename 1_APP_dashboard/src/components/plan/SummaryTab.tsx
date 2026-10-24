"use client";

import { fdrClasses } from "@/lib/helpers";
import {
  cellsFor,
  CHIP_LABEL,
  type Chip,
  type FxCell,
  type GwLedger,
  type GwSummary,
  type PlanCtx,
  type XIResult,
} from "@/lib/planEngine";
import type { PlanTeam, PlanTransfer } from "@/lib/planTypes";
import { money } from "./planUi";

interface Props {
  ctx: PlanCtx;
  teamsById: Map<number, PlanTeam>;
  fxMap: Map<string, FxCell[]>;
  gw: number;
  idx: number;
  lineup: XIResult;
  summary: GwSummary;
  ledger: GwLedger | undefined;
  transfers: PlanTransfer[];
  bank: number;
  chip?: Chip;
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 text-sm last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="font-bold text-slate-100">{children}</span>
    </div>
  );
}

export function SummaryTab({ ctx, teamsById, fxMap, gw, idx, lineup, summary, ledger, transfers, bank, chip }: Props) {
  const fixtureChip = (id: number | undefined) => {
    if (id === undefined) return null;
    const p = ctx.players.get(id);
    if (!p) return null;
    const c = cellsFor(fxMap, p.team, gw)[0];
    if (!c) return <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">blank</span>;
    const short = teamsById.get(c.opp)?.short ?? "?";
    return (
      <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${fdrClasses(c.diff)}`}>
        {c.home ? short : short.toLowerCase()}
      </span>
    );
  };
  const nameOf = (id: number | undefined) => (id !== undefined ? (ctx.players.get(id)?.name ?? "—") : "—");
  const counts = summary.fdrCounts;
  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2">
      <Line label="Chip planned">{chip ? CHIP_LABEL[chip] : "None"}</Line>
      <Line label="Bank">£{money(bank)}m</Line>
      <Line label="Transfers / Cost">
        {ledger ? `${ledger.n} / ${ledger.hit ? `-${ledger.hit}` : 0}` : "0 / 0"}
        {ledger ? (
          <span className="ml-2 text-[11px] font-medium text-slate-500">
            ({ledger.ftBefore} free → {ledger.ftAfter} next GW)
          </span>
        ) : null}
      </Line>
      <Line label="Total fixtures (lineup / squad)">
        {summary.fixturesLineup}/{summary.fixturesSquad}
      </Line>
      <Line label="DGW players (lineup / squad)">
        {summary.dgwLineup}/{summary.dgwSquad}
      </Line>
      <Line label="Blank players (lineup / squad)">
        {summary.blankLineup}/{summary.blankSquad}
      </Line>
      <Line label="Captain">
        <span className="flex items-center gap-2">
          {nameOf(lineup.captain)} {fixtureChip(lineup.captain)}
        </span>
      </Line>
      <Line label="Vice captain">
        <span className="flex items-center gap-2">
          {nameOf(lineup.vice)} {fixtureChip(lineup.vice)}
        </span>
      </Line>
      <Line label="Projected GW points">{lineup.total.toFixed(1)} ({lineup.formation})</Line>

      <div className="py-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">GW{gw} squad fixture difficulty</p>
        <div className="grid grid-cols-5 overflow-hidden rounded-xl text-center text-sm font-extrabold">
          {counts.map((n, i) => (
            <div key={i} className={`py-2 ${fdrClasses(i + 1)}`} title={`FDR ${i + 1}`}>
              {n}
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          {total} fixtures · easiest (left) to hardest (right)
        </p>
      </div>

      <div className="pb-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Transfers</p>
        {transfers.length === 0 ? (
          <p className="rounded-xl bg-white/[0.03] py-3 text-center text-xs text-slate-500">No transfers made</p>
        ) : (
          <ul className="space-y-1.5">
            {transfers.map((t, i) => {
              const o = ctx.players.get(t.out);
              const n = ctx.players.get(t.in);
              const dx = (n?.xp[idx] ?? 0) - (o?.xp[idx] ?? 0);
              return (
                <li key={i} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-xs">
                  <span>
                    <span className="text-rose-300">{o?.name}</span> → <span className="font-bold text-emerald-300">{n?.name}</span>
                  </span>
                  <span className="text-slate-400">
                    £{money(n?.cost ?? 0)}m · {dx >= 0 ? "+" : ""}
                    {dx.toFixed(1)} xP
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
