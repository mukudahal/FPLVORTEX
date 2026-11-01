/** Independent, read-only full-horizon verifier for joint WC/FH/BB/TC MILP output.
 *
 * This module is intentionally NOT used by the currently deployed no-chip
 * comparison or existing saved plans. It is a release gate for future
 * official-history-driven joint-chip recommendations.
 */
import type { ExactMilpResponse, ExactMilpWeek } from './exactMilpBridge';
import type { ExactMilpRequest } from './milpPathComparison';
import type { JointChipName, VerifiedChipInventory } from './verifiedChipInventory';

export type JointWeek = ExactMilpWeek & {
  chip: JointChipName | null;
  chip_bonus: number;
  permanent_squad_after: number[];
  temporary_transfers_in: number[];
  temporary_transfers_out: number[];
  temporary_bank: number | null;
};
export type JointPlan = Omit<ExactMilpResponse['plans'][number], 'gameweeks'> & {
  gameweeks: JointWeek[];
};
export type JointRequest = ExactMilpRequest & {
  settings: ExactMilpRequest['settings'] & {
    scoring_chip_halves: VerifiedChipInventory['scoring_chip_halves'];
    squad_chip_halves: VerifiedChipInventory['squad_chip_halves'];
    first_half_fh_used_gw19: boolean;
    forced_chip_uses?: Record<number, JointChipName>;
  };
};
export interface ComparedJointPlan {
  rank: number;
  plan: JointPlan;
  totalHits: number;
  totalMoves: number;
  chipSchedule: Array<{ gw: number; chip: JointChipName }>;
  deltaObjective: number;
  deltaUndiscounted: number;
}

const validChips: JointChipName[] = ['wildcard', 'free_hit', 'bench_boost', 'triple_captain'];
const assert = (condition: unknown, why: string): asserts condition => {
  if (!condition) throw new RangeError('Invalid joint-chip MILP output: ' + why);
};
const same = (x: readonly number[], y: readonly number[]): boolean =>
  x.length === y.length && new Set(x).size === x.length &&
  new Set(y).size === y.length && x.every(i => y.includes(i));
const near = (x: number, y: number, error = 0.004): boolean =>
  Number.isFinite(x) && Number.isFinite(y) && Math.abs(x-y) <= error;

function validateSquad(
  owners: readonly number[],
  byId: Map<number, JointRequest['players'][number]>,
  locks: readonly number[],
  exclusions: readonly number[],
): void {
  assert(owners.length === 15 && new Set(owners).size === 15 &&
    owners.every(id => byId.has(id)), 'squad must have 15 unique known owners');
  for (const [position, quota] of Object.entries({ GK:2, DEF:5, MID:5, FWD:3 })) {
    assert(owners.filter(id => byId.get(id)!.position === position).length === quota, 'position quota');
  }
  for (const team of new Set(owners.map(id => byId.get(id)!.team_id))) {
    assert(owners.filter(id => byId.get(id)!.team_id === team).length <= 3, 'club limit');
  }
  assert(locks.every(id => owners.includes(id)), 'player lock');
  assert(owners.every(id => !exclusions.includes(id)), 'excluded player');
}

export function verifyJointChipPaths(
  request: JointRequest,
  response: ExactMilpResponse,
  verifiedInventory: VerifiedChipInventory,
): ComparedJointPlan[] {
  const settings = request.settings;
  assert(Array.isArray(response.plans) && response.plans.length <= settings.solutions_requested,
    'unexpected plan count');
  assert(Array.isArray(response.solver_attempts) &&
    response.solver_attempts.length >= response.plans.length, 'missing optimizer status');
  const sameInventory = (a: Record<string, number[] | undefined>,
    b: Record<string, number[] | undefined>) =>
      JSON.stringify(Object.fromEntries(Object.keys(a).sort().map(k => [k,[...(a[k] ?? [])].sort()]))) ===
      JSON.stringify(Object.fromEntries(Object.keys(b).sort().map(k => [k,[...(b[k] ?? [])].sort()])));
  assert(sameInventory(settings.scoring_chip_halves, verifiedInventory.scoring_chip_halves) &&
    sameInventory(settings.squad_chip_halves, verifiedInventory.squad_chip_halves) &&
    settings.first_half_fh_used_gw19 === verifiedInventory.first_half_fh_used_gw19,
    'chip inventory not verified against official live history');
  const byId = new Map(request.players.map(p => [p.player_id,p]));
  const originals = new Set(request.current_team.squad_player_ids);
  assert(originals.size === 15 && [...originals].every(id => byId.get(id)?.selling_price !== null &&
    byId.get(id)?.selling_price !== undefined), 'missing original selling prices');
  const ranked: ComparedJointPlan[] = [];
  const signatures = new Set<string>();
  for (const item of response.plans) {
    const plan = item as JointPlan;
    assert(plan.solver && Number.isInteger(plan.solver.status) &&
      typeof plan.solver.optimality_proven === 'boolean' &&
      (plan.solver.mip_gap === null ||
        (Number.isFinite(plan.solver.mip_gap) && plan.solver.mip_gap >= 0)), 'certificate');
    assert(Array.isArray(plan.gameweeks) &&
      plan.gameweeks.length === settings.end_gw-settings.start_gw+1, 'missing GW');
    let permanent = [...originals];
    let bank = Math.round(request.current_team.bank*10);
    let ft = request.current_team.free_transfers;
    let totalHits = 0, totalMoves = 0, raw = 0, weighted = 0;
    const consumedInitial = new Set<number>();
    const chipsUsed = new Set<string>();
    let previousChip: JointChipName | null = null;
    const schedule: Array<{gw:number;chip:JointChipName}> = [];
    const signature: string[] = [];
    const market = (id:number): number => {
      const p=byId.get(id);
      assert(p && Number.isFinite(p.current_price), 'missing player market value');
      return Math.round(p.current_price*10);
    };
    const sale = (id:number): number =>
      originals.has(id) && !consumedInitial.has(id)
        ? Math.round(byId.get(id)!.selling_price!*10) : market(id);
    for (let i=0;i<plan.gameweeks.length;i++) {
      const week = plan.gameweeks[i], gw=settings.start_gw+i;
      assert(week.gw===gw, 'Gameweek order');
      const chip=week.chip;
      assert(chip===null || validChips.includes(chip), 'unsupported chip');
      const half=gw<=19?1:2;
      if (chip) {
        const eligible = chip==='wildcard'||chip==='free_hit'
          ? settings.squad_chip_halves[chip] : settings.scoring_chip_halves[chip];
        assert(eligible?.includes(half), 'unverified half-chip entitlement');
        assert(!chipsUsed.has(`${chip}:${half}`), 'chip used twice in half');
        assert(!(gw===1 && (chip==='wildcard'||chip==='free_hit')), 'GW1 chip ban');
        assert(!(chip==='free_hit' && previousChip==='free_hit'), 'consecutive Free Hits');
        assert(!(chip==='free_hit' && gw===20 && settings.start_gw===20 &&
          settings.first_half_fh_used_gw19), 'GW19-20 FH restriction');
        chipsUsed.add(`${chip}:${half}`);
        schedule.push({gw,chip});
      }
      assert(!settings.forced_chip_uses?.[gw] ||
        settings.forced_chip_uses[gw] === chip, 'manager forced chip');
      assert(Array.isArray(week.transfers_in)&&Array.isArray(week.transfers_out)&&
        Array.isArray(week.squad)&&Array.isArray(week.permanent_squad_after)&&
        Array.isArray(week.starters)&&Array.isArray(week.bench), 'malformed path ledger');
      const added=week.transfers_in, removed=week.transfers_out;
      assert(added.length===removed.length && new Set(added).size===added.length &&
        new Set(removed).size===removed.length, 'duplicate transfer');
      assert(removed.every(id=>permanent.includes(id))&&
        added.every(id=>byId.has(id)&&!permanent.includes(id)), 'ownership transfer');
      assert(chip==='wildcard' ? added.length>=2 :
        added.length<=settings.max_transfers_per_gw, 'normal transfer cap/WC activation');
      if(chip==='free_hit') assert(added.length===0, 'FH permanently transferred players');
      const newPermanent=[...permanent.filter(id=>!removed.includes(id)),...added];
      validateSquad(newPermanent,byId,settings.locked_players,settings.excluded_players);
      assert(same(newPermanent,week.permanent_squad_after), 'permanent squad state');
      let active=newPermanent;
      let temporaryBank: number|null=null;
      if(chip==='free_hit') {
        active=week.squad;
        validateSquad(active,byId,settings.locked_players,settings.excluded_players);
        assert(!same(active,newPermanent), 'FH temporary squad must change');
        const outs=permanent.filter(id=>!active.includes(id));
        const ins=active.filter(id=>!permanent.includes(id));
        assert(same(outs,week.temporary_transfers_out)&&
          same(ins,week.temporary_transfers_in), 'FH temporary transfers');
        temporaryBank=bank+outs.reduce((v,id)=>v+sale(id),0)-
          ins.reduce((v,id)=>v+market(id),0);
        assert(temporaryBank>=0 && week.temporary_bank!==null &&
          near(week.temporary_bank*10,temporaryBank,.001), 'FH temporary budget');
      } else {
        assert(same(week.squad,newPermanent), 'active squad');
        assert(week.temporary_transfers_in.length===0&&
          week.temporary_transfers_out.length===0, 'temporary trades without FH');
        bank+=removed.reduce((v,id)=>v+sale(id),0)-
          added.reduce((v,id)=>v+market(id),0);
        assert(bank>=0,'negative permanent bank');
        for(const id of removed) if(originals.has(id)) consumedInitial.add(id);
      }
      validateSquad(active,byId,settings.locked_players,settings.excluded_players);
      assert(week.starters.length===11&&new Set(week.starters).size===11&&
        week.starters.every(id=>active.includes(id))&&
        same(week.bench,active.filter(id=>!week.starters.includes(id))), 'lineup/bench');
      const formation=Object.fromEntries(['GK','DEF','MID','FWD'].map(pos=>
        [pos,week.starters.filter(id=>byId.get(id)?.position===pos).length])) as
          Record<'GK'|'DEF'|'MID'|'FWD',number>;
      assert(formation.GK===1&&formation.DEF>=3&&formation.DEF<=5&&
        formation.MID>=2&&formation.MID<=5&&formation.FWD>=1&&formation.FWD<=3,
        'formation legality');
      assert(week.captain!==week.vice_captain&&week.starters.includes(week.captain)&&
        week.starters.includes(week.vice_captain), 'captain or vice');
      const xp=(id:number):number=>{
        const value=byId.get(id)?.xpts_by_gw[gw];
        assert(typeof value==='number'&&Number.isFinite(value), 'missing forecast');
        return value;
      };
      const base=week.starters.reduce((v,id)=>v+xp(id),0)+xp(week.captain);
      const bonus=chip==='bench_boost' ? week.bench.reduce((v,id)=>v+xp(id),0)
        :chip==='triple_captain' ? xp(week.captain) :0;
      assert(near(week.chip_bonus,bonus), 'chip bonus');
      const hits=(chip==='wildcard'||chip==='free_hit')?0:4*Math.max(0,added.length-ft);
      assert(week.hit_cost===hits,'transfer hit');
      const nextFT=(chip==='wildcard'||chip==='free_hit')?ft:
        Math.min(5,Math.max(0,ft-added.length)+1);
      assert(week.free_transfers_before===ft&&week.free_transfers_after===nextFT,
        'FT rollover');
      const points=base+bonus-hits;
      assert(near(points,week.expected_points_after_hits,.035), 'GW net model xPts');
      assert(near(bank/10,week.bank,.051),'permanent bank');
      raw+=points;
      weighted+=Math.pow(settings.time_decay,i)*points;
      totalHits+=hits;
      totalMoves+=added.length+(chip==='free_hit'?week.temporary_transfers_in.length:0);
      signature.push(`${gw}:${chip??'-'}:${[...added].sort((a,b)=>a-b)}:${
        chip==='free_hit'?[...week.squad].sort((a,b)=>a-b):''}`);
      permanent=newPermanent;
      ft=nextFT;
      previousChip=chip;
    }
    assert(near(raw,plan.raw_expected_points_after_hits,.06)&&
      near(weighted,plan.discounted_points_after_hits,.06), 'total model points');
    if(settings.free_transfer_value===0&&settings.bank_value_per_million===0)
      assert(near(weighted,plan.evaluation_score,.06),'discounted objective');
    const key=signature.join('|');
    assert(!signatures.has(key),'duplicate joint chip and transfer strategy');
    signatures.add(key);
    ranked.push({rank:0,plan,totalHits,totalMoves,chipSchedule:schedule,
      deltaObjective:0,deltaUndiscounted:0});
  }
  ranked.sort((a,b)=>b.plan.evaluation_score-a.plan.evaluation_score);
  const winner=ranked[0]?.plan;
  ranked.forEach((value,index)=>{
    value.rank=index+1;
    value.deltaObjective=Math.round((value.plan.evaluation_score-(winner?.evaluation_score??0))*100)/100;
    value.deltaUndiscounted=Math.round((value.plan.raw_expected_points_after_hits-
      (winner?.raw_expected_points_after_hits??0))*100)/100;
  });
  return ranked;
}
