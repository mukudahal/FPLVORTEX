/** Live totals follow official pick multipliers; unplayed starters are never prematurely autosubbed. */
export function gameweekPoints({picks, live, players, fixtures, gameweek, event, officialPoints, transferCost = 0}) {
  if (!Array.isArray(picks) || !picks.length) return null;
  const cost = Number.isFinite(transferCost) ? transferCost : 0;
  if (event?.finished && event?.data_checked && Number.isFinite(officialPoints)) return officialPoints - cost;
  if (!Array.isArray(live) || !live.length) return Number.isFinite(officialPoints) ? officialPoints - cost : null;
  const stats = new Map(live.map(player => [player.id, player.stats]));
  if (picks.some(pick => !Number.isFinite(stats.get(pick.element)?.total_points))) return null;
  let total = picks.reduce((sum, pick) => sum + stats.get(pick.element).total_points * Math.max(0, pick.multiplier ?? 0), 0);
  const captain = picks.find(pick => pick.is_captain);
  const vice = picks.find(pick => pick.is_vice_captain);
  const captainPlayer = players.find(player => player.id === captain?.element);
  const captainFixtures = fixtures.filter(fixture => fixture.event === gameweek && [fixture.team_h, fixture.team_a].includes(captainPlayer?.team));
  if (captain && vice && captain.multiplier > 1 && vice.multiplier === 1 && stats.get(captain.element)?.minutes === 0 && stats.get(vice.element)?.minutes > 0 && captainFixtures.length && captainFixtures.every(fixture => fixture.finished)) {
    total += stats.get(vice.element).total_points * (captain.multiplier - 1);
  }
  return total - cost;
}
