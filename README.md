# FPL VORTEX

Private source repository for the merged FPL VORTEX project and the deployed Model Lab.

## What to edit

| Folder | Purpose |
| --- | --- |
| `site/` | Current private website: dashboard, official FPL API routes, shared prediction maths and simulation UI. |
| `1_APP_dashboard/` | Original larger Next.js application, backend and optimisation source. Its database and background jobs are not deployed by the lightweight site. |
| `2_notebooks/` | Original analytical notebooks, including their saved outputs. |
| `3_data_third_party/` | Supplied data files; these are snapshots, not a live data service. |
| `4_backup/` through `9_dashboard_reference/` | Preserved backups, design references, reports and project documentation. |
| `design-tools/` | Imported design tooling. |

The source was imported from `FPL_VORTEX_MERGED.zip`. Nested Git metadata and runtime/build caches are excluded. The original ZIP remains saved in the project files.

## Run the current website

Use Node.js 22 or newer. No dependency installation is required for the lightweight site:

```sh
cd site
npm run build
npm run validate
node scripts/smoke-test.mjs
npm run dev
```

Open the local URL printed by the server. The live site remains private:
https://fpl-vortex-lab-muku-1024.wavysnipe6.chatgpt.site/

## Real data and storage

The deployed server reads official FPL player, fixture, manager, picks, history and live-score APIs. Browser responses include data-source and retrieval-time headers. Player portraits load from the Premier League image host with a second-size retry and an unavailable-photo fallback.

Browser-local test squads and the linked manager number are not synced across devices. Forecasts are computed in the browser. There is no persistent historical-statistics database or unattended ingestion worker yet. Do not commit personal API captures, credentials, `.env` files or browser QA captures.

Forecasts remain unvalidated. The repository does not contain licensed FPLReview forecasts or establish a predictive advantage over FPLReview. The Gameweek Analysis subtab is implemented: it reports the linked manager's score breakdown, captain and bench impact, position contributions, published form and rank movement, a sortable 15-player contribution table, a next-gameweek captain/availability focus, and a head-to-head comparison against another public FPL Team ID. Rival comparison reads public picks and scores only; the linked team and rival IDs stay in the browser.

## Updates and deployment

GitHub tracks reviewable source changes and runs the site build/smoke checks. Changes can be prepared here in chat or through GitHub.

The private hosted Site currently uses its own managed source repository. A GitHub commit alone does **not** deploy it. To release a GitHub change, ask in this project to sync the desired commit, run the checks and deploy it to the existing private Site. Automatic GitHub-to-host deployment is not configured.

See `site/scripts/smoke-test.mjs` for the hosting-cache regression test and `1_APP_dashboard/docs/MATH_CORRECTIONS.md` for the mathematics audit.

## Branding and alternate hosting

The supplied crowned-lion logo is stored unchanged at `site/ui/brand/fpl-vortex-lion.jpg` and appears in the shared navigation. FPL VORTEX is shown in the header and document title of every page.

`site/vercel.json`, `site/api/index.mjs` and `site/scripts/build-vercel.mjs` prepare the same application for Git-linked Vercel hosting. This configuration has been checked locally; linking and deployment require authorizing the existing Vercel account. No Vercel address has been claimed yet. Preserve private access during setup.
