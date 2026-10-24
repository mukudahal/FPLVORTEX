import type { ChipDef, Fixture, SlimBootstrap, SlimElement, SlimEvent, SlimTeam } from "./types";

export interface FplRawBootstrap {
  events: Record<string, unknown>[];
  teams: Record<string, unknown>[];
  elements: Record<string, unknown>[];
  chips?: Record<string, unknown>[];
  total_players: number;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function invalid(source: string): never {
  throw new Error(`Invalid upstream ${source} response: missing or malformed fields.`);
}

export function parseBootstrap(value: unknown): FplRawBootstrap {
  if (!isObject(value) || !Array.isArray(value.events) || !Array.isArray(value.teams)
      || !Array.isArray(value.elements) || !value.events.length
      || !value.teams.length || !value.elements.length
      || typeof value.total_players !== "number" || !Number.isInteger(value.total_players) || value.total_players < 0) {
    return invalid("bootstrap");
  }
  const eventValid = (item: unknown) => isObject(item) && isId(item.id)
    && typeof item.deadline_time === "string";
  const teamValid = (item: unknown) => isObject(item) && isId(item.id)
    && typeof item.name === "string" && typeof item.short_name === "string";
  const elementValid = (item: unknown) => isObject(item) && isId(item.id)
    && isId(item.team) && typeof item.web_name === "string"
    && typeof item.element_type === "number" && typeof item.now_cost === "number";
  if (!value.events.every(eventValid) || !value.teams.every(teamValid)
      || !value.elements.every(elementValid)
      || (value.chips !== undefined && !Array.isArray(value.chips))) {
    return invalid("bootstrap");
  }
  return value as unknown as FplRawBootstrap;
}

const numberOrZero = (value: unknown): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};
const optionalNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function normalizePlayer(raw: Record<string, unknown>): SlimElement {
  return {
    ...(raw as unknown as SlimElement),
    news_added: (raw.news_added as string | null | undefined) ?? null,
    chance_of_playing_next_round: optionalNumber(raw.chance_of_playing_next_round),
    chance_of_playing_this_round: optionalNumber(raw.chance_of_playing_this_round),
    ep_next: String(raw.ep_next ?? "0.0"),
    ep_this: raw.ep_this == null ? null : String(raw.ep_this),
    minutes: numberOrZero(raw.minutes),
    starts: numberOrZero(raw.starts),
    starts_per_90: numberOrZero(raw.starts_per_90),
    goals_scored: numberOrZero(raw.goals_scored),
    assists: numberOrZero(raw.assists),
    clean_sheets: numberOrZero(raw.clean_sheets),
    clean_sheets_per_90: numberOrZero(raw.clean_sheets_per_90),
    saves: numberOrZero(raw.saves),
    saves_per_90: numberOrZero(raw.saves_per_90),
    bonus: numberOrZero(raw.bonus),
    bps: numberOrZero(raw.bps),
    defensive_contribution: numberOrZero(raw.defensive_contribution),
    defensive_contribution_per_90: numberOrZero(raw.defensive_contribution_per_90),
    yellow_cards: numberOrZero(raw.yellow_cards),
    red_cards: numberOrZero(raw.red_cards),
    own_goals: numberOrZero(raw.own_goals),
    penalties_saved: numberOrZero(raw.penalties_saved),
    penalties_missed: numberOrZero(raw.penalties_missed),
    cost_change_start: numberOrZero(raw.cost_change_start),
    transfers_in_event: numberOrZero(raw.transfers_in_event),
    transfers_out_event: numberOrZero(raw.transfers_out_event),
    expected_goals: String(raw.expected_goals ?? "0.0"),
    expected_assists: String(raw.expected_assists ?? "0.0"),
    expected_goal_involvements: String(raw.expected_goal_involvements ?? "0.0"),
    expected_goals_conceded: String(raw.expected_goals_conceded ?? "0.0"),
    expected_goals_per_90: numberOrZero(raw.expected_goals_per_90),
    expected_assists_per_90: numberOrZero(raw.expected_assists_per_90),
    expected_goal_involvements_per_90: numberOrZero(raw.expected_goal_involvements_per_90),
    expected_goals_conceded_per_90: numberOrZero(raw.expected_goals_conceded_per_90),
    price_change_percent: optionalNumber(raw.price_change_percent),
    price_change_hourly_rate: optionalNumber(raw.price_change_hourly_rate),
    price_change_projections: (raw.price_change_projections as SlimElement["price_change_projections"]) ?? null,
    price_change_locked_until: (raw.price_change_locked_until as string | null | undefined) ?? null,
  };
}

export function normalizeBootstrap(raw: FplRawBootstrap): SlimBootstrap {
  const events = raw.events.map((item) => {
    const event = item as unknown as SlimEvent;
    return {
      id: event.id, name: event.name, deadline_time: event.deadline_time,
      finished: event.finished, is_current: event.is_current, is_next: event.is_next,
      average_entry_score: event.average_entry_score, highest_score: event.highest_score,
      most_captained: event.most_captained, most_selected: event.most_selected,
    };
  });
  const teams = raw.teams.map((item) => {
    const team = item as unknown as SlimTeam;
    return {
      id: team.id, code: team.code, name: team.name, short_name: team.short_name,
      strength: team.strength, strength_attack_home: team.strength_attack_home,
      strength_attack_away: team.strength_attack_away, strength_defence_home: team.strength_defence_home,
      strength_defence_away: team.strength_defence_away,
    };
  });
  const chips: ChipDef[] = (raw.chips ?? []).map((item) => {
    const chip = item as unknown as ChipDef;
    return { name: chip.name, number: chip.number, start_event: chip.start_event, stop_event: chip.stop_event };
  });
  return {
    events, teams, elements: raw.elements.map(normalizePlayer), chips,
    total_players: raw.total_players,
    currentEvent: events.find((event) => event.is_current)?.id ?? null,
    nextEvent: events.find((event) => event.is_next)?.id ?? null,
  };
}

export function parseFixtures(value: unknown): Fixture[] {
  if (!Array.isArray(value)) return invalid("fixtures");
  return value.map((item) => {
    if (!isObject(item) || !isId(item.id) || !isId(item.team_h) || !isId(item.team_a)
        || (item.event !== null && item.event !== undefined && (!isId(item.event) || item.event > 38))) {
      return invalid("fixtures");
    }
    const fixture = item as unknown as Fixture;
    return {
      id: fixture.id, event: fixture.event ?? null,
      team_h: fixture.team_h, team_a: fixture.team_a,
      team_h_score: fixture.team_h_score ?? null, team_a_score: fixture.team_a_score ?? null,
      team_h_difficulty: numberOrZero(fixture.team_h_difficulty),
      team_a_difficulty: numberOrZero(fixture.team_a_difficulty),
      kickoff_time: fixture.kickoff_time ?? null,
      started: fixture.started ?? null, finished: fixture.finished ?? false,
      finished_provisional: Boolean(fixture.finished_provisional),
      minutes: numberOrZero(fixture.minutes),
    };
  });
}
