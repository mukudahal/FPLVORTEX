/**
 * Fixture & Match Strength Adapter — powered by `site/model/dashboardMath.ts` (`buildStrengths`, `projectMatch`)
 * and `7_skills/fpl-team-planner.skill` (`computeFiveGwFixtureEaseSum`) from `mukudahal/FPLVORTEX`.
 */
import type { Fixture, FixtureCell, FixtureRow, FplTeam, Player, ProjectionContext } from './types';
import { clamp, round } from './format';
import { buildStrengths, projectMatch } from './repoModel/dashboardMath';
import { computeFiveGwFixtureEaseSum } from './repoModel/optaXp';
import type { Fixture as RepoFixture, SlimElement, SlimTeam } from './repoModel/types';

export function toRepoTeams(teams: FplTeam[]): SlimTeam[] {
  return teams.map((team) => ({
    id: team.id,
    code: team.code,
    name: team.name,
    short_name: team.shortName,
    strength: team.strength,
    strength_attack_home: team.strengthAttackHome,
    strength_attack_away: team.strengthAttackAway,
    strength_defence_home: team.strengthDefenceHome,
    strength_defence_away: team.strengthDefenceAway,
  }));
}

export function toRepoFixtures(fixtures: Fixture[]): RepoFixture[] {
  return fixtures.map((fx) => ({
    id: fx.id,
    event: fx.event,
    kickoff_time: fx.kickoffTime,
    team_h: fx.teamH,
    team_a: fx.teamA,
    team_h_score: fx.teamHScore,
    team_a_score: fx.teamAScore,
    team_h_difficulty: fx.teamHDifficulty,
    team_a_difficulty: fx.teamADifficulty,
    finished: fx.finished,
    started: fx.started,
    minutes: fx.finished ? 90 : 0,
  }));
}

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
  let total = 0;
  let weightSum = 0;
  for (let offset = 0; offset < horizon; offset += 1) {
    const event = context.projectionStartEventId + offset;
    const discount = Math.pow(0.88, offset);
    const relevant = (context.fixtureIndex.get(event) ?? []).filter(
      (fixture) => fixture.teamH === player.teamId || fixture.teamA === player.teamId,
    );
    let difficulty: number;
    if (relevant.length === 0) {
      difficulty = 5.5;
    } else {
      const avgDiff = relevant.reduce((sum, fixture) => sum + difficultyForTeam(fixture, player.teamId), 0) / relevant.length;
      const doubleEdge = (relevant.length - 1) * 0.4;
      difficulty = clamp(avgDiff - doubleEdge, 1.2, 5);
    }
    total += difficulty * discount;
    weightSum += discount;
  }
  return weightSum > 0 ? total / weightSum : 3;
}

export function buildFixtureMatrix(
  teams: FplTeam[],
  fixtures: Fixture[],
  startEvent: number,
  horizon = 5,
  repoElements: SlimElement[] = [],
): FixtureRow[] {
  const teamIndex = new Map(teams.map((team) => [team.id, team]));
  const repoTeams = toRepoTeams(teams);
  const repoFixtures = toRepoFixtures(fixtures);
  const strengths = buildStrengths(repoTeams, repoElements, repoFixtures);
  const defaultStrength = { atkH: 1, atkA: 1, defWeakH: 1, defWeakA: 1 };

  const rows = teams.map((team) => {
    const cells: FixtureCell[] = [];
    let lambdaSum = 0;
    let csSum = 0;
    let nonBlankCells = 0;

    for (let offset = 0; offset < horizon; offset += 1) {
      const event = startEvent + offset;
      const relevant = teamFixturesForEvent(fixtures, event, team.id);
      const isBlank = relevant.length === 0;
      const isDouble = relevant.length > 1;
      const difficulty = isBlank
        ? 6
        : round(relevant.reduce((sum, fixture) => sum + difficultyForTeam(fixture, team.id), 0) / relevant.length, 1);

      let cellLambdaFor = 0;
      let cellLambdaAgainst = 0;
      let cellCs = 0;
      let cellWin = 0;
      for (const fx of relevant) {
        const homeStrength = strengths.get(fx.teamH) ?? defaultStrength;
        const awayStrength = strengths.get(fx.teamA) ?? defaultStrength;
        const proj = projectMatch(homeStrength, awayStrength);
        const isHome = fx.teamH === team.id;
        const lf = isHome ? proj.homeXg : proj.awayXg;
        const la = isHome ? proj.awayXg : proj.homeXg;
        const cs = isHome ? proj.homeCs : proj.awayCs;
        const win = isHome ? proj.homeWin : proj.awayWin;
        cellLambdaFor += lf;
        cellLambdaAgainst += la;
        cellCs += cs;
        cellWin += win;
      }
      if (!isBlank && relevant.length > 0) {
        lambdaSum += cellLambdaFor;
        csSum += cellCs / relevant.length;
        nonBlankCells += 1;
      }

      const label = isBlank
        ? 'Blank GW'
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

      cells.push({
        event,
        difficulty,
        fixtures: relevant,
        label,
        isBlank,
        isDouble,
        lambdaFor: isBlank ? 0 : round(cellLambdaFor, 2),
        lambdaAgainst: isBlank ? 0 : round(cellLambdaAgainst, 2),
        csProb: isBlank ? 0 : round(cellCs / Math.max(1, relevant.length), 3),
        winProb: isBlank ? 0 : round(cellWin / Math.max(1, relevant.length), 3),
      });
    }

    const next3 = round(cells.slice(0, 3).reduce((sum, cell) => sum + cell.difficulty, 0) / Math.min(3, cells.length || 1), 2);
    const next5 = round(cells.reduce((sum, cell) => sum + cell.difficulty, 0) / Math.max(1, horizon), 2);
    const easeSum5 = computeFiveGwFixtureEaseSum(team.id, fixtures, startEvent, horizon);

    return {
      team,
      cells,
      next3,
      next5,
      easeSum5,
      avgLambdaFor: nonBlankCells > 0 ? round(lambdaSum / nonBlankCells, 2) : 0,
      avgCsProb: nonBlankCells > 0 ? round(csSum / nonBlankCells, 3) : 0,
      swing: round(next5 - next3, 2),
      rank: 0,
    };
  });

  rows.sort((a, b) => a.next5 - b.next5 || b.easeSum5 - a.easeSum5 || a.team.name.localeCompare(b.team.name));
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
  sortBy: 'difficulty' | 'swing' | 'name' | 'attack' | 'cleanSheet' = 'difficulty',
): FixtureRow[] {
  const sorted = [...rows];
  if (sortBy === 'swing') sorted.sort((a, b) => a.swing - b.swing || b.easeSum5 - a.easeSum5);
  else if (sortBy === 'name') sorted.sort((a, b) => a.team.name.localeCompare(b.team.name));
  else if (sortBy === 'attack') sorted.sort((a, b) => b.avgLambdaFor - a.avgLambdaFor || b.easeSum5 - a.easeSum5);
  else if (sortBy === 'cleanSheet') sorted.sort((a, b) => b.avgCsProb - a.avgCsProb || b.easeSum5 - a.easeSum5);
  else sorted.sort((a, b) => a.next5 - b.next5 || b.easeSum5 - a.easeSum5);
  return sorted;
}
