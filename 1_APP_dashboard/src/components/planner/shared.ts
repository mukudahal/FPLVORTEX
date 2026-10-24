import type { CSSProperties } from "react";
import type { FxCell } from "@/lib/planEngine";
import type { PlanTeam } from "@/lib/planTypes";

export const POS = ["", "GK", "DEF", "MID", "FWD"] as const;

export const money = (tenths: number): string => `£${(tenths / 10).toFixed(1)}m`;

/** Predicted-points colour: warm = poor, green = strong, teal = elite. */
export function xpStyle(xp: number): CSSProperties {
  if (xp >= 7) return { background: "#14d19b", color: "#000" };
  if (xp >= 5) return { background: "#84d21c", color: "#000" };
  if (xp >= 3.5) return { background: "#e5e7eb", color: "#0f172a" };
  return { background: "linear-gradient(90deg,#d946ef,#fb923c)", color: "#fff" };
}

/** "EVE (A)", "EVE (A), ARS (H)" for a double gameweek, or "BLANK". */
export function oppLabel(cells: FxCell[], teams: Map<number, PlanTeam>): string {
  if (cells.length === 0) return "BLANK";
  return cells
    .map((c) => `${teams.get(c.opp)?.short ?? "?"} (${c.home ? "H" : "A"})`)
    .join(", ");
}

/** Fixture-difficulty colour (1–2 easy … 5 hardest), same language as FPL's own tables. */
export function diffStyle(diff: number): CSSProperties {
  if (diff <= 2) return { background: "#84d21c", color: "#0b1220" };
  if (diff === 3) return { background: "#e5e7eb", color: "#0f172a" };
  if (diff === 4) return { background: "#f43f5e", color: "#ffffff" };
  return { background: "#9f1239", color: "#ffffff" };
}
