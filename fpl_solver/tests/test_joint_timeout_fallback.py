"""No HiGHS incumbent must never turn into an invented 'optimal' joint path.

Fallback is a separately replayed HOLD + scoring-chip continuation and must
be marked degraded. It cannot override forced WC/FH, transfers or exclusions.
"""
from types import SimpleNamespace

from fpl_solver.hold_fallback import verified_hold_scoring_fallback
from fpl_solver.solver import Problem, solve
from fpl_solver.tests.test_joint_all_chips_milp import compact_request
from fpl_solver.examples.benchmark_joint_horizon import stress_request


TIMEOUT = dict(status=1, message="HiGHS time limit, no primal solution",
               mip_gap=None, optimality_proven=False)


def test_40_player_10gw_degraded_hold_is_legal_and_uses_only_verified_scoring_chips():
    request = stress_request(candidate_count=40,horizon=10)
    plan = verified_hold_scoring_fallback(request, TIMEOUT)
    assert plan and len(plan['gameweeks']) == 10
    assert plan['method'] == 'independent_verified_hold_scoring_fallback'
    assert plan['solver']['optimality_proven'] is False
    assert plan['solver']['mip_gap'] is None
    assert all(not w['transfers_in'] and not w['transfers_out']
               for w in plan['gameweeks'])
    assert all(w['chip'] not in ('wildcard','free_hit') for w in plan['gameweeks'])
    assert [w['gw'] for w in plan['gameweeks']] == list(range(20,30))
    assert all(w['expected_points_after_hits'] > 0 for w in plan['gameweeks'])
    assert all(w['free_transfers_after'] == min(5,w['free_transfers_before']+1)
               for w in plan['gameweeks'])
    assert plan['evaluation_score'] >= plan['discounted_points_after_hits']


def test_timeout_integrates_degraded_provenance_without_replacing_real_milp(monkeypatch):
    req=compact_request(start=18,end=19)
    def no_primal(self, settings, time_limit):
        return SimpleNamespace(status=1,message="Time limit reached",
                               mip_gap=None,x=None)
    monkeypatch.setattr(Problem,'solve',no_primal)
    result=solve(req)
    assert len(result['plans']) == 1
    assert result['full_milp_incumbent_found'] is False
    assert result['degraded_baseline_only'] is True
    assert result['plans'][0]['method'] == 'independent_verified_hold_scoring_fallback'
    assert result['solver_attempts'][0]['status'] == 1
    assert result['solver_attempts'][0]['optimality_proven'] is False
    assert 'did not find a full joint MILP incumbent' in result['warnings'][0]


def test_no_fallback_can_ignore_manager_forced_chip_or_transfer(monkeypatch):
    def no_primal(self, settings, time_limit):
        return SimpleNamespace(status=1,message="Time limit reached",
                               mip_gap=None,x=None)
    monkeypatch.setattr(Problem,'solve',no_primal)
    forced_chip=compact_request(start=18,end=18,forced={18:'free_hit'})
    result=solve(forced_chip)
    assert not result['plans']
    assert result['degraded_baseline_only'] is False
    forced_transfer=compact_request(start=18,end=18,forced={})
    from fpl_solver.models import ForcedTransfer
    forced_transfer.settings.forced_transfers=[
        ForcedTransfer(gw=18,player_out=15,player_in=24)
    ]
    result=solve(forced_transfer)
    assert not result['plans']
    assert result['degraded_baseline_only'] is False


def test_unavailable_chips_do_not_get_implicitly_used_by_degraded_fallback():
    req=compact_request(start=18,end=19)
    req.settings.scoring_chip_halves={}
    req.settings.squad_chip_halves={'free_hit':[1]}
    plan=verified_hold_scoring_fallback(req,TIMEOUT)
    assert plan
    assert all(w['chip'] is None for w in plan['gameweeks'])
