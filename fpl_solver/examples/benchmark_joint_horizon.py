"""Reproducible 40-player / 10-GW stress test for the joint chip MILP.

SYNTHETIC projections and clubs only. This is a feasibility/performance
regression fixture, not a prediction or a verified FPL manager account.
Run: python -m fpl_solver.examples.benchmark_joint_horizon
"""
from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import resource
import sys
from time import monotonic

from fpl_solver.models import SolveRequest
from fpl_solver.solver import solve

SAMPLE = Path(__file__).with_name("sample_input.json")
POSITIONS = ("GK", "DEF", "MID", "FWD")


def stress_request(*, candidate_count: int = 40, horizon: int = 10) -> SolveRequest:
    """Deterministic legal 15/30/40-player pool and 1–10-GW horizon."""
    if candidate_count not in (30, 40) or not 1 <= horizon <= 10:
        raise ValueError("Benchmark supports 30 or 40 candidates over 1–10 GWs.")
    source = json.loads(SAMPLE.read_text())
    all_players = source["players"]
    additions = ("GK", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "DEF", "GK")
    for i, position in enumerate(additions):
        seed = next(player for player in all_players if player["position"] == position)
        player = deepcopy(seed)
        player.update({
            "player_id": 31 + i,
            "name": f"Synthetic candidate {31 + i}",
            "team_id": 11 + i,
            "position": position,
            "selling_price": None,
            "current_price": [4.5, 4.7, 5.2, 6.5, 8.0, 5.0, 5.5, 7.0, 5.4, 4.0][i],
        })
        all_players.append(player)
    source["players"] = all_players[:candidate_count]
    source["current_team"].update({
        "current_gameweek": 20, "bank": 4.0, "free_transfers": 2,
    })
    settings = source["settings"]
    settings.update({
        "start_gw": 20, "end_gw": 19 + horizon,
        "transfer_depth": horizon, "max_transfers_per_gw": 2,
        "max_total_hits": 16, "time_decay": 0.85,
        "mip_gap": 0.05, "time_limit_seconds": 10,
        "solutions_requested": 1,
        "free_transfer_value": 0.0, "bank_value_per_million": 0.0,
        "scoring_chip_halves": {"bench_boost": [2], "triple_captain": [2]},
        "squad_chip_halves": {"wildcard": [2], "free_hit": [2]},
        "forced_chip_uses": {}, "first_half_fh_used_gw19": False,
    })
    position_base = {"GK": 3.0, "DEF": 3.5, "MID": 4.5, "FWD": 4.1}
    for player in source["players"]:
        pid = player["player_id"]
        for key in ("xpts_by_gw", "xmin_by_gw", "availability_by_gw", "has_fixture_by_gw"):
            player[key] = {}
        for gw in range(20, 20 + horizon):
            is_blank = pid % 13 == 0 and gw % 5 == 3
            # A few doubles/high-return weeks and changing relative rankings.
            is_double = pid % 7 == 0 and gw in (22, 25, 28)
            baseline = (position_base[player["position"]] +
                        (pid % 9) * 0.17 +
                        ((gw - 20) * (pid % 5 + 1)) % 7 * .12)
            if pid in (24, 32, 36, 39):
                baseline += 1.8
            xpts = 0.0 if is_blank else round(baseline * (1.65 if is_double else 1), 3)
            player["xpts_by_gw"][str(gw)] = xpts
            player["xmin_by_gw"][str(gw)] = 0 if is_blank else 75.0
            player["availability_by_gw"][str(gw)] = 0.95
            player["has_fixture_by_gw"][str(gw)] = not is_blank
    return SolveRequest.model_validate(source)


def benchmark() -> dict:
    request = stress_request()
    beginning = monotonic()
    try:
        result = solve(request)
    except Exception as exc:
        return {
            "benchmark": "synthetic-40-players-10-GW-all-chips",
            "feasible": False, "error_type": type(exc).__name__,
            "elapsed_seconds": round(monotonic() - beginning, 3),
        }
    status = result["solver_attempts"][0] if result["solver_attempts"] else {}
    plan = result["plans"][0] if result["plans"] else None
    return {
        "benchmark": "synthetic-40-players-10-GW-all-chips",
        "player_count": len(request.players),
        "gameweeks": request.settings.end_gw - request.settings.start_gw + 1,
        "max_time_seconds": request.settings.time_limit_seconds,
        "feasible": bool(plan),
        "status": status.get("status"),
        "status_message": status.get("message"),
        "mip_gap": status.get("mip_gap"),
        "optimality_proven": status.get("optimality_proven", False),
        "elapsed_seconds": round(monotonic() - beginning, 3),
        "max_rss_kb": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "chip_schedule": [
            {"gw": w["gw"], "chip": w["chip"]}
            for w in (plan["gameweeks"] if plan else []) if w["chip"]
        ],
        "raw_expected_model_points": (
            plan["raw_expected_points_after_hits"] if plan else None
        ),
    }


def main() -> int:
    report = benchmark()
    print(json.dumps(report, sort_keys=True))
    # Do not silently pass the release gate if the 10-second/40-player
    # workload produced NO independently verified feasible path.
    return 0 if report.get("feasible") else 3


if __name__ == "__main__":
    sys.exit(main())
