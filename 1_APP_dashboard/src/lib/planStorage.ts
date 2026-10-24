import type { TransferMap } from "./planEngine";
import type { PlanTransfer, SavedPlanData } from "./planTypes";

export interface StoredPlan {
  name: string;
  data: SavedPlanData;
}

const localKey = (teamId: string) => `fpl-plan-v2:${teamId}`;
const watchKey = (teamId: string) => `fpl-watch-v1:${teamId}`;

export function toSaved(startGw: number, transfers: TransferMap): SavedPlanData {
  const out: Record<string, PlanTransfer[]> = {};
  for (const [gw, list] of Object.entries(transfers)) {
    if (list.length > 0) out[gw] = list.map((t) => ({ out: t.out, in: t.in }));
  }
  return { kind: "plan-dashboard", v: 2, startGw, transfers: out };
}

export function fromSaved(data: unknown): TransferMap {
  const out: TransferMap = {};
  if (!data || typeof data !== "object") return out;
  const d = data as Partial<SavedPlanData>;
  if (d.kind !== "plan-dashboard" || !d.transfers || typeof d.transfers !== "object") return out;
  for (const [gw, list] of Object.entries(d.transfers)) {
    const n = Number(gw);
    if (!Number.isInteger(n) || !Array.isArray(list)) continue;
    const clean = list
      .filter((t) => t && Number.isInteger(t.out) && Number.isInteger(t.in))
      .map((t) => ({ out: t.out, in: t.in }));
    if (clean.length > 0) out[n] = clean;
  }
  return out;
}

export function readLocal(teamId: string): StoredPlan | null {
  try {
    const raw = window.localStorage.getItem(localKey(teamId));
    if (!raw) return null;
    const p = JSON.parse(raw) as StoredPlan;
    return p && typeof p.name === "string" ? p : null;
  } catch {
    return null;
  }
}

export function writeLocal(teamId: string, plan: StoredPlan): void {
  try {
    window.localStorage.setItem(localKey(teamId), JSON.stringify(plan));
  } catch {
    /* storage unavailable (private mode / quota) — server copy still works */
  }
}

export function readWatch(teamId: string): number[] {
  try {
    const raw = window.localStorage.getItem(watchKey(teamId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export function writeWatch(teamId: string, ids: number[]): void {
  try {
    window.localStorage.setItem(watchKey(teamId), JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export interface ServerPlan {
  id: number;
  name: string;
  data: unknown;
}

export async function loadServerPlan(teamId: string): Promise<ServerPlan | null> {
  const res = await fetch(`/api/plans?entry=${encodeURIComponent(teamId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`plans ${res.status}`);
  const rows = (await res.json()) as ServerPlan[];
  return (
    rows.find((r) => (r.data as { kind?: string } | null)?.kind === "plan-dashboard") ?? null
  );
}

export async function saveServerPlan(args: {
  teamId: string;
  name: string;
  data: SavedPlanData;
  projectedPoints: number;
  id: number | null;
}): Promise<number> {
  const res = await fetch("/api/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entryId: Number(args.teamId),
      name: args.name,
      data: args.data,
      projectedPoints: args.projectedPoints,
      id: args.id ?? undefined,
    }),
  });
  const json = (await res.json()) as { id?: number; error?: string };
  if (!res.ok || json.error || typeof json.id !== "number") {
    throw new Error(json.error ?? `plans ${res.status}`);
  }
  return json.id;
}
