# Team Planner update (18 Oct 2026)

All changes are inside 1_APP_dashboard/src. Nothing else in the project was touched.

Changed files
- src/components/planner/PlannerView.tsx   table fit, smaller pitch, sortable headings, Opta xP column,
                                           price arrows, info icon, captain picker, chips bar, share button
- src/components/planner/TeamPlanner.tsx   saves chips and captains, opens shared plans from a link
- src/lib/planEngine.ts                    chip rules (Wildcard, Free Hit, Bench Boost, Triple Captain)
- src/app/globals.css                      smaller fixture chips and row photos
New file
- src/lib/planShare.ts                     share-link encode / decode (validates all input)

Extra folders
- 6_replica_docs/   recon map, feature matrix and parity score from the replica skills
- 7_skills/         fpl-team-planner.skill (upload in Settings > Capabilities > Skills)

Left out of the zip on purpose: node_modules, .next, .venv, .cache and .env.local.
Run:  cd 1_APP_dashboard && npm install --include=dev && npm run dev
(keep your own .env.local with DATABASE_URL)
