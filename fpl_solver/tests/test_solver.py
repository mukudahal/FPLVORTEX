import json
from collections import Counter
from pathlib import Path

import pytest
from pydantic import ValidationError
from fpl_solver.models import SolveRequest, QUOTAS
from fpl_solver.solver import solve

DATA = json.loads((Path(__file__).parent.parent / 'examples/sample_input.json').read_text())

def request(**settings):
    data = json.loads(json.dumps(DATA))
    data['settings'].update(settings)
    return SolveRequest.model_validate(data)

def test_multiweek_plan_legal_and_accounting_reproducible():
    req = request(end_gw=3, solutions_requested=2, free_transfer_value=0, bank_value_per_million=0, mip_gap=0)
    result = solve(req)
    assert len(result['plans']) == 2
    players = {p.player_id: p for p in req.players}
    sequences = []
    for plan in result['plans']:
        previous = set(req.current_team.squad_player_ids)
        previously_sold_original = set()
        bank = req.current_team.bank
        ft = req.current_team.free_transfers
        raw = 0
        for week in plan['gameweeks']:
            gw = week['gw']; squad = set(week['squad']); starters = set(week['starters'])
            ins, outs = set(week['transfers_in']), set(week['transfers_out'])
            assert len(squad) == 15 and squad == (previous - outs) | ins
            assert len(ins) == len(outs) and not (ins & previous) and outs <= previous
            assert Counter(players[i].position for i in squad) == QUOTAS
            assert max(Counter(players[i].team_id for i in squad).values()) <= 3
            assert len(starters) == 11 and starters <= squad
            form = Counter(players[i].position for i in starters)
            assert form['GK'] == 1 and 3 <= form['DEF'] <= 5 and 2 <= form['MID'] <= 5 and 1 <= form['FWD'] <= 3
            assert week['captain'] in starters and week['vice_captain'] in starters and week['captain'] != week['vice_captain']
            assert len(week['bench']) == 4 and set(week['bench']) == squad - starters
            assert players[week['bench'][0]].position == 'GK'
            hit = max(0,len(ins)-ft)*4
            assert week['hit_cost'] == hit and week['free_transfers_before'] == ft
            ft = min(5,max(0,ft-len(ins))+1)
            assert week['free_transfers_after'] == ft
            proceeds = 0
            for pid in outs:
                if pid in req.current_team.squad_player_ids and pid not in previously_sold_original:
                    proceeds += players[pid].selling_price
                    previously_sold_original.add(pid)
                else:
                    proceeds += players[pid].current_price
            bank += proceeds - sum(players[i].current_price for i in ins)
            assert week['bank'] == pytest.approx(bank) and bank >= 0
            score = sum(players[i].xpts_by_gw[gw] for i in starters) + players[week['captain']].xpts_by_gw[gw] - hit
            assert week['expected_points_after_hits'] == pytest.approx(score)
            raw += score; previous = squad
        assert plan['raw_expected_points_after_hits'] == pytest.approx(raw)
        sequences.append([w['transfers_in'] for w in plan['gameweeks']])
    assert sequences[0] != sequences[1]
    assert result['assumptions']['fdr'] == 'not used'

def test_forced_transfer_lock_and_hit_limit():
    req = request(end_gw=2, max_transfers_per_gw=2, max_total_hits=0,
                  locked_players=[1], excluded_players=[20], forced_transfers=[{'gw':1, 'player_out':15, 'player_in':24}])
    plan = solve(req)['plans'][0]
    assert 15 in plan['gameweeks'][0]['transfers_out']
    assert 24 in plan['gameweeks'][0]['transfers_in']
    assert all(1 in week['squad'] and 20 not in week['squad'] and week['hit_cost'] == 0 for week in plan['gameweeks'])

def test_transfer_depth_zero_and_ft_cap():
    req = request(end_gw=3, transfer_depth=0)
    req.current_team.free_transfers = 5
    weeks = solve(req)['plans'][0]['gameweeks']
    assert all(not w['transfers_in'] and w['free_transfers_after'] == 5 for w in weeks)

def test_rejects_invalid_squad_missing_inputs_and_unsupported_chip_settings():
    data = json.loads(json.dumps(DATA)); data['current_team']['squad_player_ids'][1] = data['current_team']['squad_player_ids'][0]
    with pytest.raises(ValidationError): SolveRequest.model_validate(data)
    data = json.loads(json.dumps(DATA)); del data['players'][0]['xpts_by_gw']['1']
    with pytest.raises(ValidationError): SolveRequest.model_validate(data)
    with pytest.raises(ValidationError): request(chips_mode='solver_decides')

def test_infeasible_forced_transfer_returns_no_fake_plan():
    req = request(end_gw=1, transfer_depth=0, forced_transfers=[{'gw':1, 'player_out':15, 'player_in':24}])
    result = solve(req)
    assert not result['plans']
    assert result['solver_attempts'][0]['status'] == 2

def test_api_health_solve_and_validation():
    from fastapi.testclient import TestClient
    from fpl_solver.api.main import app
    client = TestClient(app)
    assert client.get('/health').json() == {'status': 'ok', 'chips_supported': False}
    payload = json.loads(json.dumps(DATA)); payload['settings']['end_gw'] = 1
    response = client.post('/solver/solve', json=payload)
    assert response.status_code == 200 and len(response.json()['plans']) == 1
    payload['settings']['chips_mode'] = 'solver_decides'
    assert client.post('/solver/solve', json=payload).status_code == 422
