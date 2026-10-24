FPL VORTEX - clean copy made 14 Oct 2026. Everything here is a COPY. The originals are still on your Desktop.

1_APP_dashboard/        The real dashboard app (Next.js). Includes the Monte Carlo risk view, the new
                        xPts model, the solver fixes, the plan page and the photo fixes.
                        To run: npm install --include=dev, set DATABASE_URL, then npm run dev.
2_notebooks/            Four separate Colab notebooks (not part of the app):
                          FPL_VORTEX_WC_FH_DEFENDER_TWO_WAY_LIVE_FIXED  newest Wildcard / Free Hit planner
                          FPL_VORTEX_Wildcard_Slides1_to_4_Premium_Captaincy  older version of the one above
                          FPLVORTEX_V4_6_INLINE_UPDATED  decision engine (tested; not merged)
                          FPL_VORTEX_DEFCON_FIXED  xG / DEFCON / slides notebook
3_data_third_party/     FPL Copilot projections CSV. Third-party data: private benchmark only.
4_backup/               Zip backup of the finished app.
5_screenshots_reference/ Your screenshots and design images.

Not copied on purpose: .env (it holds secrets), node_modules, and the Desktop-root git files.

2026-10-18 update: Manual bench/starting-XI swaps and Analysis Live. See CHANGES_LIVE_ANALYSIS.md for behaviour, data sources, sampling limits and checks.
