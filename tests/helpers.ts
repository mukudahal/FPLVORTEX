import type { EnrichedPlayer, Fixture, FplTeam, Gameweek, Position } from '../src/lib/types.ts';

export function makeTeam(id = 1, shortName = `T${id}`): FplTeam {
  return {
    id,
    code: 100 + id,
    name: `Team ${id}`,
    shortName,
    position: id,
    played: 8,
    points: 12,
    form: 'W',
    strength: 3,
    strengthAttackHome: 3,
    strengthAttackAway: 3,
    strengthDefenceHome: 3,
    strengthDefenceAway: 3,
  };
}

export function makeGameweek(id: number, overrides: Partial<Gameweek> = {}): Gameweek {
  return {
    id,
    name: `Gameweek ${id}`,
    shortName: `GW ${id}`,
    deadlineTime: new Date(Date.UTC(2026, 7, 1 + id)).toISOString(),
    finished: id < 8,
    dataChecked: id < 8,
    isCurrent: id === 8,
    isNext: id === 9,
    isPrevious: id === 7,
    averageEntryScore: 50,
    highestScore: 110,
    mostSelected: 1,
    mostCaptained: 1,
    topElement: 1,
    highestScoringEntry: 12345,
    chipPlays: [],
    transfersMade: 1000000,
    rankedCount: 1000000,
    ...overrides,
  };
}

export function makeFixture(id: number, event: number, teamH: number, teamA: number, homeDifficulty = 2, awayDifficulty = 4): Fixture {
  return {
    id,
    event,
    kickoffTime: new Date(Date.UTC(2026, 8, event)).toISOString(),
    finished: false,
    started: false,
    minutes: 0,
    teamH,
    teamA,
    teamHScore: null,
    teamAScore: null,
    teamHDifficulty: homeDifficulty,
    teamADifficulty: awayDifficulty,
  };
}

export function makePlayer(id: number, overrides: Partial<EnrichedPlayer> = {}): EnrichedPlayer {
  const position: Position = overrides.position ?? 'MID';
  const teamId = overrides.teamId ?? 1;
  const cost = overrides.cost ?? 60;
  return {
    id,
    code: id,
    name: `Player ${id}`,
    fullName: `Test Player ${id}`,
    teamId,
    position,
    price: cost / 10,
    cost,
    totalPoints: 60,
    eventPoints: 5,
    ppg: 5,
    form: 5,
    ownership: 10,
    minutes: 720,
    starts: 8,
    goals: 3,
    assists: 4,
    cleanSheets: 2,
    goalsConceded: 8,
    saves: 0,
    bonus: 5,
    bps: 120,
    influence: 200,
    creativity: 300,
    threat: 300,
    ict: 80,
    xG: 3,
    xA: 3,
    xGI: 6,
    xGC: 8,
    defensiveContribution: 40,
    transfersIn: 1000,
    transfersOut: 500,
    transfersInEvent: 100,
    transfersOutEvent: 50,
    selectedByPercent: 10,
    status: 'a',
    chance: null,
    news: '',
    epNext: 5,
    epThis: 5,
    dreamteamCount: 1,
    cornersOrder: null,
    freekicksOrder: null,
    penaltiesOrder: null,
    birthDate: null,
    team: makeTeam(teamId),
    projection: 6,
    confidence: 0.85,
    value: 1,
    fixtureScore: 3,
    fixtureDelta: 0,
    momentum: 0,
    availability: 1,
    roleScore: 1,
    leverage: 0.5,
    reasons: ['Test projection'],
    sparkline: [5, 5.2, 5.5, 5.7, 6],
    ...overrides,
  };
}

export function syntheticPlayerPool(): EnrichedPlayer[] {
  const players: EnrichedPlayer[] = [];
  let id = 1;
  const quotas: Array<[Position, number]> = [['GKP', 8], ['DEF', 16], ['MID', 16], ['FWD', 10]];
  for (const [position, count] of quotas) {
    for (let index = 0; index < count; index += 1) {
      const teamId = (index % 20) + 1;
      players.push(
        makePlayer(id++, {
          position,
          teamId,
          name: `${position} ${index + 1}`,
          cost: 42 + (index % 8) * 4,
          projection: 8.5 - index * 0.18,
          confidence: 0.8 + (index % 3) * 0.04,
          ownership: 5 + (index % 7) * 6,
          fixtureScore: 2 + (index % 4) * 0.4,
          team: makeTeam(teamId, `C${teamId}`),
        }),
      );
    }
  }
  return players;
}
