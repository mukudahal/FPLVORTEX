import { CLEAN_SHEET_POINTS, GOAL_POINTS } from "./scoring";
import type { MinutesDistribution } from "./minutes";
import { expectedPoissonFloor, gammaSample, negativeBinomialTail, poissonFromUniform, poissonSample, probability } from "./probability";

export interface PlayerFixtureModel {
  fixtureId: number;
  position: number;
  minutes: MinutesDistribution;
  goals90: number;
  assists90: number;
  conceded90: number;
  saves90: number;
  bonus90: number;
  defensiveActions90: number;
  defensiveDispersion: number;
  yellow90: number;
  red90: number;
  ownGoals90: number;
  penaltyMisses90: number;
  penaltySaves90: number;
}

export interface FixtureExpectation {
  appearancePts: number; goalPts: number; assistPts: number; cleanSheetPts: number;
  bonusPts: number; defensivePts: number; savePts: number; cardPts: number; otherPts: number;
}

export function validateFixtureModel(model: PlayerFixtureModel): void {
  if (![1, 2, 3, 4].includes(model.position) || !Number.isInteger(model.fixtureId) || model.fixtureId < 1) throw new RangeError("Invalid fixture identity or position.");
  for (const [key, value] of Object.entries(model)) {
    if (key !== "minutes" && (!Number.isFinite(value) || Number(value) < 0)) throw new RangeError(`Invalid fixture parameter ${key}.`);
  }
  if (model.defensiveDispersion <= 0 || model.conceded90 > 20) throw new RangeError("Invalid count distribution.");
  probability(model.minutes.p60);
  probability(model.minutes.pSub);
  if (model.minutes.p60 + model.minutes.pSub > 1 + 1e-12 ||
      !Number.isFinite(model.minutes.minutes60) || model.minutes.minutes60 < 60 || model.minutes.minutes60 > 90 ||
      !Number.isFinite(model.minutes.minutesShort) || model.minutes.minutesShort < 1 || model.minutes.minutesShort >= 60) throw new RangeError("Invalid conditional minutes.");
}

function defensiveThreshold(position: number): number { return position === 2 ? 10 : position >= 3 ? 12 : 0; }

export function expectedFixturePoints(model: PlayerFixtureModel): FixtureExpectation {
  validateFixtureModel(model);
  const result: FixtureExpectation = { appearancePts: 0, goalPts: 0, assistPts: 0, cleanSheetPts: 0, bonusPts: 0, defensivePts: 0, savePts: 0, cardPts: 0, otherPts: 0 };
  for (const [weight, minutes] of [[model.minutes.p60, model.minutes.minutes60], [model.minutes.pSub, model.minutes.minutesShort]]) {
    const exposure = minutes / 90;
    const conceded = model.conceded90 * exposure;
    const threshold = defensiveThreshold(model.position);
    result.appearancePts += weight * (minutes >= 60 ? 2 : 1);
    result.goalPts += weight * model.goals90 * exposure * GOAL_POINTS[model.position];
    result.assistPts += weight * model.assists90 * exposure * 3;
    result.cleanSheetPts += weight * ((minutes >= 60 ? CLEAN_SHEET_POINTS[model.position] * Math.exp(-conceded) : 0) -
      (model.position <= 2 ? expectedPoissonFloor(conceded, 2) : 0));
    result.bonusPts += weight * Math.min(3, model.bonus90 * exposure);
    result.defensivePts += threshold ? weight * 2 * negativeBinomialTail(model.defensiveActions90 * exposure, model.defensiveDispersion, threshold) : 0;
    result.savePts += model.position === 1 ? weight * (expectedPoissonFloor(model.saves90 * exposure, 3) + 5 * model.penaltySaves90 * exposure) : 0;
    result.cardPts -= weight * (-Math.expm1(-model.yellow90 * exposure) - 3 * Math.expm1(-model.red90 * exposure));
    result.otherPts -= weight * 2 * (model.ownGoals90 + model.penaltyMisses90) * exposure;
  }
  return result;
}

/** Conditional simulation shares the exact scoring components and minutes law with analytic xPts. */
export function sampleFixturePoints(model: PlayerFixtureModel, random: () => number, concededUniform: number, attackShock = 1): { points: number; appeared: boolean } {
  const uniform = random();
  const minutes = uniform < model.minutes.p60 ? model.minutes.minutes60 :
    uniform < model.minutes.p60 + model.minutes.pSub ? model.minutes.minutesShort : 0;
  if (!minutes) return { points: 0, appeared: false };
  const exposure = minutes / 90;
  const conceded = poissonFromUniform(concededUniform, model.conceded90 * exposure);
  const bonusMean = Math.min(3, model.bonus90 * exposure);
  const threshold = defensiveThreshold(model.position);
  let points = minutes >= 60 ? 2 : 1;
  points += GOAL_POINTS[model.position] * poissonSample(model.goals90 * exposure * attackShock, random);
  points += 3 * poissonSample(model.assists90 * exposure * attackShock, random);
  if (minutes >= 60 && conceded === 0) points += CLEAN_SHEET_POINTS[model.position];
  if (model.position <= 2) points -= Math.floor(conceded / 2);
  if (model.position === 1) points += Math.floor(poissonSample(model.saves90 * exposure, random) / 3) + 5 * poissonSample(model.penaltySaves90 * exposure, random);
  points += Math.floor(bonusMean) + Number(random() < bonusMean % 1);
  if (threshold) {
    const actions = poissonSample(model.defensiveActions90 * exposure * gammaSample(model.defensiveDispersion, random) / model.defensiveDispersion, random);
    if (actions >= threshold) points += 2;
  }
  points -= Number(random() < -Math.expm1(-model.yellow90 * exposure));
  points -= 3 * Number(random() < -Math.expm1(-model.red90 * exposure));
  points -= 2 * poissonSample((model.ownGoals90 + model.penaltyMisses90) * exposure, random);
  return { points, appeared: true };
}
