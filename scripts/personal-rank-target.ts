const OVERALL_LEAGUE_ID = 314;
const STANDINGS_PAGE_SIZE = 50;
const round = (n: number) => Math.round(n * 100) / 100;

export type RankGoal = { rank: number; gameweek: number };
type Cutoff = {
  points: number; rank: number; observedAt: string; source: string;
};
export type RankCheckpoint = {
  entryId: number; season: string; gameweek: number; rank: number;
  managerPoints: number; cutoffPoints: number; observedAt: string;
};
type GoalWeek = { gw: number; xPts: number; fixedHoldXPts: number };
type CutoffFeed = {
  league?: { id?: number; name?: string };
  last_updated_data?: string;
  standings?: { page?: number; results?: { rank_sort?: number; rank?: number; total?: number }[] };
};

/** The ordinal position identifies the cutline even when displayed ranks are tied. */
export async function fetchOfficialRankCutoff(
  rank: number, settledDeadline: string, now: Date, apiBase: string,
  get: (url: string) => Promise<CutoffFeed>,
): Promise<Cutoff | null> {
  const page = Math.ceil(rank / STANDINGS_PAGE_SIZE);
  const source = apiBase + '/leagues-classic/' + OVERALL_LEAGUE_ID + '/standings/?page_standings=' + page + '&phase=1';
  try {
    const data = await get(source);
    const rows = data.standings?.results;
    const target = Array.isArray(rows) ? rows.filter(row => row?.rank_sort === rank) : [];
    const observedAt = data.last_updated_data ?? '';
    const observed = Date.parse(observedAt);
    const deadline = Date.parse(settledDeadline);
    if (data.league?.id !== OVERALL_LEAGUE_ID || data.standings?.page !== page ||
        !Number.isFinite(observed) || !Number.isFinite(deadline) || observed < deadline || observed > now.getTime() + 120_000 ||
        target.length !== 1) return null;
    const point = target[0];
    if (typeof point.total !== 'number' || !Number.isInteger(point.total) || point.total < 0 ||
        typeof point.rank !== 'number' || !Number.isInteger(point.rank) || point.rank < 1 || point.rank > rank) return null;
    return { points: point.total, rank: point.rank, observedAt, source };
  } catch {
    return null;
  }
}

export function rankTargetAssessment(
  target: RankGoal, weeks: readonly GoalWeek[], latest: RankCheckpoint | null,
  previous: readonly RankCheckpoint[] = [],
) {
  const first = weeks[0]?.gw;
  if (!Number.isInteger(first) || !weeks.every((week,i)=>week.gw === first+i &&
      Number.isFinite(week.xPts) && Number.isFinite(week.fixedHoldXPts))) {
    throw new RangeError('Rank target needs a complete, consecutive points plan.');
  }
  const targetWeeks = weeks.filter(w => w.gw <= target.gameweek);
  const through = targetWeeks.at(-1)?.gw ?? null;
  const completed = target.gameweek < first;
  const coversTarget = through === target.gameweek;
  const remainingGameweeks = Math.max(0,target.gameweek-first+1);
  const gap = latest ? latest.cutoffPoints - latest.managerPoints : null;
  const catchup = gap === null ? null : Math.max(0,gap);
  const predicted = targetWeeks.length ? round(targetWeeks.reduce((sum,w)=>sum+w.xPts,0)) : null;
  const hold = targetWeeks.length ? round(targetWeeks.reduce((sum,w)=>sum+w.fixedHoldXPts,0)) : null;
  const older = latest ? previous.filter(p => p.season === latest.season && p.entryId === latest.entryId &&
    p.rank === target.rank && Number.isInteger(p.gameweek) && p.gameweek >= 1 && p.gameweek < latest.gameweek &&
    Number.isInteger(p.managerPoints) && p.managerPoints >= 0 && Number.isInteger(p.cutoffPoints) && p.cutoffPoints >= 0 &&
    Date.parse(p.observedAt) < Date.parse(latest.observedAt)).sort((a,b)=>b.gameweek-a.gameweek || Date.parse(b.observedAt)-Date.parse(a.observedAt))[0] : undefined;
  // These figures answer what the field could score before the lead is lost.
  // They do not assume that the field scores like the opening squad.
  const maxCutoffGainAtEqualPoints = coversTarget && gap !== null && predicted !== null ? round(predicted-gap) : null;
  const maxCutoffGainAtOnePointClear = maxCutoffGainAtEqualPoints === null ? null : round(maxCutoffGainAtEqualPoints-1);
  return {
    ...target, remainingGameweeks, through, coversTarget, completed, checkpoint: latest,
    signedGap: gap, pointsToMatchCutoff: catchup,
    weeklyGainToMatchCutoff: catchup !== null && remainingGameweeks > 0 ? round(catchup/remainingGameweeks) : null,
    weeklyGainToClearCutoff: gap !== null && remainingGameweeks > 0 ? round(Math.max(0,gap+1)/remainingGameweeks) : null,
    expectedPlanPoints: predicted, expectedHoldPoints: hold,
    planGainVsHold: predicted !== null && hold !== null ? round(predicted-hold) : null,
    maxCutoffGainAtEqualPoints, maxCutoffGainAtOnePointClear,
    cutoffPaceAtEqualPoints: maxCutoffGainAtEqualPoints !== null && remainingGameweeks > 0 ? round(maxCutoffGainAtEqualPoints/remainingGameweeks) : null,
    changeSincePrevious: latest && older ? {
      fromGameweek: older.gameweek, toGameweek: latest.gameweek,
      managerGain: latest.managerPoints-older.managerPoints, cutoffGain: latest.cutoffPoints-older.cutoffPoints,
      gapClosed: (older.cutoffPoints-older.managerPoints)-(latest.cutoffPoints-latest.managerPoints),
    } : null,
    probabilityOfTarget: null,
    probabilityReason: 'No prospectively validated model of future scores at the moving overall-rank cutline.',
  };
}
