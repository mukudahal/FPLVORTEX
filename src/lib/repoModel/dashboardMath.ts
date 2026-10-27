import type { Fixture, SlimElement, SlimTeam } from "./dashboardTypes";

/** Same strength scale the Vortex video pipeline uses when the FPL API provides it. */
export const API_BASE = 1100;
export const HOME_GOALS = 1.55;
export const AWAY_GOALS = 1.25;
/** How many "average" games a team's early-season numbers are blended with. */
export const PRIOR_GAMES = 4;

/** atk > 1 = scores more than the league average; defWeak > 1 = concedes more than average. */
export interface TeamStrength {
  atkH: number;
  atkA: number;
  defWeakH: number;
  defWeakA: number;
}

export interface MatchProjection {
  homeXg: number;
  awayXg: number;
  homeWin: number; // 0..1
  awayWin: number; // 0..1
  draw: number; // 0..1
  homeCs: number; // 0..1 – home clean-sheet chance
  awayCs: number; // 0..1
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Builds a strength rating for every team.
 *  1. If the FPL API supplies attack/defence strengths (the classic ~1100 scale), use them:
 *     HomeXG = 1.55 × (atk_h / 1100) ÷ (def_a / 1100).
 *  2. Otherwise (the API now returns 0) derive them from the season's expected goals:
 *     attack = team xG for per game, defence = xG against per 90 of the team's most-used
 *     player, each divided by the league average and pulled toward 1 early in the season.
 */
export function buildStrengths(
  teams: SlimTeam[],
  elements: SlimElement[],
  fixtures: Fixture[],
): Map<number, TeamStrength> {
  const out = new Map<number, TeamStrength>();

  // Missing one club's API ratings must not discard valid ratings for every club.
  for (const t of teams) {
    const ratings = [t.strength_attack_home, t.strength_attack_away, t.strength_defence_home, t.strength_defence_away];
    if (!ratings.every(value => Number.isFinite(value) && (value as number) > 0)) continue;
    out.set(t.id, {
      atkH: (t.strength_attack_home as number) / API_BASE,
      atkA: (t.strength_attack_away as number) / API_BASE,
      defWeakH: API_BASE / (t.strength_defence_home as number),
      defWeakA: API_BASE / (t.strength_defence_away as number),
    });
  }
  if (out.size === teams.length) return out;

  const games = new Map<number, number>();
  for (const f of fixtures) {
    if (!f.finished) continue;
    games.set(f.team_h, (games.get(f.team_h) ?? 0) + 1);
    games.set(f.team_a, (games.get(f.team_a) ?? 0) + 1);
  }

  const raw = teams.map((t) => {
    const squad = elements.filter((p) => p.team === t.id);
    const n = games.get(t.id) ?? 0;
    const xgValues = squad.map(p => parseFloat(p.expected_goals));
    const hasAttackEvidence = xgValues.length > 0 && xgValues.every(value => Number.isFinite(value) && value >= 0);
    const xgFor = xgValues.reduce((sum, value) => sum + value, 0);
    const anchor = squad.reduce<SlimElement | null>(
      (best, p) => (Number.isFinite(p.minutes) && p.minutes > 0 && Number.isFinite(p.expected_goals_conceded_per_90) && p.expected_goals_conceded_per_90 >= 0 && (best === null || p.minutes > best.minutes) ? p : best),
      null,
    );
    return {
      id: t.id,
      n,
      forPerGame: n > 0 && hasAttackEvidence ? xgFor / n : null,
      againstPer90: anchor ? anchor.expected_goals_conceded_per_90 : null,
    };
  });

  const attacks = raw.filter(r => r.n > 0 && r.forPerGame !== null);
  const defences = raw.filter(r => r.n > 0 && r.againstPer90 !== null);
  const avgFor = attacks.length ? attacks.reduce((sum, r) => sum + (r.forPerGame as number), 0) / attacks.length : 0;
  const avgAgainst = defences.length ? defences.reduce((sum, r) => sum + (r.againstPer90 as number), 0) / defences.length : 0;

  for (const r of raw) {
    if (out.has(r.id)) continue;
    const w = r.n / (r.n + PRIOR_GAMES);
    const atkRatio = avgFor > 0 && r.n > 0 && r.forPerGame !== null ? r.forPerGame / avgFor : 1;
    const defRatio = avgAgainst > 0 && r.n > 0 && r.againstPer90 !== null ? r.againstPer90 / avgAgainst : 1;
    const atk = clamp(w * atkRatio + (1 - w), 0.55, 1.8);
    const defWeak = clamp(w * defRatio + (1 - w), 0.55, 1.8);
    out.set(r.id, { atkH: atk, atkA: atk, defWeakH: defWeak, defWeakA: defWeak });
  }
  return out;
}

function poissonPmf(k: number, lambda: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i += 1) p *= lambda / i;
  return p;
}

/**
 * HomeXG = 1.55 × attack(home) × leakiness(away),  AwayXG = 1.25 × attack(away) × leakiness(home).
 * Clean sheet = e^(−xG conceded). Win % from an independent-Poisson score grid.
 */
export function projectMatch(home: TeamStrength, away: TeamStrength): MatchProjection {
  const homeXg = HOME_GOALS * home.atkH * away.defWeakA;
  const awayXg = AWAY_GOALS * away.atkA * home.defWeakH;

  if (![homeXg, awayXg].every(value => Number.isFinite(value) && value >= 0 && value <= 30)) throw new RangeError("Invalid match scoring intensity.");
  let homeWin = 0;
  let awayWin = 0;
  let draw = 0;
  const limit = Math.ceil(Math.max(homeXg, awayXg) + 12 * Math.sqrt(Math.max(homeXg, awayXg)) + 20);
  for (let h = 0; h <= limit; h += 1) {
    const ph = poissonPmf(h, homeXg);
    for (let a = 0; a <= limit; a += 1) {
      const p = ph * poissonPmf(a, awayXg);
      if (h > a) homeWin += p;
      else if (a > h) awayWin += p;
      else draw += p;
    }
  }
  return {
    homeXg,
    awayXg,
    homeWin,
    awayWin,
    draw,
    homeCs: Math.exp(-awayXg),
    awayCs: Math.exp(-homeXg),
  };
}
