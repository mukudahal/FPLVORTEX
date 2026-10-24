"use client";

import { useMemo, useState } from "react";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { formatPrice } from "@/lib/helpers";
import type { SlimElement, SlimTeam } from "@/lib/types";

const POSITIONS = ["", "GK", "DEF", "MID", "FWD"];
type SortKey = "player" | "progress" | "forecast" | "tomorrow" | "later" | "hourly" | "owned" | "buy" | "sell" | "gw" | "season";
const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "player", label: "Player", title: "Player name" },
  { key: "progress", label: "Progress", title: "Signed progress toward a price change, not a probability" },
  { key: "forecast", label: "Next", title: "FPL projection for the next price update" },
  { key: "tomorrow", label: "+1 day", title: "FPL projected progress, one day ahead" },
  { key: "later", label: "+2 days", title: "FPL projected progress, two days ahead" },
  { key: "hourly", label: "Net/h", title: "FPL hourly net-transfer rate" },
  { key: "owned", label: "Owned", title: "Current ownership; gameweek net transfers appear below" },
  { key: "buy", label: "Buy est.", title: "Estimated purchase price from public transfer history or starting price" },
  { key: "sell", label: "Sell est.", title: "Estimated selling price; confirm the exact value in your FPL account" },
];
const CHANGE_COLUMNS = [COLUMNS[0], { key: "gw" as const, label: "This GW", title: "Confirmed net price change this gameweek" }, { key: "season" as const, label: "Season", title: "Confirmed net price change since the season started" }, COLUMNS[6], COLUMNS[5]];
function finite(n: unknown): number | null { return n !== null && n !== undefined && n !== "" && Number.isFinite(Number(n)) ? Number(n) : null; }
function projection(e: SlimElement, offset: number) { return finite(e.price_change_projections?.find(p => p.offset === offset)?.projected_percent); }
const signed = (n: number, digits = 1) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const tone = (n: number | null) => n === null || n === 0 ? "" : n > 0 ? "market-up" : "market-down";
function priceStatus(e: SlimElement) {
  if (e.price_change_locked_until && Date.parse(e.price_change_locked_until) > Date.now()) return "Price locked";
  const p = finite(e.price_change_percent);
  if (p === null) return "Progress unavailable";
  if (p >= 100) return "Rise threshold";
  if (p <= -100) return "Fall threshold";
  if (Math.abs(p) >= 80) return p > 0 ? "Rise watch" : "Fall watch";
  return "Below threshold";
}

export function PriceView({ squadIds, elements, teamsMap, purchasePrices, sellingPrices }: {
  squadIds: number[]; elements: SlimElement[]; teamsMap: Map<number, SlimTeam>;
  purchasePrices?: Record<number, number>; sellingPrices?: Record<number, number>;
}) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [team, setTeam] = useState("");
  const [scope, setScope] = useState("squad");
  const [view, setView] = useState("forecast");
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: "progress", direction: -1 });
  const [page, setPage] = useState(0);
  const squad = useMemo(() => new Set(squadIds), [squadIds]);
  const rows = useMemo(() => {
    const value = (e: SlimElement, key: SortKey): number | string | null => {
      switch (key) {
        case "player": return e.web_name;
        case "progress": return finite(e.price_change_percent);
        case "forecast": return projection(e, 0);
        case "tomorrow": return projection(e, 1);
        case "later": return projection(e, 2);
        case "hourly": return finite(e.price_change_hourly_rate);
        case "owned": return finite(e.selected_by_percent);
        case "buy": return squad.has(e.id) ? purchasePrices?.[e.id] ?? null : null;
        case "sell": return squad.has(e.id) ? sellingPrices?.[e.id] ?? null : null;
        case "gw": return e.cost_change_event;
        case "season": return e.cost_change_start;
      }
    };
    return elements.filter(e => e.element_type <= 4 && (scope !== "squad" || squad.has(e.id)) &&
      (!position || e.element_type === Number(position)) && (!team || e.team === Number(team)) &&
      `${e.web_name} ${e.first_name} ${e.second_name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()))
      .sort((a, b) => {
        const av = value(a, sort.key), bv = value(b, sort.key);
        if (av === null) return bv === null ? a.id - b.id : 1;
        if (bv === null) return -1;
        return (typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv)) * sort.direction || a.id - b.id;
      });
  }, [elements, squad, scope, position, team, query, sort, purchasePrices, sellingPrices]);
  const columns = view === "forecast" ? COLUMNS : CHANGE_COLUMNS;
  const lastPage = Math.max(0, Math.ceil(rows.length / 20) - 1);
  const currentPage = Math.min(page, lastPage);
  const sortBy = (key: SortKey) => { setSort(s => ({ key, direction: s.key === key ? s.direction === 1 ? -1 : 1 : key === "player" ? 1 : -1 })); setPage(0); };
  const changeView = (next: string) => { setView(next); setSort({ key: next === "forecast" ? "progress" : "gw", direction: -1 }); setPage(0); };
  return <section className="market-panel market-prices" aria-labelledby="market-price-title">
    <header className="market-panel-head"><div><span className="market-kicker">01 / Transfer intelligence</span><h2 id="market-price-title">Price trends</h2></div><div className="market-segment"><button aria-pressed={view === "forecast"} onClick={() => changeView("forecast")}>Forecasts</button><button aria-pressed={view === "changes"} onClick={() => changeView("changes")}>GW changes</button></div></header>
    <div className="market-filters"><input aria-label="Search market players" placeholder="Search players…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/><select aria-label="Market position" value={position} onChange={e => { setPosition(e.target.value); setPage(0); }}><option value="">All positions</option>{POSITIONS.slice(1).map((p, i) => <option key={p} value={i + 1}>{p}</option>)}</select><select aria-label="Market club" value={team} onChange={e => { setTeam(e.target.value); setPage(0); }}><option value="">All clubs</option>{[...teamsMap.values()].map(t => <option key={t.id} value={t.id}>{t.short_name}</option>)}</select><div className="market-segment"><button aria-pressed={scope === "squad"} onClick={() => { setScope("squad"); setPage(0); }}>My team</button><button aria-pressed={scope === "all"} onClick={() => { setScope("all"); setPage(0); }}>All</button></div></div>
    <div className="market-table-scroll" tabIndex={0} role="region" aria-label="Sortable price trends table"><table className="market-table"><thead><tr>{columns.map(c => <th key={c.key} scope="col" aria-sort={sort.key === c.key ? sort.direction === 1 ? "ascending" : "descending" : "none"}><button onClick={() => sortBy(c.key)} title={c.title}>{c.label}<span aria-hidden="true">{sort.key === c.key ? sort.direction === 1 ? "↑" : "↓" : "↕"}</span></button></th>)}</tr></thead><tbody>
      {rows.slice(currentPage * 20, currentPage * 20 + 20).map(e => {
        const progress = finite(e.price_change_percent), rate = finite(e.price_change_hourly_rate), net = e.transfers_in_event - e.transfers_out_event;
        return <tr key={e.id} data-player-id={e.id} className={squad.has(e.id) ? "market-owned-row" : ""}><td><div className="market-player"><span className="market-photo"><PlayerPhoto code={e.code} alt={e.web_name}/></span><span><strong title={e.web_name}>{e.web_name}</strong><small>{teamsMap.get(e.team)?.short_name} · {POSITIONS[e.element_type]} · {formatPrice(e.now_cost)}</small><small className={tone(progress)}>{priceStatus(e)}</small></span></div></td>
        {view === "forecast" ? <><td className={tone(progress)}><b>{progress === null ? "—" : `${signed(progress)}%`}</b><span className="market-progress" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.abs(progress ?? 0))}%` }}/></span></td>{[0, 1, 2].map(offset => { const n = projection(e, offset); return <td key={offset} className={tone(n)}>{n === null ? "—" : `${signed(n)}%`}</td>; })}<td className={tone(rate)}>{rate === null ? "—" : `${rate > 0 ? "+" : ""}${compact(rate)}`}</td><td>{e.selected_by_percent}%<small className={tone(net)}>{net > 0 ? "+" : ""}{compact(net)} GW</small></td><td>{squad.has(e.id) && purchasePrices?.[e.id] != null ? formatPrice(purchasePrices[e.id]) : "—"}</td><td>{squad.has(e.id) && sellingPrices?.[e.id] != null ? formatPrice(sellingPrices[e.id]) : "—"}</td></> : <><td className={tone(e.cost_change_event)}>{e.cost_change_event === 0 ? "—" : `${e.cost_change_event > 0 ? "+" : "−"}${formatPrice(Math.abs(e.cost_change_event))}`}</td><td className={tone(e.cost_change_start)}>{e.cost_change_start === 0 ? "—" : `${e.cost_change_start > 0 ? "+" : "−"}${formatPrice(Math.abs(e.cost_change_start))}`}</td><td>{e.selected_by_percent}%</td><td className={tone(rate)}>{rate === null ? "—" : `${rate > 0 ? "+" : ""}${compact(rate)}`}</td></>}
        </tr>;
      })}
      {!rows.length ? <tr><td colSpan={columns.length} className="market-empty">No players match these filters.</td></tr> : null}
    </tbody></table></div>
    <footer className="market-table-footer"><span>{rows.length} players · {currentPage + 1}/{lastPage + 1}</span><div><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>← Previous</button><button disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next →</button></div></footer>
    <p className="market-note">FPL feed projections show progress toward a threshold, not the chance of a change. Timing is not guaranteed. Buy/sell values are estimates from public history. Missing fields show —.</p>
  </section>;
}
