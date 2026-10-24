"use client";

import { useMemo, useState } from "react";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { Message, Pager, Panel, Tabs } from "@/components/home/ui";
import { POSITIONS, formatPrice } from "@/lib/helpers";
import type { SlimElement, SlimTeam } from "@/lib/types";

type MarketTab = "transfers" | "prices";
type PriceSort = "rising" | "falling";
type TransferSort = "in" | "out" | "net";
const PAGE = 10;

const pct = (n: number | null | undefined): number => n ?? 0;
const signed = (n: number, digits = 1) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

function priceBadge(progress: number): { label: string; cls: string } | null {
  if (progress >= 100) return { label: "Rise due", cls: "vx-up" };
  if (progress <= -100) return { label: "Fall due", cls: "vx-down" };
  if (progress >= 60) return { label: "Likely rise", cls: "vx-up" };
  if (progress <= -60) return { label: "Likely fall", cls: "vx-down" };
  return null;
}

function PlayerCell({ p, teams }: { p: SlimElement; teams: Map<number, SlimTeam> }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PlayerPhoto code={p.code} alt={p.web_name} className="h-9 w-7 shrink-0 rounded-md" />
      <div className="min-w-0">
        <div className="vx-text truncate text-sm font-bold">{p.web_name}</div>
        <div className="vx-muted truncate text-[11px]">
          {teams.get(p.team)?.short_name} · {POSITIONS[p.element_type]} · {formatPrice(p.now_cost)}
        </div>
      </div>
    </div>
  );
}

function PriceRows({ rows, teams }: { rows: SlimElement[]; teams: Map<number, SlimTeam> }) {
  return (
    <>
      <div className="vx-card-head grid grid-cols-[minmax(0,1fr)_84px_58px_58px] gap-1 px-3 py-2 text-[11px] font-bold vx-muted">
        <span>Player</span>
        <span className="text-right">Progress</span>
        <span className="text-right">Rate/hr</span>
        <span className="text-right">GW Δ</span>
      </div>
      {rows.map((p) => {
        const progress = pct(p.price_change_percent);
        const rate = pct(p.price_change_hourly_rate);
        const badge = priceBadge(progress);
        return (
          <div
            key={p.id}
            className="vx-row grid grid-cols-[minmax(0,1fr)_84px_58px_58px] items-center gap-1 px-3 py-2"
          >
            <PlayerCell p={p} teams={teams} />
            <div className="text-right">
              <div className={`text-sm font-bold ${progress > 0 ? "vx-up" : progress < 0 ? "vx-down" : "vx-muted"}`}>
                {signed(progress)}%
              </div>
              {badge ? <div className={`text-[10px] font-semibold ${badge.cls}`}>{badge.label}</div> : null}
            </div>
            <span className={`text-right text-xs font-semibold ${rate > 0 ? "vx-up" : rate < 0 ? "vx-down" : "vx-muted"}`}>
              {signed(rate)}%
            </span>
            <span
              className={`text-right text-xs font-semibold ${
                p.cost_change_event > 0 ? "vx-up" : p.cost_change_event < 0 ? "vx-down" : "vx-muted"
              }`}
            >
              {p.cost_change_event === 0 ? "—" : `${p.cost_change_event > 0 ? "+" : "-"}£${Math.abs(p.cost_change_event / 10).toFixed(1)}`}
            </span>
          </div>
        );
      })}
    </>
  );
}

function TransferRows({ rows, teams }: { rows: SlimElement[]; teams: Map<number, SlimTeam> }) {
  return (
    <>
      <div className="vx-card-head grid grid-cols-[minmax(0,1fr)_56px_56px_64px_52px] gap-1 px-3 py-2 text-[11px] font-bold vx-muted">
        <span>Player</span>
        <span className="text-right">In</span>
        <span className="text-right">Out</span>
        <span className="text-right">Net</span>
        <span className="text-right">Own%</span>
      </div>
      {rows.map((p) => {
        const net = p.transfers_in_event - p.transfers_out_event;
        return (
          <div
            key={p.id}
            className="vx-row grid grid-cols-[minmax(0,1fr)_56px_56px_64px_52px] items-center gap-1 px-3 py-2 text-xs"
          >
            <PlayerCell p={p} teams={teams} />
            <span className="vx-text text-right">{p.transfers_in_event.toLocaleString()}</span>
            <span className="vx-text text-right">{p.transfers_out_event.toLocaleString()}</span>
            <span className={`text-right font-bold ${net > 0 ? "vx-up" : net < 0 ? "vx-down" : "vx-muted"}`}>
              {net > 0 ? "+" : ""}
              {net.toLocaleString()}
            </span>
            <span className="vx-muted text-right">{Number(p.selected_by_percent).toFixed(1)}</span>
          </div>
        );
      })}
    </>
  );
}

/**
 * Right-hand market panel: every price rise/fall candidate and the latest
 * transfer-market flow, for your squad (left) and the whole player pool (right).
 */
export function MarketPanel({
  squad,
  elements,
  teams,
  className,
}: {
  squad: number[];
  elements: SlimElement[] | null;
  teams: Map<number, SlimTeam>;
  className?: string;
}) {
  const [tab, setTab] = useState<MarketTab>("prices");
  const [priceSort, setPriceSort] = useState<PriceSort>("rising");
  const [transferSort, setTransferSort] = useState<TransferSort>("net");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const mine = useMemo(() => {
    const ids = new Set(squad);
    const list = (elements ?? []).filter((e) => ids.has(e.id));
    return tab === "prices"
      ? list.sort((a, b) => pct(b.price_change_percent) - pct(a.price_change_percent))
      : list.sort(
          (a, b) =>
            b.transfers_in_event - b.transfers_out_event - (a.transfers_in_event - a.transfers_out_event),
        );
  }, [squad, elements, tab]);

  const all = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (elements ?? []).filter(
      (e) =>
        !q ||
        e.web_name.toLowerCase().includes(q) ||
        teams.get(e.team)?.short_name.toLowerCase().includes(q),
    );
    if (tab === "prices") {
      return list.sort((a, b) =>
        priceSort === "rising"
          ? pct(b.price_change_percent) - pct(a.price_change_percent)
          : pct(a.price_change_percent) - pct(b.price_change_percent),
      );
    }
    return list.sort((a, b) => {
      const key = (e: SlimElement) =>
        transferSort === "in"
          ? e.transfers_in_event
          : transferSort === "out"
            ? e.transfers_out_event
            : e.transfers_in_event - e.transfers_out_event;
      return key(b) - key(a);
    });
  }, [elements, teams, query, tab, priceSort, transferSort]);

  const rows = all.slice(page * PAGE, (page + 1) * PAGE);
  const Rows = tab === "prices" ? PriceRows : TransferRows;

  return (
    <Panel
      title="Transfer market"
      right={
        <Tabs
          filled
          value={tab}
          onChange={(t) => {
            setTab(t);
            setPage(0);
          }}
          options={[
            { id: "prices", label: "Prices" },
            { id: "transfers", label: "Transfers" },
          ]}
        />
      }
      className={className}
    >
      {!elements ? (
        <Message>Loading market data…</Message>
      ) : (
        <div className="grid grid-cols-1 gap-0 xl:grid-cols-2">
          <div className="xl:border-r" style={{ borderColor: "var(--vx-border)" }}>
            <div className="px-3 py-2.5">
              <h3 className="vx-text text-sm font-extrabold">My team</h3>
              <p className="vx-muted text-[11px]">
                {tab === "prices"
                  ? "How close each of your players is to a price change"
                  : "Net transfers this gameweek for your 15"}
              </p>
            </div>
            <Rows rows={mine} teams={teams} />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <h3 className="vx-text text-sm font-extrabold">All players</h3>
              <div className="flex items-center gap-2">
                {tab === "prices" ? (
                  <Tabs
                    filled
                    value={priceSort}
                    onChange={(s) => {
                      setPriceSort(s);
                      setPage(0);
                    }}
                    options={[
                      { id: "rising", label: "Rising" },
                      { id: "falling", label: "Falling" },
                    ]}
                  />
                ) : (
                  <Tabs
                    filled
                    value={transferSort}
                    onChange={(s) => {
                      setTransferSort(s);
                      setPage(0);
                    }}
                    options={[
                      { id: "net", label: "Net" },
                      { id: "in", label: "In" },
                      { id: "out", label: "Out" },
                    ]}
                  />
                )}
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Search…"
                  className="vx-input w-28 rounded-lg px-2.5 py-1 text-xs"
                />
              </div>
            </div>
            <Rows rows={rows} teams={teams} />
            <Pager page={page} pageSize={PAGE} total={all.length} onPage={setPage} filled />
          </div>
        </div>
      )}
    </Panel>
  );
}
