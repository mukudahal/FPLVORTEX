import type { FixtureForecast } from '../src/lib/fixtureForecast';

// Stable official club codes used for the manager's caution labels.
const CAUTION_CLUB_CODES = new Set([3, 43, 14]);

export function managerFixtureRisk(opponentCode: number | undefined): 'hard' | null {
  return opponentCode !== undefined && CAUTION_CLUB_CODES.has(opponentCode) ? 'hard' : null;
}

export function personalFixtureOpportunities(forecasts: readonly FixtureForecast[], gw: number) {
  const eligible = forecasts.filter(f => f.fixture.event === gw && !f.fixture.finished &&
    managerFixtureRisk(f.opponent.code) === null);
  const top = (metric: 'goals' | 'cleanSheet') => [...eligible]
    .sort((a, b) => b[metric] - a[metric] || a.team.id - b.team.id || a.fixture.id - b.fixture.id)
    .slice(0, 3)
    .map(f => ({ team: f.team.name, opponent: f.opponent.name, home: f.home,
      expectedGoals: f.goals, cleanSheet: f.cleanSheet }));
  return { gw, attack: top('goals'), cleanSheet: top('cleanSheet') };
}
