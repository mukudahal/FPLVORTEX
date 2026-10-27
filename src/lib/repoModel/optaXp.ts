/**
 * Opta xP & 5-GW Fixture Run Score — ported verbatim from `7_skills/fpl-team-planner.skill`
 * in `mukudahal/FPLVORTEX`.
 */
import type { Fixture, Player } from '../types';
import { clamp } from '../format';

const ATTACK_MULT: Record<number, number> = {
  1: 1.25,
  2: 1.12,
  3: 1.0,
  4: 0.88,
  5: 0.75,
};

const DEFENCE_MULT: Record<number, number> = {
  1: 1.35,
  2: 1.15,
  3: 1.0,
  4: 0.8,
  5: 0.65,
};

const STATUS_FACTOR: Record<string, number> = {
  a: 1.0,
  d: 0.75,
  i: 0.1,
  s: 0.0,
  u: 0.0,
  n: 0.0,
};

export function computeOptaAvailability(player: Pick<Player, 'chance' | 'status' | 'minutes'>, gamesPlayed: number): number {
  const statusBase =
    player.chance !== null && player.chance !== undefined
      ? clamp(player.chance / 100, 0, 1)
      : STATUS_FACTOR[player.status?.toLowerCase() ?? 'a'] ?? 0.75;
  const minutesShare = clamp(player.minutes / (90 * Math.max(1, gamesPlayed)), 0, 1);
  return statusBase * (0.15 + 0.85 * minutesShare);
}

export function computeFiveGwFixtureEaseSum(teamId: number, fixtures: Fixture[], startGw: number, horizon = 5): number {
  let score = 0;
  for (let offset = 0; offset < horizon; offset += 1) {
    const gw = startGw + offset;
    for (const fx of fixtures) {
      if (fx.event !== gw) continue;
      if (fx.teamH === teamId) {
        score += 6 - clamp(fx.teamHDifficulty || 3, 1, 5);
      } else if (fx.teamA === teamId) {
        score += 6 - clamp(fx.teamADifficulty || 3, 1, 5);
      }
    }
  }
  return score;
}

export function computeOptaXP5Gw(
  player: Player,
  fixtures: Fixture[],
  startGw: number,
  gamesPlayed: number,
  horizon = 5,
): { total5Gw: number; nextGw: number; perGw: number[] } {
  const avail = computeOptaAvailability(player, gamesPlayed);
  const mins90 = Math.max(0.25, player.minutes / 90);
  const xG90 = player.minutes > 0 ? player.xG / mins90 : 0;
  const xA90 = player.minutes > 0 ? player.xA / mins90 : 0;
  const csPer90 = player.minutes > 0 ? player.cleanSheets / mins90 : 0;
  const bonus90 = player.minutes > 0 ? player.bonus / mins90 : 0;

  const goalPts = player.position === 'GKP' || player.position === 'DEF' ? 6 : player.position === 'MID' ? 5 : 4;
  const csPts = player.position === 'GKP' || player.position === 'DEF' ? 4 : player.position === 'MID' ? 1 : 0;
  const cs90 = 0.5 * csPer90 + 0.5 * 0.28;

  const perGw: number[] = [];
  for (let offset = 0; offset < horizon; offset += 1) {
    const gw = startGw + offset;
    let gwPts = 0;
    for (const fx of fixtures) {
      if (fx.event !== gw) continue;
      let diff: number | null = null;
      if (fx.teamH === player.teamId) diff = clamp(Math.round(fx.teamHDifficulty || 3), 1, 5);
      else if (fx.teamA === player.teamId) diff = clamp(Math.round(fx.teamADifficulty || 3), 1, 5);
      if (diff === null) continue;
      const att = ATTACK_MULT[diff] ?? 1.0;
      const def = DEFENCE_MULT[diff] ?? 1.0;
      const cellPts = 2 + goalPts * xG90 * att + 3 * xA90 * att + csPts * Math.min(0.6, cs90 * def) + 0.6 * bonus90;
      gwPts += cellPts * avail;
    }
    perGw.push(Math.round(gwPts * 100) / 100);
  }

  const total5Gw = Math.round(perGw.reduce((acc, v) => acc + v, 0) * 100) / 100;
  return {
    total5Gw,
    nextGw: perGw[0] ?? 0,
    perGw,
  };
}
