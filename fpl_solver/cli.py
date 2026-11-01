"""Bounded stdin/stdout bridge for the independent no-chip HiGHS MILP.

Caller input is untrusted. Validation is strict; no player details or
unverified projections are read from a private provider.
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
            raise ValueError("Payload exceeds the server's bounded solver input.")
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("Expected a solver input object.")
        # Full schema validation is strict and rejects unsupported chips.
        request = SolveRequest.model_validate(payload)
        settings = request.settings
        if len(request.players) > 60 or settings.time_limit_seconds > 10 or settings.solutions_requested > 3 or settings.max_transfers_per_gw > 2:
            raise ValueError("Exact comparison exceeds the permitted candidate/time limits.")
        result = solve(request)
        sys.stdout.write(json.dumps(result, separators=(',', ':'), allow_nan=False))
        return 0
    except (ValueError, ValidationError, TypeError, json.JSONDecodeError):
        # Never echo private squad data in an error response.
        sys.stderr.write("Invalid or unsupported no-chip MILP request.")
        return 2
    except Exception:
        sys.stderr.write("MILP service failed without a feasible response.")
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
