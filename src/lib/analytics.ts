/**
 * Player Forecasting & Intelligence Adapter
 * 100% powered by `mukudahal/FPLVORTEX` repository math & projections:
 * - Tier-1 primary projections: `3_data_third_party/fplcopilot-projections-gw7-2026-10-15-v4.csv`
 * - Mechanistic expected points: `site/model/xpts.ts` + `site/model/playerModel.ts` (`computePositionPriors`, `computePlayerXPts`, `DEFAULT_PRIORS`, `SHRINK_90S=4`)
 * - Minutes distribution: `site/model/minutes.ts` (`estimateMinutesDistribution`)
 * - 2026/27 scoring & DEFCON: `site/model/seasonRules.ts` (`RULES_2026_27`)
 * - Opta xP & 5-GW fixture run: `7_skills/fpl-team-planner.skill` (`computeOptaXP5Gw`, `computeFiveGwFixtureEaseSum`)
 * - Captaincy & differential risk weighting: `1_APP_dashboard/src/lib/marketLeague.ts`
 */
import type {
  EnrichedPlayer,
  FplTeam,
  Player,
  Position,
  ProjectionContext,
  RiskProfile,
  Snapshot,
} from './types';
import {
  averageFixtureDifficulty,
  buildProjectionContext,
  toRepoFixtures,
  toRepoTeams,
} from './fixtures';
import { clamp, numberValue, round } from './format';
import { estimateMinutesDistribution } from './repoModel/minutes';
import { computeFiveGwFixtureEaseSum, computeOptaXP5Gw } from './repoModel/optaXp';
import {
  computePlayerXPts,
  computePositionPriors,
  DEFAULT_PRIORS,
  type PositionPriors,
} from './repoModel/xpts';
import type { Fixture as RepoFixture, SlimElement, SlimTeam } from './repoModel/types';

function positionToElementType(pos: Position): 1 | 2 | 3 | 4 {
  if (pos === 'GKP') return 1;
  if (pos === 'DEF') return 2;
  if (pos === 'MID') return 3;
  return 4;
}

export function toRepoElement(player: Player): SlimElement {
  const [firstName, ...rest] = (player.fullName || player.name).split(' ');
  const n90 = Math.max(player.minutes / 90, 0);
  const per90 = (v: number) => (n90 > 0 ? round(v / n90, 3) : 0);
  return {
    id: player.id,
    code: player.code,
    web_name: player.name,
    first_name: firstName || player.name,
    second_name: rest.join(' ') || player.name,
    team: player.teamId,
    element_type: positionToElementType(player.position),
    now_cost: player.cost,
    cost_change_event: 0,
    cost_change_start: 0,
    total_points: player.totalPoints,
    event_points: player.eventPoints,
    form: String(player.form ?? 0),
    points_per_game: String(player.ppg ?? 0),
    selected_by_percent: String(player.selectedByPercent ?? player.ownership ?? 0),
    status: player.status || 'a',
    news: player.news || '',
    news_added: null,
    chance_of_playing_next_round: player.chance,
    chance_of_playing_this_round: player.chance,
    ep_next: String(player.epNext ?? 0),
    ep_this: String(player.epThis ?? 0),
    minutes: player.minutes,
    starts: player.starts,
    starts_per_90: per90(player.starts),
    goals_scored: player.goals,
    assists: player.assists,
    clean_sheets: player.cleanSheets,
    clean_sheets_per_90: per90(player.cleanSheets),
    saves: player.saves,
    saves_per_90: per90(player.saves),
    bonus: player.bonus,
    bps: player.bps,
    defensive_contribution: player.defensiveContribution,
    defensive_contribution_per_90: per90(player.defensiveContribution),
    yellow_cards: 0,
    red_cards: 0,
    own_goals: 0,
    penalties_saved: 0,
    penalties_missed: 0,
    transfers_in_event: player.transfersInEvent,
    transfers_out_event: player.transfersOutEvent,
    expected_goals: String(player.xG ?? 0),
    expected_assists: String(player.xA ?? 0),
    expected_goal_involvements: String(player.xGI ?? 0),
    expected_goals_conceded: String(player.xGC ?? 0),
    expected_goals_per_90: per90(player.xG ?? 0),
    expected_assists_per_90: per90(player.xA ?? 0),
    expected_goal_involvements_per_90: per90(player.xGI ?? 0),
    expected_goals_conceded_per_90: per90(player.xGC ?? 0),
    price_change_percent: null,
    price_change_hourly_rate: null,
    price_change_projections: null,
    price_change_locked_until: null,
  };
}

export function playerAvailability(player: Player, completedEvents = 7): number {
  const el = toRepoElement(player);
  const dist = estimateMinutesDistribution(el, Math.max(1, completedEvents));
  return clamp(dist.p60 + dist.pSub, 0, 1);
}

export function projectionReasons(
  player: Player,
  projection: number,
  fixtureScore: number,
  defconPts: number,
  availability: number,
  csProb: number,
  team?: FplTeam,
): string[] {
  const reasons: string[] = [];
  if (player.gwProjections && Object.keys(player.gwProjections).length > 0) {
    const mins = player.repoExpectedMinutes ?? 0;
    reasons.push(`Repo projection ${projection.toFixed(2)} xPts (${Math.round(mins)} xMins)`);
  } else {
    reasons.push(`Mechanistic model ${projection.toFixed(2)} xPts (Shrinkage + Poisson)`);
  }
  if (defconPts >= 0.45) {
    const threshold = player.position === 'DEF' ? 10 : 12;
    reasons.push(`DEFCON +${defconPts.toFixed(2)} xPts (≥${threshold} CBIT${player.position === 'DEF' ? '' : 'R'} tail)`);
  }
  if ((player.position === 'GKP' || player.position === 'DEF') && csProb >= 0.34) {
    reasons.push(`${Math.round(csProb * 100)}% Poisson clean-sheet probability`);
  }
  if (fixtureScore <= 2.65) {
    reasons.push(`Favorable ${team?.shortName ?? 'club'} 5-GW run (FDR ${fixtureScore.toFixed(2)})`);
  } else if (fixtureScore >= 3.65) {
    reasons.push(`Tougher 5-GW fixture run (FDR ${fixtureScore.toFixed(2)})`);
  }
  if (availability < 0.72) {
    reasons.push(`Minutes/fitness caution (${Math.round(availability * 100)}% appearance probability)`);
  }
  return reasons.slice(0, 3);
}

function applyRepoRiskProfile(
  baseXPts: number,
  availability: number,
  eoRatio: number,
  attackingShare: number,
  profile: RiskProfile,
): number {
  if (profile === 'balanced') return baseXPts;
  if (profile === 'safe') {
    const minsFactor = 0.92 + 0.1 * availability;
    const eoShield = 1 + 0.05 * eoRatio;
    return baseXPts * minsFactor * eoShield;
  }
  const diffFactor = 1 + 0.08 * (1 - eoRatio);
  const upsideFactor = 0.95 + 0.12 * clamp(attackingShare, 0, 1);
  return baseXPts * diffFactor * upsideFactor;
}

export function projectPlayer(
  player: Player,
  context: ProjectionContext,
  profile: RiskProfile = 'balanced',
  shared?: {
    teamsMap: Map<number, SlimTeam>;
    priors: PositionPriors;
    repoFixtures: RepoFixture[];
    allFixtures: Snapshot['fixtures'];
  },
): EnrichedPlayer {
  const team: FplTeam = context.teamIndex.get(player.teamId) ?? {
    id: player.teamId,
    code: player.teamId,
    name: `Club ${player.teamId}`,
    shortName: `T${player.teamId}`,
    position: player.teamId,
    played: 7,
    points: 10,
    form: 'W',
    strength: 3,
    strengthAttackHome: 1100,
    strengthAttackAway: 1100,
    strengthDefenceHome: 1100,
    strengthDefenceAway: 1100,
  };

  const completedEvents = Math.max(1, context.completedEvents);
  const nextGw = context.projectionStartEventId;
  const el = toRepoElement(player);

  const allFixtures = shared?.allFixtures ?? [...context.fixtureIndex.values()].flat();
  const repoFixtures = shared?.repoFixtures ?? toRepoFixtures(allFixtures);
  const teamsMap =
    shared?.teamsMap ??
    new Map(toRepoTeams([...context.teamIndex.values()]).map((t) => [t.id, t]));
  const priors = shared?.priors ?? DEFAULT_PRIORS;

  const modelOut = computePlayerXPts(el, nextGw, repoFixtures, teamsMap, completedEvents, 0, priors);
  const minsDist = estimateMinutesDistribution(el, completedEvents);
  const opta = computeOptaXP5Gw(player, allFixtures, nextGw, completedEvents, 5);
  const fiveGwEaseScore = computeFiveGwFixtureEaseSum(player.teamId, allFixtures, nextGw, 5);

  const csvGwXpts =
    player.gwProjections?.[nextGw] ??
    (player.repoBenchmarkXpts !== null && player.repoBenchmarkXpts !== undefined
      ? player.repoBenchmarkXpts
      : null);
  const baseNextGwXPts = csvGwXpts !== null ? csvGwXpts : modelOut.xPts;

  const availability = clamp(minsDist.p60 + minsDist.pSub, 0, 1);
  const eoRatio = clamp(numberValue(player.ownership, 0) / 100, 0, 1);
  const attackingPts = modelOut.goalPts + modelOut.assistPts;
  const attackingShare = modelOut.xPts > 0 ? (attackingPts + modelOut.bonusPts) / modelOut.xPts : 0.4;
  const projection = round(
    Math.max(0, applyRepoRiskProfile(baseNextGwXPts, availability, eoRatio, attackingShare, profile)),
    2,
  );

  const sparkline: number[] = [];
  if (player.gwProjections && Object.keys(player.gwProjections).length > 0) {
    const sortedGws = Object.keys(player.gwProjections)
      .map(Number)
      .sort((a, b) => a - b);
    for (const gw of sortedGws) {
      sparkline.push(round(player.gwProjections[gw] ?? 0, 2));
    }
  } else {
    for (let offset = 0; offset < 6; offset += 1) {
      const gw = nextGw + offset;
      sparkline.push(
        round(computePlayerXPts(el, gw, repoFixtures, teamsMap, completedEvents, offset, priors).xPts, 2),
      );
    }
  }

  let horizon5Projection = 0;
  for (let offset = 0; offset < 5; offset += 1) {
    const gw = nextGw + offset;
    if (player.gwProjections?.[gw] !== undefined) {
      horizon5Projection += player.gwProjections[gw];
    } else {
      horizon5Projection += computePlayerXPts(el, gw, repoFixtures, teamsMap, completedEvents, offset, priors).xPts;
    }
  }
  horizon5Projection = round(horizon5Projection, 2);

  const fixtureScore = averageFixtureDifficulty(player, context, 5);
  const fixtureDelta = round(clamp((3 - fixtureScore) * 0.11, -0.25, 0.25), 3);
  const momentum = round(Math.tanh((player.transfersInEvent - player.transfersOutEvent) / 50000), 3);
  const expectedMinutes =
    player.repoExpectedMinutes !== null && player.repoExpectedMinutes !== undefined
      ? player.repoExpectedMinutes
      : minsDist.expectedMinutes;
  const confidence = round(clamp(modelOut.confidence / 100, 0.08, 0.99), 3);
  const roleScore = round(attackingPts + modelOut.defensivePts + modelOut.bonusPts, 3);
  const leverage = round(projection * (1 - eoRatio), 3);

  const reasons = projectionReasons(
    player,
    projection,
    fixtureScore,
    modelOut.defensivePts,
    availability,
    modelOut.csProb,
    team,
  );

  return {
    ...player,
    team,
    projection,
    horizon5Projection,
    confidence,
    value: round((projection / Math.max(40, player.cost)) * 10, 3),
    fixtureScore: round(fixtureScore, 2),
    fixtureDelta,
    momentum,
    availability: round(availability, 3),
    roleScore,
    leverage,
    reasons,
    sparkline,
    modelBreakdown: {
      modelXPts: modelOut.xPts,
      expectedMinutes: round(expectedMinutes, 1),
      pStart: round(minsDist.pStart, 3),
      p60Plus: round(minsDist.p60, 3),
      appearance: round(modelOut.appearancePts, 2),
      attacking: round(attackingPts, 2),
      goal: round(modelOut.goalPts, 2),
      assist: round(modelOut.assistPts, 2),
      cleanSheet: round(modelOut.cleanSheetPts, 2),
      defcon: round(modelOut.defensivePts, 2),
      saves: round(modelOut.savePts, 2),
      bonus: round(modelOut.bonusPts, 2),
      concededPenalty: 0,
      cardsPenalty: round(modelOut.cardPts, 2),
      csProb: round(modelOut.csProb, 3),
      optaXP5Gw: opta.total5Gw,
      optaXPNext: opta.nextGw,
      fiveGwEaseScore,
    },
  };
}

export function enrichPlayers(snapshot: Snapshot, profile: RiskProfile = 'balanced'): EnrichedPlayer[] {
  const context = buildProjectionContext(
    snapshot.teams,
    snapshot.fixtures,
    snapshot.gameweeks,
    snapshot.meta.nextEventId,
  );
  const repoTeams = toRepoTeams(snapshot.teams);
  const teamsMap = new Map(repoTeams.map((t) => [t.id, t]));
  const repoFixtures = toRepoFixtures(snapshot.fixtures);
  const repoElements = snapshot.players.map(toRepoElement);
  const priors = computePositionPriors(repoElements);
  const shared = {
    teamsMap,
    priors,
    repoFixtures,
    allFixtures: snapshot.fixtures,
  };
  return snapshot.players.map((player) => projectPlayer(player, context, profile, shared));
}

export function captaincyRanking(players: EnrichedPlayer[], limit = 8): EnrichedPlayer[] {
  return [...players]
    .filter((p) => p.availability >= 0.45)
    .sort((a, b) => {
      const aCap = a.projection * (0.85 + 0.15 * a.confidence);
      const bCap = b.projection * (0.85 + 0.15 * b.confidence);
      return bCap - aCap || b.horizon5Projection - a.horizon5Projection;
    })
    .slice(0, limit);
}

export function differentialRanking(players: EnrichedPlayer[], maxOwnership = 12, limit = 8): EnrichedPlayer[] {
  return [...players]
    .filter((p) => p.ownership > 0 && p.ownership <= maxOwnership && p.availability >= 0.55)
    .sort((a, b) => b.leverage - a.leverage || b.projection - a.projection)
    .slice(0, limit);
}

export function valueRanking(players: EnrichedPlayer[], limit = 8): EnrichedPlayer[] {
  return [...players]
    .filter((p) => p.availability >= 0.6 && p.projection >= 3.2)
    .sort((a, b) => b.value - a.value || b.horizon5Projection - a.horizon5Projection)
    .slice(0, limit);
}

export function riskWatchlist(players: EnrichedPlayer[], limit = 8): EnrichedPlayer[] {
  return [...players]
    .filter((p) => p.ownership >= 4 && (p.availability < 0.78 || p.status !== 'a'))
    .sort((a, b) => b.ownership * (1 - b.availability) - a.ownership * (1 - a.availability))
    .slice(0, limit);
}

export function normalizeSearchText(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function searchPlayers(players: EnrichedPlayer[], query: string, limit = 10): EnrichedPlayer[] {
  const needle = normalizeSearchText(query);
  const relevance = (name: string, fullName: string) => {
    if (normalizeSearchText(name) === needle || normalizeSearchText(fullName) === needle) return 0;
    if (normalizeSearchText(name).startsWith(needle) || normalizeSearchText(fullName).startsWith(needle)) return 1;
    if (normalizeSearchText(name).includes(needle) || normalizeSearchText(fullName).includes(needle)) return 2;
    return 3;
  };
  const base = !needle
    ? [...players].sort((a, b) => b.projection - a.projection)
    : players
        .filter((p) =>
          [p.name, p.fullName, p.team.name, p.team.shortName, p.position]
            .some((field) => normalizeSearchText(field).includes(needle)),
        )
        .sort((a, b) =>
          relevance(a.name, a.fullName) - relevance(b.name, b.fullName) ||
          b.projection - a.projection,
        );
  return base.slice(0, limit);
}

export function buildInsights(players: EnrichedPlayer[]) {
  const topProjected = [...players].sort((a, b) => b.projection - a.projection).slice(0, 12);
  const captainCandidates = captaincyRanking(players, 8);
  const differentials = differentialRanking(players, 12, 8);
  const bestValues = valueRanking(players, 8);
  const marketIn = [...players]
    .sort((a, b) => b.transfersInEvent - b.transfersOutEvent - (a.transfersInEvent - a.transfersOutEvent))
    .slice(0, 8);
  const watchlist = riskWatchlist(players, 8);
  return {
    topProjected,
    captainCandidates,
    differentials,
    bestValues,
    marketIn,
    watchlist,
  };
}

export type PriceChangeStatus = 'Likely to rise' | 'Likely to drop' | 'Unlikely to change';

export interface PriceChangePrediction {
  status: PriceChangeStatus;
  progressPct: number;
  predictedProgressPct: number;
  netTransfers: number;
  stepThreshold: number;
}

/**
 * Dynamically computes current price-change `Progress %`, `Predicted Progress %` at tonight's
 * 01:30 UTC cutoff, and `Status` (`Likely to rise` | `Likely to drop` | `Unlikely to change`)
 * strictly from live/snapshot official FPL transfer volume, ownership, availability lockouts,
 * and current-GW price steps — zero hardcoded player overrides.
 */
export function computePriceChangePrediction(
  player: Pick<
    EnrichedPlayer,
    | 'transfersInEvent'
    | 'transfersOutEvent'
    | 'ownership'
    | 'status'
    | 'chance'
    | 'form'
    | 'costChangeEvent'
  >,
  totalManagers = 11_000_000,
): PriceChangePrediction {
  const net = player.transfersInEvent - player.transfersOutEvent;
  const volume = player.transfersInEvent + player.transfersOutEvent;
  const safeTotal = Math.max(4_000_000, Number.isFinite(totalManagers) && totalManagers > 0 ? totalManagers : 11_000_000);
  // Active non-dead manager pool driving FPL market thresholds (~46% of total registered managers)
  const activePool = safeTotal * 0.46;

  // Permanently departed / loaned-out-abroad players ('u' / 'n') are price-locked in official FPL
  if (player.status === 'u' || player.status === 'n' || volume === 0 || net === 0) {
    return {
      status: 'Unlikely to change',
      progressPct: 0,
      predictedProgressPct: 0,
      netTransfers: net,
      stepThreshold: Math.round(activePool * 0.04),
    };
  }

  const ownPct = Math.max(0.1, Number.isFinite(player.ownership) ? player.ownership : 0.1);
  const ownFrac = ownPct / 100;

  if (net > 0) {
    const riseStep = Math.max(25_000, Math.round(activePool * (0.0375 + ownFrac * 0.054)));
    const completedRises =
      typeof player.costChangeEvent === 'number'
        ? Math.max(0, player.costChangeEvent)
        : Math.min(2, Math.floor(net / riseStep));

    if (completedRises >= 3) {
      return {
        status: 'Unlikely to change',
        progressPct: 0,
        predictedProgressPct: 0,
        netTransfers: net,
        stepThreshold: riseStep,
      };
    }

    const remainingNet = Math.max(0, net - completedRises * riseStep);
    const progressPct = Math.min(99.9, Math.round((remainingNet / riseStep) * 1000) / 10);
    const inShare = player.transfersInEvent / Math.max(1, volume);
    const velocity = 0.965 + inShare * 0.105 + Math.min(0.05, Math.max(0, player.form || 0) * 0.006);
    const predictedProgressPct = Math.min(104.5, Math.round(progressPct * velocity * 10) / 10);
    const status: PriceChangeStatus =
      progressPct >= 95.0 || predictedProgressPct >= 95.0 ? 'Likely to rise' : 'Unlikely to change';

    return {
      status,
      progressPct,
      predictedProgressPct,
      netTransfers: net,
      stepThreshold: riseStep,
    };
  }

  const absNet = Math.abs(net);
  const activeOwners = Math.max(12_000, ownFrac * activePool);
  const flagDampener = (player.status === 'i' || player.status === 's') && player.chance === 0 ? 1.46 : 1.0;
  const dropStep = Math.max(4_800, Math.round((activeOwners * 0.104 + activePool * 0.00072) * flagDampener));
  const completedDrops =
    typeof player.costChangeEvent === 'number'
      ? Math.max(0, -player.costChangeEvent)
      : Math.min(2, Math.floor(absNet / dropStep));

  if (completedDrops >= 3) {
    return {
      status: 'Unlikely to change',
      progressPct: 0,
      predictedProgressPct: 0,
      netTransfers: net,
      stepThreshold: dropStep,
    };
  }

  const remainingDropNet = Math.max(0, absNet - completedDrops * dropStep);
  const progressPct = -Math.min(99.9, Math.round((remainingDropNet / dropStep) * 1000) / 10);
  const outShare = player.transfersOutEvent / Math.max(1, volume);
  const velocity = (player.status !== 'a' ? 1.035 : 0.945) + (outShare - 0.5) * 0.175;
  const predictedProgressPct = -Math.min(104.5, Math.round(Math.abs(progressPct) * velocity * 10) / 10);
  const status: PriceChangeStatus =
    progressPct <= -95.0 || predictedProgressPct <= -95.0 ? 'Likely to drop' : 'Unlikely to change';

  return {
    status,
    progressPct,
    predictedProgressPct,
    netTransfers: net,
    stepThreshold: dropStep,
  };
}

export interface ParsedInjuryDetails {
  statusLabel: 'Injured' | 'Doubtful' | 'Suspended' | 'Unavailable' | 'Available';
  badgeText: string;
  severity: 'severe' | 'doubt' | 'clear';
  injuryType: string;
  expectedReturn: string;
  chancePercent: number;
  officialBulletin: string;
  nextFixtureLabel?: string;
}

/**
 * Dynamically extracts structured medical/disciplinary details (`injuryType`, `expectedReturn`,
 * `chancePercent`, `statusLabel`, `badgeText`) from official FPL `status`, `chance`, and `news`.
 */
export function parsePlayerInjuryDetails(
  player: Pick<EnrichedPlayer, 'status' | 'chance' | 'news'>,
  nextFixtureLabel?: string,
): ParsedInjuryDetails {
  const rawNews = (player.news || '').trim();
  const status = (player.status || 'a').toLowerCase();

  let statusLabel: ParsedInjuryDetails['statusLabel'] = 'Available';
  if (status === 'i') statusLabel = 'Injured';
  else if (status === 'd') statusLabel = 'Doubtful';
  else if (status === 's') statusLabel = 'Suspended';
  else if (status === 'u' || status === 'n') statusLabel = 'Unavailable';
  else if (player.chance !== null && player.chance < 100) statusLabel = 'Doubtful';

  const chancePercent =
    player.chance !== null && Number.isFinite(player.chance)
      ? Math.max(0, Math.min(100, player.chance))
      : status === 'i' || status === 's' || status === 'u' || status === 'n'
        ? 0
        : status === 'd'
          ? 75
          : 100;

  const severity: ParsedInjuryDetails['severity'] =
    status === 'i' || status === 's' || status === 'u' || status === 'n' || chancePercent <= 25
      ? 'severe'
      : status === 'd' || chancePercent < 100
        ? 'doubt'
        : 'clear';

  const badgeText =
    status === 's'
      ? 'SUSP'
      : status === 'u' || status === 'n'
        ? 'OUT'
        : chancePercent === 0
          ? 'INJ'
          : chancePercent < 100
            ? `${chancePercent}%`
            : 'FIT';

  let injuryType =
    status === 's'
      ? 'Disciplinary Suspension'
      : status === 'u' || status === 'n'
        ? 'Squad Unavailable'
        : status === 'i'
          ? 'Injury Sideline'
          : status === 'd'
            ? 'Fitness Assessment'
            : 'Match Fit';

  let expectedReturn =
    chancePercent === 0
      ? 'Unknown return date (awaiting club medical update)'
      : chancePercent < 100
        ? `Assessed ahead of next Gameweek (${chancePercent}% chance of playing)`
        : 'Available for next Gameweek';

  if (rawNews) {
    const dashParts = rawNews.split(/\s+-\s+/);
    if (dashParts.length >= 2) {
      injuryType = dashParts[0].trim();
      const tail = dashParts.slice(1).join(' - ').trim();
      const backMatch = tail.match(/expected back\s+(.+)/i);
      if (backMatch?.[1]) {
        expectedReturn = `Expected back ${backMatch[1].trim()}`;
      } else if (/unknown return date/i.test(tail)) {
        expectedReturn = 'Unknown return date (awaiting club medical update)';
      } else if (/\d+%\s*chance/i.test(tail)) {
        expectedReturn = `In contention for next Gameweek (${tail})`;
      } else {
        expectedReturn = tail;
      }
    } else if (/^suspended until\s+(.+)/i.test(rawNews)) {
      const m = rawNews.match(/^suspended until\s+(.+)/i);
      injuryType = 'Suspension';
      expectedReturn = m?.[1] ? `Eligible after ${m[1].trim()}` : rawNews;
    } else if (/on loan until\s+(.+)/i.test(rawNews)) {
      const m = rawNews.match(/on loan until\s+(.+)/i);
      injuryType = 'Out on Loan';
      expectedReturn = m?.[1] ? `Loaned until ${m[1].trim()}` : rawNews;
    } else if (/on loan/i.test(rawNews)) {
      injuryType = 'Out on Loan';
      expectedReturn = 'On loan for the remainder of the spell';
    } else if (/joined .+ permanently|departed the club/i.test(rawNews)) {
      injuryType = 'Transferred / Departed Club';
      expectedReturn = 'Not returning (left club)';
    } else {
      injuryType = rawNews;
    }
  }

  return {
    statusLabel,
    badgeText,
    severity,
    injuryType,
    expectedReturn,
    chancePercent,
    officialBulletin: rawNews || `${statusLabel} (${chancePercent}% chance of playing)`,
    nextFixtureLabel,
  };
}

