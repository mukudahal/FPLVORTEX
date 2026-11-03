import type { Snapshot } from './types';
import { makeFixtureForecasts, meanForecast } from './fixtureForecast';
import { summarizeOfficialFplHealth } from './publicDataHealth';

/** Export the existing team model; display FDR is an output, never a second multiplier. */
export function buildTeamPlanningReport(snapshot: Snapshot, horizon = 5, nowMs = Date.now()) {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 15) throw new RangeError('Choose 1–15 gameweeks.');
  if (!Number.isFinite(nowMs)) throw new RangeError('A finite clock is required.');
  const start = snapshot.meta.nextEventId;
  if (!Number.isInteger(start) || start < 1 || start > 38) throw new RangeError('No actionable gameweek.');
  const health = summarizeOfficialFplHealth(snapshot.meta, nowMs);
  if (health.state !== 'fresh') throw new Error('Fresh official inputs are required for a new planning forecast.');
  const teamIds = new Set(snapshot.teams.map(t => t.id));
  if (teamIds.size !== snapshot.teams.length || teamIds.size !== 20) throw new Error('Exactly 20 unique teams are required.');
  const events = Array.from({ length: Math.min(horizon, 39 - start) }, (_, i) => start + i);
  const selected = snapshot.fixtures.filter(f => events.includes(f.event));
  const fixtureIds = new Set<number>();
  for (const fixture of selected) {
    if (fixtureIds.has(fixture.id) || !teamIds.has(fixture.teamH) || !teamIds.has(fixture.teamA) || fixture.teamH === fixture.teamA) {
      throw new Error('Duplicate fixture or invalid team reference.');
    }
    fixtureIds.add(fixture.id);
  }
  const forecasts = makeFixtureForecasts(snapshot, 'vortex', events);
  const rows = snapshot.teams.map(team => {
    const gameweeks = events.map(event => {
      const matches = (forecasts.get(`${team.id}:${event}`) ?? []).map(f => ({
        fixtureId: f.fixture.id, opponent: f.opponent.shortName, home: f.home,
        kickoffTime: f.fixture.kickoffTime,
        officialFdr: f.home ? f.fixture.teamHDifficulty : f.fixture.teamADifficulty,
        goals: f.goals, goalsAgainst: f.goalsAgainst, cleanSheet: f.cleanSheet, win: f.win,
        attackIndex: f.attackIndex, defenceIndex: f.defenceIndex,
      }));
      return { event, blank: matches.length === 0, matches };
    });
    const all = events.flatMap(event => forecasts.get(`${team.id}:${event}`) ?? []);
    return {
      teamId: team.id, teamCode: team.code, team: team.name, shortName: team.shortName,
      gameweeks, fixtureCount: all.length,
      projectedGoals: all.reduce((sum, f) => sum + f.goals, 0),
      // Sum of indicators' expectations. This can exceed 1 in a double/horizon.
      expectedCleanSheets: all.reduce((sum, f) => sum + f.cleanSheet, 0),
      meanAttackIndex: meanForecast(all, 'attackIndex'),
      meanDefenceIndex: meanForecast(all, 'defenceIndex'),
    };
  });
  return {
    season: snapshot.meta.season, events, retrievedAt: snapshot.meta.generatedAt,
    computedAt: new Date(nowMs).toISOString(), source: 'vortex' as const,
    model: 'production-team-model; provisional, uncalibrated',
    historicalStrengthsAsOf: snapshot.historicalTeamModel?.asOf ?? null,
    notes: [
      'Model forecasts, not bookmaker odds or guaranteed returns.',
      'Attack/Defence indices are derived display outputs (1 easy–5 hard); they do not multiply team predictions.',
      'Player xPts separately uses official fixture difficulty; team forecasts are not player points.',
      'Goals and expected clean sheets sum per match; index means exclude blanks. Doubles retain every fixture.',
      'No scheduled match is a blank in this snapshot, not a guarantee against later rescheduling.',
    ], rows,
  };
}
