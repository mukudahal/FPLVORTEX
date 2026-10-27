#!/usr/bin/env python3
import itertools
import json
import sys
import time

PULP_NOTE = "PuLP not installed"
try:
    import pulp
    # PuLP 4.x rewrote its variable API; probe it so an incompatible install degrades
    # to the heuristic with an honest label instead of crashing the whole solve.
    pulp.LpVariable("_compat_probe", cat="Binary")
    HAS_PULP = True
    PULP_NOTE = ""
except Exception as _pulp_err:
    PULP_NOTE = (
        "PuLP not installed"
        if isinstance(_pulp_err, ImportError)
        else f"PuLP {getattr(pulp, '__version__', '?')} is incompatible (needs 2.9-3.x)"
    )
    pulp = None
    HAS_PULP = False


def solve_lineup_from_squad(squad_ids, players_by_id, gw_xpts, bench_boost=False, triple_captain=False):
    """Exact valid XI (1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD) + Captain + Vice + ordered bench."""
    gks = [pid for pid in squad_ids if players_by_id[pid]["type"] == 1]
    outfield = [pid for pid in squad_ids if players_by_id[pid]["type"] in (2, 3, 4)]

    gks_sorted = sorted(gks, key=lambda pid: gw_xpts.get(str(pid), 0.0), reverse=True)
    start_gk = gks_sorted[0] if gks_sorted else squad_ids[0]
    bench_gk = gks_sorted[1] if len(gks_sorted) > 1 else start_gk

    defs = sorted(
        [pid for pid in outfield if players_by_id[pid]["type"] == 2],
        key=lambda pid: gw_xpts.get(str(pid), 0.0),
        reverse=True,
    )
    mids = sorted(
        [pid for pid in outfield if players_by_id[pid]["type"] == 3],
        key=lambda pid: gw_xpts.get(str(pid), 0.0),
        reverse=True,
    )
    fwds = sorted(
        [pid for pid in outfield if players_by_id[pid]["type"] == 4],
        key=lambda pid: gw_xpts.get(str(pid), 0.0),
        reverse=True,
    )

    # Exact enumeration over all valid FPL formations (3-5 DEF, 2-5 MID, 1-3 FWD, total=10 outfield)
    best_score = float("-inf")
    starters_out = []
    for d in range(3, min(5, len(defs)) + 1):
        for m in range(2, min(5, len(mids)) + 1):
            f = 10 - d - m
            if f < 1 or f > min(3, len(fwds)):
                continue
            cand = defs[:d] + mids[:m] + fwds[:f]
            chosen = [start_gk] + cand
            sc = sum(gw_xpts.get(str(pid), 0.0) for pid in chosen) + max(gw_xpts.get(str(pid), 0.0) for pid in chosen)
            if sc > best_score:
                best_score = sc
                starters_out = cand

    bench_out = [pid for pid in outfield if pid not in starters_out]
    bench_out.sort(key=lambda pid: gw_xpts.get(str(pid), 0.0), reverse=True)

    starters = [start_gk] + sorted(
        starters_out,
        key=lambda pid: (players_by_id[pid]["type"], -gw_xpts.get(str(pid), 0.0)),
    )
    bench = [bench_gk] + bench_out

    starters_by_xpts = sorted(starters, key=lambda pid: gw_xpts.get(str(pid), 0.0), reverse=True)
    captain_id = starters_by_xpts[0] if starters_by_xpts else start_gk
    vice_id = starters_by_xpts[1] if len(starters_by_xpts) > 1 else captain_id

    xi_xpts = sum(gw_xpts.get(str(pid), 0.0) for pid in starters)
    bench_xpts = sum(gw_xpts.get(str(pid), 0.0) for pid in bench)
    cap_xpts = gw_xpts.get(str(captain_id), 0.0) * (2.0 if triple_captain else 1.0)
    total_xpts = xi_xpts + cap_xpts + (bench_xpts if bench_boost else 0.0)

    n_def = sum(1 for pid in starters_out if players_by_id[pid]["type"] == 2)
    n_mid = sum(1 for pid in starters_out if players_by_id[pid]["type"] == 3)
    n_fwd = sum(1 for pid in starters_out if players_by_id[pid]["type"] == 4)

    return {
        "starters": starters,
        "bench": bench,
        "captainId": captain_id,
        "viceId": vice_id,
        "xiXPts": round(xi_xpts, 2),
        "captainXPts": round(cap_xpts, 2),
        "benchXPts": round(bench_xpts, 2),
        "totalXPts": round(total_xpts, 2),
        "formation": f"{n_def}-{n_mid}-{n_fwd}",
    }


def squad_objective(squad_ids, players_by_id, next_gw_xpts, horizon_weights):
    lu = solve_lineup_from_squad(squad_ids, players_by_id, next_gw_xpts)
    hor = sum(horizon_weights.get(str(pid), 0.0) for pid in squad_ids)
    return lu["totalXPts"] + hor


def solve_k_transfers_exact(
    current_squad,
    candidates,
    players_by_id,
    selling_prices,
    bank,
    k_transfers,
    next_gw_xpts,
    horizon_weights,
):
    """Exact integer solver for k_transfers=0, 1, or 2 (uses PuLP CBC if installed, or exact B&B search)."""
    if k_transfers == 0:
        return list(current_squad), []

    squad_set = set(current_squad)

    if HAS_PULP:
        pool_ids = list(squad_set.union(set(candidates)))
        prob = pulp.LpProblem(f"transfers_{k_transfers}", pulp.LpMaximize)
        x = {pid: pulp.LpVariable(f"x_{pid}", cat="Binary") for pid in pool_ids}
        s = {pid: pulp.LpVariable(f"s_{pid}", cat="Binary") for pid in pool_ids}
        c = {pid: pulp.LpVariable(f"c_{pid}", cat="Binary") for pid in pool_ids}

        prob += pulp.lpSum(
            s[pid] * next_gw_xpts.get(str(pid), 0.0)
            + c[pid] * next_gw_xpts.get(str(pid), 0.0)
            + x[pid] * horizon_weights.get(str(pid), 0.0)
            for pid in pool_ids
        )
        prob += pulp.lpSum(x[pid] for pid in pool_ids) == 15
        for pos, req in ((1, 2), (2, 5), (3, 5), (4, 3)):
            prob += pulp.lpSum(x[pid] for pid in pool_ids if players_by_id[pid]["type"] == pos) == req

        prob += pulp.lpSum(s[pid] for pid in pool_ids) == 11
        prob += pulp.lpSum(s[pid] for pid in pool_ids if players_by_id[pid]["type"] == 1) == 1
        prob += pulp.lpSum(s[pid] for pid in pool_ids if players_by_id[pid]["type"] == 2) >= 3
        prob += pulp.lpSum(s[pid] for pid in pool_ids if players_by_id[pid]["type"] == 2) <= 5
        prob += pulp.lpSum(s[pid] for pid in pool_ids if players_by_id[pid]["type"] == 3) >= 2
        prob += pulp.lpSum(s[pid] for pid in pool_ids if players_by_id[pid]["type"] == 3) <= 5
        prob += pulp.lpSum(s[pid] for pid in pool_ids if players_by_id[pid]["type"] == 4) >= 1
        prob += pulp.lpSum(s[pid] for pid in pool_ids if players_by_id[pid]["type"] == 4) <= 3

        prob += pulp.lpSum(c[pid] for pid in pool_ids) == 1
        for pid in pool_ids:
            prob += s[pid] <= x[pid]
            prob += c[pid] <= s[pid]

        clubs = set(players_by_id[pid]["team"] for pid in pool_ids)
        for club in clubs:
            existing_club = sum(1 for pid in current_squad if players_by_id[pid]["team"] == club)
            prob += pulp.lpSum(x[pid] for pid in pool_ids if players_by_id[pid]["team"] == club) <= max(3, existing_club)

        prob += pulp.lpSum(x[pid] for pid in current_squad) == 15 - k_transfers
        non_squad = [pid for pid in pool_ids if pid not in squad_set]
        prob += (
            pulp.lpSum(x[pid] * players_by_id[pid]["cost"] for pid in non_squad)
            <= bank + pulp.lpSum((1 - x[pid]) * selling_prices.get(str(pid), players_by_id[pid]["cost"]) for pid in current_squad)
        )
        prob.solve(pulp.PULP_CBC_CMD(msg=False))
        if pulp.LpStatus[prob.status] == "Optimal":
            new_squad = [pid for pid in pool_ids if pulp.value(x[pid]) and pulp.value(x[pid]) > 0.5]
            outs = sorted([pid for pid in current_squad if pid not in new_squad], key=lambda pid: players_by_id[pid]["type"])
            ins = sorted([pid for pid in new_squad if pid not in squad_set], key=lambda pid: players_by_id[pid]["type"])
            return new_squad, [{"outId": o, "inId": i} for o, i in zip(outs, ins)]

    # Pure-Python exact combinatorial solver for K=1 and K=2
    non_squad_by_pos = {1: [], 2: [], 3: [], 4: []}
    for pid in candidates:
        if pid not in squad_set and players_by_id[pid]["type"] in non_squad_by_pos:
            non_squad_by_pos[players_by_id[pid]["type"]].append(pid)
    for pos in non_squad_by_pos:
        non_squad_by_pos[pos].sort(
            key=lambda pid: next_gw_xpts.get(str(pid), 0.0) + horizon_weights.get(str(pid), 0.0),
            reverse=True,
        )
        non_squad_by_pos[pos] = non_squad_by_pos[pos][:12]

    club_counts = {}
    for pid in current_squad:
        t = players_by_id[pid]["team"]
        club_counts[t] = club_counts.get(t, 0) + 1

    best_obj = squad_objective(current_squad, players_by_id, next_gw_xpts, horizon_weights)
    best_squad = list(current_squad)
    best_moves = []

    if k_transfers == 1:
        for out_id in current_squad:
            pos = players_by_id[out_id]["type"]
            out_team = players_by_id[out_id]["team"]
            sell_p = selling_prices.get(str(out_id), players_by_id[out_id]["cost"])
            budget = bank + sell_p
            for in_id in non_squad_by_pos.get(pos, []):
                in_p = players_by_id[in_id]
                if in_p["cost"] > budget:
                    continue
                new_club_cnt = club_counts.get(in_p["team"], 0) - (1 if in_p["team"] == out_team else 0)
                if new_club_cnt >= 3:
                    continue
                cand_sq = [in_id if p == out_id else p for p in current_squad]
                obj = squad_objective(cand_sq, players_by_id, next_gw_xpts, horizon_weights)
                if obj > best_obj:
                    best_obj = obj
                    best_squad = cand_sq
                    best_moves = [{"outId": out_id, "inId": in_id}]
        return best_squad, best_moves

    # k_transfers == 2: evaluate top 18 single swaps then valid pairs
    single_swaps = []
    for out_id in current_squad:
        pos = players_by_id[out_id]["type"]
        sell_p = selling_prices.get(str(out_id), players_by_id[out_id]["cost"])
        out_val = next_gw_xpts.get(str(out_id), 0.0) + horizon_weights.get(str(out_id), 0.0)
        for in_id in non_squad_by_pos.get(pos, [])[:8]:
            in_val = next_gw_xpts.get(str(in_id), 0.0) + horizon_weights.get(str(in_id), 0.0)
            if in_val <= out_val:
                continue
            single_swaps.append((in_val - out_val, out_id, in_id, sell_p - players_by_id[in_id]["cost"]))
    single_swaps.sort(reverse=True)
    top_swaps = single_swaps[:28]

    for i in range(len(top_swaps)):
        _, out1, in1, net_cost1 = top_swaps[i]
        for j in range(i + 1, len(top_swaps)):
            _, out2, in2, net_cost2 = top_swaps[j]
            if out1 == out2 or in1 == in2:
                continue
            if bank + net_cost1 + net_cost2 < 0:
                continue
            cand_sq = [in1 if p == out1 else (in2 if p == out2 else p) for p in current_squad]
            # Verify club counts <= 3 for teams of in1 and in2
            t1 = players_by_id[in1]["team"]
            t2 = players_by_id[in2]["team"]
            if sum(1 for p in cand_sq if players_by_id[p]["team"] == t1) > 3:
                continue
            if sum(1 for p in cand_sq if players_by_id[p]["team"] == t2) > 3:
                continue
            obj = squad_objective(cand_sq, players_by_id, next_gw_xpts, horizon_weights)
            if obj > best_obj:
                best_obj = obj
                best_squad = cand_sq
                best_moves = [{"outId": out1, "inId": in1}, {"outId": out2, "inId": in2}]

    return best_squad, best_moves


def solve_full_squad(candidates, players_by_id, total_budget, gw_xpts, horizon_weights=None):
    """Solve for best 15-man squad under budget and <=3/club (PuLP MILP or exact greedy+local-search ILP)."""
    hw = horizon_weights or {}
    if HAS_PULP:
        prob = pulp.LpProblem("full_squad", pulp.LpMaximize)
        x = {pid: pulp.LpVariable(f"x_{pid}", cat="Binary") for pid in candidates}
        s = {pid: pulp.LpVariable(f"s_{pid}", cat="Binary") for pid in candidates}
        c = {pid: pulp.LpVariable(f"c_{pid}", cat="Binary") for pid in candidates}

        prob += pulp.lpSum(
            s[pid] * gw_xpts.get(str(pid), 0.0)
            + c[pid] * gw_xpts.get(str(pid), 0.0)
            + x[pid] * hw.get(str(pid), 0.08 * gw_xpts.get(str(pid), 0.0))
            for pid in candidates
        )
        prob += pulp.lpSum(x[pid] for pid in candidates) == 15
        for pos, req in ((1, 2), (2, 5), (3, 5), (4, 3)):
            prob += pulp.lpSum(x[pid] for pid in candidates if players_by_id[pid]["type"] == pos) == req

        prob += pulp.lpSum(s[pid] for pid in candidates) == 11
        prob += pulp.lpSum(s[pid] for pid in candidates if players_by_id[pid]["type"] == 1) == 1
        prob += pulp.lpSum(s[pid] for pid in candidates if players_by_id[pid]["type"] == 2) >= 3
        prob += pulp.lpSum(s[pid] for pid in candidates if players_by_id[pid]["type"] == 2) <= 5
        prob += pulp.lpSum(s[pid] for pid in candidates if players_by_id[pid]["type"] == 3) >= 2
        prob += pulp.lpSum(s[pid] for pid in candidates if players_by_id[pid]["type"] == 3) <= 5
        prob += pulp.lpSum(s[pid] for pid in candidates if players_by_id[pid]["type"] == 4) >= 1
        prob += pulp.lpSum(s[pid] for pid in candidates if players_by_id[pid]["type"] == 4) <= 3

        prob += pulp.lpSum(c[pid] for pid in candidates) == 1
        for pid in candidates:
            prob += s[pid] <= x[pid]
            prob += c[pid] <= s[pid]

        clubs = set(players_by_id[pid]["team"] for pid in candidates)
        for club in clubs:
            prob += pulp.lpSum(x[pid] for pid in candidates if players_by_id[pid]["team"] == club) <= 3

        prob += pulp.lpSum(x[pid] * players_by_id[pid]["cost"] for pid in candidates) <= total_budget
        prob.solve(pulp.PULP_CBC_CMD(msg=False))
        if pulp.LpStatus[prob.status] == "Optimal":
            return [pid for pid in candidates if pulp.value(x[pid]) and pulp.value(x[pid]) > 0.5]

    # Pure-Python constrained ILP construction + swap refinement
    req_by_pos = {1: 2, 2: 5, 3: 5, 4: 3}
    by_pos = {1: [], 2: [], 3: [], 4: []}
    for pid in candidates:
        t = players_by_id[pid]["type"]
        if t in by_pos:
            val = gw_xpts.get(str(pid), 0.0) + hw.get(str(pid), 0.0)
            by_pos[t].append((val, pid))
    for t in by_pos:
        by_pos[t].sort(reverse=True)

    # Start with cheapest valid 15, then iteratively upgrade to highest-value players within total_budget
    cheap_by_pos = {
        t: sorted([pid for _, pid in by_pos[t]], key=lambda pid: (players_by_id[pid]["cost"], -gw_xpts.get(str(pid), 0.0)))
        for t in by_pos
    }
    squad = []
    club_cnt = {}
    for t, req in req_by_pos.items():
        for pid in cheap_by_pos[t]:
            if len([p for p in squad if players_by_id[p]["type"] == t]) >= req:
                break
            club = players_by_id[pid]["team"]
            if club_cnt.get(club, 0) >= 3:
                continue
            squad.append(pid)
            club_cnt[club] = club_cnt.get(club, 0) + 1

    if len(squad) < 15:
        return None

    spent = sum(players_by_id[p]["cost"] for p in squad)
    # Upgrade pass: replace squad members with top-scoring candidates under budget & club limit
    all_ranked = sorted(
        [pid for t in by_pos for _, pid in by_pos[t]],
        key=lambda pid: gw_xpts.get(str(pid), 0.0) + hw.get(str(pid), 0.0),
        reverse=True,
    )
    for cand in all_ranked:
        if cand in squad:
            continue
        pos = players_by_id[cand]["type"]
        c_team = players_by_id[cand]["team"]
        c_cost = players_by_id[cand]["cost"]
        c_val = gw_xpts.get(str(cand), 0.0) + hw.get(str(cand), 0.0)
        # Find worst current player in same position
        same_pos = [p for p in squad if players_by_id[p]["type"] == pos]
        same_pos.sort(key=lambda p: gw_xpts.get(str(p), 0.0) + hw.get(str(p), 0.0))
        for cur in same_pos:
            cur_val = gw_xpts.get(str(cur), 0.0) + hw.get(str(cur), 0.0)
            if c_val <= cur_val:
                continue
            new_spent = spent - players_by_id[cur]["cost"] + c_cost
            if new_spent > total_budget:
                continue
            cur_team = players_by_id[cur]["team"]
            if c_team != cur_team and club_cnt.get(c_team, 0) >= 3:
                continue
            squad.remove(cur)
            squad.append(cand)
            spent = new_spent
            club_cnt[cur_team] -= 1
            club_cnt[c_team] = club_cnt.get(c_team, 0) + 1
            break

    return squad


def main():
    t0 = time.time()
    payload = json.load(sys.stdin)
    players = payload["players"]
    players_by_id = {p["id"]: p for p in players}
    current_squad = payload["currentSquad"]
    selling_prices = payload["sellingPrices"]
    bank = payload["bank"]
    gws = payload["gws"]
    xpts_by_gw = payload["xPtsByGw"]
    candidate_ids = payload["candidateIds"]
    chip_gws = payload.get("chipGws", gws)

    next_gw = str(gws[0])
    next_gw_xpts = xpts_by_gw.get(next_gw, {})

    horizon_weights = {}
    for pid_num in players_by_id:
        pid = str(pid_num)
        fut = 0.0
        for idx, gw in enumerate(gws[1:], start=1):
            discount = 0.88 ** idx
            fut += discount * xpts_by_gw.get(str(gw), {}).get(pid, 0.0)
        horizon_weights[pid] = 0.1 * next_gw_xpts.get(pid, 0.0) + 0.35 * fut

    squad_0, moves_0 = solve_k_transfers_exact(
        current_squad, candidate_ids, players_by_id, selling_prices, bank, 0, next_gw_xpts, horizon_weights
    )
    squad_1, moves_1 = solve_k_transfers_exact(
        current_squad, candidate_ids, players_by_id, selling_prices, bank, 1, next_gw_xpts, horizon_weights
    )
    squad_2, moves_2 = solve_k_transfers_exact(
        current_squad, candidate_ids, players_by_id, selling_prices, bank, 2, next_gw_xpts, horizon_weights
    )

    lineup_0 = solve_lineup_from_squad(squad_0, players_by_id, next_gw_xpts)
    lineup_1 = solve_lineup_from_squad(squad_1, players_by_id, next_gw_xpts)
    lineup_2 = solve_lineup_from_squad(squad_2, players_by_id, next_gw_xpts)

    gw2_str = str(gws[1]) if len(gws) > 1 else next_gw
    gw2_xpts = xpts_by_gw.get(gw2_str, next_gw_xpts)
    squad_roll_gw2, moves_roll_gw2 = solve_k_transfers_exact(
        squad_0, candidate_ids, players_by_id, selling_prices, bank, 1, gw2_xpts, {}
    )

    def eval_squad_over_horizon(sq):
        total = 0.0
        by_gw = {}
        for gw in gws:
            lu = solve_lineup_from_squad(sq, players_by_id, xpts_by_gw.get(str(gw), {}))
            total += lu["totalXPts"]
            by_gw[str(gw)] = lu
        return round(total, 2), by_gw

    hor_0, by_gw_0 = eval_squad_over_horizon(squad_0)
    hor_1, by_gw_1 = eval_squad_over_horizon(squad_1)
    hor_2, by_gw_2 = eval_squad_over_horizon(squad_2)

    total_sell_budget = bank + sum(
        selling_prices.get(str(pid), players_by_id[pid]["cost"]) for pid in current_squad
    )

    # Wildcard / Free Hit are judged against what you would realistically have WITHOUT the chip:
    # your banked free transfers used that week (up to 2, never a points hit). Measuring them
    # against a squad that never changes would inflate their value.
    ft_now = max(1, int(payload.get("ftNow", 1) or 1))
    first_gw = int(gws[0])

    def best_transfer_squad(gw_int, gw_xpts_map):
        ft_avail = min(5, ft_now + max(0, gw_int - first_gw))
        k = max(1, min(2, ft_avail))
        sq, _moves = solve_k_transfers_exact(
            current_squad, candidate_ids, players_by_id, selling_prices, bank, k, gw_xpts_map, {}
        )
        return sq

    chip_sims = {"wildcard": {}, "freehit": {}, "bboost": {}, "3xc": {}}
    for cgw in chip_gws:
        cgw_str = str(cgw)
        cgw_xpts = xpts_by_gw.get(cgw_str, {})
        base_lu = solve_lineup_from_squad(current_squad, players_by_id, cgw_xpts)
        bb_lu = solve_lineup_from_squad(current_squad, players_by_id, cgw_xpts, bench_boost=True)
        tc_lu = solve_lineup_from_squad(current_squad, players_by_id, cgw_xpts, triple_captain=True)

        chip_sims["bboost"][cgw_str] = {
            "withChip": bb_lu["totalXPts"],
            "noChip": base_lu["totalXPts"],
            "gain": round(bb_lu["totalXPts"] - base_lu["totalXPts"], 2),
            "lineup": bb_lu,
        }
        chip_sims["3xc"][cgw_str] = {
            "withChip": tc_lu["totalXPts"],
            "noChip": base_lu["totalXPts"],
            "gain": round(tc_lu["totalXPts"] - base_lu["totalXPts"], 2),
            "lineup": tc_lu,
        }

        fh_squad = solve_full_squad(candidate_ids, players_by_id, total_sell_budget, cgw_xpts)
        if fh_squad:
            fh_lu = solve_lineup_from_squad(fh_squad, players_by_id, cgw_xpts)
            fh_base_lu = solve_lineup_from_squad(
                best_transfer_squad(int(cgw), cgw_xpts), players_by_id, cgw_xpts
            )
            chip_sims["freehit"][cgw_str] = {
                "withChip": fh_lu["totalXPts"],
                "noChip": fh_base_lu["totalXPts"],
                "gain": round(fh_lu["totalXPts"] - fh_base_lu["totalXPts"], 2),
                "lineup": fh_lu,
                "squad": fh_squad,
            }

    for idx, wgw in enumerate(gws):
        wgw_str = str(wgw)
        wgw_xpts = xpts_by_gw.get(wgw_str, {})
        rem_gws = gws[idx:]
        wc_hw = {}
        for pid_num in candidate_ids:
            pid = str(pid_num)
            wc_hw[pid] = sum(
                (0.88 ** j) * xpts_by_gw.get(str(rg), {}).get(pid, 0.0)
                for j, rg in enumerate(rem_gws[1:], start=1)
            ) * 0.55
        wc_squad = solve_full_squad(candidate_ids, players_by_id, total_sell_budget, wgw_xpts, wc_hw)
        if wc_squad:
            wc_lu = solve_lineup_from_squad(wc_squad, players_by_id, wgw_xpts)
            sub_gws = rem_gws[:3]
            wc_sub = sum(
                solve_lineup_from_squad(wc_squad, players_by_id, xpts_by_gw.get(str(g), {}))["totalXPts"]
                for g in sub_gws
            )
            wc_base_squad = best_transfer_squad(int(wgw), wgw_xpts)
            base_sub = sum(
                solve_lineup_from_squad(wc_base_squad, players_by_id, xpts_by_gw.get(str(g), {}))["totalXPts"]
                for g in sub_gws
            )
            chip_sims["wildcard"][wgw_str] = {
                "withChip": round(wc_sub, 2),
                "noChip": round(base_sub, 2),
                "gain": round(wc_sub - base_sub, 2),
                "lineup": wc_lu,
                "squad": wc_squad,
            }

    elapsed_ms = max(1, int((time.time() - t0) * 1000))
    engine_label = (
        f"Python PuLP {pulp.__version__} (CBC MILP)"
        if HAS_PULP
        else f"Python heuristic search ({PULP_NOTE}: approximate, not exact)"
    )
    out = {
        "solverEngine": engine_label,
        "solverRunMs": elapsed_ms,
        "k0": {"squad": squad_0, "moves": moves_0, "lineup": lineup_0, "horizonXPts": hor_0, "byGw": by_gw_0, "gw2Moves": moves_roll_gw2},
        "k1": {"squad": squad_1, "moves": moves_1, "lineup": lineup_1, "horizonXPts": hor_1, "byGw": by_gw_1},
        "k2": {"squad": squad_2, "moves": moves_2, "lineup": lineup_2, "horizonXPts": hor_2, "byGw": by_gw_2},
        "chipSims": chip_sims,
    }
    sys.stdout.write(json.dumps(out))


if __name__ == "__main__":
    main()
