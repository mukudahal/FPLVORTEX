"use client";

import { useMemo, useState } from "react";
import { Pager, Panel, Dot } from "@/components/home/ui";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { TeamBadge } from "@/components/TeamBadge";
import type { PlanResponse } from "@/lib/planTypes";
import { POS, money } from "./shared";

const PAGE = 15;

/** Brand-green heat: darker cell = more predicted points. */
function heat(xp: number): string {
  const a = 0.1 + 0.62 * Math.min(1, Math.max(0, xp / 8));
  return `rgba(132, 210, 28, ${a.toFixed(2)})`;
}

export function ProjectionsView({ plan }: { plan: PlanResponse }) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState(0);
  const [nGw, setNGw] = useState(Math.min(4, plan.gws.length));
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortKey, setSortKey] = useState<"total" | number>("total");
  const [page, setPage] = useState(0);

  const teams = useMemo(() => new Map(plan.teams.map((t) => [t.id, t] as const)), [plan.teams]);
  const mine = useMemo(() => new Set(plan.picks.map((p) => p.element)), [plan.picks]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const lo = minPrice ? Number(minPrice) * 10 : 0;
    const hi = maxPrice ? Number(maxPrice) * 10 : Infinity;
    return plan.players
      .filter(
        (p) =>
          (pos === 0 || p.type === pos) &&
          p.cost >= lo &&
          p.cost <= hi &&
          (!query ||
            p.name.toLowerCase().includes(query) ||
            (teams.get(p.team)?.short ?? "").toLowerCase().includes(query)),
      )
      .map((p) => {
        const cells = p.xp.slice(0, nGw);
        return { p, cells, total: cells.reduce((a, b) => a + b, 0) };
      })
      .sort((a, b) =>
        sortKey === "total" ? b.total - a.total : (b.cells[sortKey] ?? 0) - (a.cells[sortKey] ?? 0),
      );
  }, [plan.players, teams, q, pos, minPrice, maxPrice, nGw, sortKey]);

  const view = rows.slice(page * PAGE, (page + 1) * PAGE);
  const gws = plan.gws.slice(0, nGw);
  const template = `minmax(190px,1.7fr) 72px repeat(${nGw}, minmax(56px,1fr)) 72px 70px`;

  function reset<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  function downloadCsv() {
    const head = ["Player", "Team", "Pos", "Price", ...gws.map((g) => `GW${g}`), "Total", "Owned%"];
    const lines = rows.map(({ p, cells, total }) =>
      [
        `"${p.name.replace(/"/g, '""')}"`,
        teams.get(p.team)?.short ?? "",
        POS[p.type],
        (p.cost / 10).toFixed(1),
        ...cells.map((c) => c.toFixed(2)),
        total.toFixed(2),
        p.owned.toFixed(1),
      ].join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fpl-vortex-projections-GW${gws[0]}-GW${gws[gws.length - 1]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const control = "vx-input rounded-lg px-3 py-2 text-sm";

  return (
    <Panel
      title="Projections"
      icon={<Dot color="#84d21c" />}
      right={
        <button type="button" onClick={downloadCsv} className="vx-btn vx-btn-primary vx-btn-sm">
          ⬇ CSV
        </button>
      }
    >
      <div className="flex h-full flex-col">
        <div className="vx-card-head flex flex-wrap items-center gap-2 px-3 py-3">
          <input
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
            placeholder="Search players…"
            className={`${control} w-52`}
          />
          <select value={pos} onChange={(e) => reset(setPos)(Number(e.target.value))} className={control}>
            <option value={0}>All players</option>
            <option value={1}>Goalkeepers</option>
            <option value={2}>Defenders</option>
            <option value={3}>Midfielders</option>
            <option value={4}>Forwards</option>
          </select>
          <select
            value={nGw}
            onChange={(e) => {
              setNGw(Number(e.target.value));
              setSortKey("total");
              setPage(0);
            }}
            className={control}
          >
            {plan.gws.map((_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}/{plan.gws.length} GWs
              </option>
            ))}
          </select>
          <input
            value={minPrice}
            onChange={(e) => reset(setMinPrice)(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="£ min"
            inputMode="decimal"
            className={`${control} w-20`}
          />
          <input
            value={maxPrice}
            onChange={(e) => reset(setMaxPrice)(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="£ max"
            inputMode="decimal"
            className={`${control} w-20`}
          />
          <span className="vx-muted ml-auto text-xs">xPts per gameweek · from the Vortex model</span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div
              className="vx-card-head grid items-center gap-1.5 px-3 py-2 text-[11px] font-bold vx-muted"
              style={{ gridTemplateColumns: template }}
            >
              <span>PLAYER</span>
              <span className="text-right">PRICE</span>
              {gws.map((g, i) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setSortKey(i);
                    setPage(0);
                  }}
                  className={`text-center hover:underline ${sortKey === i ? "vx-gold" : ""}`}
                >
                  GW{g}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSortKey("total");
                  setPage(0);
                }}
                className={`text-center hover:underline ${sortKey === "total" ? "vx-gold" : ""}`}
              >
                TOTAL {sortKey === "total" ? "▼" : ""}
              </button>
              <span className="text-right">OWN%</span>
            </div>

            {view.map(({ p, cells, total }) => {
              const t = teams.get(p.team);
              return (
                <div
                  key={p.id}
                  className="vx-row grid items-center gap-1.5 px-3 py-1.5"
                  style={{
                    gridTemplateColumns: template,
                    background: mine.has(p.id) ? "rgba(132,210,28,.07)" : undefined,
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <PlayerPhoto code={p.code} alt={p.name} className="h-10 w-8 shrink-0 rounded-md" />
                    <TeamBadge code={t?.code} shortName={t?.short} className="h-5 w-5 shrink-0" />
                    <div className="min-w-0">
                      <div className="vx-text truncate text-sm font-bold">
                        {p.name}
                        {mine.has(p.id) ? <span className="vx-up ml-1 text-[10px]">● my squad</span> : null}
                      </div>
                      <div className="vx-muted truncate text-[11px]">
                        {t?.short} · {POS[p.type]}
                        {p.status !== "a" ? (
                          <span className={p.status === "d" ? "ml-1 text-amber-500" : "vx-down ml-1"}>
                            ● {p.chance != null ? `${p.chance}%` : "flagged"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <span className="vx-text text-right text-sm">{money(p.cost)}</span>
                  {cells.map((xp, i) => (
                    <span
                      key={i}
                      className="vx-text rounded-md py-1.5 text-center text-sm font-bold"
                      style={{ background: heat(xp) }}
                    >
                      {xp.toFixed(1)}
                    </span>
                  ))}
                  <span className="vx-text text-center text-lg font-extrabold">{total.toFixed(1)}</span>
                  <span className="vx-muted text-right text-xs">{p.owned.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>

        <Pager page={page} pageSize={PAGE} total={rows.length} onPage={setPage} filled />
      </div>
    </Panel>
  );
}
