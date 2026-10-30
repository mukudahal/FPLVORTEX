import type { Snapshot, Fixture, FplTeam } from './types';
import { toRepoElement } from './analytics';
import { applyHistoricalStrengths, toRepoFixtures, toRepoTeams } from './fixtures';
import { buildStrengths, projectMatch } from './repoModel/dashboardMath';
import { forecastFromGoalRates } from './repoModel/scoreDistribution';

export type ForecastSource = 'vortex' | 'market';
export interface FixtureForecast {
  fixture: Fixture;
  team: FplTeam;
  opponent: FplTeam;
  home: boolean;
  goals: number;
  goalsAgainst: number;
  cleanSheet: number;
  win: number;
  score2Plus: number;
  attackIndex: number;
  defenceIndex: number;
  source: ForecastSource;
}

export const VORTEX_FILL_COLORS = {
  green: '#40d99c',
  cyan: '#45c8ce',
  orange: '#f59e42',
  red: '#d62849',
  neutral: '#9bacba',
} as const;

export interface VortexFillStyle {
  background: string;
  color: '#ffffff' | '#000000';
}

/** Red fills use White text; all other fills (Green, Cyan, Orange, Neutral) use Black text. */
export function fillTextColor(background: string): '#ffffff' | '#000000' {
  return background.toLowerCase() === VORTEX_FILL_COLORS.red ? '#ffffff' : '#000000';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Fixed illustrative mapping only; NOT a calibrated or historical percentile FDR. */
export function provisionalOpportunityIndices(goals: number, cleanSheet: number) {
  if (!Number.isFinite(goals) || goals < 0 || !Number.isFinite(cleanSheet) || cleanSheet < 0 || cleanSheet > 1) throw new RangeError('Invalid fixture projection');
  return { attackIndex: 1 + 4 * clamp((2.8 - goals) / 2.2, 0, 1), defenceIndex: 1 + 4 * clamp((0.65 - cleanSheet) / 0.55, 0, 1) };
}

/** VORTEX never reads odds. Market never falls back to VORTEX rates. */
export function makeFixtureForecasts(snapshot: Snapshot, source: ForecastSource, events: readonly number[]): Map<string, FixtureForecast[]> {
  const selected = new Set(events);
  const teams = new Map(snapshot.teams.map(t => [t.id, t]));
  const strengths = buildStrengths(toRepoTeams(snapshot.teams), snapshot.players.map(toRepoElement), toRepoFixtures(snapshot.fixtures));
  applyHistoricalStrengths(strengths, snapshot.teams, snapshot.historicalTeamModel?.strengths);
  const neutral = { atkH: 1, atkA: 1, defWeakH: 1, defWeakA: 1 };
  const results = new Map<string, FixtureForecast[]>();
  for (const fixture of snapshot.fixtures) {
    if (!selected.has(fixture.event)) continue;
    const home = teams.get(fixture.teamH), away = teams.get(fixture.teamA);
    if (!home || !away) continue;
    let rates: { home: number; away: number };
    if (source === 'market') {
      const odds = fixture.marketOdds;
      if (!odds || !Number.isFinite(odds.homeXg) || !Number.isFinite(odds.awayXg) || odds.homeXg < 0 || odds.awayXg < 0 || odds.homeXg > 30 || odds.awayXg > 30) continue;
      rates = { home: odds.homeXg, away: odds.awayXg };
    } else {
      const model = projectMatch(strengths.get(home.id) ?? neutral, strengths.get(away.id) ?? neutral);
      rates = { home: model.homeXg, away: model.awayXg };
    }
    const forecast = forecastFromGoalRates(rates.home, rates.away);
    for (const side of [true, false]) {
      const team = side ? home : away, opponent = side ? away : home;
      const goals = side ? forecast.homeXg : forecast.awayXg;
      const cleanSheet = side ? forecast.homeCs : forecast.awayCs;
      const item: FixtureForecast = {
        fixture, team, opponent, home: side, source, goals,
        goalsAgainst: side ? forecast.awayXg : forecast.homeXg,
        cleanSheet, win: side ? forecast.homeWin : forecast.awayWin,
        score2Plus: side ? forecast.homeScore2Plus : forecast.awayScore2Plus,
        ...provisionalOpportunityIndices(goals, cleanSheet),
      };
      const key = `${team.id}:${fixture.event}`;
      const list = results.get(key) ?? [];
      list.push(item);
      results.set(key, list);
    }
  }
  for (const list of results.values()) list.sort((a, b) => (a.fixture.kickoffTime ?? '').localeCompare(b.fixture.kickoffTime ?? '') || a.fixture.id - b.fixture.id);
  return results;
}

/** Average per fixture, not per GW; blanks and missing prices are excluded. */
export function meanForecast(items: readonly FixtureForecast[], metric: 'attackIndex' | 'defenceIndex' | 'goals' | 'cleanSheet' | 'win'): number | null {
  if (!items.length) return null;
  return items.reduce((sum, item) => sum + item[metric], 0) / items.length;
}

/**
 * Shared FDR colour scale across the model (low is easier, high is harder):
 * 0 - 2.8: Green, 2.9 - 3.4: Cyan, 3.5 - 4.2: Orange, 4.2 - 5: Red.
 */
export function difficultyColor(value: number): string {
  if (!Number.isFinite(value)) return VORTEX_FILL_COLORS.neutral;
  if (value <= 2.85) return VORTEX_FILL_COLORS.green;
  if (value <= 3.45) return VORTEX_FILL_COLORS.cyan;
  if (value <= 4.2) return VORTEX_FILL_COLORS.orange;
  return VORTEX_FILL_COLORS.red;
}

export function difficultyTextColor(value: number): '#ffffff' | '#000000' {
  return fillTextColor(difficultyColor(value));
}

export function difficultyFillStyle(value: number): VortexFillStyle {
  const background = difficultyColor(value);
  return { background, color: fillTextColor(background) };
}

/**
 * Projected Goals colour scale (high is easier / better):
 * 0 - 0.9: Red, 1 - 1.3: Cyan, 1.3 - 1.9: Orange, > 1.9: Green.
 */
export function projectedGoalsColor(goals: number): string {
  if (!Number.isFinite(goals)) return VORTEX_FILL_COLORS.neutral;
  if (goals < 1.0) return VORTEX_FILL_COLORS.red;
  if (goals <= 1.3) return VORTEX_FILL_COLORS.cyan;
  if (goals <= 1.9) return VORTEX_FILL_COLORS.orange;
  return VORTEX_FILL_COLORS.green;
}

export function projectedGoalsTextColor(goals: number): '#ffffff' | '#000000' {
  return fillTextColor(projectedGoalsColor(goals));
}

export function projectedGoalsFillStyle(goals: number): VortexFillStyle {
  const background = projectedGoalsColor(goals);
  return { background, color: fillTextColor(background) };
}

/**
 * Clean Sheet Odds Percentage colour scale (high is easier / better):
 * Up to 25%: Red, 26 - 30%: Orange, 31 - 35%: Cyan, > 35%: Green.
 * Evaluates on the rounded integer percentage of `cleanSheetProb` in [0, 1].
 */
export function cleanSheetColor(cleanSheetProb: number): string {
  if (!Number.isFinite(cleanSheetProb)) return VORTEX_FILL_COLORS.neutral;
  const pct = Math.round(cleanSheetProb * 100);
  if (pct <= 25) return VORTEX_FILL_COLORS.red;
  if (pct <= 30) return VORTEX_FILL_COLORS.orange;
  if (pct <= 35) return VORTEX_FILL_COLORS.cyan;
  return VORTEX_FILL_COLORS.green;
}

export function cleanSheetTextColor(cleanSheetProb: number): '#ffffff' | '#000000' {
  return fillTextColor(cleanSheetColor(cleanSheetProb));
}

export function cleanSheetFillStyle(cleanSheetProb: number): VortexFillStyle {
  const background = cleanSheetColor(cleanSheetProb);
  return { background, color: fillTextColor(background) };
}

/** Overall display index, equally weighted attack and defence; not official FDR. */
export function overallDifficulty(item: Pick<FixtureForecast, 'attackIndex' | 'defenceIndex'>): number {
  return (item.attackIndex + item.defenceIndex) / 2;
}

export function fixtureCellIndex(forecasts: ReadonlyMap<string, FixtureForecast[]>, teamId: number, event: number): number | null {
  const items = forecasts.get(`${teamId}:${event}`) ?? [];
  return items.length ? items.reduce((sum, item) => sum + overallDifficulty(item), 0) / items.length : null;
}
