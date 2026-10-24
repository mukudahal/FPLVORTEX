import type {
  Fixture,
  LiveElementStats,
  PicksResponse,
  SlimElement,
} from "./types";

// ---------- Phase 2: plain-English points explanation ----------

export function explainStats(
  stats: LiveElementStats | undefined,
  element: SlimElement,
  played: boolean,
): string {
  if (!stats || (!played && stats.minutes === 0)) {
    return "Did not play — no points.";
  }
  const s = stats;
  const parts: string[] = [];
  if (s.minutes === 0) return "Did not play — no points.";
  parts.push(
    s.minutes >= 60
      ? `played ${s.minutes} mins (+2)`
      : `played ${s.minutes} mins (+1)`,
  );
  if (s.goals_scored > 0) {
    const per =
      element.element_type === 1 || element.element_type === 2
        ? 6
        : element.element_type === 3
          ? 5
          : 4;
    parts.push(
      `${s.goals_scored} goal${s.goals_scored > 1 ? "s" : ""} (+${s.goals_scored * per})`,
    );
  }
  if (s.assists > 0)
    parts.push(`${s.assists} assist${s.assists > 1 ? "s" : ""} (+${s.assists * 3})`);
  if (s.clean_sheets > 0 && element.element_type <= 3 && s.minutes >= 60) {
    const cs = element.element_type <= 2 ? 4 : 1;
    parts.push(`clean sheet (+${cs})`);
  }
  if (s.saves >= 3 && element.element_type === 1)
    parts.push(`${s.saves} saves (+${Math.floor(s.saves / 3)})`);
  if (s.penalties_saved > 0) parts.push(`penalty saved (+${s.penalties_saved * 5})`);
  if ((s.defensive_contribution ?? 0) > 0)
    parts.push(`defensive contribution (+${s.defensive_contribution})`);
  if (s.bonus > 0) parts.push(`${s.bonus} bonus (bps ${s.bps})`);
  // negatives
  if (s.goals_conceded >= 2 && element.element_type <= 2)
    parts.push(`${s.goals_conceded} conceded (−${Math.floor(s.goals_conceded / 2)})`);
  if (s.yellow_cards > 0) parts.push(`yellow card (−1)`);
  if (s.red_cards > 0) parts.push(`red card (−3)`);
  if (s.own_goals > 0) parts.push(`own goal (−${s.own_goals * 2})`);
  if (s.penalties_missed > 0) parts.push(`missed penalty (−${s.penalties_missed * 2})`);
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

export type PerfLabel = "HIGH" | "AVERAGE" | "LOW";

/** Compare GW points to the player's own season average (points_per_game). */
export function perfVsSeason(gwPoints: number, element: SlimElement): PerfLabel {
  const ppg = parseFloat(element.points_per_game) || 0;
  if (gwPoints >= ppg + 2) return "HIGH";
  if (gwPoints <= ppg - 2) return "LOW";
  return "AVERAGE";
}

// ---------- Rank impact ----------

export interface RankImpact {
  element: SlimElement;
  gwPoints: number;
  myMultiplier: number;
  eo: number; // 0..1 field ownership proxy
  impact: number; // (mult - eo) * points
  owned: boolean;
}

/**
 * Rank impact per player = (my multiplier − field ownership) × GW points.
 * Ownership proxy = selected_by_percent (NOT top-10k EO).
 * Includes players I do NOT own (multiplier 0) so big hauls I missed show up.
 */
export function computeRankImpacts(
  picks: PicksResponse,
  elements: SlimElement[],
  liveMap: Map<number, LiveElementStats>,
): { gained: RankImpact[]; cost: RankImpact[] } {
  const myMult = new Map<number, number>();
  picks.picks.forEach((p) => myMult.set(p.element, p.multiplier));

  const impacts: RankImpact[] = [];
  for (const el of elements) {
    if (el.element_type > 4) continue;
    const pts = liveMap.get(el.id)?.total_points ?? 0;
    if (pts === 0) continue;
    const eo = (parseFloat(el.selected_by_percent) || 0) / 100;
    const mult = myMult.get(el.id) ?? 0;
    const impact = (mult - eo) * pts;
    // keep only meaningful movements
    if (Math.abs(impact) < 0.5) continue;
    impacts.push({
      element: el,
      gwPoints: pts,
      myMultiplier: mult,
      eo,
      impact,
      owned: myMult.has(el.id),
    });
  }
  const gained = impacts
    .filter((i) => i.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3);
  const cost = impacts
    .filter((i) => i.impact < 0)
    .sort((a, b) => a.impact - b.impact)
    .slice(0, 3);
  return { gained, cost };
}

// ---------- Captain decision ----------

export interface CaptainVerdict {
  captain: SlimElement | null;
  captainPoints: number;
  multiplier: number;
  best: SlimElement | null;
  bestPoints: number;
  delta: number; // points gained (+) or lost (−) vs best available captain
}

export function captainDecision(
  picks: PicksResponse,
  elementsMap: Map<number, SlimElement>,
  liveMap: Map<number, LiveElementStats>,
): CaptainVerdict {
  const capPick = picks.picks.find((p) => p.is_captain);
  const captain = capPick ? (elementsMap.get(capPick.element) ?? null) : null;
  const capPts = capPick ? (liveMap.get(capPick.element)?.total_points ?? 0) : 0;
  const mult = capPick?.multiplier && capPick.multiplier > 1 ? capPick.multiplier : 2;

  let best: SlimElement | null = null;
  let bestPts = -1;
  for (const p of picks.picks) {
    const pts = liveMap.get(p.element)?.total_points ?? 0;
    if (pts > bestPts) {
      bestPts = pts;
      best = elementsMap.get(p.element) ?? null;
    }
  }
  const extraMult = mult - 1; // extra points per captain point
  const delta = (capPts - Math.max(bestPts, 0)) * extraMult;
  return {
    captain,
    captainPoints: capPts,
    multiplier: mult,
    best,
    bestPoints: Math.max(bestPts, 0),
    delta,
  };
}

// ---------- Fixtures helpers shared by planner/chips ----------

export function teamFixturesInGw(
  teamId: number,
  gw: number,
  fixtures: Fixture[],
): Fixture[] {
  return fixtures.filter(
    (f) => f.event === gw && (f.team_h === teamId || f.team_a === teamId),
  );
}

export function fixtureDifficultyFor(teamId: number, f: Fixture): number {
  return f.team_h === teamId ? f.team_h_difficulty : f.team_a_difficulty;
}
