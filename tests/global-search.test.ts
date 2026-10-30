import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSearchText, searchPlayers } from '../src/lib/analytics';
import type { EnrichedPlayer } from '../src/lib/types';

const player = (id: number, name: string, fullName: string, team: string, score = 5): EnrichedPlayer => ({
  id, name, fullName, projection: score, position: 'MID',
  team: { name: team, shortName: team.slice(0, 3).toUpperCase() },
} as EnrichedPlayer);

test('global search finds full names, partial names and accents', () => {
  const players = [
    player(1, 'João Pedro', 'João Pedro Junqueira de Jesus', 'Chelsea', 8),
    player(2, 'Pedro Porro', 'Pedro Antonio Porro Sauceda', 'Tottenham', 7),
    player(3, 'Mohamed Salah', 'Mohamed Salah Ghaly', 'Liverpool', 9),
  ];
  assert.equal(normalizeSearchText(' JOÃO '), 'joao');
  assert.deepEqual(searchPlayers(players, 'joao', players.length).map(p => p.id), [1]);
  assert.deepEqual(searchPlayers(players, 'salah', players.length).map(p => p.id), [3]);
  assert.deepEqual(searchPlayers(players, 'Tottenham', players.length).map(p => p.id), [2]);
});

test('global search returns all matching players when the caller supplies the full dataset length', () => {
  const players = Array.from({ length: 35 }, (_, i) => player(i + 1, `Player ${i + 1}`, `Full Player ${i + 1}`, 'Arsenal'));
  assert.equal(searchPlayers(players, 'arsenal', players.length).length, 35);
  assert.equal(searchPlayers(players, 'arsenal', 7).length, 7);
});
