import type { SlimElement } from "./types";
import { probability } from "./probability";

export const LONG_APPEARANCE_MINUTES = 85;
export const SHORT_APPEARANCE_MINUTES = 24;

export interface MinutesObservation {
  kickoffAt: string;
  recordedAt: string;
  minutes: number;
  started: boolean;
  available: boolean;
}

export interface MinutesEvidence {
  asOf: string;
  observations: readonly MinutesObservation[];
  halfLifeDays?: number;
  priorWeight?: number;
}

export interface MinutesDistribution {
  p60: number;
  pSub: number;
  pStart: number;
  minutes60: number;
  minutesShort: number;
  expectedMinutes: number;
  confidence: number;
  source: "fpl_appearance_heuristic" | "recency_weighted_minutes";
}

export function estimateMinutesDistribution(
  player: SlimElement, teamMatchesPlayed: number, gwOffset = 0, evidence?: MinutesEvidence,
): MinutesDistribution {
  if (!Number.isFinite(teamMatchesPlayed) || teamMatchesPlayed < 0 || !Number.isInteger(gwOffset) || gwOffset < 0 ||
      !Number.isFinite(player.minutes) || player.minutes < 0 || !Number.isFinite(player.starts) || player.starts < 0) {
    throw new RangeError("Invalid minutes evidence or forecast horizon.");
  }
  const matches = Math.max(teamMatchesPlayed, 1);
  const startShare = Math.min(1, player.starts / matches);
  const minuteShare = Math.min(1, player.minutes / (matches * 90));
  let p60 = Math.min(0.96, 0.62 * startShare + 0.38 * minuteShare);
  let pSub = Math.min(0.35, (1 - p60) * (player.minutes > 0 ? 0.35 : 0.05));
  let pStart = startShare;
  let minutes60 = LONG_APPEARANCE_MINUTES;
  let minutesShort = SHORT_APPEARANCE_MINUTES;
  let source: MinutesDistribution["source"] = "fpl_appearance_heuristic";
  if (evidence) {
    const asOf = Date.parse(evidence.asOf);
    const halfLifeDays = evidence.halfLifeDays ?? 60;
    const priorWeight = evidence.priorWeight ?? 4;
    if (!Number.isFinite(asOf) || !Number.isFinite(halfLifeDays) || halfLifeDays <= 0 ||
        !Number.isFinite(priorWeight) || priorWeight <= 0) throw new RangeError("Invalid historical minutes configuration.");
    let weight = priorWeight;
    let longWeight = p60 * priorWeight;
    let shortWeight = pSub * priorWeight;
    let starts = pStart * priorWeight;
    let longMinutes = longWeight * minutes60;
    let shortMinutes = shortWeight * minutesShort;
    for (const observation of evidence.observations) {
      const kickoff = Date.parse(observation.kickoffAt);
      const recorded = Date.parse(observation.recordedAt);
      if (!Number.isFinite(kickoff) || !Number.isFinite(recorded) || recorded < kickoff ||
          !Number.isInteger(observation.minutes) || observation.minutes < 0 || observation.minutes > 90 ||
          typeof observation.started !== "boolean" || typeof observation.available !== "boolean") throw new RangeError("Invalid minutes observation.");
      if (kickoff >= asOf || recorded >= asOf || !observation.available) continue;
      const observationWeight = 2 ** (-(asOf - kickoff) / (86_400_000 * halfLifeDays));
      weight += observationWeight;
      starts += Number(observation.started) * observationWeight;
      if (observation.minutes >= 60) {
        longWeight += observationWeight;
        longMinutes += observation.minutes * observationWeight;
      } else if (observation.minutes > 0) {
        shortWeight += observationWeight;
        shortMinutes += observation.minutes * observationWeight;
      }
    }
    p60 = longWeight / weight;
    pSub = shortWeight / weight;
    pStart = starts / weight;
    if (longWeight > 0) minutes60 = longMinutes / longWeight;
    if (shortWeight > 0) minutesShort = shortMinutes / shortWeight;
    if (weight > priorWeight) source = "recency_weighted_minutes";
  }
  let availability = 1;
  if (["s", "u", "n"].includes(player.status)) availability = 0;
  else if (player.status === "i" || player.status === "d") {
    availability = probability((player.chance_of_playing_next_round ?? (player.status === "d" ? 50 : 0)) / 100, "Availability");
  } else if (player.chance_of_playing_next_round != null) {
    availability = probability(player.chance_of_playing_next_round / 100, "Availability");
  }
  // Future recovery needs dated evidence; a GW offset alone is not a recovery model.
  p60 *= availability;
  pSub *= availability;
  pStart *= availability;
  return {
    p60, pSub, pStart, minutes60, minutesShort,
    expectedMinutes: p60 * minutes60 + pSub * minutesShort,
    confidence: Math.round(Math.max(0, Math.min(94, 52 + minuteShare * 40 - (1 - availability) * 30 - gwOffset * 4))),
    source,
  };
}
