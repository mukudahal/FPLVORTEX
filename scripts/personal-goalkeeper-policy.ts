import type { Player, Snapshot } from '../src/lib/types';

const MINIMUM_MATCHES = 5;
const REGULAR_START_SHARE = 0.8;

type Keeper = Pick<Player, 'id' | 'name' | 'teamId' | 'position' | 'starts' | 'minutes' | 'status' | 'chance'>;

/** A manager preference for normal transfers, separate from forecast arithmetic. */
export function personalGoalkeeperPolicy(
  snapshot: Pick<Snapshot, 'fixtures'>, players: readonly Keeper[], owned: readonly number[],
  confirmedMultiweekAbsences: ReadonlySet<number> = new Set(),
) {
  const played = new Map<number, number>();
  for (const f of snapshot.fixtures) {
    if (!f.finished) continue;
    for (const club of [f.teamH, f.teamA]) played.set(club, (played.get(club) ?? 0) + 1);
  }
  const evidence = (p: Keeper) => {
    const clubMatches = played.get(p.teamId) ?? 0;
    const startShare = clubMatches ? Math.min(1, p.starts / clubMatches) : null;
    return { ...p, clubMatches, startShare, regularStarter: clubMatches >= MINIMUM_MATCHES && startShare !== null && startShare >= REGULAR_START_SHARE };
  };
  const keepers = players.filter(p => p.position === 'GKP').map(evidence);
  const incumbents = keepers.filter(p => owned.includes(p.id)).sort((a, b) =>
    Number(b.regularStarter) - Number(a.regularStarter) || b.starts - a.starts || b.minutes - a.minutes || a.id - b.id,
  );
  if (incumbents.length !== 2) throw new RangeError('Expected two owned goalkeepers.');
  const [primary, reserve] = incumbents;
  const unavailable = primary.chance === 0 || ['s', 'u', 'n'].includes(primary.status) ||
    (primary.status === 'i' && primary.chance === null);
  const usableCover = reserve.regularStarter && reserve.status === 'a' && (reserve.chance === 100 || reserve.chance === null);
  const awaitingNews = !unavailable && (['d', 'i'].includes(primary.status) || (primary.chance !== null && primary.chance < 100));
  const replaceableId = unavailable && !usableCover && confirmedMultiweekAbsences.has(primary.id) ? primary.id : undefined;
  const reason = unavailable
    ? usableCover
      ? 'The primary goalkeeper is currently out. The incumbent reserve has a regular starting role, so preserve the transfer.'
      : confirmedMultiweekAbsences.has(primary.id)
        ? 'A sourced multiweek absence and no established available cover justify considering a replacement.'
        : 'The primary goalkeeper is currently out. Confirm a multiweek absence before spending a transfer on the position.'
    : awaitingNews
      ? 'The primary goalkeeper is doubtful. Keep him in the transfer plan and reassess after team news. The forecast keeps the official flag.'
      : 'Keep the incumbent goalkeeper pairing through normal transfers. Reassess after a change in availability or role.';
  return {
    primary, reserve, reason, awaitingNews,
    transfers: {
      replaceableId,
      incomingIds: keepers.filter(p => p.regularStarter && !owned.includes(p.id)).map(p => p.id),
    },
  };
}
