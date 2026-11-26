export interface PersonalPlanContext {
  horizon: number;
  cohort?: {
    season: string; gameweek: number; observedAt: string; source: string; sampleSize: number;
    cutoffPoints?: number; meanPoints?: number;
    players: { id: number; ownership: number; effectiveOwnership: number }[];
  };
  teamNews: {
    playerId: number; throughGw: number; status: 'a' | 'd' | 'u'; chance: number;
    observedAt: string; source: string;
  }[];
}

export function parsePersonalContext(raw: unknown, season: string, previousGw: number, nextGw: number, now: Date,
  validIds: ReadonlySet<number>): PersonalPlanContext {
  if (raw === undefined) return { horizon: 5, teamNews: [] };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid personal context.');
  const value = raw as Partial<PersonalPlanContext>;
  const asOf = now.getTime();
  const observed = (timestamp: string) => {
    const t = Date.parse(timestamp);
    return Number.isFinite(t) && t <= asOf ? t : NaN;
  };
  const source = (url: unknown) => typeof url === 'string' && /^https:\/\/[^\s]+$/.test(url);
  function within(n: unknown, max: number): n is number {
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
  }
  const horizon = value.horizon ?? 5;
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 8) throw new Error('Planning horizon must be between 1 and 8.');
  const cohort = value.cohort;
  if (cohort !== undefined && (!cohort || cohort.season !== season || cohort.gameweek !== previousGw ||
    !Number.isInteger(cohort.sampleSize) || cohort.sampleSize < 1 || cohort.sampleSize > 10_000 ||
    !Number.isFinite(observed(cohort.observedAt)) || !source(cohort.source) ||
    (cohort.cutoffPoints !== undefined && (!Number.isInteger(cohort.cutoffPoints) || cohort.cutoffPoints < 0)) ||
    (cohort.meanPoints !== undefined && !within(cohort.meanPoints, 10_000)) ||
    !Array.isArray(cohort.players) || new Set(cohort.players.map(p => p?.id)).size !== cohort.players.length ||
    cohort.players.some(p => !p || !validIds.has(p.id) || !within(p.ownership, 100) || !within(p.effectiveOwnership, 300)))) {
    throw new Error('Cohort evidence must identify the latest completed gameweek, source and valid player coverage.');
  }
  const teamNews = value.teamNews ?? [];
  if (!Array.isArray(teamNews) || new Set(teamNews.map(n => n?.playerId)).size !== teamNews.length ||
    teamNews.some(n => !n || !validIds.has(n.playerId) || !Number.isInteger(n.throughGw) ||
      n.throughGw < nextGw || n.throughGw > Math.min(38, nextGw + 7) || !source(n.source) ||
      !Number.isFinite(observed(n.observedAt)) || asOf - observed(n.observedAt) > 72 * 3600_000 ||
      ![0, 25, 50, 75, 100].includes(n.chance) ||
      n.status !== (n.chance === 0 ? 'u' : n.chance === 100 ? 'a' : 'd'))) {
    throw new Error('Team news must be sourced within 72 hours, agree with its availability percentage and declare its last applicable gameweek.');
  }
  return { horizon, cohort, teamNews };
}
