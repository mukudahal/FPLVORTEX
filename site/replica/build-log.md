# S02 build log

2026-10-24: Player forecasts rebuilt with shared filters, up to eight future GWs, official historical statistics, VORTEX next-GW probabilities and independent pagers. Historical and projected xG are separate. Starting scenarios preserve availability. No player/fixture list is hard-coded.

Verified the 8-GW selector, disjoint next pages, shared search and position filters, numeric sorting, empty states, player details and Escape dismissal in the browser. Confirmed injured players remain at zero in the starting scenario. Checked desktop 1440×900 and mobile 390×844: no page-width overflow; dense tables scroll inside their panels. Desktop pagination stays in the viewport. Light and dark themes work, with no console errors.

Corrected completed-club-game counts to include provisionally finished fixtures, fixing minutes-per-game inflation while official results are finalising. Automated checks cover that regression, per-90 missing values, joint appearance probabilities, eight-week windows and all-player pagination. The existing corrected VORTEX engine remains the forecast source; this update does not introduce a live notebook-output feed or establish superior accuracy against other models.
