import json
from pathlib import Path
from fpl_solver.models import SolveRequest
from fpl_solver.solver import solve

request = SolveRequest.model_validate_json(Path(__file__).with_name('sample_input.json').read_text())
print(json.dumps(solve(request), indent=2))
