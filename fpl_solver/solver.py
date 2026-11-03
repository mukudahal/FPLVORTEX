"""Multi-period transfer MILP with optional joint WC/FH/BB/TC chips.

HiGHS plans are independently replayed. If an unrestricted research solve
finds no incumbent within its budget, an explicitly marked conservative
fixed-roster baseline can be returned; it is NOT a HiGHS incumbent.
No chips are presumed owned without caller-verified inventory.
"""
from __future__ import annotations
from time import monotonic
import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import coo_array
from .models import SolveRequest, QUOTAS
from .chip_replay import verify_joint_milp_ledger

class Problem:
    def __init__(self):
        self.names = {}
        self.lower, self.upper, self.integrality, self.objective = [], [], [], []
        self.rows, self.row_lower, self.row_upper = [], [], []

    def var(self, key, lo=0, hi=1, integer=1, objective=0):
        idx = len(self.lower)
        self.names[key] = idx
        self.lower.append(lo); self.upper.append(hi); self.integrality.append(integer); self.objective.append(objective)
        return idx

    def row(self, coefficients, lo=-np.inf, hi=np.inf):
        self.rows.append({k: v for k, v in coefficients.items() if v})
        self.row_lower.append(lo); self.row_upper.append(hi)

    def solve(self, settings, time_limit):
        r, c, data = [], [], []
        for i, row in enumerate(self.rows):
            for col, value in row.items():
                r.append(i); c.append(col); data.append(value)
        matrix = coo_array((np.array(data, dtype=float), (np.array(r, dtype=np.int32), np.array(c, dtype=np.int32))), shape=(len(self.rows), len(self.lower))).tocsc()
        return milp(c=np.array(self.objective), integrality=np.array(self.integrality), bounds=Bounds(self.lower, self.upper),
                    constraints=LinearConstraint(matrix, self.row_lower, self.row_upper),
                    options={'time_limit': time_limit, 'mip_rel_gap': settings.mip_gap})

def solve(request: SolveRequest) -> dict:
    s, team, players = request.settings, request.current_team, request.players
    gws = list(range(s.start_gw, s.end_gw + 1))
    owned = set(team.squad_player_ids)
    n = len(players)
    problem = Problem()
    V = problem.var
    by_id = {p.player_id: i for i, p in enumerate(players)}
    locked = set(s.locked_players); excluded = set(s.excluded_players)
    # The original squad uses its verified effective selling price until
    # its first sale. On a later repurchase the new cost basis is the
    # current market price (prices remain fixed across this horizon).
    scoring = s.scoring_chip_halves
    bb_halves = set(scoring.get('bench_boost', []))
    tc_halves = set(scoring.get('triple_captain', []))
    squad_chips = s.squad_chip_halves
    wc_halves = set(squad_chips.get('wildcard', []))
    fh_halves = set(squad_chips.get('free_hit', []))
    scoring_enabled = bool(bb_halves or tc_halves)
    squad_enabled = bool(wc_halves or fh_halves)
    fh_enabled = bool(fh_halves)
    initial_discount = {
        i: round(p.current_price * 10) - round(p.selling_price * 10)
        for i, p in enumerate(players)
        if p.player_id in owned and p.selling_price is not None
        and round(p.current_price * 10) > round(p.selling_price * 10)
    }
    for gidx, gw in enumerate(gws):
        weight = s.time_decay ** gidx
        for i, p in enumerate(players):
            V(('s', i, gidx), lo=int(p.player_id in locked), hi=int(p.player_id not in excluded))
            if fh_enabled:
                V(('h', i, gidx), lo=int(p.player_id in locked), hi=int(p.player_id not in excluded))
                V(('fh_added', i, gidx))
                if i in initial_discount:
                    V(('fh_discount', i, gidx))
            V(('b', i, gidx), hi=int(gidx < s.transfer_depth))
            if i in initial_discount:
                # One first-sale flag is enough to track the original
                # sale-price basis across arbitrary rebuys.
                V(('first_sale', i, gidx))
            V(('o', i, gidx), hi=int(p.player_id not in locked and gidx < s.transfer_depth))
            V(('l', i, gidx), hi=int(s.allow_blank_starters or p.has_fixture_by_gw[gw]), objective=-weight * p.xpts_by_gw[gw])
            V(('c', i, gidx), objective=-weight * p.xpts_by_gw[gw])
            if bb_halves:
                # Bench Boost includes the non-XI members of the owned squad.
                V(('bb_bench', i, gidx), objective=-weight * p.xpts_by_gw[gw])
            if tc_halves:
                # TC adds ONE more captain copy beyond normal double captain.
                V(('tc_captain', i, gidx), objective=-weight * p.xpts_by_gw[gw])
        half = 1 if gw <= 19 else 2
        if scoring_enabled:
            V(('chip_bb', gidx), hi=int(half in bb_halves))
            V(('chip_tc', gidx), hi=int(half in tc_halves))
        if squad_enabled:
            V(('chip_wc', gidx), hi=int(half in wc_halves and gw > 1 and gidx < s.transfer_depth))
            V(('chip_fh', gidx), hi=int(half in fh_halves and gw > 1 and
                (gw != 20 or s.start_gw < 20 or s.first_half_fh_used_gw19 is False)))
            for ft in range(0, 6):
                V(('chip_ft', gidx, ft), objective=(
                    s.free_transfer_value * (min(5, ft + 1) - ft)
                    if gidx == len(gws) - 1 else 0))
        if fh_enabled:
            V(('temporary_bank', gidx), hi=2000, integer=1)
        # Bank is in tenths of a million, so no fractional FPL prices are introduced.
        V(('bank', gidx), hi=2000, integer=1, objective=(-s.bank_value_per_million / 10 if gidx == len(gws)-1 else 0))
        for ft in range(0, 6):
            for count in range(s.max_transfers_per_gw + 1):
                V(('z', gidx, ft, count), objective=weight * 4 * max(0, count-ft) - (s.free_transfer_value * min(5, max(0, ft-count)+1) if gidx == len(gws)-1 else 0))
    idx = problem.names
    def row(coefs, lo=-np.inf, hi=np.inf): problem.row(coefs, lo, hi)
    for t, gw in enumerate(gws):
        row({idx['s', i, t]: 1 for i in range(n)}, 15, 15)
        for position, count in QUOTAS.items():
            row({idx['s', i, t]: 1 for i,p in enumerate(players) if p.position == position}, count, count)
        for club in {p.team_id for p in players}:
            row({idx['s', i, t]: 1 for i,p in enumerate(players) if p.team_id == club}, hi=3)
        row({idx['l', i, t]: 1 for i in range(n)}, 11, 11)
        for position, low, high in [('GK',1,1),('DEF',3,5),('MID',2,5),('FWD',1,3)]:
            row({idx['l',i,t]:1 for i,p in enumerate(players) if p.position == position}, low, high)
        row({idx['c', i, t]: 1 for i in range(n)}, 1, 1)
        chip_at = {}
        if scoring_enabled:
            chip_at.update({idx['chip_bb', t]: 1, idx['chip_tc', t]: 1})
        if squad_enabled:
            chip_at.update({idx['chip_wc', t]: 1, idx['chip_fh', t]: 1})
        if chip_at:
            row(chip_at, hi=1)
        if fh_enabled:
            row({idx['h', i, t]: 1 for i in range(n)}, 15, 15)
            for position, count in QUOTAS.items():
                row({idx['h', i, t]: 1 for i,p in enumerate(players) if p.position == position}, count, count)
            for club in {p.team_id for p in players}:
                row({idx['h', i, t]: 1 for i,p in enumerate(players) if p.team_id == club}, hi=3)
            row({idx['fh_added', i, t]: 1 for i in range(n)} |
                {idx['chip_fh', t]: -1}, lo=0)
        for i,p in enumerate(players):
            initial = int(p.player_id in owned)
            evolution = {idx['s',i,t]:1, idx['b',i,t]:-1, idx['o',i,t]:1}
            if t: evolution[idx['s',i,t-1]] = -1
            row(evolution, initial if not t else 0, initial if not t else 0)
            # Explicitly prohibit selling unowned and buying owned players.
            sell = {idx['o',i,t]:1}; buy = {idx['b',i,t]:1}
            if t:
                sell[idx['s',i,t-1]] = -1; buy[idx['s',i,t-1]] = 1
                row(sell, hi=0); row(buy, hi=1)
            else:
                row(sell, hi=initial); row(buy, hi=1-initial)
            row({idx['b',i,t]:1, idx['o',i,t]:1}, hi=1)
            if i in initial_discount:
                first = idx['first_sale', i, t]
                sell_var = idx['o', i, t]
                # first_sale = sold_this_week AND no earlier first_sale.
                row({first: 1, sell_var: -1}, hi=0)
                if t == 0:
                    row({first: 1, sell_var: -1}, 0, 0)
                else:
                    prev = {idx['first_sale', i, u]: 1 for u in range(t)}
                    row({first: 1, **prev}, hi=1)
                    row({first: 1, sell_var: -1, **prev}, lo=0)
            if fh_enabled:
                row({idx['h',i,t]:1, idx['s',i,t]:-1, idx['chip_fh',t]:-1}, hi=0)
                row({idx['s',i,t]:1, idx['h',i,t]:-1, idx['chip_fh',t]:-1}, hi=0)
                added = idx['fh_added',i,t]
                # fh_added = FH AND temporary owner AND NOT permanent owner.
                row({added:1,idx['h',i,t]:-1}, hi=0)
                row({added:1,idx['s',i,t]:1}, hi=1)
                row({added:1,idx['chip_fh',t]:-1}, hi=0)
                row({added:1,idx['h',i,t]:-1,idx['s',i,t]:1,idx['chip_fh',t]:-1}, lo=-1)
                if i in initial_discount:
                    disc = idx['fh_discount',i,t]
                    row({disc:1,idx['s',i,t]:-1}, hi=0)
                    row({disc:1,idx['h',i,t]:1}, hi=1)
                    row({disc:1,idx['chip_fh',t]:-1}, hi=0)
                    history = {idx['first_sale',i,u]:1 for u in range(t+1)}
                    row({disc:1, **history}, hi=1)
                    row({disc:1,idx['s',i,t]:-1,idx['h',i,t]:1,idx['chip_fh',t]:-1, **history}, lo=-1)
                row({idx['l',i,t]:1, idx['h',i,t]:-1}, hi=0)
                # FH transfers must not mutate the permanent squad.
                row({idx['b',i,t]:1,idx['chip_fh',t]:1}, hi=1)
                row({idx['o',i,t]:1,idx['chip_fh',t]:1}, hi=1)
            else:
                row({idx['l',i,t]:1, idx['s',i,t]:-1}, hi=0)
            row({idx['c',i,t]:1, idx['l',i,t]:-1}, hi=0)
            if bb_halves:
                bonus = idx['bb_bench', i, t]
                active = idx['chip_bb', t]
                # bonus = active AND (selected squad member not in XI).
                row({bonus:1, active:-1}, hi=0)
                row({bonus:1, idx['s',i,t]:-1, idx['l',i,t]:1}, hi=0)
                row({bonus:1, active:-1, idx['s',i,t]:-1, idx['l',i,t]:1}, lo=-1)
            if tc_halves:
                bonus = idx['tc_captain', i, t]
                active = idx['chip_tc', t]
                row({bonus:1, active:-1}, hi=0)
                row({bonus:1, idx['c',i,t]:-1}, hi=0)
                row({bonus:1, active:-1, idx['c',i,t]:-1}, lo=-1)
        row({idx['b',i,t]:1 for i in range(n)} | {idx['o',i,t]:-1 for i in range(n)}, 0, 0)
        # Bank[t] = previous bank + sale proceeds - purchase costs.
        bankrow = {idx['bank',t]:1}
        if t: bankrow[idx['bank',t-1]] = -1
        for i,p in enumerate(players):
            market_tenths = round(p.current_price * 10)
            bankrow[idx['b',i,t]] = market_tenths
            bankrow[idx['o',i,t]] = -market_tenths
            if i in initial_discount:
                # A reduced selling price applies only on the FIRST sale,
                # not on future sales after buying the player back.
                bankrow[idx['first_sale',i,t]] = initial_discount[i]
        row(bankrow, round(team.bank*10) if not t else 0, round(team.bank*10) if not t else 0)
        if fh_enabled:
            # FH has an independent one-GW cash account. All old owners
            # remain in s, so neither bank nor first-sale basis is consumed.
            fh_cash = {idx['temporary_bank',t]:1, idx['bank',t]:-1}
            for i,p in enumerate(players):
                market = round(p.current_price*10)
                fh_cash[idx['s',i,t]] = -market
                fh_cash[idx['h',i,t]] = market
                if i in initial_discount:
                    fh_cash[idx['fh_discount',i,t]] = initial_discount[i]
            row(fh_cash, 0, 0)
        zkeys = [(ft,k) for ft in range(0,6) for k in range(s.max_transfers_per_gw+1)]
        row({idx['z',t,ft,k]:1 for ft,k in zkeys}, 1, 1)
        countrow = {idx['b',i,t]:1 for i in range(n)}
        countrow.update({idx['z',t,ft,k]:-k for ft,k in zkeys})
        if squad_enabled:
            # In a normal week, actual purchases equal z's hit-counted
            # number. A WC permits many permanent transfers; FH permits
            # zero permanent transfers. Both preserve the banked FT count.
            row({**countrow,idx['chip_wc',t]:-15}, hi=0)
            row({**countrow,idx['chip_wc',t]:15}, lo=0)
            row({idx['z',t,ft,k]:1 for ft,k in zkeys if k > 0} |
                {idx['chip_wc',t]:1,idx['chip_fh',t]:1}, hi=1)
            row({idx['b',i,t]:1 for i in range(n)} | {idx['chip_wc',t]:-2}, lo=0)
            for ft in range(0,6):
                active = idx['chip_ft',t,ft]
                chosen = idx['z',t,ft,0]
                row({active:1,chosen:-1}, hi=0)
                row({active:1,idx['chip_wc',t]:-1,idx['chip_fh',t]:-1}, hi=0)
                row({active:1,chosen:-1,idx['chip_wc',t]:-1,idx['chip_fh',t]:-1}, lo=-1)
        else:
            row(countrow, 0, 0)
        if t == 0:
            row({idx['z',t,ft,k]:ft for ft,k in zkeys}, team.free_transfers, team.free_transfers)
        else:
            ftrow = {idx['z',t,ft,k]:ft for ft,k in zkeys}
            ftrow.update({idx['z',t-1,ft,k]:-min(5,max(0,ft-k)+1) for ft,k in zkeys})
            if squad_enabled:
                # WC/FH preserve banked FT; ordinary no-transfer GW gets +1.
                for ft in range(0,6):
                    ftrow[idx['chip_ft',t-1,ft]] = min(5,ft+1)-ft
            row(ftrow, 0, 0)
    # There is one BB and one TC per verified season half. Ineligible weeks
    # have chip variables fixed to zero; unused chips are not forced to play.
    for half in (1, 2):
        half_times = [t for t, gw in enumerate(gws) if (1 if gw <= 19 else 2) == half]
        if not half_times: continue
        if half in bb_halves:
            row({idx['chip_bb', t]:1 for t in half_times}, hi=1)
        if half in tc_halves:
            row({idx['chip_tc', t]:1 for t in half_times}, hi=1)
        if squad_enabled:
            if half in wc_halves:
                row({idx['chip_wc',t]:1 for t in half_times}, hi=1)
            if half in fh_halves:
                row({idx['chip_fh',t]:1 for t in half_times}, hi=1)
    if fh_enabled:
        for t in range(1,len(gws)):
            row({idx['chip_fh',t-1]:1,idx['chip_fh',t]:1}, hi=1)
    chip_vars = {'wildcard':'chip_wc', 'free_hit':'chip_fh',
                 'bench_boost':'chip_bb', 'triple_captain':'chip_tc'}
    for gw, chip in s.forced_chip_uses.items():
        row({idx[chip_vars[chip], gw - s.start_gw]:1}, 1, 1)
    if s.max_total_hits is not None:
        row({idx['z',t,ft,k]:4*max(0,k-ft) for t in range(len(gws)) for ft in range(0,6) for k in range(s.max_transfers_per_gw+1)}, hi=s.max_total_hits)
    for tr in s.forced_transfers:
        t = tr.gw - s.start_gw
        row({idx['o',by_id[tr.player_out],t]:1}, 1, 1)
        row({idx['b',by_id[tr.player_in],t]:1}, 1, 1)
    started = monotonic(); plans = []; statuses = []
    for _ in range(s.solutions_requested):
        remaining = s.time_limit_seconds - (monotonic()-started)
        if remaining <= 0: break
        res = problem.solve(s, max(.1, remaining))
        statuses.append({'status': int(res.status), 'message': res.message, 'mip_gap': float(res.mip_gap) if getattr(res,'mip_gap',None) is not None and np.isfinite(res.mip_gap) else None, 'optimality_proven': res.status == 0 and getattr(res,'mip_gap',1) <= 1e-9})
        if res.x is None: break
        x = res.x; weeks = []; raw = 0.0; discount = 0.0
        for t,gw in enumerate(gws):
            selected = lambda key: [p.player_id for i,p in enumerate(players) if x[idx[key,i,t]] > .5]
            permanent = selected('s')
            squad = selected('h') if fh_enabled else permanent
            starters, captain = selected('l'), selected('c')[0]
            bench = [pid for pid in squad if pid not in starters]
            bench.sort(key=lambda pid: (players[by_id[pid]].position != 'GK', -players[by_id[pid]].xpts_by_gw[gw], pid))
            vice = max((pid for pid in starters if pid != captain), key=lambda pid: (players[by_id[pid]].xpts_by_gw[gw], -pid))
            ft, count = next((f,k) for f in range(0,6) for k in range(s.max_transfers_per_gw+1) if x[idx['z',t,f,k]] > .5)
            hit = max(0,count-ft)*4
            chip = None
            bonus = 0.0
            if scoring_enabled:
                if x[idx['chip_bb', t]] > .5:
                    chip = 'bench_boost'
                    bonus = sum(players[by_id[pid]].xpts_by_gw[gw] for pid in bench)
                elif x[idx['chip_tc', t]] > .5:
                    chip = 'triple_captain'
                    bonus = players[by_id[captain]].xpts_by_gw[gw]
            if squad_enabled:
                if x[idx['chip_wc',t]] > .5:
                    chip = 'wildcard'
                elif x[idx['chip_fh',t]] > .5:
                    chip = 'free_hit'
            points = sum(players[by_id[pid]].xpts_by_gw[gw] for pid in starters) + players[by_id[captain]].xpts_by_gw[gw] + bonus - hit
            raw += points; discount += s.time_decay**t * points
            weeks.append({
                'chip':chip,'chip_bonus':round(bonus,3),'gw':gw,
                'squad':squad,'permanent_squad_after':permanent,
                'starters':starters,'bench':bench,'captain':captain,
                'vice_captain':vice,
                'transfers_in':selected('b'),'transfers_out':selected('o'),
                'temporary_transfers_in':sorted(set(squad)-set(permanent)) if chip == 'free_hit' else [],
                'temporary_transfers_out':sorted(set(permanent)-set(squad)) if chip == 'free_hit' else [],
                'free_transfers_before':ft,
                'free_transfers_after':ft if chip in ('wildcard','free_hit') else min(5,max(0,ft-count)+1),
                'hit_cost':hit,'bank':round(float(x[idx['bank',t]])/10,1),
                'temporary_bank':round(float(x[idx['temporary_bank',t]])/10,1) if fh_enabled else None,
                'expected_points_after_hits':round(points,3),
            })
        if scoring_enabled or squad_enabled:
            # Prove each emitted legal-path ledger independently. A malformed
            # solution must fail closed, never become an actionable proposal.
            verify_joint_milp_ledger(request, weeks)
        plans.append({'method':'full_joint_milp', 'gameweeks':weeks, 'raw_expected_points_after_hits':round(raw,3), 'discounted_points_after_hits':round(discount,3), 'evaluation_score':round(-float(res.fun),3), 'solver':statuses[-1]})
        # Distinct paths may differ by transfer sequence or chip schedule.
        # Exclude precisely this pattern, not every path with the same buys.
        buy_indices = [idx['b',i,t] for t in range(len(gws)) for i in range(n)]
        if scoring_enabled:
            buy_indices.extend(idx['chip_bb',t] for t in range(len(gws)))
            buy_indices.extend(idx['chip_tc',t] for t in range(len(gws)))
        if squad_enabled:
            buy_indices.extend(idx['chip_wc',t] for t in range(len(gws)))
            buy_indices.extend(idx['chip_fh',t] for t in range(len(gws)))
        if fh_enabled:
            buy_indices.extend(idx['fh_added',i,t] for t in range(len(gws)) for i in range(n))
        present = [j for j in buy_indices if x[j] > .5]
        absent = [j for j in buy_indices if x[j] <= .5]
        row({**{j:-1 for j in present}, **{j:1 for j in absent}}, lo=1-len(present))
    # A time-limited HiGHS run may return no primal incumbent at all. Keep
    # the failure visible; only a separately independent-replay-verified
    # constrained HOLD/scoring strategy is safe to return in that case.
    # Forced manager decisions must NEVER be silently overridden.
    degraded = False
    if not plans and statuses and (scoring_enabled or squad_enabled):
        from .hold_fallback import verified_hold_scoring_fallback
        baseline = verified_hold_scoring_fallback(request, statuses[-1])
        if baseline is not None:
            plans.append(baseline)
            degraded = True
    return {'plans':plans,'solver_attempts':statuses,
            'full_milp_incumbent_found':any(p['method']=='full_joint_milp' for p in plans),
            'degraded_baseline_only':degraded,
            'runtime_seconds':round(monotonic()-started,3),'assumptions':{'chip_mode':('WC/FH/BB/TC jointly optimized from explicit verified half-season inventory' if squad_enabled else 'BB/TC jointly selected from explicit half-season inventory; WC/FH unsupported' if scoring_enabled else 'off'),'price_model':'verified initial selling price on first sale only; repurchases and subsequent sales at fixed current market prices','autosubs':'not modelled','vice_captain':'highest projected non-captain starter, not included in score','future_free_transfer_value':'terminal next-GW banked free transfers','fdr':'not used','projection_source':'caller-provided xPts already accounts for availability'},'warnings': (['HiGHS did not find a full joint MILP incumbent in time. The returned hold/BB/TC fallback has independently validated legality but has NOT optimized WC/FH or permanent transfers.'] if degraded else []) + ['Projection-based recommendations, not guarantees.', 'The solver is time- and shortlist-bounded; only a valid optimality certificate proves the returned formulation optimum.', ('Fixed prices; FH restores original squad, bank and selling basis; autosubs and future price changes are not modelled.' if squad_enabled else 'Fixed prices; Wildcard/Free Hit, autosubs and future price changes are not supported by this scoring-chip MILP.' if scoring_enabled else 'Fixed prices; chips, autosubs and future price changes are not yet supported.')]}
