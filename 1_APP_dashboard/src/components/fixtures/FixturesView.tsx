"use client";

import { useMemo, useState } from "react";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import { useJson } from "@/lib/useJson";
import { fdrClasses, kickoffLabel, teamBadgeUrl } from "@/lib/helpers";
import type { Fixture, SlimBootstrap, SlimTeam } from "@/lib/types";

type Mode = "list" | "planner";

export function FixturesView() {
  const bootstrap = useJson<SlimBootstrap>("/api/fpl/bootstrap", 300_000);
  const fixtures = useJson<Fixture[]>("/api/fpl/fixtures", 120_000);
  const [mode, setMode] = useState<Mode>("list");
  const [viewGw, setViewGw] = useState<number | null>(null);

  const currentGw =
    bootstrap.data?.currentEvent ?? bootstrap.data?.nextEvent ?? 1;
  const gw = viewGw ?? currentGw;

  const teamsMap = useMemo(() => {
    const m = new Map<number, SlimTeam>();
    bootstrap.data?.teams.forEach((t) => m.set(t.id, t));
    return m;
  }, [bootstrap.data]);

  const gwFixtures = useMemo(
    () =>
      (fixtures.data ?? [])
        .filter((f) => f.event === gw)
        .sort((a, b) =>
          (a.kickoff_time ?? "").localeCompare(b.kickoff_time ?? ""),
        ),
    [fixtures.data, gw],
  );

  // FDR planner: next 6 GWs from the next unfinished GW
  const planner = useMemo(() => {
    if (!bootstrap.data || !fixtures.data) return null;
    const startGw =
      bootstrap.data.nextEvent ?? bootstrap.data.currentEvent ?? 1;
    const gws = Array.from({ length: 6 }, (_, i) => startGw + i).filter(
      (g) => g <= 38,
    );
    const rows = bootstrap.data.teams.map((team) => {
      const cells = gws.map((g) => {
        const fx = fixtures.data!.filter(
          (f) => f.event === g && (f.team_h === team.id || f.team_a === team.id),
        );
        return fx.map((f) => {
          const home = f.team_h === team.id;
          const opp = teamsMap.get(home ? f.team_a : f.team_h);
          return {
            label: `${opp?.short_name ?? "?"}${home ? "" : "*"}`,
            home,
            difficulty: home ? f.team_h_difficulty : f.team_a_difficulty,
          };
        });
      });
      const totalDifficulty = cells
        .flat()
        .reduce((s, c) => s + c.difficulty, 0);
      const played = cells.flat().length;
      return {
        team,
        cells,
        score: played > 0 ? totalDifficulty / played + (6 - played) : 99,
      };
    });
    rows.sort((a, b) => a.score - b.score);
    return { gws, rows };
  }, [bootstrap.data, fixtures.data, teamsMap]);

  if (bootstrap.loading || fixtures.loading)
    return <Spinner label="Loading fixtures…" />;
  if (bootstrap.error || fixtures.error || !bootstrap.data || !fixtures.data)
    return (
      <ErrorBox
        message={bootstrap.error ?? fixtures.error ?? "Could not load fixtures."}
        onRetry={() => {
          bootstrap.refresh();
          fixtures.refresh();
        }}
      />
    );

  return (
    <main className="px-3 pt-5">
      <div className="mb-3 flex items-center justify-between px-1">
        <h1 className="text-xl font-extrabold tracking-tight">Fixtures</h1>
        <div className="flex rounded-full border border-white/15 p-0.5">
          {(
            [
              ["list", "By GW"],
              ["planner", "FDR grid"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                mode === m ? "bg-[#84d21c] text-[#000000]" : "text-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "list" ? (
        <>
          <div className="mb-3 flex items-center justify-between px-1">
            <button
              onClick={() => setViewGw(Math.max(1, gw - 1))}
              disabled={gw <= 1}
              className="rounded-full border border-white/15 px-3 py-1 text-sm font-bold text-slate-300 disabled:opacity-30"
            >
              ‹
            </button>
            <p className="text-sm font-bold">Gameweek {gw}</p>
            <button
              onClick={() => setViewGw(Math.min(38, gw + 1))}
              disabled={gw >= 38}
              className="rounded-full border border-white/15 px-3 py-1 text-sm font-bold text-slate-300 disabled:opacity-30"
            >
              ›
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {gwFixtures.map((f) => {
              const home = teamsMap.get(f.team_h);
              const away = teamsMap.get(f.team_a);
              const isLive = f.started && !f.finished;
              return (
                <Card key={f.id} className="!p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                      <span className="truncate text-sm font-semibold">
                        {home?.name}
                      </span>
                      {home ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={teamBadgeUrl(home.code)}
                          alt=""
                          className="h-6 w-6"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="shrink-0 text-center">
                      {f.started || f.finished ? (
                        <p
                          className={`rounded-lg px-2.5 py-1 text-sm font-extrabold ${
                            isLive
                              ? "bg-[#84d21c] text-[#000000]"
                              : "bg-white/10 text-white"
                          }`}
                        >
                          {f.team_h_score ?? 0} – {f.team_a_score ?? 0}
                        </p>
                      ) : (
                        <p className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold text-slate-300">
                          {kickoffLabel(f.kickoff_time)}
                        </p>
                      )}
                      {isLive ? (
                        <p className="live-dot mt-0.5 text-[9px] font-bold text-[#84d21c]">
                          LIVE {f.minutes}&apos;
                        </p>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {away ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={teamBadgeUrl(away.code)}
                          alt=""
                          className="h-6 w-6"
                          loading="lazy"
                        />
                      ) : null}
                      <span className="truncate text-sm font-semibold">
                        {away?.name}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 flex justify-between text-[9px] font-semibold">
                    <span
                      className={`rounded px-1.5 py-0.5 ${fdrClasses(f.team_h_difficulty)}`}
                    >
                      FDR {f.team_h_difficulty}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 ${fdrClasses(f.team_a_difficulty)}`}
                    >
                      FDR {f.team_a_difficulty}
                    </span>
                  </div>
                </Card>
              );
            })}
            {gwFixtures.length === 0 ? (
              <Card>
                <p className="text-center text-sm text-slate-400">
                  No fixtures scheduled for this gameweek.
                </p>
              </Card>
            ) : null}
          </div>
        </>
      ) : planner ? (
        <Card className="!p-2">
          <p className="mb-2 px-1 text-[11px] text-slate-400">
            Next {planner.gws.length} gameweeks, easiest run first. * = away.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-[10px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-transparent px-1 text-left text-slate-400">
                    Team
                  </th>
                  {planner.gws.map((g) => (
                    <th key={g} className="text-slate-400">
                      GW{g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planner.rows.map(({ team, cells }) => (
                  <tr key={team.id}>
                    <td className="sticky left-0 z-10 whitespace-nowrap rounded bg-[#1c1630] px-1.5 py-1 font-bold">
                      {team.short_name}
                    </td>
                    {cells.map((cell, i) => (
                      <td key={i} className="min-w-[44px]">
                        {cell.length === 0 ? (
                          <div className="rounded bg-slate-800 py-1 text-center text-slate-500">
                            —
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {cell.map((c, j) => (
                              <div
                                key={j}
                                className={`rounded py-1 text-center font-bold ${fdrClasses(c.difficulty)}`}
                              >
                                {c.label}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </main>
  );
}
