"use client";

import { useMemo, useState } from "react";
import {
  autoPlan,
  topMoves,
  type AutoStep,
  type PlanCtx,
  type ReplayState,
  type TransferMap,
} from "@/lib/planEngine";
import { inputCls, money } from "./planUi";

interface Props {
  ctx: PlanCtx;
  state: ReplayState;
  transfers: TransferMap;
  idx: number;
  gw: number;
  onApplyPlan: (tm: TransferMap) => void;
  onApplyMove: (outId: number, inId: number) => void;
}

export function LabPanel({ ctx, state, transfers, idx, gw, onApplyPlan, onApplyMove }: Props) {
  const [horizon, setHorizon] = useState(5);
  const [allowHits, setAllowHits] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ transfers: TransferMap; steps: AutoStep[] } | null>(null);

  const moves = useMemo(() => topMoves(ctx, state, idx, horizon, 5), [ctx, state, idx, horizon]);

  const name = (id: number) => ctx.players.get(id)?.name ?? "?";

  function run() {
    setBusy(true);
    setPreview(null);
    // yield once so the spinner paints before the (synchronous) search
    window.setTimeout(() => {
      setPreview(autoPlan(ctx, transfers, { horizon, allowHits, fromIdx: idx }));
      setBusy(false);
    }, 30);
  }

  const hits = preview ? preview.steps.reduce((s, x) => s + x.hit, 0) : 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <h3 className="text-sm font-extrabold text-white">Auto-optimise plan</h3>
        <p className="mt-1 text-xs text-slate-400">
          Builds a transfer plan from GW{gw} onward, checking budget, the 3-per-club limit, free-transfer rollover and hit
          cost. Earlier gameweeks are left alone.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Look-ahead
            <select className={`${inputCls} mt-1`} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              <option value={3}>3 gameweeks</option>
              <option value={5}>5 gameweeks</option>
              <option value={8}>8 gameweeks</option>
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2.5 text-xs font-semibold text-slate-200">
            <input type="checkbox" checked={allowHits} onChange={(e) => setAllowHits(e.target.checked)} />
            Allow -4 hits
          </label>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="mt-3 w-full rounded-xl bg-[#cda228] py-2.5 text-sm font-extrabold text-black hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Optimising…" : `Auto-optimise from GW${gw}`}
        </button>

        {preview ? (
          <div className="mt-3">
            {preview.steps.length === 0 ? (
              <p className="rounded-xl bg-white/[0.04] p-3 text-xs text-slate-300">
                No move clears the threshold — rolling free transfers is the best use of them for this window.
              </p>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {preview.steps.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs">
                      <span>
                        <b className="text-slate-400">GW{s.gw}</b> <span className="text-rose-300">{name(s.out)}</span> →{" "}
                        <span className="font-bold text-emerald-300">{name(s.in)}</span>
                        {s.hit ? <span className="ml-1 text-amber-300">(-{s.hit})</span> : null}
                      </span>
                      <span className="shrink-0 font-bold text-[#bbe682]">+{s.gain.toFixed(1)} xP</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] text-slate-500">
                  Gains are measured over each move&apos;s own look-ahead window, so they overlap and shouldn&apos;t be summed.
                  {hits ? ` Hits in this plan: -${hits}.` : ""}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onApplyPlan(preview.transfers);
                      setPreview(null);
                    }}
                    className="rounded-xl bg-[#84d21c] py-2 text-sm font-extrabold text-black hover:brightness-110"
                  >
                    Apply plan
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="rounded-xl border border-white/20 py-2 text-sm font-bold text-slate-200 hover:bg-white/10"
                  >
                    Discard
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <h3 className="text-sm font-extrabold text-white">Best single moves now (GW{gw})</h3>
        <p className="mt-1 text-xs text-slate-400">
          Top swap for each squad player over the next {horizon} gameweeks, within your budget.
        </p>
        {moves.length === 0 ? (
          <p className="mt-3 rounded-xl bg-white/[0.04] p-3 text-xs text-slate-300">No affordable upgrade found.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {moves.map((m) => (
              <li key={`${m.out}-${m.in}`} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs">
                <span className="min-w-0 truncate">
                  <span className="text-rose-300">{name(m.out)}</span> →{" "}
                  <span className="font-bold text-emerald-300">{name(m.in)}</span>{" "}
                  <span className="text-slate-500">£{money(ctx.players.get(m.in)?.cost ?? 0)}m</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <b className="text-[#bbe682]">+{m.gain.toFixed(1)}</b>
                  <button
                    type="button"
                    onClick={() => onApplyMove(m.out, m.in)}
                    className="rounded-lg bg-[#84d21c] px-2 py-1 font-extrabold text-black hover:brightness-110"
                  >
                    Do it
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
