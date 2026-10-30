# FPL VORTEX — Product Contract (V2)

**Status:** Proposed for the Stage 02 product/architecture review. Not a claim that features are deployed.
**Audience:** Fantasy Premier League managers planning next-gameweek actions and ten-Gameweek strategies.
**Primary job:** Help a manager create, compare, update and review a rules-valid 10-GW plan without confusing forecasts with verified facts.
**Live baseline:** Current Vite/Express application on Render. **Target under validation:** Next.js + Supabase + Vercel.

## A. Non-negotiable product requirements

1. The home workspace opens on the NEXT eligible Fantasy Premier League gameweek and a rolling planning window of up to 10 upcoming gameweeks, shortened safely near the end of the season. No hard-coded current gameweek or deadline.
2. The main workspace supports three interoperable modes: **Manual**, **Auto Plan**, **Simulate**. Manual plans are first-class and never silently replaced by auto recommendations.
3. Manual mode: inspect lineup/pitch and bench; swap players; stage transfers across weeks; set captain, vice and chip per week; lock players and user choices; undo/revert; save, name, copy and restore independently versioned scenarios.
4. Auto Plan: recommend an executable transfer and chip sequence using verified source snapshots, versioned xPts assumptions, season-specific squad/budget/FT/chip constraints and user locks. Explain decisions compactly with a small expandable detail panel. State explicitly when search is heuristic rather than globally optimal.
5. Simulate: compare Manual vs Auto, hold vs transfer, and Plan A vs B over the same simulated fixture/player outcomes. Show mean and median total points, 10th–90th percentile intervals, gain relative to a valid baseline, transfer costs and chip opportunity cost. Do not present rank/EO probabilities without a validated sampled manager population.
6. Weekly review: compare the user's last-approved scenario with newly verified fixtures, prices, availability and market snapshots; show what changed, why, and whether previously approved plans are now stale. Replanning must preserve locked decisions and avoid overwriting the old version.
7. Supporting views: searchable and sortable Player Explorer, player detail with verified statistics, 10-GW Attack/Defence FDR matrix, transfer and market screens, captaincy comparison, verified news, data-status and concise Guide & Methodology.
8. Protected **DATA** route: server-authenticated admin-only source configuration, raw ingestion diagnostics, snapshot/model provenance, job state, source-license information and read-only analytics. Operational write actions require explicit permissions, confirmations and audit logs. Never put credentials or unrestricted raw/licensed data in client payloads.
9. The public product shows compact tables/cards/charts first. Place detailed formulas, methodology, FAQ and instructional prose in Guide & Methodology or accessible expandable help.
10. Both dark and light themes with consistent branding; fast perceived loading; responsive across 320px–1920px; keyboard/touch operation and WCAG 2.2 AA objective.

## B. Core 10-GW planning contract

- **Plan input:** manager-selected 15-player initial squad; prices, purchase/selling basis, cash, free transfers, used chips, current fixture snapshot, allowed player pool, risk preference and manual locks.
- **Plan state:** immutable scenario identifier, revision, owner, season, start GW, horizon, weekly squad/lineup/captain/vice/bench/chip/transfer ledger, source snapshot IDs and forecast-model version.
- **Plan output:** valid weekly actions and explicit cost/uncertainty; forecasts are always labeled as model estimates and tagged with run ID.
- **Temporary chips:** Free Hit restores the permanent squad and its relevant transfer state after the temporary week; Wildcard permanently resets the squad; Bench Boost and Triple Captain affect that week only. All applicable season constraints enforced.
- **Preserved managers' work:** incoming API data can mark a scenario outdated, but never silently mutate a saved scenario. Accept/reject changes one action at a time; compare before overwriting.
- **Unavailable inputs:** if club/player/fixture history, used chips, current budget, or prices are unknown, disable the affected recommendation and show the exact missing input; allow independent manual research where feasible.
- **No actual transfers:** no direct transfer execution in the official FPL game.

## C. Mathematical and data provenance contract

- Derive appearance, goals, FPL assists, clean sheets, defensive contributions, saves, concessions, penalties, cards and bonus from the season-specific scoring model. No duplicated or double-counted adjustments.
- Use scenario probabilities for no appearance/cameo/short start/60+ and coherent score distributions where sufficient data exists. Player xPts is a versioned forecast, **not an official observation**.
- VORTEX FDR: independently calibrated 1.0–5.0 Attack FDR and Defence FDR, using historical pre-deadline frozen reference distributions. Until validated, a displayed score must be labeled **provisional opportunity index** rather than calibrated VORTEX FDR.
- Market: source-specific betting odds with bookmaker, fixture, market, line, quote timestamp and retrieval timestamp. Display market-implied probabilities only if coverage and licensing are verified; use a separately labeled statistical model rather than fake market rates when data is missing.
- FPL source: fetch and normalize bootstrap, fixtures and player summary server-side, preserve observation timestamps and stale states; keep historical inputs as-of their actual observation time for backtesting.
- Provenance label on every decision surface: source class (official / vendor / model / fallback), observed time, computed time, freshness and explanation path. Never silently mix GW-specific data from incompatible snapshots.

## D. UX route priorities

1. Home / 10-GW Planner
2. Simulation
3. Players
4. Fixtures
5. Market & Transfers
6. News
7. Guide & Methodology
8. DATA (visible as an admin entry only to authorized users; server protection required regardless)

Data Status, Account, Saved Plans and Model Health are secondary routes or embedded views.

## E. Performance and reliability objectives

- User-visible interaction: no full-page reload for plan edits, theme changes, filters or comparison adjustments.
- Optimize local edits using cached/precomputed projections and run full optimization/Monte Carlo asynchronously with progress, cancellation and server-side rate limits.
- LCP <=2.5 s p75; INP <=200 ms p75; CLS <=0.1; dashboard data and source status must render independently of slow odds/optimizer providers.
- Error/empty/stale/partial/loading states are mandatory. Keep the last *valid* snapshot while explicitly marking staleness; never fabricate freshness.
- Resolve/authorize each scenario on the server, with owner-specific PostgreSQL policies and cross-user integration tests.

## F. Release acceptance criteria

- Every proposed transfer path is season-rules-valid for all 10 weeks including blanks, doubles, transfer hits, banked FTs, price basis and chips.
- Model tests verify probability normalization, event/point reconciliation, repeatable random seeds and unchanged historical training cutoffs; claims of improved accuracy require chronological holdout evidence.
- Create/save/reopen/duplicate/delete/compare plan workflows pass browser and database authorization tests. Non-admins cannot call DATA endpoints even by constructing URLs.
- Every source/stat displays units, coverage and timestamps; absent odds/xPts/EO do not produce fabricated figures.
- Theme, mobile, keyboard and stale-data flows pass E2E; review before any production cutover.
- Keep current Render production service until a staging replacement proves parity and the owner explicitly approves cutover.

## G. Not in first release

Subscription payments, automatic official-FPL transfer execution, unlicensed paid data, unrestricted API-key administration, unverified effective ownership, automated social publication and optimistic simulated rank claims.

**Change control:** Stage 02 specifies contracts only. Code owners, runtime tokens, migrations and live deployment are determined in later stages behind tests.
