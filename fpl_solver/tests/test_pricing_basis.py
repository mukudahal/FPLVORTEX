"""P0-A08: sale basis is consumed exactly once, even with later rebuys.

The small example is synthetic, not a prediction or live FPL squad.
Official 2026/27 rule: a player keeps half the increase, rounded down
to £0.1m, but loses the full decrease. The original FPL entry provides
an effective selling price; fixed future price scenarios do not invent
future price rises.
"""
import json
from pathlib import Path
import pytest
from pydantic import ValidationError
from fpl_solver.models import SolveRequest
from fpl_solver.solver import solve

DATA = json.loads((Path(__file__).parent.parent / "examples/sample_input.json").read_text())


def pricing_request(bank=4.0, current=5.0, initial_sale=4.9):
    payload = json.loads(json.dumps(DATA))
    payload["current_team"]["bank"] = bank
    payload["settings"].update({
        "end_gw": 3, "max_transfers_per_gw": 1,
        "max_total_hits": 0, "solutions_requested": 1,
        "time_limit_seconds": 12, "mip_gap": .02,
        "free_transfer_value": 0, "bank_value_per_million": 0,
        "forced_transfers": [
            {"gw": 1, "player_out": 15, "player_in": 24},
            {"gw": 2, "player_out": 24, "player_in": 15},
            {"gw": 3, "player_out": 15, "player_in": 24},
        ],
    })
    player15 = next(p for p in payload["players"] if p["player_id"] == 15)
    player15["current_price"] = current
    player15["selling_price"] = initial_sale
    return payload


@pytest.mark.parametrize("current,sale", [(5.0, 4.9), (5.4, 5.2), (4.7, 4.7)])
def test_original_sale_rebuy_resale_uses_distinct_cost_bases(current, sale):
    payload = pricing_request(current=current, initial_sale=sale)
    req = SolveRequest.model_validate(payload)
    result = solve(req)
    assert result["plans"], "Legal sell/rebuy/resell sequence must remain feasible"
    weeks = result["plans"][0]["gameweeks"]
    assert [w["transfers_out"] for w in weeks] == [[15], [24], [15]]
    assert [w["transfers_in"] for w in weeks] == [[24], [15], [24]]
    # Week 1 first sale has the verified price basis; week 3 resells
    # player 15 at the new market-price cost basis, not the initial sale.
    expected_bank = 4 + sale - 5
    assert weeks[0]["bank"] == pytest.approx(expected_bank)
    assert weeks[1]["bank"] == pytest.approx(expected_bank + 5 - current)
    assert weeks[2]["bank"] == pytest.approx(expected_bank + 5 - current + current - 5)
    assert all(w["bank"] >= 0 and w["hit_cost"] == 0 for w in weeks)
    assert "first sale only" in result["assumptions"]["price_model"]


def test_insufficient_initial_sale_cash_is_not_subsidized_by_market_price():
    # £0 bank + £4.9 initial sale cannot buy a £5.0 replacement.
    # Treating the owned player's market price as cash would wrongly
    # make the forced GW1 transfer feasible.
    payload = pricing_request(bank=0)
    request = SolveRequest.model_validate(payload)
    result = solve(request)
    assert result["plans"] == []
    assert result["solver_attempts"][0]["status"] == 2


def test_rejects_unknown_initial_selling_price_and_non_tenth_prices():
    payload = pricing_request()
    owned = payload["current_team"]["squad_player_ids"][0]
    target = next(p for p in payload["players"] if p["player_id"] == owned)
    target["selling_price"] = None
    with pytest.raises(ValidationError, match="verified selling price"):
        SolveRequest.model_validate(payload)
    payload = pricing_request()
    target = next(p for p in payload["players"] if p["player_id"] == 15)
    target["selling_price"] = 4.95
    with pytest.raises(ValidationError):
        SolveRequest.model_validate(payload)
