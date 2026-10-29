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
