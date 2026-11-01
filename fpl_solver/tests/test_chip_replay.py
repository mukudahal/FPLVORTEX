"""Synthetic WC/FH/BB/TC replay: full state, price, FT and scoring invariants."""
import json
from pathlib import Path
import pytest
from fpl_solver.models import SolveRequest
from fpl_solver.chip_replay import WeekAction, validate_proposed_chip_path

DATA = json.loads((Path(__file__).parent.parent / "examples/sample_input.json").read_text())
ORIGINAL = tuple(DATA["current_team"]["squad_player_ids"])
XI = (1, 5, 6, 7, 15, 16, 17, 18, 25, 26, 27)
XI_WITH_24 = tuple(24 if p == 15 else p for p in XI)


def request(start=18, end=20, bank=4):
    data = json.loads(json.dumps(DATA))
    data["current_team"]["current_gameweek"] = start
    data["current_team"]["bank"] = bank
    data["settings"].update({
        "start_gw": start, "end_gw": end,
        "max_transfers_per_gw": 2, "time_decay": .85,
    })
    for p in data["players"]:
        for gw in range(start, end + 1):
            source = str(1 + (gw - start) % 5)
            for k in ("xpts_by_gw", "xmin_by_gw", "availability_by_gw", "has_fixture_by_gw"):
                p[k][str(gw)] = p[k][source]
    return SolveRequest.model_validate(data)


def week(gw, *, chip=None, transfers=(), temp=(), changed=False):
    return WeekAction(
        gw=gw, transfers=tuple(transfers), temporary_squad=tuple(temp),
        chip=chip, starters=XI_WITH_24 if changed else XI,
        captain=25, vice=26,
    )


def temp_swap(out=15, incoming=24):
    return tuple(incoming if p == out else p for p in ORIGINAL)


def test_free_hit_budget_team_and_original_sale_basis_restore():
    req = request(start=18, end=19)
    result = validate_proposed_chip_path(req, [
        week(18, chip="free_hit", temp=temp_swap(), changed=True),
        week(19),
    ], verified_available={"free_hit": {1}})
    first, second = result
    assert first["chip"] == "free_hit"
    assert first["temporary_bank_tenths"] == 39
    assert first["bank_after_tenths"] == 40
    assert first["permanent_squad_after"] == sorted(ORIGINAL)
    assert first["sales"] == [{"id": 15, "price_tenths": 49}]
    assert first["purchases"] == [{"id": 24, "price_tenths": 50}]
    assert first["free_transfers_before"] == first["free_transfers_after"] == 2
    assert first["hit_cost"] == 0
    assert second["squad"] == sorted(ORIGINAL)
    assert second["bank_after_tenths"] == 40
    assert second["free_transfers_after"] == 3, "non-chip banked FT rolls next GW"


def test_wildcard_rebuild_is_permanent_free_and_preserves_banked_ft():
    req = request(start=18, end=20)
    result = validate_proposed_chip_path(req, [
        week(18, chip="wildcard", transfers=((15, 24),), changed=True),
        week(19, transfers=((24, 15),)),
        week(20),
    ], verified_available={"wildcard": {1}})
    first, second, third = result
    assert first["bank_after_tenths"] == 39
    assert first["permanent_squad_after"] == sorted(temp_swap())
    assert first["hit_cost"] == 0 and first["free_transfers_after"] == 2
    assert second["sales"] == [{"id": 24, "price_tenths": 50}]
    assert second["purchases"] == [{"id": 15, "price_tenths": 50}]
    assert second["bank_after_tenths"] == 39
    assert second["free_transfers_after"] == 2
    assert third["free_transfers_after"] == 3


def test_bench_boost_triple_captain_different_halves_and_exact_bonus():
    req = request(start=19, end=20)
    result = validate_proposed_chip_path(req, [
        week(19, chip="bench_boost"),
        week(20, chip="triple_captain"),
    ], verified_available={"bench_boost": {1}, "triple_captain": {2}})
    pmap = {p.player_id: p for p in req.players}
    bench = set(ORIGINAL) - set(XI)
    assert result[0]["chip_bonus"] == pytest.approx(
        sum(pmap[pid].xpts_by_gw[19] for pid in bench), abs=.001)
    assert result[1]["chip_bonus"] == pytest.approx(
        pmap[25].xpts_by_gw[20], abs=.001)


def test_known_half_inventory_limits_and_fh_consecutive_cross_half():
    req = request(start=19, end=20)
    with pytest.raises(ValueError, match="consecutive"):
        validate_proposed_chip_path(req, [
            week(19, chip="free_hit", temp=temp_swap(), changed=True),
            week(20, chip="free_hit", temp=temp_swap(), changed=True),
        ], verified_available={"free_hit": {1, 2}})
    with pytest.raises(ValueError, match="already used"):
        validate_proposed_chip_path(request(start=18, end=19), [
            week(18, chip="bench_boost"),
            week(19, chip="bench_boost"),
        ], verified_available={"bench_boost": {1}})
    with pytest.raises(ValueError, match="unavailable"):
        validate_proposed_chip_path(request(start=18, end=19), [
            week(18, chip="free_hit", temp=temp_swap(), changed=True),
            week(19),
        ], verified_available={})


def test_prices_and_ownership_fail_closed_including_temporary_budget():
    with pytest.raises(ValueError, match="budget"):
        validate_proposed_chip_path(request(start=18, end=19, bank=0), [
            week(18, chip="free_hit", temp=temp_swap(), changed=True),
            week(19),
        ], verified_available={"free_hit": {1}})
    with pytest.raises(ValueError, match="negative bank"):
        validate_proposed_chip_path(request(start=18, end=19, bank=0), [
            week(18, transfers=((15, 24),), changed=True),
            week(19),
        ], verified_available={})
    with pytest.raises(ValueError, match="duplicate"):
        validate_proposed_chip_path(request(start=18, end=19), [
            week(18, transfers=((15, 24), (15, 24)), changed=True),
            week(19),
        ], verified_available={})


def test_gw1_wc_and_fh_are_blocked_even_when_offered_as_available():
    for chip in ("wildcard", "free_hit"):
        action = week(1, chip=chip, temp=temp_swap(), changed=True) if chip == "free_hit" else (
            week(1, chip=chip, transfers=((15, 24),), changed=True))
        with pytest.raises(ValueError, match="GW1"):
            validate_proposed_chip_path(request(start=1, end=1), [action],
                                       verified_available={chip: {1}})


def test_fh_excluded_locked_player_or_illegal_formation_is_rejected():
    req = request(start=18, end=18)
    req.settings.locked_players = [15]
    with pytest.raises(ValueError, match="locked"):
        validate_proposed_chip_path(req, [
            week(18, chip="free_hit", temp=temp_swap(), changed=True),
        ], verified_available={"free_hit": {1}})
    with pytest.raises(ValueError, match="XI"):
        validate_proposed_chip_path(request(start=18, end=18), [
            WeekAction(gw=18, starters=(1, 2), captain=1, vice=2),
        ], verified_available={})
