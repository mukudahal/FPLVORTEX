import type { Chip, ChipMap, LineupMap, TransferMap } from "@/lib/planEngine";

/** Everything needed to rebuild a plan on another device. Ids and gameweeks only. */
export interface SharedPlan {
  team: number;
  transfers: TransferMap;
  chips: ChipMap;
  captains: Record<number, number>;
  viceCaptains?: Record<number, number>;
  lineups?: LineupMap;
}

const CHIPS: Chip[] = ["wc", "fh", "bb", "tc"];
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

function toB64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(text: string): string {
  const b = text.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b + "=".repeat((4 - (b.length % 4)) % 4));
}

/** Compact, ASCII-only encoding so the link stays short. */
export function encodePlan(p: SharedPlan): string {
  const tr: Record<number, number[][]> = {};
  for (const [gw, list] of Object.entries(p.transfers)) {
    if (list.length) tr[Number(gw)] = list.map((t) => [t.out, t.in]);
  }
  return toB64Url(JSON.stringify({ v: 1, t: p.team, tr, ch: p.chips, cp: p.captains, vp: p.viceCaptains, lu: p.lineups }));
}

/** Parses untrusted input from a URL. Returns null unless every field is well-formed. */
export function decodePlan(code: string, team: number): SharedPlan | null {
  try {
    if (code.length > 8000) return null;
    const raw = JSON.parse(fromB64Url(code)) as Record<string, unknown>;
    if (raw.v !== 1 || raw.t !== team) return null;
    const transfers: TransferMap = {};
    const tr = (raw.tr ?? {}) as Record<string, unknown>;
    for (const [gw, list] of Object.entries(tr)) {
      if (!isInt(Number(gw), 1, 60) || !Array.isArray(list) || list.length > 20) return null;
      transfers[Number(gw)] = list.map((pair) => {
        if (!Array.isArray(pair) || !isInt(pair[0], 1, 2000) || !isInt(pair[1], 1, 2000)) throw new Error("bad pair");
        return { out: pair[0], in: pair[1] };
      });
    }
    const chips: ChipMap = {};
    for (const [gw, c] of Object.entries((raw.ch ?? {}) as Record<string, unknown>)) {
      if (!isInt(Number(gw), 1, 60) || !CHIPS.includes(c as Chip)) return null;
      chips[Number(gw)] = c as Chip;
    }
    const captains: Record<number, number> = {};
    for (const [gw, id] of Object.entries((raw.cp ?? {}) as Record<string, unknown>)) {
      if (!isInt(Number(gw), 1, 60) || !isInt(id, 1, 2000)) return null;
      captains[Number(gw)] = id;
    }
    const viceCaptains: Record<number, number> = {};
    if (raw.vp !== undefined) {
      if (!raw.vp || typeof raw.vp !== "object" || Array.isArray(raw.vp)) return null;
      for (const [gw, id] of Object.entries(raw.vp as Record<string, unknown>)) {
        if (!isInt(Number(gw), 1, 60) || !isInt(id, 1, 2000)) return null;
        viceCaptains[Number(gw)] = id;
      }
    }
    const lineups: LineupMap = {};
    for (const [gw, ids] of Object.entries((raw.lu ?? {}) as Record<string, unknown>)) {
      if (!isInt(Number(gw), 1, 60) || !Array.isArray(ids) || ids.length !== 15 ||
          ids.some((id) => !isInt(id, 1, 2000)) || new Set(ids).size !== 15) return null;
      lineups[Number(gw)] = ids;
    }
    return { team, transfers, chips, captains, ...(raw.vp === undefined ? {} : {viceCaptains}), lineups };
  } catch {
    return null;
  }
}

/** Link to the planner page that opens this plan. */
export function planLink(p: SharedPlan): string {
  // A share created inside a team dashboard must open the planner, not the dashboard's default tab.
  const url = new URL(`/planner/${p.team}`, window.location.origin);
  url.searchParams.set("t", String(p.team));
  url.searchParams.set("s", encodePlan(p));
  return url.toString();
}
