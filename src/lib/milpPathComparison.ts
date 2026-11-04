/**
 * Independent VORTEX validation of HiGHS alternative transfer paths.
 * Verifies the real full-GW ledger before displaying or saving a proposal.
 * Path comparisons are conditional on the submitted candidate set, fixed
 * prices and the no-chip MILP rules; forecasts are not guaranteed outcomes.
 */
import type { StoredTransferPlan } from './transferPlansStore';
import type { ExactMilpResponse } from './exactMilpBridge';
import { buildExactMilpRequest } from './exactMilpBridge';

export type ExactMilpRequest = ReturnType<typeof buildExactMilpRequest>;
export type ExactMilpPlan = ExactMilpResponse['plans'][number];

export interface ComparedMilpPath {
  rank: number;
  plan: ExactMilpPlan;
  totalTransfers: number;
  totalHits: number;
  lastBank: number;
  lastFreeTransfers: number;
  /** Independent financial replay. Original price basis is consumed on first sale. */
  weekFinances: Array<{
    gw: number;
    sales: Array<{ playerId: number; price: number; originalBasis: boolean }>;
    purchases: Array<{ playerId: number; price: number }>;
  }>;
  /** xPts after hits (undiscounted) compared to the highest solver objective path. */
  deltaRawPoints: number;
  /** Discounted, hit-adjusted objective delta; not a confidence interval. */
  deltaObjective: number;
}

const close = (a: number, b: number, epsilon = .015) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;

function assertInvariant(ok: unknown, why: string): asserts ok {
  if (!ok) throw new RangeError('Invalid MILP proposal: ' + why);
}
function sameMembers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && new Set(a).size === a.length && new Set(b).size === b.length && a.every(id => b.includes(id));
}

/**
 * Response may be incomplete when HiGHS reaches its shared time limit.
 * Do not synthesize paths or assume an optimality certificate.
 */
export function compareMilpPaths(
  request: ExactMilpRequest,
  response: ExactMilpResponse,
  eligibleIncoming?: (id: number) => boolean,
): ComparedMilpPath[] {
  assertInvariant(Array.isArray(response.plans) &&
    response.plans.length <= request.settings.solutions_requested, 'unexpected plan count');
  assertInvariant(Array.isArray(response.solver_attempts) &&
    response.solver_attempts.length >= response.plans.length, 'missing solver reports');
  const first = request.current_team;
  const settings = request.settings;
  const byId = new Map(request.players.map(p => [p.player_id, p]));
  const originallyOwned = new Set(first.squad_player_ids);
  assertInvariant(first.squad_player_ids.every(id =>
    byId.get(id)?.selling_price !== null && byId.get(id)?.selling_price !== undefined),
    'missing verified initial selling-price basis');
  const keys = new Set<string>();
  const ranked: Array<{ plan: ExactMilpPlan; hits: number; moves: number; endBank: number; endFT: number; weekFinances: ComparedMilpPath['weekFinances'] }> = [];
  for (const plan of response.plans) {
    assertInvariant(Array.isArray(plan.gameweeks) &&
      plan.gameweeks.length === settings.end_gw - settings.start_gw + 1, 'partial or missing gameweek path');
    assertInvariant(plan.solver && Number.isInteger(plan.solver.status) &&
      typeof plan.solver.optimality_proven === 'boolean', 'missing MILP certificate');
    assertInvariant(plan.solver.mip_gap === null ||
      (Number.isFinite(plan.solver.mip_gap) && plan.solver.mip_gap >= 0), 'invalid MILP gap');
    let previous = [...first.squad_player_ids];
    const soldOriginal = new Set<number>();
    const weekFinances: ComparedMilpPath['weekFinances'] = [];
    let bank = first.bank;
    let ft = first.free_transfers;
    let raw = 0;
    let weighted = 0;
    let hits = 0;
    let moves = 0;
    const signature: string[] = [];
    for (const [index, week] of plan.gameweeks.entries()) {
      const gw = settings.start_gw + index;
      assertInvariant(week.gw === gw && Array.isArray(week.transfers_in) &&
        Array.isArray(week.transfers_out) && Array.isArray(week.squad) &&
        Array.isArray(week.starters) && Array.isArray(week.bench), 'gameweek ledger shape');
      const ins = week.transfers_in, outs = week.transfers_out, squad = week.squad;
      assertInvariant(ins.length === outs.length && ins.length <= settings.max_transfers_per_gw &&
        new Set(ins).size === ins.length && new Set(outs).size === outs.length, 'invalid transfer batch');
      assertInvariant(outs.every(id => previous.includes(id)) &&
        ins.every(id => byId.has(id) && !previous.includes(id)), 'transfers are not based on previous ownership');
      assertInvariant(!eligibleIncoming || ins.every(id => eligibleIncoming(id)),
        'incoming player is currently flagged by official FPL availability');
      assertInvariant(squad.length === 15 && new Set(squad).size === 15 &&
        sameMembers(squad, [...previous.filter(id => !outs.includes(id)), ...ins]), 'squad transition');
      assertInvariant(settings.locked_players.every(id => squad.includes(id)) &&
        squad.every(id => !settings.excluded_players.includes(id) && byId.has(id)), 'locks or exclusions');
      for (const [position, quota] of Object.entries({ GK: 2, DEF: 5, MID: 5, FWD: 3 })) {
        assertInvariant(squad.filter(id => byId.get(id)?.position === position).length === quota, 'position quota');
      }
      for (const club of new Set(squad.map(id => byId.get(id)!.team_id))) {
        assertInvariant(squad.filter(id => byId.get(id)!.team_id === club).length <= 3, 'club quota');
      }
      assertInvariant(week.starters.length === 11 && new Set(week.starters).size === 11 &&
        week.starters.every(id => squad.includes(id)) &&
        sameMembers(week.bench, squad.filter(id => !week.starters.includes(id))) &&
        week.captain !== week.vice_captain &&
        week.starters.includes(week.captain) && week.starters.includes(week.vice_captain), 'XI/captain/bench');
      const form = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const id of week.starters) {
        form[byId.get(id)!.position]++;
      }
      assertInvariant(form.GK === 1 && form.DEF >= 3 && form.DEF <= 5 &&
        form.MID >= 2 && form.MID <= 5 && form.FWD >= 1 && form.FWD <= 3, 'lineup formation');
      assertInvariant(week.free_transfers_before === ft, 'FT carried incorrectly');
      const hit = Math.max(0, ins.length - ft) * 4;
      const ftAfter = Math.min(5, Math.max(0, ft - ins.length) + 1);
      assertInvariant(week.hit_cost === hit && week.free_transfers_after === ftAfter, 'transfer-hit or FT accounting');
      // Original owners retain their entry selling price until the FIRST
      // sale. A later repurchase uses the same fixed market price as
      // any new purchase, even for a player from the original squad.
      const sales = outs.map(id => {
        const player = byId.get(id)!;
        const originalBasis = originallyOwned.has(id) && !soldOriginal.has(id);
        const price = originalBasis ? player.selling_price! : player.current_price;
        if (originalBasis) soldOriginal.add(id);
        return { playerId: id, price, originalBasis };
      });
      const purchases = ins.map(id => ({ playerId: id, price: byId.get(id)!.current_price }));
      const saleTenths = sales.reduce((sum, sale) => sum + Math.round(sale.price * 10), 0);
      const buyTenths = purchases.reduce((sum, purchase) => sum + Math.round(purchase.price * 10), 0);
      bank = (Math.round(bank * 10) + saleTenths - buyTenths) / 10;
      weekFinances.push({ gw, sales, purchases });
      assertInvariant(bank >= -0.001 && close(bank, week.bank, .051), 'bank or selling price');
      const points = week.starters.reduce((total, id) => total + byId.get(id)!.xpts_by_gw[gw], 0) +
        byId.get(week.captain)!.xpts_by_gw[gw] - hit;
      assertInvariant(close(points, week.expected_points_after_hits, .035), 'points do not match model forecasts');
      raw += points;
      weighted += Math.pow(settings.time_decay, index) * points;
      hits += hit; moves += ins.length; ft = ftAfter;
      previous = [...squad];
      signature.push(gw + ':' + [...ins].sort((a, b) => a - b).join(','));
    }
    assertInvariant(close(raw, plan.raw_expected_points_after_hits, .04) &&
      close(weighted, plan.discounted_points_after_hits, .04), 'incorrect cumulative xPts');
    // The production planner explicitly sets terminal bank/FT values to 0.
    if (settings.free_transfer_value === 0 && settings.bank_value_per_million === 0) {
      assertInvariant(close(plan.evaluation_score, weighted, .05), 'discounted objective mismatch');
    }
    const key = signature.join('|');
    assertInvariant(!keys.has(key), 'duplicate transfer path');
    keys.add(key);
    ranked.push({ plan, hits, moves, endBank: bank, endFT: ft, weekFinances });
  }
  ranked.sort((a, b) => b.plan.evaluation_score - a.plan.evaluation_score);
  const lead = ranked[0]?.plan;
  return ranked.map((row, rank) => ({
    rank: rank + 1,
    plan: row.plan,
    totalTransfers: row.moves,
    totalHits: row.hits,
    lastBank: row.endBank,
    lastFreeTransfers: row.endFT,
    weekFinances: row.weekFinances,
    deltaRawPoints: Math.round((row.plan.raw_expected_points_after_hits - (lead?.raw_expected_points_after_hits ?? 0)) * 100) / 100,
    deltaObjective: Math.round((row.plan.evaluation_score - (lead?.evaluation_score ?? 0)) * 100) / 100,
  }));
}

/**
 * A proposal must first pass compareMilpPaths and then receive an explicit
 * manager confirmation. This creates a NEW plan; it cannot replace an existing
 * saved plan and never transfers a player in the official FPL application.
 */
export function createReviewedMilpPlan(params: {
  request: ExactMilpRequest;
  path: ComparedMilpPath;
  name: string;
  id: string;
  createdAt: string;
}): StoredTransferPlan {
  const { request, path, name, id, createdAt } = params;
  assertInvariant(id.length > 3 && name.trim().length > 0, 'missing plan identity');
  const positions = new Map(request.players.map(p => [p.player_id, p.position]));
  const transfers: StoredTransferPlan['transfers'] = {};
  const lineups: StoredTransferPlan['lineups'] = {};
  const captains: StoredTransferPlan['captains'] = {};
  for (const week of path.plan.gameweeks) {
    if (week.transfers_out.length) {
      const ins = [...week.transfers_in];
      const chosen = week.transfers_out.map(out => {
        const i = ins.findIndex(inId => positions.get(inId) === positions.get(out));
        assertInvariant(i !== -1, 'position-matched transfer pairing');
        return { out, in: ins.splice(i, 1)[0] };
      });
      assertInvariant(ins.length === 0, 'unpaired transfers');
      transfers[week.gw] = chosen;
    }
    lineups[week.gw] = [...week.starters, ...week.bench];
    captains[week.gw] = { captain: week.captain, vice: week.vice_captain };
  }
  const originals = request.current_team.squad_player_ids;
  return {
    id, name, startGw: request.settings.start_gw,
    baseSquad: [...originals],
    baseBankTenths: Math.round(request.current_team.bank * 10),
    baseFreeTransfers: request.current_team.free_transfers,
    sellingPrices: Object.fromEntries(originals.map(pid => [pid, Math.round(
      (request.players.find(p => p.player_id === pid)?.selling_price ??
        request.players.find(p => p.player_id === pid)?.current_price ?? 0) * 10,
    )])),
    transfers, lineups, captains, chips: {},
    lockedPlayerIds: [...request.settings.locked_players],
    createdAt, updatedAt: createdAt,
  };
}
