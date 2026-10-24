import { computePlayerXPts, computePositionPriors } from "@/lib/xpts";
import type { Fixture, SlimBootstrap, SlimElement, SlimTeam } from "@/lib/types";

export interface PlayerIntelligence {
  player: SlimElement;
  team: SlimTeam | null;
  weeklyXPts: number[];
  totalXPts: number;
  nextXPts: number;
  valuePerMillion: number;
  minutesChance: number;
  confidence: number;
  ownership: number;
  fixtureLabels: string[];
  risk: "LOW" | "MEDIUM" | "HIGH";
}

export interface IntelligenceResult {
  nextGw: number;
  weeks: number[];
  players: PlayerIntelligence[];
  captainCandidates: PlayerIntelligence[];
  matchCount: number;
  generatedAt: string;
}

function isPlayable(player: SlimElement): boolean {
  return player.element_type >= 1 && player.element_type <= 4 && player.now_cost > 0;
}

export function analyzeIntelligence(
  bootstrap: SlimBootstrap,
  fixtures: Fixture[],
  horizon = 5,
  generatedAt = new Date().toISOString(),
): IntelligenceResult {
  const nextGw = bootstrap.nextEvent ?? bootstrap.currentEvent ?? bootstrap.events.find((event) => !event.finished)?.id ?? 1;
  const count = Math.max(1, Math.min(8, Math.floor(Number.isFinite(horizon) ? horizon : 5)));
  const weeks = bootstrap.events
    .filter((event) => event.id >= nextGw && !event.finished)
    .slice(0, count)
    .map((event) => event.id);
  if (weeks.length === 0) weeks.push(nextGw);

  const teams = new Map(bootstrap.teams.map((team) => [team.id, team] as const));
  const finishedByTeam = new Map<number, number>();
  for (const match of fixtures) {
    if (!match.finished) continue;
    finishedByTeam.set(match.team_h, (finishedByTeam.get(match.team_h) ?? 0) + 1);
    finishedByTeam.set(match.team_a, (finishedByTeam.get(match.team_a) ?? 0) + 1);
  }
  const priors = computePositionPriors(bootstrap.elements);
  const players = bootstrap.elements.filter(isPlayable).map((player): PlayerIntelligence => {
    const weekly = weeks.map((gw, index) =>
      computePlayerXPts(
        player,
        gw,
        fixtures,
        teams,
        finishedByTeam.get(player.team) ?? 0,
        index,
        priors,
      ),
    );
    const weeklyXPts = weekly.map((estimate) => Number.isFinite(estimate.xPts) ? estimate.xPts : 0);
    const totalXPts = weeklyXPts.reduce((sum, points) => sum + points, 0);
    const next = weekly[0];
    const ownership = Math.max(0, Number.parseFloat(player.selected_by_percent) || 0);
    const minutesChance = Math.max(0, Math.min(100, Math.round((next.p60 + next.pSub) * 100)));
    const risk: PlayerIntelligence["risk"] =
      player.status !== "a" || minutesChance < 58 ? "HIGH" :
      minutesChance < 80 || next.confidence < 65 ? "MEDIUM" : "LOW";
    return {
      player,
      team: teams.get(player.team) ?? null,
      weeklyXPts,
      totalXPts,
      nextXPts: weeklyXPts[0] ?? 0,
      valuePerMillion: totalXPts / Math.max(1, player.now_cost / 10),
      minutesChance,
      confidence: next.confidence,
      ownership,
      fixtureLabels: weekly.map((estimate) => estimate.fixturesLabel),
      risk,
    };
  }).sort((a, b) => b.totalXPts - a.totalXPts);

  const captainCandidates = [...players]
    .filter((item) => item.nextXPts > 0 && item.minutesChance >= 55)
    .sort((a, b) => b.nextXPts - a.nextXPts)
    .slice(0, 3);

  return {
    nextGw,
    weeks,
    players,
    captainCandidates,
    matchCount: fixtures.filter((match) => weeks.includes(match.event ?? -1)).length,
    generatedAt,
  };
}
