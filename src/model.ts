/** Independent, deterministic demo forecasts. No third-party predictions or live-data claims. */
export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';
export type Player = {
  id: number;
  name: string;
  club: string;
  position: Position;
  price: number;
  ownership: number;
  form: number;
  xg90: number;
  xa90: number;
  expectedMinutes: number;
  fixtures: readonly number[];
  imageCode?: number;
  status: 'available' | 'doubt' | 'out';
};
export type Projection = { playerId: number; expectedPoints: number; appearancePoints: number; attackPoints: number; cleanSheetPoints: number; bonusPoints: number };
export type Recommendation = { outgoing: Player; incoming: Player; gain: number; transferCost: number; netGain: number };
export type SquadSnapshot = { selectedIds: number[]; bank: number; freeTransfers: number; captainId: number };

export const positionLimits: Record<Position, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
export const rosterSize = 15;

// Fictional, illustrative inputs built for UI and calculations only; never current FPL projections.
export const demoPlayers: readonly Player[] = [
  { id: 1, name: 'Erling Haaland', club: 'MCI', position: 'FWD', price: 15.7, ownership: 76.2, form: 8.2, xg90: .83, xa90: .10, expectedMinutes: 86, fixtures: [2,3,2,4,2,3], imageCode: 223094, status: 'available' },
  { id: 2, name: 'Bukayo Saka', club: 'ARS', position: 'MID', price: 9.6, ownership: 16.9, form: 6.7, xg90: .48, xa90: .27, expectedMinutes: 85, fixtures: [2,3,4,2,3,2], imageCode: 223340, status: 'available' },
  { id: 3, name: 'Cole Palmer', club: 'CHE', position: 'MID', price: 9.7, ownership: 26.0, form: 7.0, xg90: .39, xa90: .32, expectedMinutes: 84, fixtures: [3,2,3,2,4,2], imageCode: 244851, status: 'available' },
  { id: 4, name: 'Mohamed Salah', club: 'LIV', position: 'MID', price: 12.5, ownership: 34.1, form: 7.5, xg90: .64, xa90: .23, expectedMinutes: 87, fixtures: [3,2,2,4,3,2], imageCode: 118748, status: 'available' },
  { id: 5, name: 'Bruno Fernandes', club: 'MUN', position: 'MID', price: 11.8, ownership: 31.5, form: 5.6, xg90: .32, xa90: .43, expectedMinutes: 89, fixtures: [4,2,3,3,2,4], imageCode: 141746, status: 'available' },
  { id: 6, name: 'Morgan Rogers', club: 'AVL', position: 'MID', price: 7.9, ownership: 46.8, form: 6.0, xg90: .36, xa90: .24, expectedMinutes: 84, fixtures: [3,2,4,2,3,2], imageCode: 503301, status: 'available' },
  { id: 7, name: 'Ollie Watkins', club: 'AVL', position: 'FWD', price: 8.8, ownership: 20.2, form: 6.0, xg90: .56, xa90: .16, expectedMinutes: 80, fixtures: [3,2,4,2,3,2], imageCode: 178301, status: 'available' },
  { id: 8, name: 'Alexander Isak', club: 'LIV', position: 'FWD', price: 9.0, ownership: 12.3, form: 5.9, xg90: .60, xa90: .10, expectedMinutes: 78, fixtures: [3,2,2,4,3,2], imageCode: 219168, status: 'available' },
  { id: 9, name: 'David Raya', club: 'ARS', position: 'GKP', price: 6.1, ownership: 43.8, form: 5.1, xg90: 0, xa90: 0, expectedMinutes: 90, fixtures: [2,3,4,2,3,2], imageCode: 154561, status: 'available' },
  { id: 10, name: 'Gabriel Magalhães', club: 'ARS', position: 'DEF', price: 6.4, ownership: 40.3, form: 5.4, xg90: .12, xa90: .04, expectedMinutes: 88, fixtures: [2,3,4,2,3,2], imageCode: 226597, status: 'available' },
  { id: 11, name: 'Virgil van Dijk', club: 'LIV', position: 'DEF', price: 6.0, ownership: 25.9, form: 4.7, xg90: .10, xa90: .03, expectedMinutes: 90, fixtures: [3,2,2,4,3,2], imageCode: 97032, status: 'available' },
  { id: 12, name: 'Joško Gvardiol', club: 'MCI', position: 'DEF', price: 5.8, ownership: 28.8, form: 5.9, xg90: .12, xa90: .10, expectedMinutes: 80, fixtures: [2,3,2,4,2,3], imageCode: 246333, status: 'available' },
  { id: 13, name: 'Marc Guéhi', club: 'MCI', position: 'DEF', price: 6.0, ownership: 17.9, form: 4.7, xg90: .08, xa90: .02, expectedMinutes: 86, fixtures: [2,3,2,4,2,3], imageCode: 209036, status: 'available' },
  { id: 14, name: 'Riccardo Calafiori', club: 'ARS', position: 'DEF', price: 5.9, ownership: 53.1, form: 5.7, xg90: .17, xa90: .08, expectedMinutes: 77, fixtures: [2,3,4,2,3,2], imageCode: 432160, status: 'doubt' },
  { id: 15, name: 'Bart Verbruggen', club: 'BHA', position: 'GKP', price: 4.6, ownership: 22.3, form: 3.9, xg90: 0, xa90: 0, expectedMinutes: 90, fixtures: [3,4,2,2,3,4], imageCode: 489639, status: 'available' },
  { id: 16, name: 'João Pedro', club: 'CHE', position: 'FWD', price: 7.8, ownership: 71.9, form: 7.1, xg90: .45, xa90: .22, expectedMinutes: 81, fixtures: [3,2,3,2,4,2], imageCode: 244546, status: 'available' },
  { id: 17, name: 'Rayan Cherki', club: 'MCI', position: 'MID', price: 7.9, ownership: 36.1, form: 6.9, xg90: .28, xa90: .38, expectedMinutes: 70, fixtures: [2,3,2,4,2,3], imageCode: 248856, status: 'available' },
  { id: 18, name: 'Antoine Semenyo', club: 'MCI', position: 'MID', price: 8.3, ownership: 14.5, form: 6.1, xg90: .30, xa90: .31, expectedMinutes: 85, fixtures: [2,3,2,4,2,3], imageCode: 458291, status: 'available' },
  { id: 19, name: 'Lewis Hall', club: 'NEW', position: 'DEF', price: 5.3, ownership: 20.3, form: 4.9, xg90: .04, xa90: .19, expectedMinutes: 81, fixtures: [4,2,3,3,2,2], imageCode: 438464, status: 'available' },
  { id: 20, name: 'Dominic Solanke', club: 'TOT', position: 'FWD', price: 7.7, ownership: 9.4, form: 4.5, xg90: .47, xa90: .12, expectedMinutes: 78, fixtures: [2,4,3,2,2,3], imageCode: 154566, status: 'available' },
  { id: 21, name: 'Jordan Pickford', club: 'EVE', position: 'GKP', price: 5.2, ownership: 17.1, form: 4.6, xg90: 0, xa90: 0, expectedMinutes: 90, fixtures: [4,3,2,4,2,3], imageCode: 111234, status: 'available' },
  { id: 22, name: 'Eberechi Eze', club: 'ARS', position: 'MID', price: 8.0, ownership: 18.2, form: 6.3, xg90: .34, xa90: .32, expectedMinutes: 80, fixtures: [2,3,4,2,3,2], imageCode: 232413, status: 'available' },
  { id: 23, name: 'Nico O’Reilly', club: 'MCI', position: 'DEF', price: 5.5, ownership: 14.9, form: 4.8, xg90: .09, xa90: .18, expectedMinutes: 78, fixtures: [2,3,2,4,2,3], imageCode: 513046, status: 'available' },
  { id: 24, name: 'Bryan Mbeumo', club: 'MUN', position: 'MID', price: 7.8, ownership: 19.5, form: 6.0, xg90: .43, xa90: .20, expectedMinutes: 87, fixtures: [4,2,3,3,2,4], imageCode: 176297, status: 'available' }
];

export const initialSquad: SquadSnapshot = {
  selectedIds: [9,15,10,11,12,13,19,2,3,4,6,5,1,7,16], bank: 2.4, freeTransfers: 2, captainId: 1
};

export function fixtureDifficulty(fdr: number): 'easy' | 'medium' | 'hard' {
  if (fdr <= 2) return 'easy';
  if (fdr <= 3) return 'medium';
  return 'hard';
}

export function projectPlayer(player: Player, gameweekIndex = 0): Projection {
  if (!Number.isInteger(gameweekIndex) || gameweekIndex < 0 || gameweekIndex >= player.fixtures.length) {
    throw new RangeError('Gameweek index is outside available projection horizon');
  }
  const difficulty = player.fixtures[gameweekIndex] ?? 3;
  const minutesShare = Math.min(1, Math.max(0, player.expectedMinutes / 90));
  const positionGoalPoints = player.position === 'DEF' || player.position === 'GKP' ? 6 : player.position === 'MID' ? 5 : 4;
  const difficultyFactor = 1 + (3 - difficulty) * 0.12;
  const availabilityFactor = player.status === 'out' ? 0 : player.status === 'doubt' ? .70 : 1;
  const appearancePoints = (player.expectedMinutes >= 60 ? 2 : player.expectedMinutes > 0 ? 1 : 0) * availabilityFactor;
  const attackPoints = (player.xg90 * positionGoalPoints + player.xa90 * 3) * minutesShare * difficultyFactor * availabilityFactor;
  const cleanSheetPoints = (player.position === 'GKP' || player.position === 'DEF' ? 4 : player.position === 'MID' ? 1 : 0)
    * Math.min(.72, .36 + (3 - difficulty) * .1) * minutesShare * availabilityFactor;
  const bonusPoints = (player.form / 10) * .55 * minutesShare * availabilityFactor;
  const expectedPoints = appearancePoints + attackPoints + cleanSheetPoints + bonusPoints;
  return { playerId: player.id, expectedPoints: Math.round(expectedPoints * 100) / 100, appearancePoints, attackPoints, cleanSheetPoints, bonusPoints };
}

export function projectedHorizon(player: Player, weeks = 5): number {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > player.fixtures.length) throw new RangeError('Invalid forecast horizon');
  return Math.round(player.fixtures.slice(0, weeks).reduce((total, _, index) => total + projectPlayer(player, index).expectedPoints, 0) * 10) / 10;
}

export function validateSquad(players: readonly Player[], selectedIds: readonly number[]): string[] {
  const failures: string[] = [];
  if (selectedIds.length !== rosterSize) failures.push(`Squad must contain ${rosterSize} players`);
  if (new Set(selectedIds).size !== selectedIds.length) failures.push('Duplicate squad player');
  const squad = selectedIds.map(id => players.find(player => player.id === id));
  if (squad.some(player => !player)) failures.push('Unknown player in squad');
  const valid = squad.filter((player): player is Player => Boolean(player));
  for (const [position, expected] of Object.entries(positionLimits)) {
    if (valid.filter(player => player.position === position).length !== expected) failures.push(`Squad must have ${expected} ${position}`);
  }
  const clubCounts = new Map<string, number>();
  for (const player of valid) clubCounts.set(player.club, (clubCounts.get(player.club) ?? 0) + 1);
  if ([...clubCounts.values()].some(count => count > 3)) failures.push('Maximum three players per club');
  return failures;
}

export function optimizeOneTransfer(players: readonly Player[], squad: SquadSnapshot, horizon = 5): Recommendation[] {
  const errors = validateSquad(players, squad.selectedIds);
  if (errors.length) throw new Error(`Invalid squad: ${errors.join('; ')}`);
  if (!Number.isFinite(squad.bank) || squad.bank < 0 || !Number.isInteger(squad.freeTransfers) || squad.freeTransfers < 0) {
    throw new Error('Invalid squad budget or transfer allowance');
  }
  const selected = players.filter(player => squad.selectedIds.includes(player.id));
  const recommendations: Recommendation[] = [];
  for (const outgoing of selected) {
    const remaining = selected.filter(player => player.id !== outgoing.id);
    for (const incoming of players) {
      if (incoming.position !== outgoing.position || squad.selectedIds.includes(incoming.id)) continue;
      if (incoming.price - outgoing.price > squad.bank + 1e-8) continue;
      if (remaining.filter(player => player.club === incoming.club).length >= 3) continue;
      const transferCost = squad.freeTransfers > 0 ? 0 : 4;
      const gain = projectedHorizon(incoming, horizon) - projectedHorizon(outgoing, horizon);
      recommendations.push({ outgoing, incoming, gain: Math.round(gain * 10) / 10, transferCost, netGain: Math.round((gain - transferCost) * 10) / 10 });
    }
  }
  return recommendations.sort((left, right) => right.netGain - left.netGain).slice(0, 8);
}

export function parseSquad(value: string | null, players: readonly Player[] = demoPlayers): SquadSnapshot {
  if (!value) return { ...initialSquad, selectedIds: [...initialSquad.selectedIds] };
  try {
    const decoded: unknown = JSON.parse(value);
    if (typeof decoded !== 'object' || decoded === null) return { ...initialSquad, selectedIds: [...initialSquad.selectedIds] };
    const raw = decoded as Record<string, unknown>;
    const selectedIds = raw.selectedIds;
    if (!Array.isArray(selectedIds) || !selectedIds.every(id => Number.isInteger(id))) throw new Error('Invalid IDs');
    if (validateSquad(players, selectedIds).length) throw new Error('Invalid squad');
    if (typeof raw.bank !== 'number' || !Number.isFinite(raw.bank) || raw.bank < 0 || raw.bank > 120) throw new Error('Invalid bank');
    if (typeof raw.freeTransfers !== 'number' || !Number.isInteger(raw.freeTransfers) || raw.freeTransfers < 0 || raw.freeTransfers > 5) throw new Error('Invalid free transfers');
    if (typeof raw.captainId !== 'number' || !selectedIds.includes(raw.captainId)) throw new Error('Invalid captain');
    return { selectedIds: [...selectedIds], bank: raw.bank, freeTransfers: raw.freeTransfers, captainId: raw.captainId };
  } catch { return { ...initialSquad, selectedIds: [...initialSquad.selectedIds] }; }
}

export function csvForPlayers(players: readonly Player[], weeks = 5): string {
  const escapeCsv = (value: string | number): string => `"${String(value).replaceAll('"', '""')}"`;
  return [
    ['Player', 'Club', 'Position', 'Price', 'Own %', `Illustrative xPts (${weeks} GWs)`].map(escapeCsv).join(','),
    ...players.map(player => [player.name, player.club, player.position, player.price, player.ownership, projectedHorizon(player, weeks)].map(escapeCsv).join(','))
  ].join('\n');
}