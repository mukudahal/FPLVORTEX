# Player forecasts: S02

Scope: update only the existing Player forecasts view. Keep the Gameweek Hub, squad tools, scoring engine and private audience.

References: the four user-supplied screenshots and the rendered public https://www.fplcore.com/players page. Study filters, compact sortable statistics, fixtures and paging only. No competitor source code, forecasts or assets are incorporated.

Flows: choose 1–8 upcoming GWs; filter position, price, ownership or name; sort either table; page through all matching players; inspect a player; add/remove a test-squad player. Both tables share filters and the same official snapshot. The next-GW table keeps its own sort and page.

Data: historical season columns come from official FPL bootstrap/fixtures, the same input family used by the inspected VORTEX notebooks. Existing corrected VORTEX fixture/minutes models supply xP and next-GW probabilities. Saved notebook numbers are not presented as a live feed. No superiority claim is established by changing the interface. Season minutes per club fixture explicitly include nonappearances. Per-90 rates without minutes remain unavailable. Forecast xG and observed xG have separate fields.

States: loading/sample/official/imported data, empty filters, first/last page, missing photo, unavailable player, blank/double GW, fewer than eight GWs remaining, starting-scenario assumptions, desktop and phone layouts. Player identity uses the shared code-based photo resolver.
