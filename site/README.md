# FPL VORTEX — private Model Lab

The first hosted test interface covers player forecasts, browser-local squad selection, conditional fixture simulations and frozen-forecast comparisons. It is a separate lightweight front end over the corrected mathematical modules from the existing Next.js application. It does not deploy the existing account database, Python jobs, billing, or scheduled report delivery.

The source manifest retains the same private Sites project identity for future updates. Keep that identity and its owner-only audience when redeploying.

`model/` is a deployment snapshot of the canonical math in `../1_APP_dashboard/src/lib/`. Update the canonical modules first, run their tests, then synchronize the matching files here before preparing an updated artifact. It is not a second independently maintained implementation.

`ui/` holds the test interface. The Gameweek Hub has an Overview subtab and a Gameweek Analysis subtab. Analysis uses `ui/analysis.js`: pure, tested maths for official live-point breakdowns, captain/bench effects, formation, published form and a two-team head-to-head comparison. `ui/dashboard.js` renders it. Any rival Team ID is stored in the browser and only public entry/picks/history endpoints are fetched.

`worker/handler.js` serves assets and fixed official-data endpoints with bounded request timeouts. `scripts/prepare-model.mjs` compiles the shared TypeScript and embeds assets into the dependency-free `worker/index.js`. `scripts/check-analysis.mjs` verifies the analysis maths, missing-data behaviour, sorting, rival comparison, and renders the tab against a minimal DOM stub.

Prepare with TypeScript 5.9.3 available: `node scripts/prepare-model.mjs`.

Build and verify: `bash scripts/build.sh`, `node scripts/validate-artifact.mjs`, `node scripts/smoke-test.mjs`.

`../DASHBOARD_PREVIEW.html` is a self-contained, offline copy of the same interface with fictional data. Regenerate it with TypeScript 5.9.3 available (`node scripts/standalone-preview.mjs`); the checked-in copy is verified by `node scripts/check-standalone.mjs`, which resolves its complete module graph without a browser.

Official data refreshes while the page is open. If the feed fails, the fictional sandbox stays clearly labeled; users can import a JSON object containing `bootstrap` and `fixtures` instead. Uploaded files and squads remain in the user's browser. There is no claim of measured superiority over FPLReview.
