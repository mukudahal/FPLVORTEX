# FPL VORTEX — private Model Lab

The first hosted test interface covers player forecasts, browser-local squad selection, conditional fixture simulations and frozen-forecast comparisons. It is a separate lightweight front end over the corrected mathematical modules from the existing Next.js application. It does not deploy the existing account database, Python jobs, billing, or scheduled report delivery.

The source manifest retains the same private Sites project identity for future updates. Keep that identity and its owner-only audience when redeploying.

`model/` is a deployment snapshot of the canonical math in `../1_APP_dashboard/src/lib/`. Update the canonical modules first, run their tests, then synchronize the matching files here before preparing an updated artifact. It is not a second independently maintained implementation.

`ui/` holds the test interface. `worker/handler.js` serves assets and two fixed official-data endpoints with bounded request timeouts. `scripts/prepare-model.mjs` compiles the shared TypeScript and embeds assets into the dependency-free `worker/index.js`.

Prepare with TypeScript 5.9.3 available: `node scripts/prepare-model.mjs`.

Build and verify: `bash scripts/build.sh`, `node scripts/validate-artifact.mjs`, `node scripts/smoke-test.mjs`.

Official data refreshes while the page is open. If the feed fails, the fictional sandbox stays clearly labeled; users can import a JSON object containing `bootstrap` and `fixtures` instead. Uploaded files and squads remain in the user's browser. There is no claim of measured superiority over FPLReview.
