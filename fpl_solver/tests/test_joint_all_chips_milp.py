"""P0-A09 joint all-four-chip MILP: synthetic, *verified inventory* fixtures.

This is the research optimizer, not the production public CLI.
WC/FH permanent-vs-temporary state, FT conservation, cash and price basis
are checked independently against the chip replay validator.
"""
import json
from pathlib import Path
import pytest
from pydantic import ValidationError
from fpl_solver.models import SolveRequest
from fpl_solver.solver import solve
from fpl_solver.chip_replay import WeekAction, validate_proposed_chip_path

DATA = json.loads((Path(__file__).parent.parent / 'examples/sample_input.json').read_text())


def compact_request(start=18, end=19, *, forced=None, half1=True):
    raw = json.loads(json.dumps(DATA))
    raw['players'] = [p for p in raw['players']
                      if p['player_id'] in set(raw['current_team']['squad_player_ids']) | {3, 10, 24}]
    raw['current_team']['current_gameweek'] = start
    raw['settings'].update({
        'start_gw': start, 'end_gw': end,
        'transfer_depth': end-start+1,
        'time_decay': .85, 'max_total_hits': 20,
        'max_transfers_per_gw': 1, 'time_limit_seconds': 14,
        'mip_gap': .05, 'solutions_requested': 1,
        'free_transfer_value': 0, 'bank_value_per_million': 0,
        'forced_chip_uses': forced or {},
        'scoring_chip_halves': {'bench_boost':[1,2], 'triple_captain':[1,2]},
        'squad_chip_halves': {'wildcard':[1,2], 'free_hit':[1,2]},
        'first_half_fh_used_gw19': False,
    })
    for p in raw['players']:
        for gw in range(start, end+1):
            original_gw = str(1+(gw-start)%5)
            for col in ('xpts_by_gw','xmin_by_gw','availability_by_gw','has_fixture_by_gw'):
                p[col][str(gw)] = p[col][original_gw]
            if p['player_id'] in (3, 10, 24):
                p['xpts_by_gw'][str(gw)] = 6.0 if gw == start else 2.0
    return SolveRequest.model_validate(raw)


def replay_exact_output(req, plan):
    map_by_id = {p.player_id:p for p in req.players}
    actions = []
    for week in plan['gameweeks']:
        if week['chip'] == 'free_hit':
            action = WeekAction(
                gw=week['gw'], chip='free_hit',
                temporary_squad=tuple(week['squad']),
                starters=tuple(week['starters']),
                captain=week['captain'], vice=week['vice_captain'],
            )
        else:
            incoming = list(week['transfers_in'])
            pairs = []
            for out in week['transfers_out']:
                matching = next(
                    (pid for pid in incoming if map_by_id[pid].position == map_by_id[out].position), None
                )
                assert matching is not None
                pairs.append((out, matching))
                incoming.remove(matching)
            assert incoming == []
            action = WeekAction(
                gw=week['gw'], chip=week['chip'],
                transfers=tuple(pairs), starters=tuple(week['starters']),
                captain=week['captain'], vice=week['vice_captain'],
            )
        actions.append(action)
    availability = {
        'wildcard': set(req.settings.squad_chip_halves.get('wildcard',[])),
        'free_hit': set(req.settings.squad_chip_halves.get('free_hit',[])),
        'bench_boost': set(req.settings.scoring_chip_halves.get('bench_boost',[])),
        'triple_captain': set(req.settings.scoring_chip_halves.get('triple_captain',[])),
    }
    replay = validate_proposed_chip_path(req, actions, verified_available=availability)
    for gw, week in enumerate(plan['gameweeks']):
        checked = replay[gw]
        assert week['chip'] == checked['chip']
        assert week['squad'] == checked['squad'] or sorted(week['squad']) == checked['squad']
        assert sorted(week['permanent_squad_after']) == checked['permanent_squad_after']
        assert week['free_transfers_after'] == checked['free_transfers_after']
        assert week['hit_cost'] == checked['hit_cost']
        assert week['bank'] == pytest.approx(checked['bank_after_tenths']/10)
        assert week['expected_points_after_hits'] == pytest.approx(
            checked['expected_points_after_hits'], abs=.003)
        if week['chip'] == 'free_hit':
            assert week['temporary_bank'] == pytest.approx(
                checked['temporary_bank_tenths']/10)
            assert set(week['squad']) != set(week['permanent_squad_after'])
    return replay


def test_force_wildcard_then_free_hit_uses_permanent_and_temporary_states():
    req = compact_request(forced={18:'wildcard', 19:'free_hit'})
    result = solve(req)
    assert result['plans'], result['solver_attempts']
    plan = result['plans'][0]
    assert [w['chip'] for w in plan['gameweeks']] == ['wildcard','free_hit']
    assert len(plan['gameweeks'][0]['transfers_in']) >= 2
    assert plan['gameweeks'][0]['hit_cost'] == 0
    assert plan['gameweeks'][0]['free_transfers_before'] == plan['gameweeks'][0]['free_transfers_after']
    assert not plan['gameweeks'][1]['transfers_in'] and not plan['gameweeks'][1]['transfers_out']
    assert plan['gameweeks'][1]['hit_cost'] == 0
    assert plan['gameweeks'][1]['free_transfers_before'] == plan['gameweeks'][1]['free_transfers_after']
    replay_exact_output(req, plan)


def test_forced_free_hit_only_restores_initial_squad_and_selling_price_basis():
    req = compact_request(forced={18:'free_hit'},end=18)
    result = solve(req)
    assert result['plans'], result['solver_attempts']
    week=result['plans'][0]['gameweeks'][0]
    assert week['chip']=='free_hit'
    assert set(week['permanent_squad_after'])==set(req.current_team.squad_player_ids)
    assert week['temporary_bank'] is not None
    assert week['bank']==req.current_team.bank
    replay_exact_output(req, result['plans'][0])


def test_gw19_20_consecutive_fh_conflict_is_illegal_with_separate_half_inventories():
    with pytest.raises(ValidationError, match='consecutive'):
        compact_request(start=19,end=20,forced={19:'free_hit',20:'free_hit'})
    with pytest.raises(ValidationError, match='verified evidence'):
        raw = compact_request(start=20,end=20,forced={},half1=False).model_dump(mode='json')
        raw['settings']['first_half_fh_used_gw19']=None
        raw['settings']['forced_chip_uses']={'20':'free_hit'}
        SolveRequest.model_validate(raw)


def test_forced_chip_requires_verified_inventory_and_wildcard_cannot_start_gw1():
    data=compact_request(start=18,end=18).model_dump(mode='json')
    data['settings']['squad_chip_halves']={}
    data['settings']['forced_chip_uses']={'18':'wildcard'}
    with pytest.raises(ValidationError, match='not verified'):
        SolveRequest.model_validate(data)
    data=compact_request(start=1,end=1).model_dump(mode='json')
    data['settings']['forced_chip_uses']={'1':'wildcard'}
    with pytest.raises(ValidationError, match='GW1'):
        SolveRequest.model_validate(data)
