"""Research-grade bounded CLI for the explicit joint WC/FH/BB/TC MILP.

Only the backend may invoke this module, AFTER independently checking official
chip-history provenance against the live FPL account. The public no-chip CLI
continues rejecting all chip-enabled requests. This module has no writes.
"""
from __future__ import annotations
import json
import sys
from pydantic import ValidationError
from .models import SolveRequest
from .solver import solve


def main() -> int:
    try:
        raw = sys.stdin.buffer.read(120_001)
        if len(raw) > 120_000:
            raise ValueError('Joint MILP input is too large.')
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError('Expected a solver request object.')
        req = SolveRequest.model_validate(payload)
        s = req.settings
        if (len(req.players) > 40 or s.time_limit_seconds > 10
            or s.solutions_requested > 1 or s.max_transfers_per_gw > 2
            or s.end_gw - s.start_gw >= 10):
            raise ValueError('Joint MILP exceeds bounded candidate, time, or horizon limits.')
        if not (s.scoring_chip_halves or s.squad_chip_halves):
            raise ValueError('Joint MILP must receive a verified explicit chip inventory.')
        result = solve(req)
        sys.stdout.write(json.dumps(result, separators=(',', ':'), allow_nan=False))
        return 0
    except (ValueError, ValidationError, TypeError, json.JSONDecodeError):
        sys.stderr.write('Invalid or unsupported bounded joint-chip MILP request.')
        return 2
    except Exception:
        sys.stderr.write('Joint-chip MILP failed without a verified feasible result.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
