"""Standalone API; not yet connected to the existing Express deployment."""
from fastapi import FastAPI
from fpl_solver.models import SolveRequest
from fpl_solver.solver import solve

app = FastAPI(title='FPL VORTEX Transfer Solver', version='0.1.0')

@app.get('/health')
def health():
    return {'status': 'ok', 'chips_supported': False}

@app.post('/solver/solve')
def solve_route(request: SolveRequest):
    return solve(request)
