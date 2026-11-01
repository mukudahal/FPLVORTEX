"""P0-A09 stage 1: jointly optimized BB/TC, transfers and FPL FT/lineup rules.

Synthetic fixture data; there is no claim that chip availability can be
assumed without official account history. WC/FH remain explicitly unsupported.
"""
import json
from pathlib import Path
from collections import Counter
import pytest
from pydantic import ValidationError
from fpl_solver.models import SolveRequest
from fpl_solver.solver import solve

DATA = json.loads((Path(__file__).parent.parent / 'examples/sample_input.json').read_text())


def request_with_windows(start=1, end=3, chips=None, transfers=0, solutions=1):
    payload = json.loads(json.dumps(DATA))
    payload['current_team']['current_gameweek'] = start
    payload['settings'].update({
        'start_gw': start, 'end_gw': end,
        'transfer_depth': end - start + 1, 'max_transfers_per_gw': transfers,
        'max_total_hits': 12, 'time_decay': 0.9, 'free_transfer_value': 0,
        'bank_value_per_million': 0, 'time_limit_seconds': 12,
        'solutions_requested': solutions, 'mip_gap': 0.001,
        'scoring_chip_halves': chips or {},
    })
    for p in payload['players']:
        original = p['xpts_by_gw']
        for gw in range(start, end + 1):
            sample_gw = (gw - start) % 5 + 1
            p['xpts_by_gw'][str(gw)] = original[str(sample_gw)]
            p['xmin_by_gw'][str(gw)] = p['xmin_by_gw'][str(sample_gw)]
            p['availability_by_gw'][str(gw)] = p['availability_by_gw'][str(sample_gw)]
            p['has_fixture_by_gw'][str(gw)] = p['has_fixture_by_gw'][str(sample_gw)]
    return SolveRequest.model_validate(payload)


def independently_replay_chip_points(plan, req):
    players = {p.player_id: p for p in req.players}
    for week in plan['gameweeks']:
        gw = week['gw']
        xi = sum(players[pid].xpts_by_gw[gw] for pid in week['starters'])
        captain = players[week['captain']].xpts_by_gw[gw]
        bench = sum(players[pid].xpts_by_gw[gw] for pid in week['bench'])
        chip = week['chip']
        bonus = bench if chip == 'bench_boost' else captain if chip == 'triple_captain' else 0
        assert week['chip_bonus'] == pytest.approx(bonus, abs=.001)
        assert week['expected_points_after_hits'] == pytest.approx(
            xi + captain + bonus - week['hit_cost'], abs=.001
        )
    raw = sum(w['expected_points_after_hits'] for w in plan['gameweeks'])
    weighted = sum(req.settings.time_decay**i * w['expected_points_after_hits']
                   for i, w in enumerate(plan['gameweeks']))
    assert plan['raw_expected_points_after_hits'] == pytest.approx(raw, abs=.005)
    assert plan['discounted_points_after_hits'] == pytest.approx(weighted, abs=.005)
    assert plan['evaluation_score'] == pytest.approx(weighted, abs=.005)


def test_scoring_chips_optional_and_never_fabricated():
    no_history = request_with_windows()
    result = solve(no_history)
    assert result['plans']
    assert result['assumptions']['chip_mode'] == 'off'
    assert all(w['chip'] is None and w['chip_bonus'] == 0
               for w in result['plans'][0]['gameweeks'])
    independently_replay_chip_points(result['plans'][0], no_history)


def test_bb_tc_are_joint_with_squad_lineup_captain_and_ft_decisions():
    req = request_with_windows(chips={'bench_boost': [1], 'triple_captain': [1]}, transfers=1)
    result = solve(req)
    assert result['plans'], result['solver_attempts']
    plan = result['plans'][0]
    seen = [w['chip'] for w in plan['gameweeks'] if w['chip']]
    assert Counter(seen) == Counter({'bench_boost': 1, 'triple_captain': 1})
    for week in plan['gameweeks']:
        assert week['free_transfers_after'] <= 5
        assert week['bank'] >= 0
        assert len(week['squad']) == 15 and len(week['starters']) == 11
    independently_replay_chip_points(plan, req)


def test_half_boundary_inventory_and_single_chip_per_gw():
    req = request_with_windows(
        start=19, end=21,
        chips={'bench_boost': [1, 2], 'triple_captain': [1, 2]},
    )
    result = solve(req)
    assert result['plans']
    weeks = result['plans'][0]['gameweeks']
    first = [w['chip'] for w in weeks if w['gw'] == 19 and w['chip']]
    second = [w['chip'] for w in weeks if w['gw'] >= 20 and w['chip']]
    assert len(first) <= 1
    assert Counter(second)['bench_boost'] <= 1
    assert Counter(second)['triple_captain'] <= 1
    assert len(second) <= 2
    independently_replay_chip_points(result['plans'][0], req)


def test_explicit_second_half_inventory_cannot_play_first_half_chips():
    req = request_with_windows(start=19, end=20,
        chips={'bench_boost': [2], 'triple_captain': [2]})
    result = solve(req)
    assert result['plans']
    assert result['plans'][0]['gameweeks'][0]['chip'] is None
    assert result['plans'][0]['gameweeks'][1]['chip'] in ('bench_boost', 'triple_captain')
    independently_replay_chip_points(result['plans'][0], req)


def test_invalid_or_doubled_chip_inventory_is_rejected_not_silently_assumed():
    data = json.loads(json.dumps(DATA))
    data['settings']['scoring_chip_halves'] = {'bench_boost': [1, 1]}
    with pytest.raises(ValidationError, match='Duplicate'):
        SolveRequest.model_validate(data)
    data['settings']['scoring_chip_halves'] = {'wildcard': [1]}
    with pytest.raises(ValidationError):
        SolveRequest.model_validate(data)
    data['settings']['scoring_chip_halves'] = {'triple_captain': [3]}
    with pytest.raises(ValidationError):
        SolveRequest.model_validate(data)


def test_distinct_scoring_chip_schedules_when_transfers_are_frozen():
    req = request_with_windows(chips={'bench_boost': [1], 'triple_captain': [1]},
                               transfers=0, solutions=2)
    result = solve(req)
    assert len(result['plans']) == 2, result['solver_attempts']
    schedules = [tuple((w['gw'], w['chip']) for w in p['gameweeks']) for p in result['plans']]
    assert len(set(schedules)) == 2
    for plan in result['plans']:
        independently_replay_chip_points(plan, req)
