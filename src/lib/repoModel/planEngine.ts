// Pure planning logic for the /plan dashboard. No React, no I/O — unit-testable.

import { MAX_FREE_TRANSFERS, MAX_PLAYERS_PER_CLUB, TRANSFER_HIT_COST, nextFreeTransfers, pointsHit, projectedTotal, selectOptimalXI } from "./scoring";
import { futureGwScore } from "./decay";

import type {
  PlanFixture,
  PlanPlayer,
  PlanResponse,
  PlanTransfer,
} from "./planTypes";

export type TransferMap = Record<number, PlanTransfer[]>;
/** First 11 ids start; the remaining ids are the ordered bench, goalkeeper first. */
export type LineupMap = Record<number, number[]>;

/** wc = Wildcard, fh = Free Hit, bb = Bench Boost, tc = Triple Captain. One chip per gameweek. */
export type Chip = "wc" | "fh" | "bb" | "tc";
export type ChipMap = Record<number, Chip>;
export const CHIP_LABEL: Record<Chip, string> = {
  wc: "Wildcard",
  fh: "Free Hit",
  bb: "Bench Boost",
  tc: "Triple Captain",
};
export const CHIP_ORDER: Chip[] = ["wc", "fh", "bb", "tc"];

export interface FxCell {
  opp: number;
  home: boolean;
  diff: number;
}

export const MAX_FT = MAX_FREE_TRANSFERS;
export const HIT_COST = TRANSFER_HIT_COST;
export const MAX_PER_CLUB = MAX_PLAYERS_PER_CLUB;

/* ------------------------------------------------------------------ */
/* fixtures                                                           */
/* ------------------------------------------------------------------ */

export function buildFxMap(fixtures: PlanFixture[]): Map<string, FxCell[]> {
  const m = new Map<string, FxCell[]>();
  const push = (key: string, cell: FxCell) => {
    const arr = m.get(key);
    if (arr) arr.push(cell);
    else m.set(key, [cell]);
  };
  for (const f of fixtures) {
    push(`${f.h}:${f.gw}`, { opp: f.a, home: true, diff: f.hd });
    push(`${f.a}:${f.gw}`, { opp: f.h, home: false, diff: f.ad });
  }
  return m;
}

export function cellsFor(
  fxMap: Map<string, FxCell[]>,
  team: number,
  gw: number,
): FxCell[] {
  return fxMap.get(`${team}:${gw}`) ?? [];
}

/* ------------------------------------------------------------------ */
/* lineup                                                             */
/* ------------------------------------------------------------------ */

export interface XIResult {
  starters: number[]; // [gk, ...outfield]
  bench: number[]; // [gk, ...outfield by xP]
  captain: number | undefined;
  vice: number | undefined;
  formation: string;
  xi: number;
  capXp: number;
  total: number; // xi + captain bonus
}

/** Best valid XI (+ captain/vice + ordered bench) for any set of players. */
export function bestXI(
  ids: number[],
  typeOf: (id: number) => number,
  xpOf: (id: number) => number,
): XIResult {
  const result = selectOptimalXI(ids, typeOf, xpOf);
  return { starters: result.starters, bench: result.bench, captain: result.captain, vice: result.vice,
    formation: result.formation, xi: result.xi, capXp: result.capXp, total: result.total };
}

/* ------------------------------------------------------------------ */
/* planning context                                                   */
/* ------------------------------------------------------------------ */

export interface PlanCtx {
  players: Map<number, PlanPlayer>;
  gws: number[];
  baseSquad: number[]; // 15 ids ordered by pick position
  bank0: number; // tenths
  sell0: Record<number, number>; // selling prices of the real squad
  freeNow: number;
}

export function makeCtx(data: PlanResponse): PlanCtx {
  const players = new Map<number, PlanPlayer>();
  data.players.forEach((p) => players.set(p.id, p));
  return {
    players,
    gws: data.gws,
    baseSquad: [...data.picks]
      .sort((a, b) => a.position - b.position)
      .map((p) => p.element),
    bank0: data.bank,
    sell0: data.sellingPrices,
    freeNow: data.freeTransfers,
  };
}

export const xpAt = (ctx: PlanCtx, id: number, idx: number): number =>
  ctx.players.get(id)?.xp[idx] ?? 0;

export const typeOf = (ctx: PlanCtx, id: number): number =>
  ctx.players.get(id)?.type ?? 0;

export function validateLineup(ctx: PlanCtx, squad: number[], order: number[]): string | null {
  if (order.length !== 15 || new Set(order).size !== 15 || order.some((id) => !squad.includes(id))) {
    return "Choose the 15 players in your current squad.";
  }
  const counts = [1, 2, 3, 4].map((t) => order.slice(0, 11).filter((id) => typeOf(ctx, id) === t).length);
  if (counts[0] !== 1 || typeOf(ctx, order[11]) !== 1) return "Goalkeepers can only swap with each other.";
  if (counts[1] < 3 || counts[1] > 5 || counts[2] < 2 || counts[2] > 5 || counts[3] < 1 || counts[3] > 3) {
    return "Keep a valid formation: 3–5 defenders, 2–5 midfielders and 1–3 forwards.";
  }
  return null;
}

export function validateSubstitution(ctx: PlanCtx, l: XIResult, a: number, b: number): string | null {
  const order = [...l.starters, ...l.bench];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  if (ai < 0 || bi < 0) return "Choose players in your current squad.";
  if ((ai < 11) === (bi < 11)) return "Choose one starter and one bench player.";
  [order[ai], order[bi]] = [order[bi], order[ai]];
  return validateLineup(ctx, [...l.starters, ...l.bench], order);
}

export function lineupAt(ctx: PlanCtx, squad: number[], idx: number, manual?: number[]): XIResult {
  const automatic = bestXI(
    squad,
    (id) => typeOf(ctx, id),
    (id) => xpAt(ctx, id, idx),
  );
  if (!Array.isArray(manual) || manual.length !== 15 || new Set(manual).size !== 15) return automatic;
  // A planned transfer inherits the outgoing player's lineup slot, including on the bench.
  const incoming = squad.filter((id) => !manual.includes(id));
  const order = manual.map((id) => {
    if (squad.includes(id)) return id;
    const at = incoming.findIndex((n) => typeOf(ctx, n) === typeOf(ctx, id));
    return at < 0 ? id : incoming.splice(at, 1)[0];
  });
  if (validateLineup(ctx, squad, order)) return automatic;
  const starters = order.slice(0, 11);
  const bench = order.slice(11);
  const ranked = [...starters].sort((a, b) => xpAt(ctx, b, idx) - xpAt(ctx, a, idx));
  const xi = starters.reduce((sum, id) => sum + xpAt(ctx, id, idx), 0);
  const capXp = xpAt(ctx, ranked[0], idx);
  const formation = [2, 3, 4].map((t) => starters.filter((id) => typeOf(ctx, id) === t).length).join("-");
  return { starters, bench, captain: ranked[0], vice: ranked[1], formation, xi, capXp, total: xi + capXp };
}

/* ------------------------------------------------------------------ */
/* replaying transfers                                                */
/* ------------------------------------------------------------------ */

export interface GwLedger {
  gw: number;
  ftBefore: number;
  n: number; // transfers made this GW
  hit: number; // points cost
  ftAfter: number;
  bankAfter: number;
}

export interface ReplayState {
  squad: number[];
  bank: number;
  buy: Map<number, number>; // price paid for players bought inside the plan
  ledger: GwLedger[];
}

export function sellOf(ctx: PlanCtx, state: Pick<ReplayState, "buy">, id: number): number {
  return state.buy.get(id) ?? ctx.sell0[id] ?? ctx.players.get(id)?.cost ?? 0;
}

/** Apply transfers gameweek by gameweek up to (and including) `uptoGw`. */
export function replay(
  ctx: PlanCtx,
  transfers: TransferMap,
  uptoGw: number,
  chips: ChipMap = {},
): ReplayState {
  const squad = [...ctx.baseSquad];
  const buy = new Map<number, number>();
  let bank = ctx.bank0;
  let ft = ctx.freeNow;
  const ledger: GwLedger[] = [];
  // Free Hit: the squad, bank and buy prices come back after the gameweek.
  let fhRestore: { squad: number[]; bank: number; buy: Map<number, number> } | null = null;

  for (const gw of ctx.gws) {
    if (gw > uptoGw) break;
    if (fhRestore) {
      squad.splice(0, squad.length, ...fhRestore.squad);
      bank = fhRestore.bank;
      buy.clear();
      fhRestore.buy.forEach((v, k) => buy.set(k, v));
      fhRestore = null;
    }
    const chip = chips[gw];
    const freeChip = chip === "wc" || chip === "fh";
    if (chip === "fh") fhRestore = { squad: [...squad], bank, buy: new Map(buy) };
    const list = transfers[gw] ?? [];
    let n = 0;
    for (const t of list) {
      const at = squad.indexOf(t.out);
      const incoming = ctx.players.get(t.in);
      if (at === -1 || !incoming) continue;
      bank += sellOf(ctx, { buy }, t.out) - incoming.cost;
      squad[at] = t.in;
      buy.set(t.in, incoming.cost);
      n++;
    }
    // Wildcard/Free Hit keep banked FTs without earning an additional transfer.
    const hit = pointsHit(n, ft, freeChip);
    const ftAfter = nextFreeTransfers(ft, n, chip);
    ledger.push({ gw, ftBefore: ft, n, hit, ftAfter, bankAfter: bank });
    ft = ftAfter;
  }
  return { squad, bank, buy, ledger };
}

/** Bench Boost counts the bench; Triple Captain triples (instead of doubles) the captain. */
export function applyChipToLineup(l: XIResult, chip: Chip | undefined, ctx: PlanCtx, idx: number): XIResult {
  const benchXp = l.bench.reduce((sum, id) => sum + xpAt(ctx, id, idx), 0);
  return { ...l, total: projectedTotal(l.xi, l.capXp, benchXp, chip) };
}

/** Reason a transfer is not allowed, or null when it is fine. */
export function validateTransfer(
  ctx: PlanCtx,
  state: ReplayState,
  outId: number,
  inId: number,
): string | null {
  const out = ctx.players.get(outId);
  const inc = ctx.players.get(inId);
  if (!out || !inc) return "Unknown player.";
  if (!state.squad.includes(outId)) return `${out.name} is not in your squad.`;
  if (state.squad.includes(inId)) return `${inc.name} is already in your squad.`;
  if (out.type !== inc.type) return "Replacement must play the same position.";
  const clubCount = state.squad.reduce((c, id) => {
    if (id === outId) return c;
    return c + (ctx.players.get(id)?.team === inc.team ? 1 : 0);
  }, 0);
  if (clubCount >= MAX_PER_CLUB) return "Max 3 players from one club.";
  const left = state.bank + sellOf(ctx, state, outId) - inc.cost;
  if (left < 0) return `Over budget by £${(-left / 10).toFixed(1)}m.`;
  return null;
}

/** Replay transfers, dropping any that are no longer valid. */
export function sanitize(ctx: PlanCtx, transfers: TransferMap, chips: ChipMap = {}): TransferMap {
  const clean: TransferMap = {};
  for (const gw of ctx.gws) {
    const wanted = transfers[gw] ?? [];
    if (wanted.length === 0) continue;
    const kept: PlanTransfer[] = [];
    for (const t of wanted) {
      const trial: TransferMap = { ...clean, [gw]: [...kept] };
      const state = replay(ctx, trial, gw, chips);
      if (validateTransfer(ctx, state, t.out, t.in) === null) kept.push(t);
    }
    if (kept.length > 0) clean[gw] = kept;
  }
  return clean;
}

/* ------------------------------------------------------------------ */
/* ranking replacements & auto-plan                                   */
/* ------------------------------------------------------------------ */

export function horizonXP(
  ctx: PlanCtx,
  squad: number[],
  fromIdx: number,
  horizon: number,
  decay = 1,
): number {
  const end = Math.min(ctx.gws.length, fromIdx + horizon);
  const points: number[] = [];
  for (let i = fromIdx; i < end; i++) points.push(lineupAt(ctx, squad, i).total);
  return futureGwScore(points, decay);
}

export interface Ranked {
  id: number;
  gain: number; // horizon xP gain vs keeping the outgoing player
}

/** Every legal replacement for `outId`, best first. */
export function rankReplacements(
  ctx: PlanCtx,
  state: ReplayState,
  outId: number,
  fromIdx: number,
  horizon: number,
  limit = Infinity,
): Ranked[] {
  const out = ctx.players.get(outId);
  if (!out) return [];
  const base = horizonXP(ctx, state.squad, fromIdx, horizon);
  const at = state.squad.indexOf(outId);
  const ranked: Ranked[] = [];
  for (const cand of ctx.players.values()) {
    if (cand.type !== out.type || cand.id === outId) continue;
    if (validateTransfer(ctx, state, outId, cand.id) !== null) continue;
    const next = [...state.squad];
    next[at] = cand.id;
    ranked.push({ id: cand.id, gain: horizonXP(ctx, next, fromIdx, horizon) - base });
  }
  ranked.sort((a, b) => b.gain - a.gain);
  return ranked.slice(0, limit);
}

export interface AutoStep {
  gw: number;
  out: number;
  in: number;
  gain: number;
  hit: number;
}

export interface AutoOptions {
  horizon: number;
  allowHits: boolean;
  fromIdx: number;
  maxPerGw?: number;
  minGainFree?: number;
  minGainHit?: number;
  chips?: ChipMap;
  /** Optional future planning multiplier. Defaults to no discount for existing callers. */
  decay?: number;
}

/**
 * Greedy planner: at each gameweek, take the single best swap while its
 * horizon gain beats the roll threshold (free transfer) or hit threshold.
 */
export function autoPlan(
  ctx: PlanCtx,
  existing: TransferMap,
  opts: AutoOptions,
): { transfers: TransferMap; steps: AutoStep[] } {
  const maxPerGw = opts.maxPerGw ?? 2;
  const minFree = opts.minGainFree ?? 1.5;
  const minHit = opts.minGainHit ?? HIT_COST + 2;

  const tm: TransferMap = {};
  for (const gw of ctx.gws.slice(0, opts.fromIdx)) {
    if (existing[gw]) tm[gw] = [...existing[gw]];
  }
  const steps: AutoStep[] = [];

  for (let idx = opts.fromIdx; idx < ctx.gws.length; idx++) {
    const gw = ctx.gws[idx];
    const chip = opts.chips?.[gw];
    if (chip === "fh") continue; // Free Hit squads revert, so auto plan leaves them to you
    for (let k = 0; k < maxPerGw; k++) {
      const state = replay(ctx, tm, gw, opts.chips);
      const row = state.ledger[state.ledger.length - 1];
      const nowN = tm[gw]?.length ?? 0;
      const isHit = chip === "wc" ? false : nowN + 1 > row.ftBefore;
      if (isHit && !opts.allowHits) break;

      const base = horizonXP(ctx, state.squad, idx, opts.horizon, opts.decay);
      // shortlist: top candidates per position by horizon xP
      const pool = new Map<number, number[]>();
      for (const t of [1, 2, 3, 4]) {
        const list = [...ctx.players.values()]
          .filter((p) => p.type === t && !state.squad.includes(p.id))
          .map((p) => ({
            id: p.id,
            s: futureGwScore(p.xp.slice(idx, idx + opts.horizon), opts.decay ?? 1),
          }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 25)
          .map((x) => x.id);
        pool.set(t, list);
      }

      let best: { out: number; inn: number; gain: number } | null = null;
      for (const outId of state.squad) {
        const t = typeOf(ctx, outId);
        const at = state.squad.indexOf(outId);
        for (const cId of pool.get(t) ?? []) {
          if (validateTransfer(ctx, state, outId, cId) !== null) continue;
          const next = [...state.squad];
          next[at] = cId;
          const gain = horizonXP(ctx, next, idx, opts.horizon, opts.decay) - base;
          if (!best || gain > best.gain) best = { out: outId, inn: cId, gain };
        }
      }
      if (!best) break;
      const need = isHit ? minHit : minFree;
      if (best.gain < need) break;
      tm[gw] = [...(tm[gw] ?? []), { out: best.out, in: best.inn }];
      steps.push({ gw, out: best.out, in: best.inn, gain: best.gain, hit: isHit ? HIT_COST : 0 });
    }
  }
  return { transfers: tm, steps };
}

/* ------------------------------------------------------------------ */
/* summary helpers                                                    */
/* ------------------------------------------------------------------ */

export interface GwSummary {
  fixturesLineup: number;
  fixturesSquad: number;
  dgwLineup: number;
  dgwSquad: number;
  blankLineup: number;
  blankSquad: number;
  fdrCounts: number[]; // index 0..4 = difficulty 1..5, over every squad fixture
}

export function summarise(
  ctx: PlanCtx,
  fxMap: Map<string, FxCell[]>,
  squad: number[],
  lineup: XIResult,
  gw: number,
): GwSummary {
  const start = new Set(lineup.starters);
  const out: GwSummary = {
    fixturesLineup: 0,
    fixturesSquad: 0,
    dgwLineup: 0,
    dgwSquad: 0,
    blankLineup: 0,
    blankSquad: 0,
    fdrCounts: [0, 0, 0, 0, 0],
  };
  for (const id of squad) {
    const p = ctx.players.get(id);
    if (!p) continue;
    const cells = cellsFor(fxMap, p.team, gw);
    const inXI = start.has(id);
    out.fixturesSquad += cells.length;
    if (inXI) out.fixturesLineup += cells.length;
    if (cells.length === 0) {
      out.blankSquad++;
      if (inXI) out.blankLineup++;
    }
    if (cells.length >= 2) {
      out.dgwSquad++;
      if (inXI) out.dgwLineup++;
    }
    for (const c of cells) {
      if (c.diff >= 1 && c.diff <= 5) out.fdrCounts[c.diff - 1]++;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* best single moves right now                                        */
/* ------------------------------------------------------------------ */

export interface Move {
  out: number;
  in: number;
  gain: number;
}

/** Best replacement for each squad player, sorted by horizon gain. */
export function topMoves(
  ctx: PlanCtx,
  state: ReplayState,
  idx: number,
  horizon: number,
  limit = 5,
): Move[] {
  const base = horizonXP(ctx, state.squad, idx, horizon);
  const pool = new Map<number, number[]>();
  for (const t of [1, 2, 3, 4]) {
    pool.set(
      t,
      [...ctx.players.values()]
        .filter((p) => p.type === t && !state.squad.includes(p.id))
        .map((p) => ({
          id: p.id,
          s: p.xp.slice(idx, idx + horizon).reduce((a, b) => a + b, 0),
        }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 30)
        .map((x) => x.id),
    );
  }
  const moves: Move[] = [];
  for (const outId of state.squad) {
    const at = state.squad.indexOf(outId);
    let best: Move | null = null;
    for (const cId of pool.get(typeOf(ctx, outId)) ?? []) {
      if (validateTransfer(ctx, state, outId, cId) !== null) continue;
      const next = [...state.squad];
      next[at] = cId;
      const gain = horizonXP(ctx, next, idx, horizon) - base;
      if (!best || gain > best.gain) best = { out: outId, in: cId, gain };
    }
    if (best && best.gain > 0) moves.push(best);
  }
  return moves.sort((a, b) => b.gain - a.gain).slice(0, limit);
}
