/** Backward-compatible wire format used by the single Team Planner workspace. */
import type { Chip, ChipMap, LineupMap, PlanCtx, TransferMap } from "./planEngine";
import { sanitize } from "./planEngine";
import { fromSaved } from "./planStorage";

export interface PlannerDraft {
  kind: "vortex-planner";
  version: 3;
  startGw: number;
  transfers: TransferMap;
  chips: ChipMap;
  captains: Record<number, number>;
  viceCaptains: Record<number, number>;
  lineups: LineupMap;
}

interface LegacyGameweek {
  gw?: unknown;
  transfers?: unknown;
  chip?: unknown;
  starters?: unknown;
  bench?: unknown;
  captainId?: unknown;
  viceId?: unknown;
}

const CHIPS: Readonly<Record<string, Chip>> = {
  wildcard: "wc", freehit: "fh", bboost: "bb", "3xc": "tc",
  wc: "wc", fh: "fh", bb: "bb", tc: "tc",
};
const isRecord = (data: unknown): data is Record<string, unknown> =>
  typeof data === "object" && data !== null && !Array.isArray(data);
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

function transferMap(value: unknown, ctx: PlanCtx): TransferMap {
  if (!isRecord(value)) return {};
  const result: TransferMap = {};
  for (const [key, rawTransfers] of Object.entries(value)) {
    const gw = Number(key);
    if (!ctx.gws.includes(gw) || !Array.isArray(rawTransfers) || rawTransfers.length > 20) continue;
    const pairs = rawTransfers.filter((move): move is {out: number; in: number} =>
      isRecord(move) && positiveId(move.out) && positiveId(move.in) && move.out !== move.in,
    ).map(({out, in: incoming}) => ({out, in: incoming}));
    if (pairs.length) result[gw] = pairs;
  }
  return result;
}

function chipMap(value: unknown, ctx: PlanCtx): ChipMap {
  if (!isRecord(value)) return {};
  const result: ChipMap = {};
  for (const [key, chip] of Object.entries(value)) {
    const gw = Number(key);
    if (!ctx.gws.includes(gw) || typeof chip !== "string" || !CHIPS[chip]) continue;
    result[gw] = CHIPS[chip];
  }
  return result;
}

function captainMap(value: unknown, ctx: PlanCtx): Record<number, number> {
  if (!isRecord(value)) return {};
  const result: Record<number, number> = {};
  for (const [key, playerId] of Object.entries(value)) {
    const gw = Number(key);
    if (ctx.gws.includes(gw) && positiveId(playerId) && ctx.players.has(playerId)) result[gw] = playerId;
  }
  return result;
}

function lineupMap(value: unknown, ctx: PlanCtx): LineupMap {
  if (!isRecord(value)) return {};
  const result: LineupMap = {};
  for (const [key, lineup] of Object.entries(value)) {
    const gw = Number(key);
    if (!ctx.gws.includes(gw) || !Array.isArray(lineup) || lineup.length !== 15) continue;
    if (lineup.every((id): id is number => positiveId(id) && ctx.players.has(id)) && new Set(lineup).size === 15) {
      result[gw] = lineup;
    }
  }
  return result;
}

export function emptyDraft(ctx: PlanCtx): PlannerDraft {
  return {kind: "vortex-planner", version: 3, startGw: ctx.gws[0] ?? 1,
    transfers: {}, chips: {}, captains: {}, viceCaptains: {}, lineups: {}};
}

export function encodeDraft(ctx: PlanCtx, draft: Omit<PlannerDraft, "kind" | "version" | "startGw">): PlannerDraft {
  return {kind: "vortex-planner", version: 3, startGw: ctx.gws[0] ?? 1,
    transfers: draft.transfers, chips: draft.chips, captains: draft.captains,
    viceCaptains: draft.viceCaptains, lineups: draft.lineups};
}

/** Convert both historical formats without allowing invalid remote records to affect the planner. */
export function decodeDraft(raw: unknown, ctx: PlanCtx): PlannerDraft | null {
  if (!isRecord(raw)) return null;
  const draft = emptyDraft(ctx);
  if (raw.kind === "vortex-planner" && raw.version === 3) {
    draft.chips = chipMap(raw.chips, ctx);
    draft.transfers = sanitize(ctx, transferMap(raw.transfers, ctx), draft.chips);
    draft.captains = captainMap(raw.captains, ctx);
    draft.viceCaptains = captainMap(raw.viceCaptains, ctx);
    draft.lineups = lineupMap(raw.lineups, ctx);
    return draft;
  }
  if (raw.kind === "plan-dashboard" && raw.v === 2) {
    draft.transfers = sanitize(ctx, transferMap(fromSaved(raw), ctx));
    return draft;
  }
  if (Array.isArray(raw.gws) && raw.gws.length <= 38) {
    const transfers: TransferMap = {};
    const chips: ChipMap = {};
    const captains: Record<number, number> = {};
    const viceCaptains: Record<number, number> = {};
    const lineups: LineupMap = {};
    for (const item of raw.gws as LegacyGameweek[]) {
      if (!isRecord(item) || !ctx.gws.includes(Number(item.gw))) continue;
      const gw = Number(item.gw);
      if (Array.isArray(item.transfers)) transfers[gw] = item.transfers as TransferMap[number];
      if (typeof item.chip === "string" && CHIPS[item.chip]) chips[gw] = CHIPS[item.chip];
      if (positiveId(item.captainId)) captains[gw] = item.captainId;
      if (positiveId(item.viceId)) viceCaptains[gw] = item.viceId;
      if (Array.isArray(item.starters) && Array.isArray(item.bench)) {
        lineups[gw] = [...item.starters, ...item.bench] as number[];
      }
    }
    draft.chips = chipMap(chips, ctx);
    draft.transfers = sanitize(ctx, transferMap(transfers, ctx), draft.chips);
    draft.captains = captainMap(captains, ctx);
    draft.viceCaptains = captainMap(viceCaptains, ctx);
    draft.lineups = lineupMap(lineups, ctx);
    return draft;
  }
  return null;
}
