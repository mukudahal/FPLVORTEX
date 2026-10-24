"use client";

import { useMemo, useState } from "react";
import { Card, Pill, Spinner } from "@/components/ui";
import { Pitch, type PitchCardItem } from "@/components/Pitch";
import { TeamBadge } from "@/components/TeamBadge";
import { useJson } from "@/lib/useJson";
import { getBestLineup, type PredictedXI } from "@/lib/lineup";
import { kickoffLabel } from "@/lib/helpers";
import type { Fixture, SlimElement, SlimTeam } from "@/lib/types";
import type { PressResponse } from "@/app/api/press/route";

function XiPitch({
  xi,
  teamsMap,
}: {
  xi: PredictedXI;
  teamsMap: Map<number, SlimTeam>;
}) {
  const starters: PitchCardItem[] = xi.players.map((p) => ({
    element: p.element,
    team: teamsMap.get(p.element.team),
    primaryLabel: `${p.confidence}% Est.`,
    primaryTone:
      p.confidence >= 75 ? "green" : p.confidence >= 45 ? "amber" : "muted",
  }));
  return <Pitch starters={starters} />;
}

function PressPanel({ home, away }: { home: string; away: string }) {
  const { data, loading } = useJson<PressResponse>(
    `/api/press?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`,
  );
  if (loading) return <Spinner label="Checking press coverage…" />;
  if (!data || !data.found) {
    return (
      <p className="py-2 text-center text-xs text-slate-500">
        No press conference found yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {data.summary ? (
        <div className="grid grid-cols-1 gap-1.5 text-xs">
          {(
            [
              ["🤕 Injuries", data.summary.injuries],
              ["✅ Returns", data.summary.returns],
              ["🔄 Rotation", data.summary.rotation],
              ["🧠 Tactics", data.summary.tactics],
            ] as const
          ).map(([label, text]) => (
            <div key={label} className="rounded-lg bg-white/[0.05] px-2.5 py-1.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                {label}
              </p>
              <p className="text-slate-200">{text}</p>
            </div>
          ))}
          <p className="text-[9px] text-slate-600">
            AI summary — check sources below.
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-slate-500">
          Latest pre-match press &amp; team-news coverage:
        </p>
      )}
      {data.items.map((item, i) => (
        <a
          key={i}
          href={item.link}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs hover:bg-white/[0.08]"
        >
          <p className="font-semibold text-sky-200">{item.title} ↗</p>
          <p className="text-[9px] text-slate-500">{item.source}</p>
        </a>
      ))}
    </div>
  );
}

export function MatchesView({
  fixtures,
  elements,
  teamsMap,
  gw,
  squadTeamIds,
}: {
  fixtures: Fixture[];
  elements: SlimElement[];
  teamsMap: Map<number, SlimTeam>;
  gw: number;
  squadTeamIds: Set<number>;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [panel, setPanel] = useState<"lineups" | "press">("lineups");

  const gwFixtures = useMemo(
    () =>
      fixtures
        .filter((f) => f.event === gw)
        .sort((a, b) =>
          (a.kickoff_time ?? "").localeCompare(b.kickoff_time ?? ""),
        ),
    [fixtures, gw],
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[10px] text-slate-400">
        Predicted XIs (Estimate with confidence %) generated from recent starts,
        minutes, fitness flags and availability. Confirmed lineups replace
        predictions automatically when published.
      </p>
      {gwFixtures.map((f, idx) => {
        const home = teamsMap.get(f.team_h);
        const away = teamsMap.get(f.team_a);
        const isOpen = open === f.id || (open === null && idx === 0);
        const mine = squadTeamIds.has(f.team_h) || squadTeamIds.has(f.team_a);
        return (
          <Card
            key={f.id}
            className={`!p-3 ${mine ? "ring-1 ring-[#84d21c]/30" : ""}`}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? -1 : f.id)}
              className="flex w-full items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <TeamBadge
                  code={home?.code}
                  shortName={home?.short_name}
                  className="h-6 w-6"
                />
                <span className="text-sm font-bold">
                  {home?.short_name} v {away?.short_name}
                </span>
                <TeamBadge
                  code={away?.code}
                  shortName={away?.short_name}
                  className="h-6 w-6"
                />
                {mine ? (
                  <Pill className="bg-[#84d21c]/15 !px-1.5 !text-[8px] text-[#84d21c]">
                    MY PLAYERS
                  </Pill>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400">
                  {kickoffLabel(f.kickoff_time)}
                </p>
                <p className="text-[10px] text-slate-500">
                  {isOpen ? "hide ▴" : "details ▾"}
                </p>
              </div>
            </button>

            {isOpen ? (
              <div className="mt-3">
                <div className="mb-2 flex rounded-lg border border-white/10 p-0.5">
                  {(
                    [
                      ["lineups", "Predicted XIs"],
                      ["press", "Press & team news"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPanel(key)}
                      className={`flex-1 rounded-md py-1.5 text-xs font-semibold ${
                        panel === key
                          ? "bg-[#37003c] text-white"
                          : "text-slate-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {panel === "lineups" ? (
                  <div className="flex flex-col gap-3">
                    {[f.team_h, f.team_a].map((tid) => {
                      const xi = getBestLineup(tid, elements);
                      const t = teamsMap.get(tid);
                      return (
                        <div key={tid}>
                          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold">
                            <TeamBadge
                              code={t?.code}
                              shortName={t?.short_name}
                              className="h-4 w-4"
                            />
                            {t?.name}{" "}
                            <span className="font-normal text-slate-400">
                              {xi
                                ? `(${xi.formation}, ${
                                    xi.source === "model"
                                      ? "model Estimate"
                                      : "confirmed XI"
                                  })`
                                : ""}
                            </span>
                          </p>
                          {xi ? (
                            <XiPitch xi={xi} teamsMap={teamsMap} />
                          ) : (
                            <p className="text-xs text-slate-500">
                              Not enough data.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <PressPanel
                    home={home?.name ?? ""}
                    away={away?.name ?? ""}
                  />
                )}
              </div>
            ) : null}
          </Card>
        );
      })}
      {gwFixtures.length === 0 ? (
        <Card>
          <p className="text-center text-sm text-slate-500">
            No fixtures in GW{gw}.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
