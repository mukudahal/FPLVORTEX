"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Dot, Pager, Tabs } from "@/components/home/ui";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { TeamBadge } from "@/components/TeamBadge";
import {
  CHIP_LABEL,
  CHIP_ORDER,
  applyChipToLineup,
  autoPlan,
  cellsFor,
  horizonXP,
  lineupAt,
  replay,
  sanitize,
  sellOf,
  validateTransfer,
  validateSubstitution,
  xpAt,
  type Chip,
  type ChipMap,
  type FxCell,
  type PlanCtx,
  type LineupMap,
  type TransferMap,
} from "@/lib/planEngine";
import { planLink } from "@/lib/planShare";
import type { PlanPlayer, PlanResponse, PlanTeam } from "@/lib/planTypes";
import type { SlimElement, SlimTeam } from "@/lib/types";
import { MarketPanel } from "./MarketPanel";
import { POS, diffStyle, money, oppLabel } from "./shared";

const HORIZON = 5;
const POOL_PAGE = 50;

type ColKey = "fixtures" | "price" | "owned" | "pts" | "xp" | "opta" | "xp5" | "form" | "net" | "pct";
type SortKey = "name" | "fixtures" | "price" | "owned" | "pts" | "xp" | "opta" | "xp5" | "form" | "net" | "pct";

const COLS: { key: ColKey; label: string; width: number; sort?: SortKey; hint: string }[] = [
  { key: "fixtures", label: "Fixtures", width: 176, sort: "fixtures", hint: "Next 5 gameweeks, coloured by difficulty. Click to sort by easiest run" },
  { key: "price", label: "£", width: 66, sort: "price", hint: "Current price" },
  { key: "owned", label: "%", width: 62, sort: "owned", hint: "Ownership" },
  { key: "pts", label: "Pts", width: 50, sort: "pts", hint: "Season points" },
  { key: "xp", label: "xPts", width: 58, sort: "xp", hint: "Predicted points this gameweek (FPL Vortex model)" },
  { key: "opta", label: "Opta xP", width: 76, sort: "opta", hint: "Own prediction built from Opta xG / xA / clean-sheet rates, minutes and fixture difficulty, next 5 gameweeks" },
  { key: "xp5", label: "xP×5", width: 62, sort: "xp5", hint: "Vortex model, next 5 gameweeks" },
  { key: "form", label: "Form", width: 56, sort: "form", hint: "FPL form" },
  { key: "net", label: "Net", width: 76, sort: "net", hint: "Net transfers this gameweek" },
  { key: "pct", label: "Δ%", width: 64, sort: "pct", hint: "Progress toward a price change" },
];
const DEFAULT_COLS: ColKey[] = ["fixtures", "price", "owned", "pts", "xp", "opta"];

const GOAL_PTS: Record<number, number> = { 1: 6, 2: 6, 3: 5, 4: 4 };
const CS_PTS: Record<number, number> = { 1: 4, 2: 4, 3: 1, 4: 0 };
const ATT_MULT: Record<number, number> = { 1: 1.25, 2: 1.12, 3: 1, 4: 0.88, 5: 0.75 };
const DEF_MULT: Record<number, number> = { 1: 1.35, 2: 1.15, 3: 1, 4: 0.8, 5: 0.65 };

/**
 * Own prediction from Opta-sourced per-90 data (FPL's expected stats are Opta's):
 * appearance + goals (xG/90) + assists (xA/90) + clean sheets + bonus, each scaled by the chance the
 * player plays and by the fixture's difficulty. Summed over the next `n` gameweeks (doubles count twice).
 */
function optaXP(
  p: PlanPlayer,
  el: SlimElement | undefined,
  fromIdx: number,
  ctx: PlanCtx,
  fxMap: Map<string, FxCell[]>,
  gamesPlayed: number,
  n = HORIZON,
): number {
  if (!el) return 0;
  const share = Math.min(1, el.minutes / (90 * Math.max(1, gamesPlayed)));
  const avail = (p.chance != null ? p.chance / 100 : p.status === "a" ? 1 : p.status === "d" ? 0.5 : 0) * (0.15 + 0.85 * share);
  if (avail <= 0) return 0;
  const n90 = Math.max(el.minutes / 90, 0.01);
  const xg = el.expected_goals_per_90 || 0;
  const xa = el.expected_assists_per_90 || 0;
  const cs90 = 0.5 * (el.clean_sheets_per_90 || 0) + 0.5 * 0.28;
  const bonus90 = el.bonus / n90;
  let total = 0;
  for (let i = fromIdx; i < Math.min(ctx.gws.length, fromIdx + n); i++) {
    for (const c of cellsFor(fxMap, p.team, ctx.gws[i])) {
      const att = ATT_MULT[c.diff] ?? 1;
      const def = DEF_MULT[c.diff] ?? 1;
      const pts =
        2 +
        GOAL_PTS[p.type] * xg * att +
        3 * xa * att +
        CS_PTS[p.type] * Math.min(0.6, cs90 * def) +
        0.6 * bonus90;
      total += pts * avail;
    }
  }
  return total;
}

/** Higher = easier next 5 fixtures (blank = 0, doubles add up). */
function fixtureEase(team: number, fromIdx: number, ctx: PlanCtx, fxMap: Map<string, FxCell[]>): number {
  let e = 0;
  for (let i = fromIdx; i < Math.min(ctx.gws.length, fromIdx + HORIZON); i++)
    for (const c of cellsFor(fxMap, team, ctx.gws[i])) e += 6 - c.diff;
  return e;
}

function SortIcon({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg
      viewBox="0 0 12 16"
      aria-hidden
      className="h-4 w-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6.5 6 3l3.5 3.5" opacity={dir === "desc" ? 0.3 : 1} />
      <path d="M2.5 9.5 6 13l3.5-3.5" opacity={dir === "asc" ? 0.3 : 1} />
    </svg>
  );
}

function FixChips({
  team,
  fromIdx,
  ctx,
  fxMap,
  teamMap,
  n = HORIZON,
}: {
  team: number;
  fromIdx: number;
  ctx: PlanCtx;
  fxMap: Map<string, FxCell[]>;
  teamMap: Map<number, PlanTeam>;
  n?: number;
}) {
  const out: ReactNode[] = [];
  for (let i = fromIdx; i < Math.min(ctx.gws.length, fromIdx + n); i++) {
    const cells = cellsFor(fxMap, team, ctx.gws[i]);
    if (cells.length === 0) {
      out.push(
        <span key={i} className="fixchip" style={{ background: "#475569", color: "#fff" }}>
          –
        </span>,
      );
    } else {
      cells.forEach((c, k) => {
        const short = teamMap.get(c.opp)?.short ?? "?";
        out.push(
          <span key={`${i}-${k}`} className="fixchip" style={diffStyle(c.diff)}>
            {c.home ? short.toUpperCase() : short.toLowerCase()}
          </span>,
        );
      });
    }
  }
  return <div className="flex flex-nowrap gap-0.5">{out}</div>;
}

type Lineup = ReturnType<typeof lineupAt>;

/** The captain and vice must both start; a transferred/benched selection falls back to the best available XI. */
function withCaptain(l: Lineup, capId: number | undefined, viceId: number | undefined, ctx: PlanCtx, idx: number): Lineup {
  const captain = capId !== undefined && l.starters.includes(capId) ? capId : l.captain;
  const vice = viceId !== undefined && viceId !== captain && l.starters.includes(viceId)
    ? viceId : l.vice !== captain ? l.vice : l.starters.find((id) => id !== captain);
  const capXp = captain === undefined ? 0 : xpAt(ctx, captain, idx);
  return { ...l, captain, vice, capXp, total: l.xi + capXp };
}

function PitchCard({
  id,
  ctx,
  idx,
  fxMap,
  teamMap,
  captain,
  vice,
  isNew,
  selected,
  benchLabel,
  onSelect,
  onCaptain,
  substituting,
}: {
  id: number;
  ctx: PlanCtx;
  idx: number;
  fxMap: Map<string, FxCell[]>;
  teamMap: Map<number, PlanTeam>;
  captain: boolean;
  vice: boolean;
  isNew: boolean;
  selected: boolean;
  benchLabel?: string;
  onSelect: () => void;
  onCaptain?: () => void;
  substituting: boolean;
}) {
  const p = ctx.players.get(id);
  if (!p) return null;
  const xp = xpAt(ctx, id, idx);
  const cells = cellsFor(fxMap, p.team, ctx.gws[idx]);
  const flagged = p.status !== "a";
  const top = benchLabel ? 22 : 4;
  return (
    <button
      type="button"
      onClick={onSelect}
      title={selected ? "Click to cancel" : substituting ? `Substitute ${p.name}` : `Replace ${p.name}`}
      aria-label={`${substituting ? "Substitute" : "Transfer out"} ${p.name}, ${benchLabel ? "bench" : "starting XI"}`}
      aria-pressed={selected}
      className="relative w-[18%] min-w-[58px] max-w-[96px] text-center transition hover:scale-[1.04] active:scale-95"
      style={selected ? { outline: "3px solid #84d21c", outlineOffset: 3, borderRadius: 12 } : undefined}
    >
      {benchLabel ? (
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,.8)" }}>
          {benchLabel}
        </div>
      ) : null}
      {captain || vice ? (
        <span
          className="absolute left-1 z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold shadow"
          style={{ top, background: "#0b1220", color: "#fff", border: "1px solid rgba(255,255,255,.75)" }}
        >
          {captain ? "C" : "V"}
        </span>
      ) : onCaptain && !substituting ? (
        <span
          role="button"
          tabIndex={0}
          title={`Make ${p.name} captain`}
          aria-label={`Make ${p.name} captain`}
          onClick={(e) => {
            e.stopPropagation();
            onCaptain();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onCaptain();
            }
          }}
          className="absolute left-1 z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold opacity-70 shadow hover:opacity-100"
          style={{ top, background: "rgba(11,18,32,.45)", color: "#fff", border: "1px dashed rgba(255,255,255,.75)" }}
        >
          C
        </span>
      ) : null}
      {!substituting ? <span
        className="absolute right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-extrabold shadow"
        style={{ top, background: "rgba(11,18,32,.85)", color: "#fff" }}
        aria-hidden
      >
        ×
      </span> : null}
      <div className="relative overflow-hidden rounded-t-lg" style={{ background: "rgba(0,0,0,.3)" }}>
        <PlayerPhoto code={p.code} alt={p.name} className="mx-auto h-[52px] w-auto sm:h-[64px]" />
        <span
          className="absolute bottom-1 right-1 rounded-md px-1.5 text-[11px] font-extrabold"
          style={{ background: "rgba(11,18,32,.85)", color: "#fff" }}
        >
          {xp.toFixed(1)}
        </span>
        {isNew ? (
          <span
            className="absolute bottom-1 left-1 rounded-md px-1.5 text-[10px] font-extrabold"
            style={{ background: "#84d21c", color: "#000" }}
          >
            NEW
          </span>
        ) : flagged ? (
          <span
            className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-extrabold"
            style={{
              background: p.status === "d" ? "#fbbf24" : "#f43f5e",
              color: p.status === "d" ? "#422006" : "#fff",
            }}
            title={p.news}
          >
            !
          </span>
        ) : null}
      </div>
      <div
        className="truncate px-0.5 py-0.5 text-[11px] font-extrabold sm:text-xs"
        style={{ background: "#fff", color: "#0f172a" }}
      >
        {p.name}
      </div>
      <div
        className="truncate rounded-b-lg px-0.5 py-0.5 text-[11px] font-extrabold sm:text-xs"
        style={cells.length ? diffStyle(cells[0].diff) : { background: "#475569", color: "#fff" }}
      >
        {oppLabel(cells, teamMap)}
      </div>
    </button>
  );
}

export function PlannerView({
  plan,
  ctx,
  fxMap,
  transfers,
  setTransfers,
  chips,
  setChips,
  captains,
  setCaptains,
  viceCaptains,
  setViceCaptains,
  lineups: manualLineups,
  setLineups,
  elements,
  teams,
}: {
  plan: PlanResponse;
  ctx: PlanCtx;
  fxMap: Map<string, FxCell[]>;
  transfers: TransferMap;
  setTransfers: (t: TransferMap) => void;
  chips: ChipMap;
  setChips: (c: ChipMap) => void;
  captains: Record<number, number>;
  setCaptains: (c: Record<number, number>) => void;
  viceCaptains: Record<number, number>;
  setViceCaptains: (c: Record<number, number>) => void;
  lineups: LineupMap;
  setLineups: (l: LineupMap) => void;
  elements: SlimElement[] | null;
  teams: Map<number, SlimTeam>;
}) {
  /* ------------------------------ plan state ------------------------------ */
  const [idx, setIdx] = useState(0);
  const [outId, setOutId] = useState<number | null>(null);
  const [substituting, setSubstituting] = useState(false);
  const [subId, setSubId] = useState<number | null>(null);
  const [view, setView] = useState<"pitch" | "table">("pitch");
  const [notice, setNotice] = useState<{ kind: "info" | "ok" | "error"; text: string } | null>(null);
  const [bannerOpen, setBannerOpen] = useState(true);
  function setVice(gwNum: number, id: number | null) {
    const next = { ...viceCaptains };
    if (id === null) delete next[gwNum];
    else next[gwNum] = id;
    setViceCaptains(next);
  }

  function setCaptain(gwNum: number, id: number | null) {
    const next = { ...captains };
    if (id === null) delete next[gwNum];
    else next[gwNum] = id;
    setCaptains(next);
  }

  /* ------------------------------ pool filters ---------------------------- */
  const maxCost = useMemo(() => Math.ceil(plan.players.reduce((m, p) => Math.max(m, p.cost), 0) / 10) * 10, [plan.players]);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState(0);
  const [maxOwn, setMaxOwn] = useState(100);
  const [maxPrice, setMaxPrice] = useState<number | null>(null); // tenths; null = no cap
  const [teamSet, setTeamSet] = useState<Set<number>>(new Set());
  const [cols, setCols] = useState<ColKey[]>(DEFAULT_COLS);
  const [sortKey, setSortKey] = useState<SortKey>("opta");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(0);
  const [popover, setPopover] = useState<"teams" | "columns" | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const teamMap = useMemo(() => new Map(plan.teams.map((t) => [t.id, t] as const)), [plan.teams]);
  const elMap = useMemo(() => new Map((elements ?? []).map((e) => [e.id, e] as const)), [elements]);
  const states = useMemo(() => ctx.gws.map((g) => replay(ctx, transfers, g, chips)), [ctx, transfers, chips]);
  const lineups = useMemo(
    () =>
      ctx.gws.map((g, i) =>
        applyChipToLineup(withCaptain(lineupAt(ctx, states[i].squad, i, manualLineups[g]), captains[g], viceCaptains[g], ctx, i), chips[g], ctx, i),
      ),
    [ctx, states, captains, viceCaptains, chips, manualLineups],
  );
  const state = states[idx];
  const lineup = lineups[idx];
  const gw = ctx.gws[idx];
  const ledger = state.ledger.find((l) => l.gw === gw);
  const gwNet = (i: number) => lineups[i].total - (states[i].ledger[i]?.hit ?? 0);
  const movesHere = transfers[gw] ?? [];
  const squadSet = useMemo(() => new Set(state.squad), [state.squad]);
  const outPlayer = outId != null ? ctx.players.get(outId) : null;
  const budget = outId != null ? sellOf(ctx, state, outId) + state.bank : Infinity;

  /* ------------------------------ actions --------------------------------- */
  function commit(next: TransferMap, nextChips: ChipMap = chips) {
    const clean = sanitize(ctx, next, nextChips);
    const saved = { ...manualLineups };
    ctx.gws.forEach((g, i) => {
      if (!saved[g]) return;
      const current = lineupAt(ctx, states[i].squad, i, saved[g]);
      const updated = replay(ctx, clean, g, nextChips);
      // Replay retains each squad slot, so multiple same-position transfers keep the correct roles.
      saved[g] = [...current.starters, ...current.bench].map((id) => updated.squad[states[i].squad.indexOf(id)]);
    });
    setLineups(saved);
    setTransfers(clean);
  }

  function selectOut(id: number) {
    if (outId === id) {
      setOutId(null);
      setPos(0);
      setNotice(null);
      return;
    }
    const p = ctx.players.get(id);
    setOutId(id);
    setPos(p?.type ?? 0); // left list jumps to this player's position
    setPage(0);
    setNotice({
      kind: "info",
      text: `Replacing ${p?.name}. Pick a replacement from the list — budget ${money(
        sellOf(ctx, state, id) + state.bank,
      )}.`,
    });
  }

  function clearOut() {
    setOutId(null);
    setSubId(null);
    setPos(0);
    setNotice(null);
  }

  function selectPlayer(id: number) {
    if (!substituting) return selectOut(id);
    if (subId === id) {
      setSubId(null);
      setNotice(null);
      return;
    }
    if (subId === null) {
      setSubId(id);
      setNotice({ kind: "info", text: `Selected ${ctx.players.get(id)?.name}. Now choose ${lineup.starters.includes(id) ? "a bench player" : "a starter"} to swap.` });
      return;
    }
    const error = validateSubstitution(ctx, lineup, subId, id);
    if (error) {
      setNotice({ kind: "error", text: error });
      return;
    }
    const order = [...lineup.starters, ...lineup.bench];
    const a = order.indexOf(subId);
    const b = order.indexOf(id);
    [order[a], order[b]] = [order[b], order[a]];
    setLineups({ ...manualLineups, [gw]: order });
    // Keep the captain when still starting; otherwise promote the vice or best remaining starter.
    const starters = order.slice(0, 11);
    const captain = [lineup.captain, lineup.vice].find((c) => c !== undefined && starters.includes(c)) ??
      [...starters].sort((x, y) => xpAt(ctx, y, idx) - xpAt(ctx, x, idx))[0];
    setCaptain(gw, captain);
    setSubId(null);
    setNotice({ kind: "ok", text: `GW${gw}: ${ctx.players.get(subId)?.name} ↔ ${ctx.players.get(id)?.name}. Lineup saved; no transfer used.` });
  }

  function restoreAutoXI() {
    const next = { ...manualLineups };
    delete next[gw];
    setLineups(next);
    setSubstituting(false);
    clearOut();
    setNotice({ kind: "info", text: `GW${gw}: automatic XI and bench restored.` });
  }

  function transferIn(inId: number) {
    if (outId == null) return;
    const err = validateTransfer(ctx, state, outId, inId);
    if (err) {
      setNotice({ kind: "error", text: err });
      return;
    }
    const o = ctx.players.get(outId)?.name;
    const n = ctx.players.get(inId)?.name;
    commit({ ...transfers, [gw]: [...movesHere, { out: outId, in: inId }] });
    setOutId(null);
    setPos(0);
    setNotice({ kind: "ok", text: `GW${gw}: ${o} → ${n}` });
  }

  /** No player selected on the pitch: pick the best legal player to swap out automatically. */
  function autoAdd(inId: number) {
    const inc = ctx.players.get(inId);
    if (!inc) return;
    const base = horizonXP(ctx, state.squad, idx, HORIZON);
    let best: { out: number; gain: number } | null = null;
    for (const out of state.squad) {
      if (ctx.players.get(out)?.type !== inc.type) continue;
      if (validateTransfer(ctx, state, out, inId) !== null) continue;
      const next = state.squad.map((x) => (x === out ? inId : x));
      const gain = horizonXP(ctx, next, idx, HORIZON) - base;
      if (!best || gain > best.gain) best = { out, gain };
    }
    if (!best) {
      setNotice({
        kind: "error",
        text: `No legal swap for ${inc.name} — check your budget and the 3-per-club limit.`,
      });
      return;
    }
    commit({ ...transfers, [gw]: [...movesHere, { out: best.out, in: inId }] });
    setNotice({
      kind: "ok",
      text: `GW${gw}: ${ctx.players.get(best.out)?.name} → ${inc.name} (auto-picked, ${
        best.gain >= 0 ? "+" : ""
      }${best.gain.toFixed(1)} xPts over ${HORIZON} GWs)`,
    });
  }

  function removeMove(i: number) {
    commit({ ...transfers, [gw]: movesHere.filter((_, k) => k !== i) });
  }

  function runAuto() {
    const { transfers: t, steps } = autoPlan(ctx, transfers, { horizon: HORIZON, allowHits: false, fromIdx: 0, chips });
    commit(t);
    clearOut();
    setNotice({
      kind: steps.length ? "ok" : "info",
      text: steps.length
        ? "Auto plan: " +
          steps
            .map((s) => `GW${s.gw} ${ctx.players.get(s.out)?.name} → ${ctx.players.get(s.in)?.name} (+${s.gain.toFixed(1)})`)
            .join(" · ")
        : "Auto plan found no move worth making — rolling the free transfer is best.",
    });
  }

  /** Chip on this gameweek: toggle off if already set; a chip can only be used once in the plan. */
  function toggleChip(chip: Chip) {
    const next: ChipMap = { ...chips };
    if (next[gw] === chip) {
      delete next[gw];
      setNotice(null);
    } else {
      const usedAt = Object.entries(next).find(([g, c]) => c === chip && Number(g) !== gw);
      if (usedAt) delete next[Number(usedAt[0])]; // moving the chip to this gameweek
      next[gw] = chip;
      setNotice({
        kind: "info",
        text:
          chip === "wc" || chip === "fh"
            ? `${CHIP_LABEL[chip]} on GW${gw}: transfers this week are free${chip === "fh" ? " and your squad returns next gameweek" : ""}.`
            : chip === "bb"
              ? `Bench Boost on GW${gw}: your bench points count.`
              : `Triple Captain on GW${gw}: your captain scores triple.`,
      });
    }
    setChips(next);
    commit(transfers, next);
    clearOut();
  }

  /** Copies the complete plan, including manual lineups. */
  async function sharePlan() {
    const link = planLink({ team: plan.entryId, transfers, chips, captains, viceCaptains, lineups: manualLineups });
    try {
      await navigator.clipboard.writeText(link);
      setNotice({ kind: "ok", text: "Plan link copied, including your transfers, chips, captains and manual lineups." });
    } catch {
      window.prompt("Copy this link to share your plan:", link);
    }
  }

  function resetAll() {
    setChips({});
    setCaptains({});
    setViceCaptains({});
    setTransfers({});
    setLineups({});
    setSubstituting(false);
    clearOut();
    setNotice(null);
  }

  function resetFilters() {
    setQ("");
    setPos(0);
    setMaxOwn(100);
    setMaxPrice(null);
    setTeamSet(new Set());
    setPage(0);
  }

  function sortBy(k: SortKey) {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setDir(k === "name" ? 1 : -1);
    }
    setPage(0);
  }

  /* ------------------------------ pool data ------------------------------- */
  const optaCache = useMemo(
    () => new Map(plan.players.map((p) => [p.id, optaXP(p, elMap.get(p.id), idx, ctx, fxMap, plan.currentGw)] as const)),
    [plan.players, plan.currentGw, elMap, idx, ctx, fxMap],
  );
  // Sorting is automatic: it re-runs whenever the gameweek, filters, budget or sort column change.
  const sortedRows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const cap = maxPrice ?? Infinity;
    const val = (p: PlanPlayer, k: SortKey): number => {
      switch (k) {
        case "price":
          return p.cost;
        case "owned":
          return p.owned;
        case "pts":
          return elMap.get(p.id)?.total_points ?? 0;
        case "xp":
          return p.xp[idx] ?? 0;
        case "opta":
          return optaCache.get(p.id) ?? 0;
        case "fixtures":
          return fixtureEase(p.team, idx, ctx, fxMap);
        case "xp5":
          return p.xp.slice(idx, idx + HORIZON).reduce((a, b) => a + b, 0);
        case "form":
          return p.form;
        case "net":
          return p.net;
        case "pct":
          return elMap.get(p.id)?.price_change_percent ?? 0;
        default:
          return 0;
      }
    };
    const list = plan.players.filter(
      (p) =>
        (pos === 0 || p.type === pos) &&
        (teamSet.size === 0 || teamSet.has(p.team)) &&
        p.owned <= maxOwn &&
        p.cost <= cap &&
        p.cost <= budget &&
        (!query || p.name.toLowerCase().includes(query) || (teamMap.get(p.team)?.short ?? "").toLowerCase().includes(query)),
    );
    return list.sort((a, b) =>
      sortKey === "name"
        ? a.name.localeCompare(b.name) * dir
        : (val(a, sortKey) - val(b, sortKey)) * dir || (optaCache.get(b.id) ?? 0) - (optaCache.get(a.id) ?? 0),
    );
  }, [plan.players, elMap, q, pos, teamSet, maxOwn, maxPrice, budget, sortKey, dir, idx, teamMap, optaCache, ctx, fxMap]);

  const pageRows = sortedRows.slice(page * POOL_PAGE, (page + 1) * POOL_PAGE);
  const activeCols = COLS.filter((c) => cols.includes(c.key));
  const template = `minmax(128px,1fr) ${activeCols.map((c) => `${c.width}px`).join(" ")} 84px`;
  const minWidth = 128 + activeCols.reduce((s, c) => s + c.width, 0) + 84 + (activeCols.length + 1) * 6 + 20;

  /* ------------------------------ pitch data ------------------------------ */
  const rows = [1, 2, 3, 4].map((type) => lineup.starters.filter((id) => ctx.players.get(id)?.type === type));
  const card = (id: number, benchLabel?: string) => (
    <PitchCard
      key={id}
      id={id}
      ctx={ctx}
      idx={idx}
      fxMap={fxMap}
      teamMap={teamMap}
      captain={lineup.captain === id}
      vice={lineup.vice === id}
      isNew={state.buy.has(id)}
      selected={substituting ? subId === id : outId === id}
      substituting={substituting}
      benchLabel={benchLabel}
      onSelect={() => selectPlayer(id)}
      onCaptain={
        lineup.starters.includes(id) && lineup.captain !== id ? () => setCaptain(gw, id) : undefined
      }
    />
  );
  const squadOrder = [...lineup.starters, ...lineup.bench];

  const noticeStyle =
    notice?.kind === "error"
      ? { background: "rgba(244,63,94,.14)", border: "1px solid rgba(244,63,94,.5)" }
      : notice?.kind === "ok"
        ? { background: "rgba(132,210,28,.14)", border: "1px solid rgba(132,210,28,.5)" }
        : { background: "rgba(205,162,40,.12)", border: "1px solid rgba(205,162,40,.45)" };

  /* ------------------------------ render ---------------------------------- */
  return (
    <div className="flex flex-col gap-4">
      {/* ---------------- gameweek timeline ---------------- */}
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label="Scroll timeline left"
          onClick={() => timelineRef.current?.scrollBy({ left: -420, behavior: "smooth" })}
          className="vx-btn !px-3"
        >
          ‹
        </button>
        <div ref={timelineRef} className="vx-scroll flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {ctx.gws.map((g, i) => {
            const active = i === idx;
            const ft = states[i].ledger[i]?.ftBefore ?? plan.freeTransfers;
            const moves = transfers[g]?.length ?? 0;
            return (
              <button
                key={g}
                type="button"
                data-active={active}
                onClick={() => {
                  setIdx(i);
                  clearOut();
                }}
                className="vx-btn !flex-col !items-center !gap-0 !px-3 !py-1.5"
                style={{ minWidth: 104 }}
              >
                <span className="text-base font-extrabold">GW {g}</span>
                <span className="text-sm font-bold">{ft} FT</span>
                <span className="text-[11px] font-semibold opacity-80">
                  {gwNet(i).toFixed(1)} xPts{moves ? ` · ${moves} move${moves > 1 ? "s" : ""}` : ""}
                </span>
                {chips[g] ? (
                  <span className="mt-0.5 rounded-md px-1.5 text-[10px] font-extrabold uppercase" style={{ background: "#cda228", color: "#0b1220" }}>
                    {CHIP_LABEL[chips[g]]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Scroll timeline right"
          onClick={() => timelineRef.current?.scrollBy({ left: 420, behavior: "smooth" })}
          className="vx-btn !px-3"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:[grid-template-columns:repeat(24,minmax(0,1fr))]">
        {/* ---------------- left: player pool ---------------- */}
        <section className="vx-card flex min-h-0 flex-col overflow-hidden lg:col-span-14">
          <div className="flex flex-col gap-3 p-3">
            <div className="flex gap-2">
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder="Search players…"
                className="vx-input min-w-0 flex-1 rounded-xl px-4 py-2.5 text-sm"
              />
              <button type="button" onClick={resetFilters} className="vx-btn">
                ↺ Reset
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="vx-muted block text-xs font-semibold">
                <span className="flex justify-between">
                  Max Ownership <span className="vx-text">{maxOwn}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={maxOwn}
                  onChange={(e) => {
                    setMaxOwn(Number(e.target.value));
                    setPage(0);
                  }}
                  className="vx-range mt-2"
                />
              </label>
              <label className="vx-muted block text-xs font-semibold">
                <span className="flex justify-between">
                  Max Price <span className="vx-text">{money(maxPrice ?? maxCost)}</span>
                </span>
                <input
                  type="range"
                  min={35}
                  max={maxCost}
                  step={1}
                  value={maxPrice ?? maxCost}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMaxPrice(v >= maxCost ? null : v);
                    setPage(0);
                  }}
                  className="vx-range mt-2"
                />
              </label>
            </div>

            <div className="relative flex flex-wrap items-center gap-2">
              {[
                [0, "All"],
                [1, "GK"],
                [2, "DEF"],
                [3, "MID"],
                [4, "FWD"],
              ].map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  data-active={pos === v}
                  onClick={() => {
                    setPos(v as number);
                    setPage(0);
                    if (outId != null && ctx.players.get(outId)?.type !== v) clearOut();
                  }}
                  className="vx-btn vx-btn-sm !min-w-[58px]"
                >
                  {label}
                </button>
              ))}
              <span className="flex-1" />
              <button
                type="button"
                data-active={teamSet.size > 0}
                onClick={() => setPopover(popover === "teams" ? null : "teams")}
                className="vx-btn vx-btn-sm"
              >
                ⛉ Teams{teamSet.size ? ` (${teamSet.size})` : ""}
              </button>
              <button
                type="button"
                data-active={popover === "columns"}
                onClick={() => setPopover(popover === "columns" ? null : "columns")}
                className="vx-btn vx-btn-sm"
              >
                ⚙ Columns ({cols.length})
              </button>

              {popover ? (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setPopover(null)} aria-hidden />
                  <div
                    className="vx-card absolute right-0 top-full z-30 mt-2 w-[min(440px,92vw)] p-3"
                    style={{ background: "var(--vx-surface)", boxShadow: "0 18px 40px rgba(0,0,0,.45)" }}
                  >
                    {popover === "teams" ? (
                      <>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="vx-text text-sm font-extrabold">Filter by team</span>
                          <button type="button" className="vx-btn vx-btn-sm" onClick={() => { setTeamSet(new Set()); setPage(0); }}>
                            Clear
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {plan.teams.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              data-active={teamSet.has(t.id)}
                              onClick={() => {
                                const next = new Set(teamSet);
                                if (next.has(t.id)) next.delete(t.id);
                                else next.add(t.id);
                                setTeamSet(next);
                                setPage(0);
                              }}
                              className="vx-btn vx-btn-sm !gap-1.5 !px-2"
                            >
                              <TeamBadge code={t.code} shortName={t.short} className="h-5 w-5 shrink-0" />
                              {t.short}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="vx-text text-sm font-extrabold">Visible columns</span>
                          <button type="button" className="vx-btn vx-btn-sm" onClick={() => setCols(DEFAULT_COLS)}>
                            Default
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {COLS.map((c) => (
                            <button
                              key={c.key}
                              type="button"
                              data-active={cols.includes(c.key)}
                              title={c.hint}
                              onClick={() =>
                                setCols((cur) =>
                                  cur.includes(c.key) ? (cur.length > 1 ? cur.filter((k) => k !== c.key) : cur) : COLS.filter((d) => d.key === c.key || cur.includes(d.key)).map((d) => d.key),
                                )
                              }
                              className="vx-btn vx-btn-sm !justify-start"
                            >
                              {cols.includes(c.key) ? "✓" : "＋"} {c.label}
                              <span className="ml-1 text-[10px] font-semibold opacity-70">{c.hint.split(",")[0]}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {outPlayer ? (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm"
                style={{ background: "rgba(132,210,28,.14)", border: "1px solid rgba(132,210,28,.5)" }}
              >
                <span className="vx-text font-bold">
                  Replacing {outPlayer.name} · {POS[outPlayer.type]} only · budget {money(budget)}
                </span>
                <button type="button" onClick={clearOut} className="vx-btn vx-btn-sm">
                  Cancel
                </button>
              </div>
            ) : null}
          </div>

          <div className="vx-scroll max-h-[560px] overflow-auto lg:max-h-[calc(100vh-190px)]" style={{ borderTop: "1px solid var(--vx-border)" }}>
            <div style={{ minWidth }}>
              <div
                className="sticky top-0 z-10 grid items-center gap-1.5 px-2 py-2"
                style={{ gridTemplateColumns: template, background: "var(--vx-surface)", borderBottom: "1px solid var(--vx-border)" }}
              >
                <button
                  type="button"
                  className="vx-sortbtn justify-self-start"
                  data-active={sortKey === "name"}
                  onClick={() => sortBy("name")}
                >
                  Name <SortIcon dir={sortKey === "name" ? (dir === 1 ? "asc" : "desc") : null} />
                </button>
                {activeCols.map((c) =>
                  c.sort ? (
                    <button
                      key={c.key}
                      type="button"
                      className={`vx-sortbtn !px-2 ${c.key === "fixtures" ? "justify-self-start" : "justify-self-end"}`}
                      data-active={sortKey === c.sort}
                      onClick={() => sortBy(c.sort as SortKey)}
                      title={c.hint}
                    >
                      {c.label} <SortIcon dir={sortKey === c.sort ? (dir === 1 ? "asc" : "desc") : null} />
                    </button>
                  ) : (
                    <span key={c.key} className="vx-text px-1 text-sm font-extrabold">
                      {c.label}
                    </span>
                  ),
                )}
                <span />
              </div>

              {pageRows.map((p) => {
                const el = elMap.get(p.id);
                const inSquad = squadSet.has(p.id);
                const err = outId != null && !inSquad ? validateTransfer(ctx, state, outId, p.id) : null;
                const net = p.net;
                const pct = el?.price_change_percent ?? 0;
                return (
                  <div
                    key={p.id}
                    className="vx-row grid items-center gap-1.5 px-2"
                    style={{
                      gridTemplateColumns: template,
                      background: inSquad ? "rgba(132,210,28,.07)" : undefined,
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="vx-muted shrink-0 cursor-help text-[13px] leading-none"
                        title={[
                          `${p.name} · ${teamMap.get(p.team)?.short} ${POS[p.type]}`,
                          `Form ${p.form.toFixed(1)} · owned ${p.owned.toFixed(1)}% · net transfers ${p.net > 0 ? "+" : ""}${p.net}`,
                          el ? `xG/90 ${el.expected_goals_per_90.toFixed(2)} · xA/90 ${el.expected_assists_per_90.toFixed(2)} · ${el.minutes} mins` : "",
                          p.news || "",
                        ].filter(Boolean).join("\n")}
                        aria-label={`Details for ${p.name}`}
                      >
                        ⓘ
                      </span>
                      <PlayerPhoto code={p.code} alt={p.name} className="h-10 w-8 shrink-0 rounded-md" />
                      <div className="min-w-0">
                        <div className="vx-text truncate text-sm font-extrabold">
                          {p.name}
                          {p.status !== "a" ? (
                            <span className={`ml-1 text-[11px] ${p.status === "d" ? "text-amber-500" : "vx-down"}`}>
                              ● {p.chance != null ? `${p.chance}%` : "out"}
                            </span>
                          ) : null}
                        </div>
                        <div className="vx-muted truncate text-xs">
                          {teamMap.get(p.team)?.short} · {POS[p.type]}
                        </div>
                      </div>
                    </div>
                    {activeCols.map((c) => {
                      switch (c.key) {
                        case "fixtures":
                          return <FixChips key={c.key} team={p.team} fromIdx={idx} ctx={ctx} fxMap={fxMap} teamMap={teamMap} />;
                        case "price":
                          return (
                            <span key={c.key} className="vx-text text-right text-sm font-semibold">
                              {(el?.cost_change_event ?? 0) !== 0 ? (
                                <span className={`mr-0.5 text-[9px] ${(el?.cost_change_event ?? 0) > 0 ? "vx-up" : "vx-down"}`} title="Price changed this gameweek">
                                  {(el?.cost_change_event ?? 0) > 0 ? "▲" : "▼"}
                                </span>
                              ) : null}
                              {money(p.cost)}
                            </span>
                          );
                        case "owned":
                          return <span key={c.key} className="vx-text text-right text-sm">{p.owned.toFixed(1)}%</span>;
                        case "pts":
                          return <span key={c.key} className="vx-text text-right text-sm font-extrabold">{el ? el.total_points : "–"}</span>;
                        case "xp":
                          return <span key={c.key} className="vx-gold text-right text-sm font-extrabold">{(p.xp[idx] ?? 0).toFixed(1)}</span>;
                        case "opta":
                          return <span key={c.key} className="vx-up text-right text-sm font-extrabold">{(optaCache.get(p.id) ?? 0).toFixed(1)}</span>;
                        case "xp5":
                          return (
                            <span key={c.key} className="vx-text text-right text-sm font-bold">
                              {p.xp.slice(idx, idx + HORIZON).reduce((a, b) => a + b, 0).toFixed(1)}
                            </span>
                          );
                        case "form":
                          return <span key={c.key} className="vx-text text-right text-sm">{p.form.toFixed(1)}</span>;
                        case "net":
                          return (
                            <span key={c.key} className={`text-right text-sm font-bold ${net > 0 ? "vx-up" : net < 0 ? "vx-down" : "vx-muted"}`}>
                              {net > 0 ? "+" : ""}
                              {net.toLocaleString()}
                            </span>
                          );
                        default:
                          return (
                            <span key={c.key} className={`text-right text-sm font-bold ${pct > 0 ? "vx-up" : pct < 0 ? "vx-down" : "vx-muted"}`}>
                              {pct > 0 ? "+" : ""}
                              {pct.toFixed(1)}%
                            </span>
                          );
                      }
                    })}
                    <div className="flex justify-end">
                      {inSquad ? (
                        <span className="vx-chip rounded-lg px-2.5 py-1 text-xs font-bold">In squad</span>
                      ) : outId != null ? (
                        <button
                          type="button"
                          disabled={err !== null}
                          title={err ?? `Transfer in ${p.name}`}
                          onClick={() => transferIn(p.id)}
                          className="vx-btn vx-btn-primary vx-btn-sm !px-2"
                        >
                          Transfer in
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="Adds this player and automatically picks who to swap out"
                          onClick={() => autoAdd(p.id)}
                          className="vx-btn vx-btn-sm"
                        >
                          ＋ Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {pageRows.length === 0 ? (
                <p className="vx-muted px-4 py-10 text-center text-sm">No players match these filters.</p>
              ) : null}
            </div>
          </div>
          <Pager page={page} pageSize={POOL_PAGE} total={sortedRows.length} onPage={setPage} filled />
        </section>

        {/* ---------------- right: pitch / table ---------------- */}
        <section className="vx-card flex min-h-0 flex-col overflow-hidden lg:col-span-10">
          <div className="vx-card-head flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <h2 className="vx-text flex items-center gap-2 text-base font-extrabold">
              <Dot color="#84d21c" /> Gameweek {gw}
              <span className="vx-muted text-xs font-medium">
                {plan.deadlines[gw]
                  ? `Deadline ${new Date(plan.deadlines[gw]).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={runAuto} className="vx-btn vx-btn-primary vx-btn-sm">
                ⚡ Auto plan
              </button>
              <button type="button" onClick={sharePlan} className="vx-btn vx-btn-sm" title="Copy a link to this plan">
                🔗 Share
              </button>
              <button type="button" onClick={resetAll} className="vx-btn vx-btn-sm">
                Reset all
              </button>
              <Tabs
                filled
                value={view}
                onChange={setView}
                options={[
                  { id: "pitch", label: "Pitch" },
                  { id: "table", label: "Table" },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={substituting}
                data-active={substituting}
                className="vx-btn vx-btn-sm"
                onClick={() => { clearOut(); setSubstituting(!substituting); }}
              >
                Substitutions
              </button>
              <button type="button" onClick={restoreAutoXI} disabled={!manualLineups[gw]} className="vx-btn vx-btn-sm">
                Auto XI
              </button>
              <span className="vx-muted text-xs">{manualLineups[gw] ? "Manual XI" : "Automatic XI"} · {lineup.formation}</span>
              <label className="vx-muted flex items-center gap-1 text-xs">Vice captain
                <select className="vx-input max-w-32 rounded-lg p-1" aria-label={`GW${gw} vice captain`}
                  value={lineup.vice ?? ""} onChange={(event) => setVice(gw, Number(event.target.value))}>
                  {lineup.starters.filter((id) => id !== lineup.captain).map((id) =>
                    <option value={id} key={id}>{ctx.players.get(id)?.name ?? `#${id}`}</option>)}
                </select>
              </label>
              {substituting ? (
                <p className="vx-text w-full text-sm">Select a bench player and a starter to swap. Select a highlighted player again to cancel. Swaps use no transfers.</p>
              ) : null}
            </div>
            {notice ? (
              <div role="status" aria-live="polite" className="flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm" style={noticeStyle}>
                <span className="vx-text leading-snug">{notice.text}</span>
                <button type="button" className="vx-link shrink-0 text-xs font-bold" onClick={() => setNotice(null)}>
                  ✕
                </button>
              </div>
            ) : bannerOpen && !substituting ? (
              <div
                className="flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm"
                style={{ background: "rgba(205,162,40,.12)", border: "1px solid rgba(205,162,40,.45)" }}
              >
                <span className="vx-text leading-snug">
                  <b>Plan a transfer:</b> click a player on the pitch (or the × on the card) — the list on the left jumps
                  to that position — then press <b>Transfer in</b> on a replacement. Or press <b>＋ Add</b> on any player
                  and the best player to swap out is picked automatically. Tap the dashed <b>C</b> on a starter to make them captain for that gameweek. Step through gameweeks on the timeline.
                </span>
                <button type="button" className="vx-link shrink-0 text-xs font-bold" onClick={() => setBannerOpen(false)}>
                  ✕
                </button>
              </div>
            ) : null}

            <div className="grid grid-cols-4 overflow-hidden rounded-xl" style={{ background: "var(--vx-surface-2)", border: "1px solid var(--vx-border)" }}>
              {[
                [`${ledger?.n ?? 0} / ${ledger?.ftBefore ?? plan.freeTransfers}`, "Transfers", "vx-text"],
                [`${ledger?.hit ? `-${ledger.hit}` : "0"} pts`, chips[gw] === "wc" || chips[gw] === "fh" ? "Free (chip)" : "Transfer Cost", ledger?.hit ? "vx-down" : "vx-text"],
                [money(state.bank), "Bank", "vx-up"],
                [(lineup.total - (ledger?.hit ?? 0)).toFixed(1), "GW xPts", "vx-gold"],
              ].map(([value, label, cls], i) => (
                <div key={label} className="px-2 py-3 text-center" style={i ? { borderLeft: "1px solid var(--vx-border)" } : undefined}>
                  <div className={`text-2xl font-extrabold ${cls}`}>{value}</div>
                  <div className="vx-muted text-xs font-medium">{label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="vx-faint text-[11px] font-semibold uppercase tracking-wider">Chip for GW{gw}</span>
              {CHIP_ORDER.map((c) => {
                const usedElsewhere = Object.entries(chips).find(([g, k]) => k === c && Number(g) !== gw);
                return (
                  <button
                    key={c}
                    type="button"
                    data-active={chips[gw] === c}
                    onClick={() => toggleChip(c)}
                    title={
                      usedElsewhere
                        ? `${CHIP_LABEL[c]} is planned for GW${usedElsewhere[0]}. Click to move it here.`
                        : `Play ${CHIP_LABEL[c]} in GW${gw}`
                    }
                    className="vx-btn vx-btn-sm"
                  >
                    {CHIP_LABEL[c]}
                    {usedElsewhere ? <span className="ml-1 text-[10px] opacity-70">GW{usedElsewhere[0]}</span> : null}
                  </button>
                );
              })}
            </div>

            {view === "pitch" ? (
              <>
                <div className="pitch-bg relative min-h-[470px] overflow-hidden rounded-xl px-1 py-4 shadow-lg">
                  <div className="pointer-events-none absolute inset-3 rounded-md" style={{ border: "1px solid rgba(255,255,255,.55)" }} />
                  <div className="pointer-events-none absolute inset-x-3 top-1/2" style={{ borderTop: "1px solid rgba(255,255,255,.55)" }} />
                  <div
                    className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ border: "1px solid rgba(255,255,255,.55)" }}
                  />
                  <div className="relative flex min-h-[430px] flex-col justify-between gap-3">
                    {rows.map((row, i) =>
                      row.length === 0 ? null : (
                        <div key={i} className="flex items-start justify-evenly">
                          {row.map((id) => card(id))}
                        </div>
                      ),
                    )}
                  </div>
                </div>
                <div className="rounded-xl px-2 py-3" style={{ background: "#0e3a20" }}>
                  <div className="flex items-start justify-evenly">
                    {lineup.bench.map((id, i) => card(id, i === 0 ? "GK" : `Sub ${i}`))}
                  </div>
                </div>
              </>
            ) : (
              <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--vx-border)" }}>
                <div className="min-w-[560px]">
                  <div
                    className="grid items-center gap-2 px-3 py-2 text-xs font-extrabold vx-muted"
                    style={{ gridTemplateColumns: "44px minmax(150px,1.5fr) 230px 80px 70px", borderBottom: "1px solid var(--vx-border)" }}
                  >
                    <span>Pos</span>
                    <span>Name</span>
                    <span>Fixtures</span>
                    <span className="text-right">£</span>
                    <span className="text-right">xPts</span>
                  </div>
                  {squadOrder.map((id, i) => {
                    const p = ctx.players.get(id);
                    if (!p) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => selectPlayer(id)}
                        aria-label={`${substituting ? "Substitute" : "Transfer out"} ${p.name}, ${i >= 11 ? "bench" : "starting XI"}`}
                        aria-pressed={substituting ? subId === id : outId === id}
                        className="vx-row grid w-full items-center gap-2 px-3 py-2 text-left transition hover:brightness-125"
                        style={{
                          gridTemplateColumns: "44px minmax(150px,1.5fr) 230px 80px 70px",
                          background: (substituting ? subId === id : outId === id) ? "rgba(132,210,28,.16)" : i >= 11 ? "rgba(0,0,0,.12)" : undefined,
                        }}
                      >
                        <span className="vx-muted text-xs font-bold">{i >= 11 ? "BN" : POS[p.type]}</span>
                        <span className="flex min-w-0 items-center gap-2">
                          <PlayerPhoto code={p.code} alt={p.name} className="h-10 w-8 shrink-0 rounded-md" />
                          <span className="vx-text truncate text-sm font-extrabold">
                            {p.name}
                            {lineup.captain === id ? " (C)" : lineup.vice === id ? " (V)" : ""}
                          </span>
                        </span>
                        <FixChips team={p.team} fromIdx={idx} ctx={ctx} fxMap={fxMap} teamMap={teamMap} />
                        <span className="vx-text text-right text-sm">{money(p.cost)}</span>
                        <span className="vx-gold text-right text-sm font-extrabold">{xpAt(ctx, id, idx).toFixed(1)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {movesHere.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="vx-faint text-[11px] font-semibold uppercase tracking-wider">Planned for GW{gw}</h3>
                {movesHere.map((m, i) => {
                  const o = ctx.players.get(m.out);
                  const n = ctx.players.get(m.in);
                  return (
                    <div key={`${m.out}-${m.in}`} className="vx-chip flex items-center gap-3 rounded-xl px-3 py-2">
                      {o ? <PlayerPhoto code={o.code} alt={o.name} className="h-10 w-8 shrink-0 rounded-md" /> : null}
                      <span className="vx-down text-sm font-bold">{o?.name}</span>
                      <span>→</span>
                      {n ? <PlayerPhoto code={n.code} alt={n.name} className="h-10 w-8 shrink-0 rounded-md" /> : null}
                      <span className="vx-up min-w-0 flex-1 truncate text-sm font-bold">
                        {n?.name} <span className="vx-muted text-xs font-medium">{n ? money(n.cost) : ""}</span>
                      </span>
                      <button type="button" onClick={() => removeMove(i)} aria-label="Remove move" className="vx-btn vx-btn-sm !px-2.5">
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <MarketPanel squad={state.squad} elements={elements} teams={teams} />
    </div>
  );
}
