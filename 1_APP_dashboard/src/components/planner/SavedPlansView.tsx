"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { applyChipToLineup, lineupAt, replay, xpAt, type PlanCtx } from "@/lib/planEngine";
import { decodeDraft, encodeDraft, type PlannerDraft } from "@/lib/plannerPersistence";

interface SavedPlanRow { id: number; name: string; data: unknown; projectedPoints: number; }

function projectedTotal(ctx: PlanCtx, draft: PlannerDraft): number {
  return ctx.gws.reduce((total, gw, idx) => {
    const state = replay(ctx, draft.transfers, gw, draft.chips);
    const result = lineupAt(ctx, state.squad, idx, draft.lineups[gw]);
    const captain = draft.captains[gw];
    const selected = captain !== undefined && result.starters.includes(captain) ? captain : result.captain;
    const bonus = selected !== undefined ? xpAt(ctx, selected, idx) : 0;
    return total + applyChipToLineup({...result, captain: selected, capXp: bonus,
      total: result.xi + bonus}, draft.chips[gw], ctx, idx).total - (state.ledger.find((row) => row.gw === gw)?.hit ?? 0);
  }, 0);
}

export function SavedPlansView({entryId, ctx, draft, onLoad}: {
  entryId: number; ctx: PlanCtx; draft: PlannerDraft; onLoad: (draft: PlannerDraft) => void;
}) {
  const [rows, setRows] = useState<SavedPlanRow[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const currentXP = useMemo(() => projectedTotal(ctx, draft), [ctx, draft]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/plans?entry=${entryId}`, {cache: "no-store"});
      if (response.status === 401) {
        setRows([]);
        setRequiresSignIn(true);
        setMessage(null);
        return;
      }
      const body: unknown = await response.json();
      if (!response.ok || !Array.isArray(body)) throw new Error("Could not read saved plans.");
      setRequiresSignIn(false);
      setRows(body.filter((item): item is SavedPlanRow =>
        item !== null && typeof item === "object" && typeof item.id === "number" &&
        typeof item.name === "string" && "data" in item && typeof item.projectedPoints === "number"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load plans.");
    }
  }, [entryId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function save() {
    if (requiresSignIn) { setMessage("Sign in to store a cloud plan. Your browser draft remains available."); return; }
    if (rows.length >= 3) { setMessage("Maximum of three saved plans. Delete one to save another."); return; }
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/plans", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({entryId, name: name.trim().slice(0, 60) || `Plan ${rows.length + 1}`,
          data: draft, projectedPoints: Math.round(currentXP * 10) / 10}),
      });
      const result = await response.json() as {error?: string};
      if (!response.ok) throw new Error(result.error ?? `Save failed (${response.status}).`);
      setName(""); setMessage("Saved successfully."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save plan."); }
    finally { setBusy(false); }
  }

  async function remove(id: number) {
    if (!window.confirm("Permanently delete this saved plan?")) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/plans?entry=${entryId}&id=${id}`, {method: "DELETE"});
      if (!response.ok) throw new Error("Could not delete the plan.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Delete failed."); }
    finally { setBusy(false); }
  }

  return (
    <section className="vx-card p-5" aria-label="Saved plans">
      <h2 className="vx-text text-lg font-extrabold">Saved Plans</h2>
      <p className="vx-muted mt-1 text-sm">Manage up to three private plans. Older team-planner and transfer-plan formats are imported when loaded.</p>
      {requiresSignIn ? <p className="my-3 rounded-xl border border-amber-400/40 p-3 text-sm">
        Sign in to access private cloud plans. Your local planner draft still works.
        {" "}<Link className="font-bold underline" href="/login">Sign in</Link>
      </p> : null}
      <div className="my-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input className="vx-input rounded-xl px-3 py-2" maxLength={60} value={name}
          onChange={(event) => setName(event.target.value)} aria-label="Plan name" placeholder="Name this scenario" />
        <button className="vx-btn vx-btn-primary" type="button" onClick={() => void save()} disabled={busy || requiresSignIn || rows.length >= 3}>
          Save current plan ({currentXP.toFixed(1)} xPts)
        </button>
      </div>
      {message ? <p className="vx-muted my-3 text-sm" role="status">{message}</p> : null}
      <div className="space-y-3">
        {rows.map((row) => {
          const converted = decodeDraft(row.data, ctx);
          const xp = converted ? projectedTotal(ctx, converted) : null;
          return <article key={row.id} className="vx-chip flex flex-wrap items-center justify-between gap-3 rounded-xl p-3">
            <div>
              <h3 className="vx-text text-sm font-extrabold">{row.name}</h3>
              <p className="vx-muted text-xs">{xp === null ? "Unsupported plan format" : `${xp.toFixed(1)} xPts with current projections`}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="vx-btn vx-btn-sm" disabled={busy || !converted}
                onClick={() => { if (!converted) return; if (window.confirm("Replace your current unsaved draft?")) { onLoad(converted); setMessage(`Loaded ${row.name}.`); } }}>
                Load
              </button>
              <button type="button" className="vx-btn vx-btn-sm" disabled={busy} onClick={() => void remove(row.id)}>Delete</button>
            </div>
          </article>;
        })}
        {!requiresSignIn && rows.length === 0 ? <p className="vx-muted text-sm">No saved plans for this team.</p> : null}
      </div>
    </section>
  );
}
