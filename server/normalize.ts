import type {
  DataSource,
  Fixture,
  FplTeam,
  Gameweek,
  Player,
  Position,
  Snapshot,
} from '../src/lib/types.ts';
import { clamp, numberValue } from '../src/lib/format.ts';
import { auditPlayerData } from '../src/lib/playerDataQuality.ts';

type RawRecord = Record<string, any>;

export interface RawFplData {
  bootstrap: RawRecord;
  fixtures: RawRecord[];
  live: RawRecord | null;
}

export interface NormalizeOptions {
  source?: DataSource;
  upstreamOk?: boolean;
  stale?: boolean;
  generatedAt?: string;
  servedAt?: string;
}

const POSITION_BY_TYPE: Record<number, Position> = {
  1: 'GKP',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = numberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function seasonFrom(events: RawRecord[]): string {
  const first = events.find((event) => event.deadline_time)?.deadline_time;
  const date = first ? new Date(String(first)) : new Date();
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= 6 ? year : year - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function normalizeTeams(rawTeams: RawRecord[]): FplTeam[] {
  return rawTeams
    .map((team) => ({
      id: numberValue(team.id),
      code: numberValue(team.code),
      name: stringValue(team.name, 'Unknown'),
      shortName: stringValue(team.short_name, 'UNK'),
      position: numberValue(team.position),
      played: numberValue(team.played),
      points: numberValue(team.points),
      form: team.form === null || team.form === undefined ? null : stringValue(team.form),
      strength: numberValue(team.strength, numberValue(team.strength_overall_home, 3)),
      strengthAttackHome: numberValue(team.strength_attack_home, 3),
      strengthAttackAway: numberValue(team.strength_attack_away, 3),
      strengthDefenceHome: numberValue(team.strength_defence_home, 3),
      strengthDefenceAway: numberValue(team.strength_defence_away, 3),
    }))
    .sort((a, b) => a.id - b.id);
}

function normalizeGameweeks(rawEvents: RawRecord[]): Gameweek[] {
  return rawEvents.map((event) => ({
    id: numberValue(event.id),
    name: stringValue(event.name, `Gameweek ${numberValue(event.id)}`),
    shortName: `GW ${numberValue(event.id)}`,
    deadlineTime: stringValue(event.deadline_time),
    finished: Boolean(event.finished),
    dataChecked: Boolean(event.data_checked),
    isCurrent: Boolean(event.is_current),
    isNext: Boolean(event.is_next),
    isPrevious: Boolean(event.is_previous),
    averageEntryScore: numberValue(event.average_entry_score),
    highestScore: nullableNumber(event.highest_score),
    mostSelected: nullableNumber(event.most_selected),
    mostCaptained: nullableNumber(event.most_captained),
    topElement: nullableNumber(event.top_element),
    highestScoringEntry: nullableNumber(event.highest_scoring_entry),
    chipPlays: Array.isArray(event.chip_plays)
      ? event.chip_plays.map((chip: RawRecord) => ({
          chipName: stringValue(chip.chip_name),
          numPlayed: numberValue(chip.num_played),
        }))
      : [],
    transfersMade: numberValue(event.transfers_made),
    rankedCount: numberValue(event.ranked_count),
  }));
}

function normalizeFixtures(rawFixtures: RawRecord[]): Fixture[] {
  return rawFixtures
    .filter((fixture) => numberValue(fixture.event) > 0)
    .map((fixture) => ({
      id: numberValue(fixture.id),
      event: numberValue(fixture.event),
      kickoffTime: fixture.kickoff_time ? stringValue(fixture.kickoff_time) : null,
      finished: Boolean(fixture.finished),
      started: Boolean(fixture.started),
      minutes: numberValue(fixture.minutes),
      teamH: numberValue(fixture.team_h),
      teamA: numberValue(fixture.team_a),
      teamHScore: nullableNumber(fixture.team_h_score),
      teamAScore: nullableNumber(fixture.team_a_score),
      teamHDifficulty: numberValue(fixture.team_h_difficulty, 3),
      teamADifficulty: numberValue(fixture.team_a_difficulty, 3),
    }));
}

function normalizePlayers(rawPlayers: RawRecord[], livePoints: Map<number, number>): Player[] {
  return rawPlayers.map((element) => {
    const cost = numberValue(element.now_cost);
    const chance = nullableNumber(element.chance_of_playing_next_round);
    return {
      id: numberValue(element.id),
      code: numberValue(element.code),
      name: stringValue(element.web_name) || stringValue(element.second_name) || `Player ${numberValue(element.id)}`,
      fullName: `${stringValue(element.first_name)} ${stringValue(element.second_name)}`.trim(),
      teamId: numberValue(element.team),
      position: POSITION_BY_TYPE[numberValue(element.element_type)] ?? 'MID',
      price: cost / 10,
      cost,
      totalPoints: numberValue(element.total_points),
      eventPoints: livePoints.get(numberValue(element.id)) ?? numberValue(element.event_points),
      ppg: numberValue(element.points_per_game),
      form: numberValue(element.form),
      ownership: numberValue(element.selected_by_percent),
      minutes: numberValue(element.minutes),
      starts: numberValue(element.starts),
      goals: numberValue(element.goals_scored),
      assists: numberValue(element.assists),
      cleanSheets: numberValue(element.clean_sheets),
      goalsConceded: numberValue(element.goals_conceded),
      saves: numberValue(element.saves),
      bonus: numberValue(element.bonus),
      bps: numberValue(element.bps),
      influence: numberValue(element.influence),
      creativity: numberValue(element.creativity),
      threat: numberValue(element.threat),
      ict: numberValue(element.ict_index),
      xG: numberValue(element.expected_goals),
      xA: numberValue(element.expected_assists),
      xGI: numberValue(element.expected_goal_involvements),
      xGC: numberValue(element.expected_goals_conceded),
      defensiveContribution: numberValue(element.defensive_contribution),
      transfersIn: numberValue(element.transfers_in),
      transfersOut: numberValue(element.transfers_out),
      transfersInEvent: numberValue(element.transfers_in_event),
      transfersOutEvent: numberValue(element.transfers_out_event),
      costChangeEvent: nullableNumber(element.cost_change_event) ?? undefined,
      costChangeStart: nullableNumber(element.cost_change_start) ?? undefined,
      selectedByPercent: numberValue(element.selected_by_percent),
      status: stringValue(element.status, 'a'),
      chance,
      news: stringValue(element.news).replace(/\s+/g, ' ').trim(),
      newsAdded: element.news_added ? stringValue(element.news_added) : null,
      epNext: numberValue(element.ep_next, numberValue(element.ep_this)),
      epThis: numberValue(element.ep_this),
      dreamteamCount: numberValue(element.dreamteam_count),
      cornersOrder: nullableNumber(element.corners_and_indirect_freekicks_order),
      freekicksOrder: nullableNumber(element.direct_freekicks_order),
      penaltiesOrder: nullableNumber(element.penalties_order),
      birthDate: element.birth_date ? stringValue(element.birth_date) : null,
    };
  });
}

export function normalizeSnapshot(raw: RawFplData, options: NormalizeOptions = {}): Snapshot {
  const gameweeks = normalizeGameweeks(Array.isArray(raw.bootstrap.events) ? raw.bootstrap.events : []);
  const fixtures = normalizeFixtures(Array.isArray(raw.fixtures) ? raw.fixtures : []);
  const livePoints = new Map<number, number>();
  if (raw.live && Array.isArray(raw.live.elements)) {
    for (const element of raw.live.elements) {
      livePoints.set(numberValue(element.id), numberValue(element.stats?.total_points));
    }
  }
  const players = normalizePlayers(Array.isArray(raw.bootstrap.elements) ? raw.bootstrap.elements : [], livePoints);
  const current = gameweeks.find((event) => event.isCurrent) ?? gameweeks.find((event) => !event.finished) ?? gameweeks.at(-1);
  const next = gameweeks.find((event) => event.isNext) ?? gameweeks.find((event) => !event.finished) ?? current;
  const currentEventId = current?.id ?? 1;
  const projectionEventId = next?.id ?? Math.min(38, currentEventId + 1);
  const liveFixtures = fixtures.filter((fixture) => fixture.event === currentEventId && fixture.started && !fixture.finished);
  const now = Date.now();
  const deadlinePassed = current?.deadlineTime ? new Date(current.deadlineTime).getTime() <= now : false;
  const isLive = liveFixtures.length > 0 || (deadlinePassed && !current?.finished);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const quality = auditPlayerData(
    Array.isArray(raw.bootstrap.elements) ? raw.bootstrap.elements : [],
    Array.isArray(raw.bootstrap.teams) ? raw.bootstrap.teams : [],
    generatedAt,
  );
  return {
    meta: {
      source: options.source ?? 'live',
      generatedAt,
      servedAt: options.servedAt ?? generatedAt,
      season: seasonFrom(Array.isArray(raw.bootstrap.events) ? raw.bootstrap.events : []),
      currentEventId,
      nextEventId: projectionEventId,
      isLive,
      refreshSeconds: isLive ? 45 : 600,
      totalPlayers: numberValue(raw.bootstrap.total_players, players.length),
      fixtureCount: fixtures.length,
      playerDataQuality: quality,
      upstreamOk: options.upstreamOk ?? true,
      stale: options.stale ?? false,
      version: 1,
      exampleEntryId: current?.highestScoringEntry ?? null,
      exampleLeagueId: 314,
    },
    teams: normalizeTeams(Array.isArray(raw.bootstrap.teams) ? raw.bootstrap.teams : []),
    gameweeks,
    players,
    fixtures,
  };
}

export function withServedState(snapshot: Snapshot, changes: NormalizeOptions): Snapshot {
  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      ...changes,
      servedAt: changes.servedAt ?? new Date().toISOString(),
      refreshSeconds: clamp(snapshot.meta.refreshSeconds, 30, 900),
    },
  };
}
