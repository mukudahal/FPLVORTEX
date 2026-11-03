# FPL VORTEX — start here

The canonical released application is `main` in `mukudahal/FPLVORTEX`: root Vite/React + TypeScript + Express + bounded Python HiGHS, deployed through the existing Render main autoDeploy.

- Release baseline, source ownership and rollback: [docs/RELEASE_BASELINE.md](docs/RELEASE_BASELINE.md).
- One authoritative backlog and evidence log: [docs/VORTEX_V2_OUTSTANDING.md](docs/VORTEX_V2_OUTSTANDING.md).
- Intended production forecasting behavior: [docs/MODEL_SPEC.md](docs/MODEL_SPEC.md).
- UI/token and workflow ownership: [DESIGN.md](DESIGN.md), [UX-CONTRACT.md](UX-CONTRACT.md).

Use `npm ci`, `npm run check`, and `python -m pytest -q fpl_solver/tests`. Runtime: `npm start`. GitHub CI additionally validates the existing Next candidate, Chromium/worker/export behavior and the release production container.

`1_APP_dashboard/`, `site/model/` and `2_notebooks/` are preserved candidate/research trees. They do not receive production traffic. Older upgrade-status and migration documents describe historical work and are superseded by the single backlog above. Do not start a framework migration as part of the minimal release.

Browser-local plan storage is retained. Cloud/admin and full joint-chip/private-account work remain unreleased; no database migration is included.
