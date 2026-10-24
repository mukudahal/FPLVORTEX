# FPL Vortex: manual lineups and Analysis Live

## Manual lineups
- Team Planner → Substitutions: select one bench player and one starter in either order.
- Goalkeepers swap only with goalkeepers. Outfield swaps preserve a legal formation.
- Choices are saved separately for each team and gameweek in this browser, and included in shared plan links.
- Swaps do not use free transfers or alter the bank. Transfers remain available separately.
- Planned transfers inherit the outgoing player's starting or bench slot.
- Auto XI restores the projected lineup for the selected gameweek; Reset all clears the saved plan.

## Analysis Live
- Full analysis from the dashboard's team review opens Analysis Live for that team and gameweek.
- The team's Review tab also has a Full analysis button; Analysis Live is directly available as a tab.
- Original midnight, brass and teal styling, larger compact metrics, gold separators and a graphical live squad.
- Deadline XI and after-substitution scores use official live player points. Confirmed no-shows are substituted in bench order, respecting goalkeeper/formation rules and pending double-gameweek fixtures.
- Current overall rank uses the official entry profile; historical gameweeks use published history/picks. The profile and history can update at different times.
- Projected total and published rank are labelled separately. This project does not calculate an exact provisional global live rank or LiveFPL safety score.
- Captain/chip comparisons and effective ownership use a systematic sample of 12 public official-FPL teams across the selected current rank tier. These are samples, not complete tier aggregates. Missing teams/history are disclosed.
- Differentials, threats and scoring effects use the sampled effective ownership, including captain and chip multipliers.
- The event feed initially shows official per-fixture scoring contributions as snapshots. Subsequent observed changes are timestamped when this view receives them; they are not historical match-event timestamps. Filters support match, bonus and impact size.
- Active-gameweek points/fixtures refresh every minute; rank-tier samples every two minutes. Official upstream caches can delay changes.

## Run and verification
Use the dashboard's existing installation instructions and configure a real DATABASE_URL for persistence.
- npm run test:planning
- npm run typecheck
- npm run build

The local preview also works with unavailable database caching because the original FPL fetcher falls back to the public upstream. This does not provide database-backed saved plans or manager tracking.

The supplied archive's missing logo/icons, dependency audit findings and optimizer file-tracing warning are unchanged by this update.

## Layout and readability refinement
- Removed the team Review tab. Analysis Live is now the default team view, including old Review links.
- Kept Review's points breakdown and hindsight analysis in an expandable section inside Analysis Live.
- Home and Analysis now render the same shared green-pitch component, including white name strips, score bands and ordered bench. Analysis adds sampled EO beneath each card.
- Reduced overview row padding, used four metric columns on desktop, made standout cards compact, and placed captains/chips in the same right-hand panel.
- Replaced the heavy display type with a widely available system sans-serif stack and balanced weights. Snapshot labels are larger gold badges, match text has higher contrast, and phone-width ranks fit their cells.
- Rank-tier responses carry the selected gameweek/tier. The UI shows which tier is loading and retains the last successful sample on a refresh failure. Shared leaderboard-tier caching reduces repeat fetches.

## Market & Fitness
- Renamed Live to Market & Fitness; the short tab brings prices, transfer momentum, yellow-card watch and availability together.
- Rebuilt Price trends as a compact, photo-led table alongside the fitness column on wide screens. Every heading sorts in both directions, with missing values last. Search, position, club, squad/all scope and pagination work together.
- FPL progress and three supplied projection horizons appear with signed bars and net hourly flow. Ownership is the current percentage, with net gameweek transfers below. GW changes shows confirmed price movement separately. No fabricated probability, ownership history or change time is displayed.
- Estimated squad purchase/selling values use the existing optimizer's public-history estimates and are marked accordingly. Missing values display a dash.
- Replaced the database-dependent Price Watch request with the existing official bootstrap feed. It refreshes every five minutes and offers manual retry, preserving the last successful response on refresh failure.
- Compact, bright injury rows include photos, team, factual status/chance, expandable timestamp and card totals. Removed unsupported replacement verdict/confidence text. Retained the visit marker and added squad/search filters.
- Booking watch uses completed fixtures for each club, rather than assuming gameweek numbers equal matches played. Actual suspensions are shown in the availability feed.
- Added bright player-photo tiles to Analysis Live's Live action rows, alongside each event marker.
- Direct preview: /team/145784?tab=market. Legacy ?tab=live also opens this page.

Market & Fitness validation: production build and modified-source lint pass; all 17 existing planning/analysis tests pass. Production browser checks at 1440px and 390px verify sorting, search/position filters, confirmed-change view, injury expansion/search, loaded photos and no page overflow. A simulated refresh failure retains the table and active filters; retry recovers. Missing forecast values remain dashes and sort last in either direction. The 27 documented text/background pairs pass AA contrast.

Optional browser checks are included in scripts/market-browser-check.cjs and scripts/market-resilience-check.cjs. Supply BASE_URL, PLAYWRIGHT_MODULE and CHROME_PATH for your environment; MARKET_CHECK_OUTPUT controls where screenshot/report artifacts are written. These do not add a Playwright dependency to the app.
