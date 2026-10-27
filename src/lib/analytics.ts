import type {
  EnrichedPlayer,
  FplTeam,
  Player,
  ProjectionContext,
  RiskProfile,
  Snapshot,
} from './types';
import { averageFixtureDifficulty, buildProjectionContext } from './fixtures';
import { clamp, numberValue, round } from './format';

const STATUS_AVAILABILITY: Record<string, number> = {
  a: 1,
  d: 0.72,
  i: 0.12,
  s: 0.04,
  u: 0.45,
  n: 0.02,
  f: 1,
};

export function playerAvailability(player: Player): number {
  const status = player.status?.toLowerCase() ?? 'a';
  const statusValue = STATUS_AVAILABILITY[status] ?? 0.75;
  if (player.chance !== null && player.chance !== undefined) {
    return clamp((numberValue(player.chance, 100) / 100) * (status === 'd' ? 0.94 : 1), 0.01, 1);
  }
  return statusValue;
}

function xPer90(value: number, minutes: number): number {
  return minutes > 0 ? (value / minutes) * 90 : 0;
}

function roleScoreFor(player: Player, minutesRate: number, maxEvent: number): number {
  const xGI90 = xPer90(player.xGI, player.minutes);
  const xGC90 = xPer90(player.xGC, player.minutes);
  const attackingReturns = xPer90(player.goals + player.assists, player.minutes);
  if (player.position === 'GKP') {
    const saveRate = xPer90(player.saves, player.minutes);
    return clamp(saveRate * 0.22 + (player.cleanSheets / maxEvent) * 0.35 + (1.8 - xGC90) * 0.16, 0, 2.3);
  }
  if (player.position === 'DEF') {
    const cleanSheetRate = player.cleanSheets / maxEvent;
    const attackingThreat = xGI90 * 0.45 + attackingReturns * 0.16;
    const defensiveBase = (2 - xGC90) * 0.12 + cleanSheetRate * 0.28;
    return clamp(defensiveBase + attackingThreat + player.defensiveContribution / Math.max(90, player.minutes) * 0.12, 0, 2.4);
  }
  return clamp(
    xGI90 * 0.72 + attackingReturns * 0.34 + xPer90(player.creativity + player.threat, player.minutes) * 0.0015 * minutesRate,
    0,
    3.2,
  );
}

export function projectionReasons(
  player: Player,
  projection: number,
  fixtureScore: number,
  roleScore: number,
  availability: number,
  xGI90: number,
  team?: FplTeam,
): string[] {
  const reasons: string[] = [];
  if (player.form >= 5.5) reasons.push(`Strong recent form at ${player.form.toFixed(1)} points per match`);
  if (fixtureScore <= 2.75) reasons.push(`Favourable five-gameweek run (${fixtureScore.toFixed(2)} FDR)`);
  if (fixtureScore >= 4.1) reasons.push(`Tough upcoming run (${fixtureScore.toFixed(2)} FDR)`);
  if (roleScore >= 1.15) reasons.push(`Underlying output supports a ${projection.toFixed(1)}-point projection`);
  if (xGI90 >= 0.45 && player.position !== 'GKP') reasons.push(`${xGI90.toFixed(2)} expected goal involvements per 90`);
  if (player.penaltiesOrder === 1 || player.cornersOrder === 1) reasons.push('Primary set-piece or penalty role');
  if (player.ownership < 12 && player.ownership > 0) reasons.push(`Differential at ${player.ownership.toFixed(1)}% ownership`);
  if (player.ownership > 45) reasons.push(`Highly owned by ${player.ownership.toFixed(1)}% of managers`);
  if (availability < 0.75) reasons.push('Availability risk is priced into the projection');
  if (player.minutes > 0 && player.minutes / 90 >= 6) reasons.push('Consistent minutes improve projection confidence');
  if (team && team.strength >= 4) reasons.push(`${team.name} carry strong baseline team strength`);
  if (!reasons.length) reasons.push(`Blended form, minutes, role and fixture model: ${projection.toFixed(1)} projected points`);
  return reasons.slice(0, 4);
}

function deterministicSparkline(player: Player, projection: number): number[] {
  const seed = player.id * 0.61803398875;
  const base = clamp(projection, 0.8, 12);
  return Array.from({ length: 9 }, (_, index) => {
    const wave = Math.sin(seed + index * 0.91) * 0.22 + Math.cos(seed * 1.7 + index * 0.42) * 0.14;
    const trend = (index / 8 - 0.5) * (numberValue(player.form) - numberValue(player.ppg)) * 0.08;
    return round(Math.max(0, base + base * wave + trend), 2);
  });
}

export function projectPlayer(
  player: Player,
  context: ProjectionContext,
  profile: RiskProfile = 'balanced',
): EnrichedPlayer {
  const team = context.teamIndex.get(player.teamId) ?? {
    id: player.teamId,
    code: player.teamId,
    name: `Team ${player.teamId}`,
    shortName: `T${player.teamId}`,
    position: 0,
    played: 0,
    points: 0,
    form: null,
    strength: 3,
    strengthAttackHome: 3,
    strengthAttackAway: 3,
    strengthDefenceHome: 3,
    strengthDefenceAway: 3,
  };
  const availability = playerAvailability(player);
  const completedEvents = Math.max(1, context.completedEvents);
  const minutesPerEvent = player.minutes / completedEvents;
  const minutesRate = clamp(minutesPerEvent / 78, 0.18, 1);
  const fixtureScore = averageFixtureDifficulty(player, context, 5);
  const fixtureDelta = clamp((3 - fixtureScore) * 0.085, -0.2, 0.2);
  const roleScore = roleScoreFor(player, minutesRate, Math.max(completedEvents, 1));
  const xGI90 = xPer90(player.xGI, player.minutes);
  const momentum = Math.tanh((player.transfersInEvent - player.transfersOutEvent) / 50000);
  const ownershipRatio = clamp(player.ownership / 100, 0, 1);
  const base =
    numberValue(player.epNext) * 0.34 +
    numberValue(player.form) * 0.3 +
    numberValue(player.ppg) * 0.27 +
    numberValue(player.epThis) * 0.09;
  const bonusRate = player.bonus / completedEvents;
  const rawCore = base * (0.52 + minutesRate * 0.48) + roleScore * 0.48 + bonusRate * 0.26;
  const fixtureFactor = 1 + fixtureDelta;
  const profileFactor =
    profile === 'safe'
      ? 0.94 + ownershipRatio * 0.13
      : profile === 'differential'
        ? 1.09 - ownershipRatio * 0.25
        : profile === 'upside'
          ? 1.03 + clamp(roleScore / 8, 0, 0.12) - ownershipRatio * 0.025
          : 1;
  const momentumFactor = 1 + momentum * (profile === 'upside' ? 0.035 : 0.018);
  const projection = clamp(
    rawCore * availability * fixtureFactor * profileFactor * momentumFactor,
    0.1,
    16,
  );
  const confidence = clamp(
    0.2 + minutesRate * 0.42 + availability * 0.22 + clamp(player.minutes / 720, 0, 1) * 0.16,
    0.08,
    0.99,
  );
  const leverage = clamp((1 - ownershipRatio) * (0.45 + projection / 16), 0, 1.45);
  const reasons = projectionReasons(player, projection, fixtureScore, roleScore, availability, xGI90, team);
  return {
    ...player,
    team,
    projection: round(projection, 2),
    confidence: round(confidence, 3),
    value: round(projection / Math.max(4, player.cost) * 10, 3),
    fixtureScore: round(fixtureScore, 2),
    fixtureDelta: round(fixtureDelta, 3),
    momentum: round(momentum, 3),
    availability: round(availability, 3),
    roleScore: round(roleScore, 3),
    leverage: round(leverage, 3),
    reasons,
    sparkline: deterministicSparkline(player, projection),
  };
}

export function enrichPlayers(snapshot: Snapshot, profile: RiskProfile = 'balanced'): EnrichedPlayer[] {
  const context = buildProjectionContext(
    snapshot.teams,
    snapshot.fixtures,
    snapshot.gameweeks,
    snapshot.meta.nextEventId,
  );
  return snapshot.players.map((player) => projectPlayer(player, context, profile));
}

export function buildInsights(players: EnrichedPlayer[]) {
  const available = players.filter((player) => player.availability >= 0.5 && player.minutes > 0);
  const byProjection = [...available].sort((a, b) => b.projection - a.projection);
  const byValue = [...available].filter((player) => player.cost >= 45).sort((a, b) => b.value - a.value);
  const byForm = [...available].sort((a, b) => b.form - a.form || b.projection - a.projection);
  const byMomentum = [...players].sort(
    (a, b) => b.transfersInEvent - b.transfersOutEvent - (a.transfersInEvent - a.transfersOutEvent),
  );
  const differentials = [...available]
    .filter((player) => player.ownership < 15 && player.projection > 4)
    .sort((a, b) => b.projection - a.projection);
  return {
    topProjected: byProjection.slice(0, 12),
    captainCandidates: byProjection.slice(0, 6),
    bestValues: byValue.slice(0, 8),
    formPlayers: byForm.slice(0, 8),
    marketIn: byMomentum.slice(0, 6),
    marketOut: byMomentum.slice(-6).reverse(),
    differentials: differentials.slice(0, 8),
    averageProjection: players.reduce((sum, player) => sum + player.projection, 0) / Math.max(1, players.length),
    eliteCount: players.filter((player) => player.projection >= 6).length,
  };
}

export function searchPlayers(players: EnrichedPlayer[], query: string, limit = 8): EnrichedPlayer[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return players
    .map((player) => {
      const name = player.name.toLowerCase();
      const fullName = player.fullName.toLowerCase();
      const teamName = player.team.name.toLowerCase();
      let score = 0;
      if (name === needle || fullName === needle) score = 100;
      else if (name.startsWith(needle) || fullName.startsWith(needle)) score = 80;
      else if (name.includes(needle) || fullName.includes(needle)) score = 60;
      else if (teamName.includes(needle) || player.team.shortName.toLowerCase() === needle) score = 35;
      if (score) score += Math.min(15, player.projection);
      return { player, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((result) => result.player);
}
