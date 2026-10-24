import type { LeagueStandingRow, Pick, SlimElement } from "./types";
import type { PlayerIntelligence } from "./intelligence";

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export interface MarketSignal { playerId: number; transferBalance: number; ownershipPercent: number; momentumIndex: number; label: string; calibratedProbability: null }
/** Momentum score is an uncalibrated index, NOT a prediction probability. */
export function priceMovementSignals(players: readonly SlimElement[]): MarketSignal[] {
  return players.filter((player) => player.element_type <= 4).map((player) => {
    const balance = player.transfers_in_event - player.transfers_out_event;
    const transferVolume = player.transfers_in_event + player.transfers_out_event;
    const index = transferVolume > 0 ? clamp(Math.round((balance / Math.max(1, transferVolume)) * 100), -100, 100) : 0;
    return { playerId: player.id, transferBalance: balance,
      ownershipPercent: Number.parseFloat(player.selected_by_percent) || 0, momentumIndex: index,
      label: index > 25 ? "rising demand" : index < -25 ? "falling demand" : "mixed demand", calibratedProbability: null };
  }).sort((a, b) => b.momentumIndex - a.momentumIndex);
}

export interface AvailabilityAlert { id: number; name: string; status: string; chanceNextGw: number | null; news: string; severity: "high" | "medium"; updatedAt: string | null }
export function injuryAvailabilityList(players: readonly SlimElement[]): AvailabilityAlert[] {
  return players.filter((player) => ["d", "i", "s", "n", "u"].includes(player.status) ||
    (player.chance_of_playing_next_round !== null && player.chance_of_playing_next_round < 100))
    .map((player) => ({ id: player.id, name: player.web_name, status: player.status,
      chanceNextGw: player.chance_of_playing_next_round, news: player.news || "No verified return date",
      severity: player.status !== "d" || (player.chance_of_playing_next_round ?? 0) < 75 ? "high" as const : "medium" as const,
      updatedAt: player.news_added })).sort((a, b) => (a.chanceNextGw ?? 0) - (b.chanceNextGw ?? 0));
}

export interface LeagueRival { entryId: number; name: string; score: number; gapToLeader: number; gapToMe: number; rank: number }
export function rankLeagueThreats(standings: readonly LeagueStandingRow[], myEntryId: number): LeagueRival[] {
  const ranking = [...standings].sort((a, b) => b.total - a.total || a.rank - b.rank);
  const me = ranking.find((row) => row.entry === myEntryId);
  const leaderScore = ranking[0]?.total ?? 0;
  return ranking.map((row) => ({ entryId: row.entry, name: row.entry_name, score: row.total,
    gapToLeader: leaderScore - row.total, gapToMe: row.total - (me?.total ?? 0), rank: row.rank }));
}

export interface OwnershipCohort { source: "sampled_visible_picks"; sampleSize: number; ownership: Record<number, number>; effectiveOwnership: Record<number, number>; exactGlobal: false }
/** Picks are public-at-deadline snapshots; unknown/private squads are excluded, not inferred. */
export function effectiveOwnershipSample(picksByEntry: readonly (readonly Pick[] | null)[]): OwnershipCohort {
  const visible = picksByEntry.filter((picks): picks is readonly Pick[] => !!picks && picks.length > 0);
  const counts = new Map<number, number>();
  const weighted = new Map<number, number>();
  for (const picks of visible) {
    const seen = new Set<number>();
    for (const pick of picks) {
      if (!seen.has(pick.element)) counts.set(pick.element, (counts.get(pick.element) ?? 0) + 1);
      seen.add(pick.element);
      weighted.set(pick.element, (weighted.get(pick.element) ?? 0) + Math.max(0, pick.multiplier));
    }
  }
  const denominator = Math.max(1, visible.length);
  return { source: "sampled_visible_picks", sampleSize: visible.length,
    ownership: Object.fromEntries([...counts].map(([id, count]) => [id, count / denominator])),
    effectiveOwnership: Object.fromEntries([...weighted].map(([id, count]) => [id, count / denominator])),
    exactGlobal: false };
}

export interface ThreatRanking { playerId: number; name: string; expectedPoints: number; estimatedExposure: number; threatIndex: number; owned: boolean; kind: "exposure_risk" | "differential" }
export function rankPlayerThreats(intelligence: readonly PlayerIntelligence[], ownedIds: readonly number[], cohort?: OwnershipCohort): ThreatRanking[] {
  const owned = new Set(ownedIds);
  return intelligence.map((row) => {
    const exposure = cohort && cohort.sampleSize >= 10 ? cohort.effectiveOwnership[row.player.id] ?? 0 : row.ownership / 100;
    const unowned = !owned.has(row.player.id);
    const danger = unowned ? row.nextXPts * exposure * row.minutesChance / 100 : 0;
    return { playerId: row.player.id, name: row.player.web_name, expectedPoints: row.nextXPts,
      estimatedExposure: Math.round(exposure * 1000) / 10, threatIndex: Math.round(danger * 100) / 100,
      owned: !unowned, kind: row.ownership < 10 ? "differential" as const : "exposure_risk" as const };
  }).sort((a, b) => b.threatIndex - a.threatIndex);
}

/** Marginal upgrade with price/position/club feasibility. 'Must-own' is a decision score, not a universal label. */
export function feasibleMustOwnTargets(
  intelligence: readonly PlayerIntelligence[], squad: readonly SlimElement[], bankTenths: number,
  sellingPrices?: Readonly<Record<number, number>>,
): { targetId: number; outId: number; projectedGain: number; legalPurchase: boolean }[] {
  const owned = new Set(squad.map((player) => player.id));
  const clubCounts = new Map<number, number>();
  for (const player of squad) clubCounts.set(player.team, (clubCounts.get(player.team) ?? 0) + 1);
  const points = new Map(intelligence.map((row) => [row.player.id, row.totalXPts]));
  return intelligence.filter((row) => !owned.has(row.player.id)).flatMap((row) => squad
    .filter((out) => out.element_type === row.player.element_type && (clubCounts.get(row.player.team) ?? 0) - Number(out.team === row.player.team) < 3)
    .map((out) => ({ targetId: row.player.id, outId: out.id,
      projectedGain: Math.round((row.totalXPts - (points.get(out.id) ?? 0)) * 100) / 100,
      legalPurchase: Number.isInteger(sellingPrices?.[out.id]) && row.player.now_cost <= bankTenths + (sellingPrices?.[out.id] ?? 0) }))
    .filter((candidate) => candidate.legalPurchase && candidate.projectedGain > 0))
    .sort((a, b) => b.projectedGain - a.projectedGain);
}

export function rankCaptaincy(intelligence: readonly PlayerIntelligence[], riskPreference: "balanced" | "upside" = "balanced") {
  return intelligence.filter((row) => row.nextXPts > 0 && row.minutesChance >= 20).map((row) => {
    const availability = row.minutesChance / 100;
    const differential = 1 - clamp(row.ownership / 100, 0, 1);
    const score = row.nextXPts * (riskPreference === "upside" ? 1 + 0.15 * differential : 1) * (0.75 + 0.25 * availability);
    return { id: row.player.id, name: row.player.web_name, expectedPoints: row.nextXPts,
      confidence: row.confidence, selectedPercent: row.ownership, score: Math.round(score * 100) / 100 };
  }).sort((a, b) => b.score - a.score);
}
