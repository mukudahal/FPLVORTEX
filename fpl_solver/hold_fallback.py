"""Fail-safe fixed-squad continuation for time-limited joint MILPs.

This is NOT a feasible incumbent found by HiGHS and NOT a jointly optimized
WC/FH transfer path. It is a genuinely feasible, independently replayed
hold-squad continuation with exactly optimized XI and optional BB/TC timing
*conditional on making no transfers*. It is provided only when the full
joint MILP times out without an incumbent; its provenance is explicit.
"""
from __future__ import annotations

from itertools import combinations
from math import inf

from .chip_replay import WeekAction, validate_proposed_chip_path
from .models import QUOTAS, SolveRequest


def verified_hold_scoring_fallback(request: SolveRequest, status: dict) -> dict | None:
    s, team = request.settings, request.current_team
    # Never override caller-committed transfers/chips, or promise that an
    # excluded starting player can be held. The baseline is optional.
    if (s.forced_chip_uses or s.forced_transfers or
        set(s.excluded_players) & set(team.squad_player_ids)):
        return None
    by_id = {p.player_id: p for p in request.players}
    owned = tuple(team.squad_player_ids)
    available = {
        'wildcard': set(s.squad_chip_halves.get('wildcard', [])),
        'free_hit': set(s.squad_chip_halves.get('free_hit', [])),
        'bench_boost': set(s.scoring_chip_halves.get('bench_boost', [])),
        'triple_captain': set(s.scoring_chip_halves.get('triple_captain', [])),
    }
    lineups: list[tuple[tuple[int, ...], int, int, list[int]]] = []
    bonuses: list[tuple[float, float]] = []
    gws = range(s.start_gw, s.end_gw + 1)
    for gw in gws:
        best_xi: tuple[int, ...] | None = None
        best_captain: int | None = None
        best_score = -inf
        for lineup in combinations(owned, 11):
            if not s.allow_blank_starters and any(
                not by_id[pid].has_fixture_by_gw[gw] for pid in lineup
            ):
                continue
            pos = {key: sum(by_id[pid].position == key for pid in lineup)
                   for key in QUOTAS}
            if not (pos['GK'] == 1 and 3 <= pos['DEF'] <= 5 and
                    2 <= pos['MID'] <= 5 and 1 <= pos['FWD'] <= 3):
                continue
            captain = max(lineup, key=lambda pid: (by_id[pid].xpts_by_gw[gw], -pid))
            points = (sum(by_id[pid].xpts_by_gw[gw] for pid in lineup) +
                      by_id[captain].xpts_by_gw[gw])
            if points > best_score:
                best_score, best_xi, best_captain = points, lineup, captain
        if best_xi is None or best_captain is None:
            return None
        vice = max((pid for pid in best_xi if pid != best_captain),
                   key=lambda pid: (by_id[pid].xpts_by_gw[gw], -pid))
        bench = sorted((pid for pid in owned if pid not in best_xi),
                       key=lambda pid: (
                           by_id[pid].position != 'GK',
                           -by_id[pid].xpts_by_gw[gw], pid))
        lineups.append((best_xi, best_captain, vice, bench))
        bonuses.append((
            sum(by_id[pid].xpts_by_gw[gw] for pid in bench),
            by_id[best_captain].xpts_by_gw[gw],
        ))

    # With a fixed squad, zero transfer costs and fixed lineups, the best
    # possible BB/TC schedule is an exhaustive small 2-chip assignment
    # per half. BB and TC cannot occupy the same gameweek.
    choices: dict[int, str] = {}
    for half in (1, 2):
        in_half = [i for i,gw in enumerate(gws) if (1 if gw <= 19 else 2) == half]
        bb_candidates = ([None] + in_half if half in available['bench_boost'] else [None])
        tc_candidates = ([None] + in_half if half in available['triple_captain'] else [None])
        best = (0.0, None, None)
        for bb in bb_candidates:
            for tc in tc_candidates:
                if bb is not None and bb == tc:
                    continue
                value = (s.time_decay**bb * bonuses[bb][0] if bb is not None else 0.0)
                value += (s.time_decay**tc * bonuses[tc][1] if tc is not None else 0.0)
                if value > best[0]:
                    best = (value, bb, tc)
        if best[1] is not None:
            choices[s.start_gw + best[1]] = 'bench_boost'
        if best[2] is not None:
            choices[s.start_gw + best[2]] = 'triple_captain'

    actions = [
        WeekAction(gw=gw, chip=choices.get(gw),
                   starters=lineups[i][0], captain=lineups[i][1],
                   vice=lineups[i][2])
        for i, gw in enumerate(gws)
    ]
    # This independent engine must reject *any* overlooked budget/legality,
    # FT, chip inventory or points discrepancy. No unchecked fallback.
    replay = validate_proposed_chip_path(
        request, actions, verified_available=available,
    )
    raw = 0.0
    discounted = 0.0
    weeks = []
    for i, checked in enumerate(replay):
        gw = checked['gw']
        points = checked['expected_points_after_hits']
        raw += points
        discounted += s.time_decay**i * points
        weeks.append({
            'gw':gw, 'chip':checked['chip'],
            'chip_bonus':checked['chip_bonus'],
            'squad':list(checked['squad']),
            'permanent_squad_after':list(checked['permanent_squad_after']),
            'starters':list(checked['starters']),
            'bench':list(lineups[i][3]),
            'captain':checked['captain'],
            'vice_captain':checked['vice_captain'],
            'transfers_in':[], 'transfers_out':[],
            'temporary_transfers_in':[], 'temporary_transfers_out':[],
            'free_transfers_before':checked['free_transfers_before'],
            'free_transfers_after':checked['free_transfers_after'],
            'hit_cost':checked['hit_cost'],
            'bank':round(checked['bank_after_tenths']/10, 1),
            'temporary_bank':(round(checked['bank_after_tenths']/10,1)
                              if s.squad_chip_halves.get('free_hit') else None),
            'expected_points_after_hits':points,
        })
    # Replay again via the same top-level independent ledger validator that
    # guards every genuine HiGHS path.
    from .chip_replay import verify_joint_milp_ledger
    verify_joint_milp_ledger(request, weeks)

    after_ft = replay[-1]['free_transfers_after']
    final_bank = replay[-1]['bank_after_tenths'] / 10
    score = (discounted + s.free_transfer_value * after_ft +
             s.bank_value_per_million * final_bank)
    return {
        'method': 'independent_verified_hold_scoring_fallback',
        'gameweeks':weeks,
        'raw_expected_points_after_hits':round(raw,3),
        'discounted_points_after_hits':round(discounted,3),
        'evaluation_score':round(score,3),
        'solver':{
            **status, 'optimality_proven':False,
            'message':status.get('message','') +
            '; no full-MILP incumbent, independent hold/BB/TC baseline only',
        },
    }
