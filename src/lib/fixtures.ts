import type { Fixture, FixtureCell, FixtureRow, FplTeam, Player, ProjectionContext } from './types';
import { clamp, round } from './format';

export function buildProjectionContext(
  teams: FplTeam[],
  fixtures: Fixture[],
  gameweeks: Array<{ id: number; finished: boolean }>,
  projectionStartEventId: number,
): ProjectionContext {
  const fixtureIndex = new Map<number, Fixture[]>();
  for (const fixture of fixtures) {
    const bucket = fixtureIndex.get(fixture.event);
    if (bucket) bucket.push(fixture);
    else fixtureIndex.set(fixture.event, [fixture]);
  }
  return {
    projectionStartEventId,
    completedEvents: Math.max(1, gameweeks.filter((event) => event.finished).length),
    fixtureIndex,
    teamIndex: new Map(teams.map((team) => [team.id, team])),
    maxEventId: Math.max(1, ...gameweeks.map((event) => event.id)),
  };
}

export function teamFixturesForEvent(fixtures: Fixture[], event: number, teamId: number): Fixture[] {
  return fixtures.filter(
    (fixture) => fixture.event === event && (fixture.teamH === teamId || fixture.teamA === teamId),
  );
}

export function difficultyForTeam(fixture: Fixture, teamId: number): number {
  return fixture.teamH === teamId ? fixture.teamHDifficulty : fixture.teamADifficulty;
}

export function opponentForFixture(fixture: Fixture, teamId: number): { opponentId: number; home: boolean } {
  const home = fixture.teamH === teamId;
  return { opponentId: home ? fixture.teamA : fixture.teamH, home };
}

export function averageFixtureDifficulty(
  player: Player | { teamId: number },
  context: ProjectionContext,
  horizon = 5,
): number {
  const weights = [1, 0.94, 0.88, 0.82, 0.76, 0.7];
  let weighted = 0;
  let totalWeight = 0;
  for (let offset = 0; offset < horizon; offset += 1) {
    const event = context.projectionStartEventId + offset;
    const relevant = (context.fixtureIndex.get(event) ?? []).filter(
      (fixture) => fixture.teamH === player.teamId || fixture.teamA === player.teamId,
    );
    const weight = weights[Math.min(offset, weights.length - 1)] ?? 0.7;
    let difficulty: number;
    if (relevant.length === 0) {
      difficulty = 5.6;
    } else {
      const raw = relevant.reduce((sum, fixture) => sum + difficultyForTeam(fixture, player.teamId), 0) / relevant.length;
      const doubleBonus = Math.min(0.5, (relevant.length - 1) * 0.22);
      difficulty = clamp(raw - doubleBonus, 1.5, 5);
    }
    weighted += difficulty * weight;
    totalWeight += weight;
  }
  return totalWeight ? weighted / totalWeight : 3;
}

export function buildFixtureMatrix(
  teams: FplTeam[],
  fixtures: Fixture[],
  startEvent: number,
  horizon = 5,
): FixtureRow[] {
  const teamIndex = new Map(teams.map((team) => [team.id, team]));
  const rows = teams.map((team) => {
    const cells: FixtureCell[] = [];
    for (let offset = 0; offset < horizon; offset += 1) {
      const event = startEvent + offset;
      const relevant = teamFixturesForEvent(fixtures, event, team.id);
      const isBlank = relevant.length === 0;
      const isDouble = relevant.length > 1;
      const difficulty = isBlank
        ? 6
        : round(relevant.reduce((sum, fixture) => sum + difficultyForTeam(fixture, team.id), 0) / relevant.length, 1);
      const label = isBlank
        ? 'Blank gameweek'
        : relevant
            .map((fixture) => {
              const { opponentId, home } = opponentForFixture(fixture, team.id);
              const opponent = teamIndex.get(opponentId)?.shortName ?? `T${opponentId}`;
              const result = fixture.finished
                ? ` ${fixture.teamHScore ?? 0}-${fixture.teamAScore ?? 0}`
                : '';
              return `${opponent} (${home ? 'H' : 'A'})${result}`;
            })
            .join(' · ');
      cells.push({ event, difficulty, fixtures: relevant, label, isBlank, isDouble });
    }
    const next3 = round(cells.slice(0, 3).reduce((sum, cell) => sum + cell.difficulty, 0) / 3, 2);
    const next5 = round(cells.reduce((sum, cell) => sum + cell.difficulty, 0) / horizon, 2);
    return {
      team,
      cells,
      next3,
      next5,
      swing: round(next5 - next3, 2),
      rank: 0,
    };
  });
  rows.sort((a, b) => a.next5 - b.next5 || a.next3 - b.next3 || a.team.name.localeCompare(b.team.name));
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  return rows;
}

export function fixtureTone(difficulty: number, isBlank = false): 'blank' | 'easy' | 'medium' | 'hard' {
  if (isBlank || difficulty >= 5.5) return 'blank';
  if (difficulty <= 2.5) return 'easy';
  if (difficulty <= 3.6) return 'medium';
  return 'hard';
}

export function positionFixtureRows(
  rows: FixtureRow[],
  sortBy: 'difficulty' | 'swing' | 'name' = 'difficulty',
): FixtureRow[] {
  const sorted = [...rows];
  if (sortBy === 'swing') sorted.sort((a, b) => a.swing - b.swing || a.next5 - b.next5);
  else if (sortBy === 'name') sorted.sort((a, b) => a.team.name.localeCompare(b.team.name));
  else sorted.sort((a, b) => a.next5 - b.next5);
  return sorted;
}
