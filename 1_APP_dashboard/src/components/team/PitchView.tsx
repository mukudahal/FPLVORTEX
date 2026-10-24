"use client";

import {
  Pitch,
  type GoalkeeperSideStats,
  type PitchCardItem,
} from "@/components/Pitch";
import type {
  Fixture,
  LiveElementStats,
  PicksResponse,
  SlimElement,
  SlimTeam,
} from "@/lib/types";

interface Props {
  picks: PicksResponse;
  elementsMap: Map<number, SlimElement>;
  teamsMap: Map<number, SlimTeam>;
  liveMap: Map<number, LiveElementStats>;
  gwFixtures: Fixture[];
  gkSideStats?: GoalkeeperSideStats;
}

function opponentLabel(
  teamId: number,
  gwFixtures: Fixture[],
  teamsMap: Map<number, SlimTeam>,
): { label: string; state: "upcoming" | "live" | "done" | "none" } {
  const fx = gwFixtures.filter(
    (f) => f.team_h === teamId || f.team_a === teamId,
  );
  if (fx.length === 0) return { label: "BLANK", state: "none" };
  const parts = fx.map((f) => {
    const home = f.team_h === teamId;
    const opp = teamsMap.get(home ? f.team_a : f.team_h);
    return `${opp?.short_name ?? "?"} (${home ? "H" : "A"})`;
  });
  const anyLive = fx.some((f) => f.started && !f.finished);
  const allDone = fx.every((f) => f.finished);
  return {
    label: parts.join(", "),
    state: anyLive ? "live" : allDone ? "done" : "upcoming",
  };
}

export function PitchView({
  picks,
  elementsMap,
  teamsMap,
  liveMap,
  gwFixtures,
  gkSideStats,
}: Props) {
  const toCard = (
    p: PicksResponse["picks"][number],
    benchIdx?: number,
  ): PitchCardItem | null => {
    const element = elementsMap.get(p.element);
    if (!element) return null;
    const team = teamsMap.get(element.team);
    const stats = liveMap.get(element.id);
    const opp = opponentLabel(element.team, gwFixtures, teamsMap);
    const played = (stats?.minutes ?? 0) > 0;
    const showPoints = played || opp.state === "done" || opp.state === "live";
    const isBench = benchIdx !== undefined;
    const pts =
      (stats?.total_points ?? 0) * (isBench ? 1 : Math.max(p.multiplier, 1));

    const benchLabels = ["1. GK", "2. 1st", "3. 2nd", "4. 3rd"];

    return {
      element,
      team,
      isCaptain: p.is_captain,
      isViceCaptain: p.is_vice_captain,
      isTripleCaptain: p.is_captain && p.multiplier === 3,
      benchLabel: isBench ? benchLabels[benchIdx] ?? `Sub ${benchIdx}` : undefined,
      primaryLabel: showPoints
        ? `${pts} pt${pts === 1 ? "" : "s"}`
        : opp.label,
      primaryTone:
        opp.state === "live"
          ? "green"
          : showPoints
            ? "white"
            : "muted",
      secondaryLabel: showPoints ? opp.label : `£${(element.now_cost / 10).toFixed(1)}m`,
    };
  };

  const starters = picks.picks
    .filter((p) => p.position <= 11)
    .map((p) => toCard(p))
    .filter((c): c is PitchCardItem => c !== null);

  const bench = picks.picks
    .filter((p) => p.position >= 12)
    .sort((a, b) => a.position - b.position)
    .map((p, i) => toCard(p, i))
    .filter((c): c is PitchCardItem => c !== null);

  const autoSubFooter =
    picks.automatic_subs.length > 0 ? (
      <p className="text-center text-[11px] text-slate-400">
        Auto-subs:{" "}
        {picks.automatic_subs
          .map(
            (s) =>
              `${elementsMap.get(s.element_in)?.web_name ?? "?"} ↔ ${
                elementsMap.get(s.element_out)?.web_name ?? "?"
              }`,
          )
          .join(", ")}
      </p>
    ) : null;

  return (
    <Pitch
      starters={starters}
      bench={bench}
      gkSideStats={gkSideStats}
      footer={autoSubFooter}
    />
  );
}
