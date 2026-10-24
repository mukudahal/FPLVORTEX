"use client";

import { useMemo, useState } from "react";
import { ErrorBox, Pill, Spinner } from "@/components/ui";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { PlayerModal } from "@/components/players/PlayerModal";
import { useJson } from "@/lib/useJson";
import { formatPrice, POSITIONS, statusInfo, teamBadgeUrl } from "@/lib/helpers";
import type { SlimBootstrap, SlimElement } from "@/lib/types";

type SortKey =
  | "total_points"
  | "form"
  | "now_cost"
  | "selected_by_percent"
  | "event_points"
  | "transfers_in_event"
  | "expected_goal_involvements";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "total_points", label: "Total pts" },
  { key: "form", label: "Form" },
  { key: "now_cost", label: "Price" },
  { key: "selected_by_percent", label: "Owned %" },
  { key: "event_points", label: "GW pts" },
  { key: "transfers_in_event", label: "Transfers in" },
  { key: "expected_goal_involvements", label: "xGI" },
];

function sortValue(p: SlimElement, key: SortKey): number {
  const v = p[key];
  return typeof v === "number" ? v : parseFloat(v as string) || 0;
}

export function PlayersBrowser() {
  const { data, error, loading, refresh } = useJson<SlimBootstrap>(
    "/api/fpl/bootstrap",
    300_000,
  );
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<number>(0);
  const [sort, setSort] = useState<SortKey>("total_points");
  const [selected, setSelected] = useState<SlimElement | null>(null);
  const [limit, setLimit] = useState(40);

  const teamsMap = useMemo(() => {
    const m = new Map<number, SlimBootstrap["teams"][number]>();
    data?.teams.forEach((t) => m.set(t.id, t));
    return m;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.elements
      .filter((p) => p.element_type >= 1 && p.element_type <= 4)
      .filter((p) => (position === 0 ? true : p.element_type === position))
      .filter((p) =>
        q
          ? `${p.first_name} ${p.second_name} ${p.web_name}`
              .toLowerCase()
              .includes(q)
          : true,
      )
      .sort((a, b) => sortValue(b, sort) - sortValue(a, sort));
  }, [data, query, position, sort]);

  if (loading) return <Spinner label="Loading players…" />;
  if (error || !data)
    return <ErrorBox message={error ?? "Could not load players."} onRetry={refresh} />;

  return (
    <main className="px-3 pt-5">
      <h1 className="mb-3 px-1 text-xl font-extrabold tracking-tight">Players</h1>

      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(40);
        }}
        placeholder="Search players…"
        className="mb-3 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#84d21c] focus:outline-none"
      />

      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
        {[0, 1, 2, 3, 4].map((t) => (
          <button
            key={t}
            onClick={() => {
              setPosition(t);
              setLimit(40);
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              position === t
                ? "bg-[#84d21c] text-[#000000]"
                : "border border-white/15 text-slate-300"
            }`}
          >
            {t === 0 ? "All" : POSITIONS[t]}
          </button>
        ))}
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
              sort === s.key
                ? "bg-[#37003c] text-white ring-1 ring-fuchsia-400/50"
                : "border border-white/10 text-slate-400"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {filtered.slice(0, limit).map((p) => {
          const team = teamsMap.get(p.team);
          const status = statusInfo(p.status);
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left transition hover:bg-white/[0.08]"
            >
              <PlayerPhoto code={p.code} alt={p.web_name} className="h-10 w-8 object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold">{p.web_name}</p>
                  {status ? (
                    <Pill className={`${status.className} !px-1.5 !text-[9px]`}>
                      {status.label}
                    </Pill>
                  ) : null}
                </div>
                <p className="flex items-center gap-1 text-[11px] text-slate-400">
                  {team ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={teamBadgeUrl(team.code)}
                      alt=""
                      className="h-3.5 w-3.5"
                      loading="lazy"
                    />
                  ) : null}
                  {team?.short_name} · {POSITIONS[p.element_type]} ·{" "}
                  {formatPrice(p.now_cost)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-[#84d21c]">
                  {sort === "total_points" || sort === "now_cost"
                    ? `${p.total_points} pts`
                    : sort === "selected_by_percent"
                      ? `${p.selected_by_percent}%`
                      : sort === "form"
                        ? `${p.form} form`
                        : sort === "event_points"
                          ? `${p.event_points} pts`
                          : sort === "transfers_in_event"
                            ? p.transfers_in_event.toLocaleString()
                            : `${p.expected_goal_involvements} xGI`}
                </p>
                <p className="text-[10px] text-slate-500">
                  {p.selected_by_percent}% owned
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length > limit ? (
        <button
          onClick={() => setLimit((l) => l + 40)}
          className="mt-3 w-full rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5"
        >
          Show more ({filtered.length - limit} remaining)
        </button>
      ) : null}

      {selected ? (
        <PlayerModal
          player={selected}
          teamsMap={teamsMap}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </main>
  );
}
