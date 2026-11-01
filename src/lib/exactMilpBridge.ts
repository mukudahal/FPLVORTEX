/**
 * Strict, read-only projection bridge from the live VORTEX Planner to the
 * independent no-chip SciPy/HiGHS MILP. It does not apply transfers or chips.
 *
 * The exact formulation optimizes ONLY the supplied shortlist, and may not
 * prove an optimum when stopped by the runtime / MIP gap.
 */
import type { EnrichedPlayer, Snapshot, Position } from './types';
import type { PlannerSimulationOutput } from './repoModel/compassPlanner';

export interface ExactMilpWeek {
  gw: number;
  squad: number[];
  starters: number[];
  bench: number[];
  captain: number;
  vice_captain: number;
  transfers_in: number[];
  transfers_out: number[];
  free_transfers_before: number;
  free_transfers_after: number;
  hit_cost: number;
  bank: number;
  expected_points_after_hits: number;
}
export interface ExactMilpResponse {
  plans: Array<{
    gameweeks: ExactMilpWeek[];
    raw_expected_points_after_hits: number;
    discounted_points_after_hits: number;
    evaluation_score: number;
    solver: { status: number; message: string; mip_gap: number | null; optimality_proven: boolean };
  }>;
  solver_attempts: Array<{ status: number; message: string; mip_gap: number | null; optimality_proven: boolean }>;
  runtime_seconds: number;
  assumptions: Record<string, string>;
  warnings: string[];
}

const positions: Record<Position, 'GK' | 'DEF' | 'MID' | 'FWD'> = {
  GKP: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD',
};
const quotas: Record<Position, number> = { GKP: 4, DEF: 10, MID: 10, FWD: 6 };

export function buildExactMilpRequest(options: {
  snapshot: Snapshot;
  players: EnrichedPlayer[];
  planner: PlannerSimulationOutput;
  squadIds: number[];
  bankTenths: number;
  freeTransfers: number;
  sellingPrices: Record<number, number>;
  lockedIds: number[];
  decay: number;
}) {
  const { snapshot, players, planner, squadIds, bankTenths, freeTransfers, sellingPrices, lockedIds, decay } = options;
  const gws = planner.gws;
  if (snapshot.meta.stale || !snapshot.meta.nextEventId) {
    throw new RangeError('Exact transfer comparison requires a current FPL snapshot. Refresh data first.');
  }
  if (planner.sourcePlan) throw new RangeError('Exact no-chip comparison cannot override a saved manual plan.');
  if (gws.length === 0 || gws.length > 10 || gws[0] !== snapshot.meta.nextEventId ||
      !gws.every((gw, i) => gw === gws[0] + i && gw <= 38))
    throw new RangeError('Exact solver requires a current 1–10 Gameweek forecast horizon.');
  if (squadIds.length !== 15 || new Set(squadIds).size !== 15 || !Number.isInteger(bankTenths) || bankTenths < 0 ||
      !Number.isInteger(freeTransfers) || freeTransfers < 0 || freeTransfers > 5 ||
      !Number.isFinite(decay) || decay < 0.5 || decay > 1) {
    throw new RangeError('Review the starting squad, bank, FT balance and decay before requesting a MILP.');
  }
  const byId = new Map(players.map(p => [p.id, p]));
  if (squadIds.some(id => !byId.has(id)) || lockedIds.some(id => !squadIds.includes(id)))
    throw new RangeError('Starting squad or locked players are missing from the current forecasts.');
  const allGwValues = (id: number) => gws.map(gw => {
    const value = planner.forecastByGw[gw]?.[id];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new RangeError(`GW${gw} has missing or invalid xPts for player ${id}.`);
    return value;
  });
  // Shortlist and preserve the complete owned squad. The MILP is exact only
  // conditional on this candidate set; no proprietary data or hidden xPts.
  const ranked = (p: EnrichedPlayer) => allGwValues(p.id)
    .reduce((sum, value, i) => sum + Math.pow(decay, i) * value, 0);
  const ids = new Set(squadIds);
  for (const pos of ['GKP', 'DEF', 'MID', 'FWD'] as const) {
    const choices = players.filter(p => p.position === pos && p.cost > 0 && p.availability > 0);
    choices.sort((a,b) => ranked(b) - ranked(a) || a.cost - b.cost || a.id - b.id);
    choices.slice(0, quotas[pos]).forEach(p => ids.add(p.id));
    choices.sort((a,b) => a.cost - b.cost || ranked(b) - ranked(a) || a.id - b.id);
    choices.slice(0, 2).forEach(p => ids.add(p.id));
  }
  if (ids.size > 60) throw new RangeError('Candidate pool exceeds the supported 60-player limit.');
  const fixturesByTeamGw = new Set<string>();
  for (const fixture of snapshot.fixtures) {
    fixturesByTeamGw.add(`${fixture.teamH}:${fixture.event}`);
    fixturesByTeamGw.add(`${fixture.teamA}:${fixture.event}`);
  }
  const payloadPlayers = [...ids].map(id => {
    const p = byId.get(id)!;
    const xpt = allGwValues(id);
    const hasFixture: Record<number, boolean> = {};
    const xpts: Record<number, number> = {};
    const xmins: Record<number, number | null> = {};
    const availability: Record<number, number | null> = {};
    for (let i = 0; i < gws.length; i++) {
      const gw = gws[i], fixture = fixturesByTeamGw.has(`${p.teamId}:${gw}`);
      if (!fixture && xpt[i] !== 0) throw new RangeError(`GW${gw} nonblank xPts without a confirmed fixture for ${p.name}.`);
      hasFixture[gw] = fixture;
      xpts[gw] = Math.round(xpt[i] * 1000) / 1000;
      // Unknown expected minutes are NULL, never silently manufactured as 90.
      // The no-chip MILP optimizes supplied xPts and does not use these fields.
      xmins[gw] = fixture ? null : 0;
      availability[gw] = gw === gws[0] && typeof p.chance === 'number'
        ? Math.max(0, Math.min(1, p.chance / 100)) : null;
    }
    const sale = sellingPrices[id];
    if (squadIds.includes(id) && (sale === undefined || !Number.isInteger(sale) || sale <= 0 || sale > p.cost))
      throw new RangeError(`Verify the original selling price for ${p.name} before exact optimization.`);
    return {
      player_id: id, name: p.name, team_id: p.teamId, position: positions[p.position],
      current_price: p.cost / 10,
      selling_price: squadIds.includes(id) ? sale / 10 : null,
      xpts_by_gw: xpts, xmin_by_gw: xmins, availability_by_gw: availability,
      has_fixture_by_gw: hasFixture,
    };
  });
  return {
    players: payloadPlayers,
    current_team: {
      squad_player_ids: [...squadIds], bank: bankTenths / 10,
      free_transfers: freeTransfers, current_gameweek: gws[0],
    },
    settings: {
      start_gw: gws[0], end_gw: gws.at(-1)!, transfer_depth: gws.length,
      max_transfers_per_gw: 2, max_total_hits: 24, time_decay: decay,
      free_transfer_value: 0, bank_value_per_million: 0,
      solutions_requested: 3, time_limit_seconds: 10, mip_gap: 0.02,
      locked_players: [...lockedIds], excluded_players: [], forced_transfers: [],
      allow_blank_starters: true,
    },
  };
}
