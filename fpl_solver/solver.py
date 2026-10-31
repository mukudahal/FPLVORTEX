"""No-chip multi-period MILP. FDR is never used by the objective."""
from __future__ import annotations
from time import monotonic
import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import coo_array
from .models import SolveRequest, QUOTAS

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
    for gidx, gw in enumerate(gws):
        weight = s.time_decay ** gidx
        for i, p in enumerate(players):
            V(('s', i, gidx), lo=int(p.player_id in locked), hi=int(p.player_id not in excluded))
            # Initial squad players cannot be re-bought: avoids incorrect FPL sale-price accounting.
            V(('b', i, gidx), hi=int(p.player_id not in owned and gidx < s.transfer_depth))
            V(('o', i, gidx), hi=int(p.player_id not in locked and gidx < s.transfer_depth))
            V(('l', i, gidx), hi=int(s.allow_blank_starters or p.has_fixture_by_gw[gw]), objective=-weight * p.xpts_by_gw[gw])
            V(('c', i, gidx), objective=-weight * p.xpts_by_gw[gw])
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
            row({idx['l',i,t]:1, idx['s',i,t]:-1}, hi=0)
            row({idx['c',i,t]:1, idx['l',i,t]:-1}, hi=0)
        row({idx['b',i,t]:1 for i in range(n)} | {idx['o',i,t]:-1 for i in range(n)}, 0, 0)
        # Bank[t] = previous bank + sale proceeds - purchase costs.
        bankrow = {idx['bank',t]:1}
        if t: bankrow[idx['bank',t-1]] = -1
        for i,p in enumerate(players):
            sale = p.selling_price if p.player_id in owned and p.selling_price is not None else p.current_price
            bankrow[idx['b',i,t]] = round(p.current_price*10)
            bankrow[idx['o',i,t]] = -round(sale*10)
        row(bankrow, round(team.bank*10) if not t else 0, round(team.bank*10) if not t else 0)
        zkeys = [(ft,k) for ft in range(0,6) for k in range(s.max_transfers_per_gw+1)]
        row({idx['z',t,ft,k]:1 for ft,k in zkeys}, 1, 1)
        countrow = {idx['b',i,t]:1 for i in range(n)}
        countrow.update({idx['z',t,ft,k]:-k for ft,k in zkeys})
        row(countrow, 0, 0)
        if t == 0:
            row({idx['z',t,ft,k]:ft for ft,k in zkeys}, team.free_transfers, team.free_transfers)
        else:
            ftrow = {idx['z',t,ft,k]:ft for ft,k in zkeys}
            ftrow.update({idx['z',t-1,ft,k]:-min(5,max(0,ft-k)+1) for ft,k in zkeys})
            row(ftrow, 0, 0)
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
            squad, starters, captain = selected('s'), selected('l'), selected('c')[0]
            bench = [pid for pid in squad if pid not in starters]
            bench.sort(key=lambda pid: (players[by_id[pid]].position != 'GK', -players[by_id[pid]].xpts_by_gw[gw], pid))
            vice = max((pid for pid in starters if pid != captain), key=lambda pid: (players[by_id[pid]].xpts_by_gw[gw], -pid))
            ft, count = next((f,k) for f in range(0,6) for k in range(s.max_transfers_per_gw+1) if x[idx['z',t,f,k]] > .5)
            hit = max(0,count-ft)*4
            points = sum(players[by_id[pid]].xpts_by_gw[gw] for pid in starters) + players[by_id[captain]].xpts_by_gw[gw] - hit
            raw += points; discount += s.time_decay**t * points
            weeks.append({'gw':gw,'squad':squad,'starters':starters,'bench':bench,'captain':captain,'vice_captain':vice,'transfers_in':selected('b'),'transfers_out':selected('o'),'free_transfers_before':ft,'free_transfers_after':min(5,max(0,ft-count)+1),'hit_cost':hit,'bank':round(float(x[idx['bank',t]])/10,1),'expected_points_after_hits':round(points,3)})
        plans.append({'gameweeks':weeks, 'raw_expected_points_after_hits':round(raw,3), 'discounted_points_after_hits':round(discount,3), 'evaluation_score':round(-float(res.fun),3), 'solver':statuses[-1]})
        # Exclude precisely this sequence of buys, forcing a genuine transfer-path alternative.
        buy_indices = [idx['b',i,t] for t in range(len(gws)) for i in range(n)]
        present = [j for j in buy_indices if x[j] > .5]
        absent = [j for j in buy_indices if x[j] <= .5]
        row({**{j:-1 for j in present}, **{j:1 for j in absent}}, lo=1-len(present))
    return {'plans':plans,'solver_attempts':statuses,'runtime_seconds':round(monotonic()-started,3),'assumptions':{'chip_mode':'off','price_model':'fixed current prices; initial selling prices where provided; no re-buy of original squad players','autosubs':'not modelled','vice_captain':'highest projected non-captain starter, not included in score','future_free_transfer_value':'terminal next-GW banked free transfers','fdr':'not used','projection_source':'caller-provided xPts already accounts for availability'},'warnings': ['Projection-based recommendations, not guarantees.', 'Fixed prices; chips, autosubs and future price changes are not yet supported.']}
