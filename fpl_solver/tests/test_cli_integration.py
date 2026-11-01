import json
import subprocess
import sys
from pathlib import Path

from fpl_solver.models import SolveRequest
from fpl_solver.solver import solve

DATA = json.loads((Path(__file__).parent.parent / "examples/sample_input.json").read_text())


def test_zero_free_transfers_are_legal_and_charged_hits():
    payload = json.loads(json.dumps(DATA))
    payload["current_team"]["free_transfers"] = 0
    payload["settings"].update({
        "end_gw": 1, "solutions_requested": 1, "transfer_depth": 1,
        "time_limit_seconds": 4, "mip_gap": 0.02,
        "free_transfer_value": 0, "bank_value_per_million": 0,
        "forced_transfers": [{"gw": 1, "player_out": 15, "player_in": 24}],
        "max_total_hits": 8,
    })
    for player in payload["players"]:
        player["xmin_by_gw"]["1"] = None
        player["availability_by_gw"]["1"] = None
    request = SolveRequest.model_validate(payload)
    result = solve(request)
    assert result["plans"], "A feasible initial squad and 1-transfer path must exist"
    week = result["plans"][0]["gameweeks"][0]
    assert week["free_transfers_before"] == 0
    assert week["hit_cost"] == 4 * len(week["transfers_in"])
    assert week["free_transfers_after"] == 1
    assert 24 in week["transfers_in"]


def test_bounded_cli_returns_json_and_rejects_unsupported_chips():
    payload = json.loads(json.dumps(DATA))
    payload["settings"].update({
        "end_gw": 1, "solutions_requested": 1, "time_limit_seconds": 4,
        "free_transfer_value": 0, "bank_value_per_million": 0,
    })
    result = subprocess.run(
        [sys.executable, "-m", "fpl_solver.cli"],
        input=json.dumps(payload), text=True, capture_output=True, timeout=12, check=False,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["plans"]
    payload["settings"]["chips_mode"] = "solver_decides"
    bad = subprocess.run(
        [sys.executable, "-m", "fpl_solver.cli"],
        input=json.dumps(payload), text=True, capture_output=True, timeout=12, check=False,
    )
    assert bad.returncode == 2
    assert "Invalid or unsupported" in bad.stderr
    assert not bad.stdout

def test_bounded_cli_can_return_distinct_alternative_transfer_paths_without_extra_time():
    payload = json.loads(json.dumps(DATA))
    payload["settings"].update({
        "end_gw": 2, "solutions_requested": 3, "time_limit_seconds": 9,
        "mip_gap": 0.02, "free_transfer_value": 0,
        "bank_value_per_million": 0,
    })
    result = subprocess.run(
        [sys.executable, "-m", "fpl_solver.cli"],
        input=json.dumps(payload), text=True, capture_output=True, timeout=14, check=False,
    )
    assert result.returncode == 0, result.stderr
    parsed = json.loads(result.stdout)
    assert 1 <= len(parsed["plans"]) <= 3
    assert len(parsed["solver_attempts"]) >= len(parsed["plans"])
    signatures = [
        tuple((w["gw"], tuple(sorted(w["transfers_in"]))) for w in plan["gameweeks"])
        for plan in parsed["plans"]
    ]
    assert len(signatures) == len(set(signatures)), "No-good cuts must prevent duplicate full transfer paths"
    for plan in parsed["plans"]:
        assert len(plan["gameweeks"]) == 2
        assert isinstance(plan["solver"]["optimality_proven"], bool)
        assert all(w["hit_cost"] >= 0 and w["bank"] >= 0 for w in plan["gameweeks"])
    payload["settings"]["solutions_requested"] = 4
    invalid = subprocess.run(
        [sys.executable, "-m", "fpl_solver.cli"],
        input=json.dumps(payload), text=True, capture_output=True, timeout=4, check=False,
    )
    assert invalid.returncode == 2
    assert not invalid.stdout
