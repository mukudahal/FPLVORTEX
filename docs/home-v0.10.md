# Premium FPLVORTEX Home — v0.10

Home is the only visible top navigation tab until the owner supplies other names. Old routes are still in source code, but no longer exposed as a sidebar. The visual inspiration came from user-provided FPLCore screenshots. No FPLCore artwork, UI code, logo, custom image, or screenshot is redistributed, and the arrangement/colors/type are original.

## Live sources

`/api/v1/home/overview?entryId=145784` (optional `gw=7`):
- On-demand public Fantasy Premier League manager profile, chips, picks, player catalogue, and fixtures. Source is FPL website's unsupported JSON; this is not an official documented production API, and usage permissions should be reviewed.
- FPL fields include current manager rank, season/GW points, official player point totals, selected %, actual event price changes, transfers in/out, and availability flags/news. Picks are shown on pitch only when they match the requested GW. It does NOT make up next-week picks.
- If website requests fail, live information remains absent. A button explicitly retries. Snapshot is cached for 90 seconds. No continuous polling and no manager credentials.
- When the official fixture response isn't available, the pinned OpenFootball CC0 2026/27 data can supply *community* fixtures. Reported final scores are only accepted if present; unreported scores are not turned into 0–0.

## Own research metrics

Independent shrinkage/Poisson baseline from prior scored OpenFootball matches provides next-gameweek team expected goals, clean-sheet probability `exp(-opponent goals)` and win probability from independent Poisson score distribution. Win%/CS%/Goals clicking changes sorting of those distinct quantities. These are research calculations with no demonstrated accuracy advantage over bookmakers, Opta, or FPLReview. FPL official fixture difficulty ratings are not used to invent win odds.

## Controls

- Home top navigation with top-left crowned lion brand.
- GW previous/next buttons request that GW on demand and do not reuse the current week's picks as a historical/future lineup.
- Goals, CS%, Win% rank next-GW teams descending based on current research model.
- Points, Ownership, Value (season points / £m) rank public current-season FPL player catalogue.
- Previous/Next paginates leaders and transfers; separate rises, falls and transfers sections.
- Injury/Suspension filter uses published FPL flags and news. Status and injury classification is best-effort text matching, not a club medical report.
- No fabricated player-image source or price-change ETA. Documented Commons portraits are shown, fallback initials elsewhere.
- YouTube content is **user-owned only** and configured with `FPLVORTEX_YOUTUBE_CHANNEL_URL=https://www.youtube.com/@...` and `FPLVORTEX_YOUTUBE_VIDEO_IDS=id1,id2` (11-character IDs); no assumption that a similar channel name belongs to the user.

## Release gates

Local unit tests validate sorting, null score, published fields, Poisson probability mass, FPL account usage, URL sanitization and unavailable-source fallback. Before public deploy: license review for API/photos; prove source rate limits and rights; integration/browser/accessibility testing; verify owner YouTube channel; obtain player-level calibrated historical input if promising personalized forecasting.