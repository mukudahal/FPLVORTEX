"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Dot, Message, Panel } from "@/components/home/ui";
import { getSavedTeamId, saveTeamId } from "@/lib/helpers";
import { buildFxMap, makeCtx, sanitize, type ChipMap, type LineupMap, type TransferMap } from "@/lib/planEngine";
import { decodeDraft, encodeDraft, type PlannerDraft } from "@/lib/plannerPersistence";
import { readLocal } from "@/lib/planStorage";
import type { PlanResponse } from "@/lib/planTypes";
import type { SlimBootstrap } from "@/lib/types";
import { decodePlan, type SharedPlan } from "@/lib/planShare";
import { useJson } from "@/lib/useJson";
import { PlannerView } from "./PlannerView";
import { ProjectionsView } from "./ProjectionsView";
import { SolverView } from "./SolverView";
import { SavedPlansView } from "./SavedPlansView";
import { StrategyInsightsView } from "./StrategyInsightsView";
import { ChipCalendar, InjuryDesk, PriceIncreases, SimulationLab } from "./PlannerExtras";

type Tab = "planner" | "simulation" | "chips" | "prices" | "injuries" | "projections" | "solver" | "insights" | "saved";
const TABS: { id: Tab; label: string }[] = [
  { id: "planner", label: "Planner" },
  { id: "simulation", label: "Simulation" },
  { id: "chips", label: "Chips Strategy" },
  { id: "prices", label: "Price Increases" },
  { id: "injuries", label: "Injury List" },
  { id: "projections", label: "Projections" },
  { id: "solver", label: "Solver" },
  { id: "insights", label: "Strategy Insights" },
  { id: "saved", label: "Saved Plans" },
];

function TeamIdForm({ onLoad }: { onLoad: (id: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const cleaned = value.trim().replace(/\D/g, "");
    if (!cleaned || Number(cleaned) < 1) {
      setError("Enter your numeric FPL Team ID, e.g. 1234567");
      return;
    }
    onLoad(cleaned);
  }

  return (
    <div className="mx-auto max-w-xl py-10">
      <Panel title="Team Planner" icon={<Dot color="#84d21c" />}>
        <form onSubmit={submit} className="flex flex-col gap-3 p-4">
          <label htmlFor="planner-team-id" className="vx-gold text-xs font-semibold uppercase tracking-wider">
            Enter your FPL Team ID to plan your transfers
          </label>
          <div className="flex gap-2">
            <input
              id="planner-team-id"
              inputMode="numeric"
              placeholder="e.g. 1234567"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              className="vx-input min-w-0 flex-1 rounded-xl px-4 py-2.5 text-base font-semibold"
            />
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-[#cda228] to-[#84d21c] px-5 text-sm font-extrabold text-black shadow hover:brightness-110"
            >
              Load team
            </button>
          </div>
          {error ? <p className="vx-down text-xs">{error}</p> : null}
        </form>
      </Panel>
    </div>
  );
}

export function TeamPlanner({ initialTeamId, embedded = false }: {initialTeamId?: string; embedded?: boolean} = {}) {
  const [ready, setReady] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("planner");
  const [transfers, setTransfersState] = useState<TransferMap>({});
  const [chips, setChipsState] = useState<ChipMap>({});
  const [captains, setCaptainsState] = useState<Record<number, number>>({});
  const [viceCaptains, setViceCaptainsState] = useState<Record<number, number>>({});
  const [lineups, setLineupsState] = useState<LineupMap>({});
  const [shared, setShared] = useState<SharedPlan | null>(null); // a plan opened from a link; never saved unless kept

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of browser-only state after mount */
    const params = new URLSearchParams(window.location.search);
    const t = Number(params.get("t"));
    const code = params.get("s");
    const plan = code && Number.isInteger(t) && t > 0 && (!initialTeamId || initialTeamId === String(t))
      ? decodePlan(code, t) : null;
    if (plan) {
      setShared(plan);
      setTeamId(String(plan.team));
      setTransfersState(plan.transfers);
      setChipsState(plan.chips);
      setCaptainsState(plan.captains);
      setViceCaptainsState(plan.viceCaptains ?? {});
      setLineupsState(plan.lineups ?? {});
    } else {
      setTeamId(initialTeamId ?? getSavedTeamId());
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialTeamId]);

  const storageKey = teamId && !shared ? `vortex-planner-${teamId}` : null;
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved draft once per team
      if (raw) {
        setTransfersState(JSON.parse(raw) as TransferMap);
      } else if (teamId) {
        const older = readLocal(teamId);
        const migrated = older ? older.data.transfers : null;
        if (migrated && typeof migrated === "object") {
          const imports: TransferMap = {};
          for (const [gw, moves] of Object.entries(migrated)) {
            if (/^\d+$/.test(gw) && Array.isArray(moves)) {
              imports[Number(gw)] = moves.filter((move): move is {out: number; in: number} =>
                move !== null && typeof move === "object" && Number.isInteger(move.out) && Number.isInteger(move.in));
            }
          }
          setTransfersState(imports);
          window.localStorage.setItem(storageKey, JSON.stringify(imports));
        } else {
          setTransfersState({});
        }
      }
    } catch {
      setTransfersState({});
    }
  }, [storageKey, teamId]);

  const chipKey = teamId && !shared ? `vortex-chips-${teamId}` : null;
  const capKey = teamId && !shared ? `vortex-captains-${teamId}` : null;
  const lineupKey = teamId && !shared ? `vortex-lineups-${teamId}` : null;
  const viceKey = teamId && !shared ? `vortex-vice-${teamId}` : null;
  useEffect(() => {
    if (!viceKey) return;
    try {
      const raw = window.localStorage.getItem(viceKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore a browser-only draft for the selected team
      setViceCaptainsState(raw ? JSON.parse(raw) as Record<number, number> : {});
    } catch {
      setViceCaptainsState({});
    }
  }, [viceKey]);

  function setViceCaptains(next: Record<number, number>) {
    setViceCaptainsState(next);
    if (!viceKey) return;
    try { window.localStorage.setItem(viceKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }
  useEffect(() => {
    if (!chipKey) return;
    try {
      const raw = window.localStorage.getItem(chipKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved chips once per team
      setChipsState(raw ? (JSON.parse(raw) as ChipMap) : {});
    } catch {
      setChipsState({});
    }
  }, [chipKey]);

  useEffect(() => {
    if (!capKey) return;
    try {
      const raw = window.localStorage.getItem(capKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore saved captain picks once per team
      setCaptainsState(raw ? (JSON.parse(raw) as Record<number, number>) : {});
    } catch {
      setCaptainsState({});
    }
  }, [capKey]);

  useEffect(() => {
    if (!lineupKey) return;
    try {
      const raw = window.localStorage.getItem(lineupKey);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore saved lineups once per team
      setLineupsState(saved && typeof saved === "object" && !Array.isArray(saved) ? saved as LineupMap : {});
    } catch {
      setLineupsState({});
    }
  }, [lineupKey]);

  function setLineups(l: LineupMap) {
    setLineupsState(l);
    if (!lineupKey) return;
    try {
      window.localStorage.setItem(lineupKey, JSON.stringify(l));
    } catch {
      // The current session still works when browser storage is unavailable.
    }
  }

  function setCaptains(c: Record<number, number>) {
    setCaptainsState(c);
    if (!capKey) return;
    try {
      window.localStorage.setItem(capKey, JSON.stringify(c));
    } catch {
      // storage blocked – the picks just won't persist
    }
  }

  /** Leave the shared view: back to your own saved plan. */
  function exitShared() {
    window.history.replaceState(null, "", window.location.pathname);
    setShared(null);
    setTeamId(initialTeamId ?? getSavedTeamId());
    setTransfersState({});
    setChipsState({});
    setCaptainsState({});
    setViceCaptainsState({});
    setLineupsState({});
  }

  /** Keep the shared plan as yours: saved under that team id, replacing any draft saved for it. */
  function keepShared() {
    if (!shared) return;
    const id = String(shared.team);
    try {
      const has = window.localStorage.getItem(`vortex-planner-${id}`);
      if (has && !window.confirm(`This replaces the plan you saved for team #${id}. Continue?`)) return;
      window.localStorage.setItem(`vortex-planner-${id}`, JSON.stringify(transfers));
      window.localStorage.setItem(`vortex-chips-${id}`, JSON.stringify(chips));
      window.localStorage.setItem(`vortex-captains-${id}`, JSON.stringify(captains));
      window.localStorage.setItem(`vortex-vice-${id}`, JSON.stringify(viceCaptains));
      window.localStorage.setItem(`vortex-lineups-${id}`, JSON.stringify(lineups));
    } catch {
      // storage blocked – the plan stays open but will not persist
    }
    saveTeamId(id);
    window.history.replaceState(null, "", window.location.pathname);
    setShared(null);
  }

  function setChips(c: ChipMap) {
    setChipsState(c);
    if (!chipKey) return;
    try {
      window.localStorage.setItem(chipKey, JSON.stringify(c));
    } catch {
      // storage blocked – the chips just won't persist
    }
  }

  function setTransfers(t: TransferMap) {
    setTransfersState(t);
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(t));
    } catch {
      // storage blocked – the draft just won't persist
    }
  }

  const plan = useJson<PlanResponse>(teamId ? `/api/plan/${teamId}?gws=10` : null, 5 * 60 * 1000);
  const bootstrap = useJson<SlimBootstrap>("/api/fpl/bootstrap", 5 * 60 * 1000);

  const ctx = useMemo(() => (plan.data ? makeCtx(plan.data) : null), [plan.data]);
  const fxMap = useMemo(() => (plan.data ? buildFxMap(plan.data.fixtures) : null), [plan.data]);
  const cleanTransfers = useMemo(() => (ctx ? sanitize(ctx, transfers, chips) : transfers), [ctx, transfers, chips]);
  const teams = useMemo(
    () => new Map((bootstrap.data?.teams ?? []).map((t) => [t.id, t] as const)),
    [bootstrap.data],
  );

  const draft = useMemo<PlannerDraft | null>(() => ctx ? encodeDraft(ctx, {
    transfers: cleanTransfers, chips, captains, viceCaptains, lineups,
  }) : null, [ctx, cleanTransfers, chips, captains, viceCaptains, lineups]);

  function loadDraft(imported: PlannerDraft) {
    if (!ctx || shared) return;
    const decoded = decodeDraft(imported, ctx);
    if (!decoded) return;
    setTransfers(decoded.transfers);
    setChips(decoded.chips);
    setCaptains(decoded.captains);
    setViceCaptains(decoded.viceCaptains);
    setLineups(decoded.lineups);
    setTab("planner");
  }

  if (!ready) return <Message>Loading…</Message>;
  if (!teamId) {
    return (
      <TeamIdForm
        onLoad={(id) => {
          saveTeamId(id);
          setTeamId(id);
        }}
      />
    );
  }

  return (
    <main className={embedded ? "vx-dash py-2" : "vx-dash py-4"}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="vx-text flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Dot color="#cda228" /> Team Planner
        </h1>
        <span className="vx-muted text-xs">
          Team #{teamId} ·{" "}
          <button
            type="button"
            className="vx-link font-semibold"
            disabled={embedded}
            onClick={() => setTeamId(null)}
          >
            {embedded ? "linked team" : "change"}
          </button>
        </span>
      </div>

      {shared ? (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(205,162,40,.12)", border: "1px solid rgba(205,162,40,.45)" }}
        >
          <span className="vx-text">
            <b>Shared plan</b> for team #{shared.team}. Your edits here are not saved unless you keep it.
          </span>
          <span className="flex gap-2">
            <button type="button" className="vx-btn vx-btn-primary vx-btn-sm" onClick={keepShared}>
              Keep this plan
            </button>
            <button type="button" className="vx-btn vx-btn-sm" onClick={exitShared}>
              Back to mine
            </button>
          </span>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-active={tab === t.id}
            onClick={() => setTab(t.id)}
            className="vx-btn !px-6 !py-2.5 !text-base"
          >
            {t.label}
          </button>
        ))}
      </div>

      {plan.loading && !plan.data ? (
        <Message>Building projections for every player — this takes a few seconds…</Message>
      ) : plan.error || !plan.data || !ctx || !fxMap ? (
        <div className="vx-card p-6 text-center">
          <p className="vx-down text-sm">{plan.error ?? "Could not load the plan data."}</p>
          <button
            type="button"
            onClick={plan.refresh}
            className="mt-3 rounded-full bg-[#cda228]/20 px-4 py-1.5 text-sm font-semibold vx-gold hover:bg-[#cda228]/30"
          >
            Retry
          </button>
        </div>
      ) : tab === "planner" ? (
        <PlannerView
          plan={plan.data}
          ctx={ctx}
          fxMap={fxMap}
          transfers={cleanTransfers}
          setTransfers={setTransfers}
          chips={chips}
          setChips={setChips}
          captains={captains}
          setCaptains={setCaptains}
          viceCaptains={viceCaptains}
          setViceCaptains={setViceCaptains}
          lineups={lineups}
          setLineups={setLineups}
          elements={bootstrap.data?.elements ?? null}
          teams={teams}
        />
      ) : tab === "simulation" ? (
        <SimulationLab plan={plan.data} onApply={(gameweek, outId, inId) => {
          setTransfers(sanitize(ctx, {...cleanTransfers, [gameweek]: [...(cleanTransfers[gameweek] ?? []), { out: outId, in: inId }]}, chips));
          setTab("planner");
        }} />
      ) : tab === "chips" ? (
        <ChipCalendar plan={plan.data} />
      ) : tab === "prices" ? (
        <PriceIncreases plan={plan.data} bootstrap={bootstrap.data} teams={teams} />
      ) : tab === "injuries" ? (
        <InjuryDesk bootstrap={bootstrap.data} />
      ) : tab === "projections" ? (
        <ProjectionsView plan={plan.data} />
      ) : tab === "solver" ? (
        <SolverView teamId={teamId} plan={plan.data} />
      ) : tab === "insights" ? (
        <StrategyInsightsView key={teamId} teamId={teamId} data={plan.data} ctx={ctx}
          transfers={cleanTransfers} chips={chips} captains={captains} viceCaptains={viceCaptains} lineups={lineups}
          onTransfers={(next) => setTransfers(sanitize(ctx, next, chips))} />
      ) : draft ? (
        <SavedPlansView key={teamId} entryId={Number(teamId)} ctx={ctx} draft={draft} onLoad={loadDraft} />
      ) : null}
    </main>
  );
}
