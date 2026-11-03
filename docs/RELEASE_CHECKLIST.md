# Minimal release checklist — PR #73

Canonical source/baseline/rollback: `RELEASE_BASELINE.md`. Work status and evidence: `VORTEX_V2_OUTSTANDING.md`.

- [x] Root Vite/React/Express retained; source and model ownership documented; Next/notebooks remain candidates/research.
- [x] PR #71 public UI selected and reviewed; #60 cloud/admin not integrated. No saved-plan schema/key or data deletion.
- [x] Actual official refresh retrieved and atomically saved 670 players and 380 fixtures. Failed refresh cannot claim success; fallback retains original timestamp.
- [x] TypeScript, 203 Node tests, 14 Python tests, Vite build/static export and UI audit passed locally before final commit. Rerun final integrated CI after any fix.
- [x] Five GitHub jobs green on 3c3eff6: unit/build, Python, browser/worker/PNG/CSV, Next candidate, Docker/Express HiGHS. Final commit requires its own green run.
- [x] Dashboard/Planner/Players/H2H mobile/desktop screenshots and real PNG download evidence reviewed from artifact 13222491529. Synthetic H2H scores are test fixtures, not accuracy evidence.
- [x] Prospective-only archive and separate settled-outcome matching are tested. Calibration remains unverified.
- [ ] Final integrated commit: all required checks/reviews pass and GitHub normal merge permits release.
- [ ] Render live SHA matches the merge SHA; read health and execute one actual official refresh.
- [ ] Verify live enabled routes/assets, history, source/odds status, solver, local plans and actual exports against the deployed release.
- [ ] Inspect production logs if workspace access is available; otherwise explicitly record the dependency and rely on observed endpoint/deploy diagnostics without claiming log review.

## Enabled / deferred contract

Enabled: Dashboard, existing Planner/Transfer Lab, existing no-chip HiGHS/heuristic chip comparison/paired Monte Carlo, Players + selected-GW predictions and H2H, Fixtures with separate provisional VORTEX/market sources, League and Method, browser-local saved plans, CSV and 4K PNG exports.

Deferred: full joint-chip solve and private current-account integration, cloud saves/admin, arbitrary saved A/B UI, historical calibration, Next/Vercel migration. Their absence is not recorded as completion.

Rollback: create a normal revert PR for the release merge, preserving newer data-only snapshots where feasible, pass required checks, merge, and verify Render/health/routes. No force-push, database reset, plan deletion or paid-service change.
