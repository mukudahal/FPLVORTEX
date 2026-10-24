"use client";

import { useMemo } from "react";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import { useJson } from "@/lib/useJson";
import type { SlimElement, SlimTeam, Transfer } from "@/lib/types";

export function TransfersView({
  teamId,
  elementsMap,
  teamsMap,
}: {
  teamId: string;
  elementsMap: Map<number, SlimElement>;
  teamsMap: Map<number, SlimTeam>;
}) {
  const { data, error, loading, refresh } = useJson<Transfer[]>(
    `/api/fpl/entry/${teamId}/transfers`,
  );

  const grouped = useMemo(() => {
    const map = new Map<number, Transfer[]>();
    (data ?? []).forEach((t) => {
      const arr = map.get(t.event) ?? [];
      arr.push(t);
      map.set(t.event, arr);
    });
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [data]);

  if (loading) return <Spinner label="Loading transfers…" />;
  if (error || !data)
    return <ErrorBox message={error ?? "Could not load transfers."} onRetry={refresh} />;
  if (data.length === 0)
    return (
      <Card>
        <p className="text-sm text-slate-400">No transfers made yet this season.</p>
      </Card>
    );

  const name = (id: number) => elementsMap.get(id)?.web_name ?? `#${id}`;
  const club = (id: number) => {
    const el = elementsMap.get(id);
    return el ? (teamsMap.get(el.team)?.short_name ?? "") : "";
  };

  return (
    <div className="flex flex-col gap-3">
      {grouped.map(([gw, transfers]) => (
        <Card key={gw}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Gameweek {gw}
          </p>
          <div className="flex flex-col gap-2">
            {transfers.map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="text-rose-400">▼</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{name(t.element_out)}</p>
                    <p className="text-[10px] text-slate-500">
                      {club(t.element_out)} · £{(t.element_out_cost / 10).toFixed(1)}m
                    </p>
                  </div>
                </div>
                <span className="px-2 text-slate-500">→</span>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{name(t.element_in)}</p>
                    <p className="text-[10px] text-slate-500">
                      {club(t.element_in)} · £{(t.element_in_cost / 10).toFixed(1)}m
                    </p>
                  </div>
                  <span className="text-[#84d21c]">▲</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
