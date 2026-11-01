"""Bounded Python research CLI; the public no-chip API is unchanged."""
import json
import subprocess
import sys
from pathlib import Path

DATA = json.loads((Path(__file__).parent.parent / 'examples/sample_input.json').read_text())


def invoke(extra=None):
    payload = json.loads(json.dumps(DATA))
    payload['settings'].update({
        'end_gw': 1, 'time_limit_seconds': 7, 'solutions_requested': 1,
        'mip_gap': .05, 'free_transfer_value': 0,
        'bank_value_per_million': 0, 'max_transfers_per_gw': 1,
        **(extra or {}),
    })
    return subprocess.run(
        [sys.executable, '-m', 'fpl_solver.joint_cli'],
        input=json.dumps(payload), text=True, capture_output=True,
        check=False, timeout=12,
    )


def test_bounded_joint_cli_accepts_explicit_scoring_chip_inventory():
    r = invoke({'scoring_chip_halves': {'bench_boost': [1]}})
    assert r.returncode == 0, r.stderr
    data = json.loads(r.stdout)
    assert data['plans']
    assert data['assumptions']['chip_mode'].startswith('BB/TC')
    assert data['plans'][0]['gameweeks'][0]['chip'] == 'bench_boost'


def test_joint_cli_rejects_missing_inventory_and_excessive_time_or_solution_count():
    for settings in (
        {},
        {'scoring_chip_halves': {'bench_boost': [1]}, 'time_limit_seconds': 30},
        {'scoring_chip_halves': {'bench_boost': [1]}, 'solutions_requested': 3},
        {'scoring_chip_halves': {'bench_boost': [1]}, 'max_transfers_per_gw': 3},
        {'squad_chip_halves': {'wildcard': [3]}},
    ):
        result = invoke(settings)
        assert result.returncode == 2
        assert not result.stdout
        assert 'Invalid or unsupported' in result.stderr
