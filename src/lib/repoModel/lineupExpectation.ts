import type { McLineup, McPlayerGw } from './monteCarlo';
import { outfieldAutoSubs, type PlanningChip } from './scoring';

export function gameweekAbsence(player: McPlayerGw): number {
  const noAppearance = (p60: number, pSub: number) => Math.max(0, 1 - (p60 + pSub));
  return player.fixtureModels
    ? player.fixtureModels.reduce((p, f) => p * noAppearance(f.minutes.p60, f.minutes.pSub), 1)
    : noAppearance(player.p60, player.pSub) ** player.fixtures;
}

interface PlayerExpectation {
  position: number;
  points: number;
  absence: number;
}

/** Exact expectation for a fixed lineup under the sampler's independent appearance draws. */
export function createLineupExpectation() {
  // Player IDs affect probabilities and points, but legal replacements depend only on positions.
  const substitutions = new Map<string, Map<string, number[]>>();
  return (lineup: McLineup, playerAt: (id: number) => PlayerExpectation, chip?: PlanningChip) => {
    const starters = lineup.starters.map(playerAt);
    const bench = lineup.bench.map(playerAt);
    const captain = playerAt(lineup.captainId);
    const vice = playerAt(lineup.viceId);
    const vicePoints = lineup.viceId === lineup.captainId ? 0 : captain.absence * vice.points;
    const captainPoints = (captain.points + vicePoints) * (chip === 'tc' ? 2 : 1);
    const xiPoints = starters.reduce((total, player) => total + player.points, 0);
    const benchPoints = bench.reduce((total, player) => total + player.points, 0);
    if (chip === 'bb') return { xiPoints, captainPoints, benchPoints, autosubs: 0, total: xiPoints + captainPoints + benchPoints };

    const keeper = starters.find(player => player.position === 1);
    const reserve = bench.find(player => player.position === 1);
    let autosubs = (keeper?.absence ?? 0) * (reserve?.points ?? 0);
    const outfield = starters.filter(player => player.position !== 1);
    const reserves = bench.filter(player => player.position !== 1);
    const positions = outfield.map(player => player.position);
    const benchPositions = reserves.map(player => player.position);
    const shape = positions.join('') + ':' + benchPositions.join('');
    let profiles = substitutions.get(shape);
    if (!profiles) {
      profiles = new Map();
      substitutions.set(shape, profiles);
    }

    // Consecutive players of the same position are interchangeable for autosub eligibility.
    // Group their absence count distributions without reordering a saved lineup.
    const groups: { position: number; probabilities: number[] }[] = [];
    for (const { position, absence } of outfield) {
      let group = groups.at(-1);
      if (group?.position !== position) {
        group = { position, probabilities: [1] };
        groups.push(group);
      }
      const p = group.probabilities;
      p.push(0);
      for (let count = p.length - 1; count >= 0; count--) {
        p[count] = p[count] * (1 - absence) + (p[count - 1] ?? 0) * absence;
      }
    }
    const counts = [0, 0, 0, 0, 0];
    for (const position of positions) counts[position]++;
    const missing: number[] = [];
    const masks = Array.from({ length: 1 << reserves.length }, (_, mask) => mask);
    // A reserve contributes its unconditional xPts whenever selected given it plays.
    // Weight each scenario by the appearance chances of the *other* reserves only.
    const contributions = masks.map(mask => reserves.map((player, slot) => {
      if (!(mask & (1 << slot))) return 0;
      return reserves.reduce((points, other, i) => i === slot ? points :
        points * (mask & (1 << i) ? 1 - other.absence : other.absence), player.points);
    }));
    const combine = (index: number, probability: number) => {
      if (index < groups.length) {
        const { position, probabilities } = groups[index];
        const length = missing.length;
        for (let count = 0; count < probabilities.length; count++) {
          if (probabilities[count]) combine(index + 1, probability * probabilities[count]);
          if (count + 1 < probabilities.length) missing.push(position);
        }
        missing.length = length;
        return;
      }
      if (!missing.length) return;
      const key = missing.join('');
      let selected = profiles.get(key);
      if (!selected) {
        selected = masks.map(mask => outfieldAutoSubs(counts, missing, benchPositions, mask));
        profiles.set(key, selected);
      }
      let points = 0;
      for (const mask of masks) {
        for (let slot = 0; slot < reserves.length; slot++) {
          if (selected[mask] & (1 << slot)) points += contributions[mask][slot];
        }
      }
      autosubs += probability * points;
    };
    combine(0, 1);
    return { xiPoints, captainPoints, benchPoints, autosubs, total: xiPoints + captainPoints + autosubs };
  };
}
