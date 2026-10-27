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

export function searchPlayers(players: EnrichedPlayer[], query: string, limit = 10): EnrichedPlayer[] {
  const needle = query.trim().toLowerCase();
  const base = !needle
    ? [...players].sort((a, b) => b.projection - a.projection)
    : players
        .filter(
          (p) =>
            p.name.toLowerCase().includes(needle) ||
            p.fullName.toLowerCase().includes(needle) ||
            p.team.name.toLowerCase().includes(needle) ||
            p.team.shortName.toLowerCase().includes(needle) ||
            p.position.toLowerCase().includes(needle),
        )
        .sort((a, b) => b.projection - a.projection);
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
