import type { EnrichedPlayer, Player } from './types';

/**
 * A new acquisition must not have an official FPL injury, suspension,
 * doubt or unavailability flag. This is NOT a guarantee of minutes.
 * Existing owned players are handled separately so a bad current squad
 * does not become an invalid starting input.
 */
export function isOfficiallyUnflagged(player: Pick<Player, 'status' | 'chance'>): boolean {
  return player.status === 'a' &&
    (player.chance == null || (Number.isFinite(player.chance) && player.chance === 100));
}

export function isEligibleNewTransferTarget(
  player: Pick<EnrichedPlayer, 'status' | 'chance' | 'availability' | 'cost'>,
): boolean {
  return isOfficiallyUnflagged(player) &&
    Number.isFinite(player.cost) && player.cost > 0 &&
    Number.isFinite(player.availability) && player.availability > 0;
}
