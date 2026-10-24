# Step 6 — One canonical FPL calculation layer

**Status: implemented and regression-tested; full build remains unverified until npm registry works.**

- `src/lib/scoring.ts`: one formation algorithm; goal/clean-sheet scoring tables; transfer penalty, FT carryover, selling price, captain/bench scoring.
- `src/lib/lineup.ts` and `src/lib/optimizer.ts` now delegate to this shared solver; previous duplicate optimizer function removed; legacy optimizer export retained.
- `src/lib/planEngine.ts`: shared team selection, hit rules, chip totals and FT carryover.
- `src/lib/xpts.ts`: shared goal/CS points and selling price; historical free-transfer parser uses the same banked-FT rule.
- `src/lib/monteCarlo.ts`: canonical clean-sheet points.
- `scripts/scoring.test.cjs`: verifies planner/optimizer parity, TC/BB, WC/FH, hits, selling price, malformed squads.
- `scripts/register-typescript.cjs` fixes the test harness for imports of other TypeScript modules.

**2026/27 verified sources:** https://www.premierleague.com/en/news/2174900/fpl-basics-chips ; https://www.premierleague.com/en/news/2174907/1000 ; https://fantasy.premierleague.com/help/faqs .

The confirmed WC/FH rule **preserves** existing banked free transfers; it does **not** award another FT when activating either chip. The pre-upgrade planner mistakenly incremented by one. Historical FPL rules will be parametrized by season in Step 17; only 2026/27 is assumed for this upgrade.

**Tests:** `NODE_PATH=$(npm root -g) npm run test:planning` — 33/33 pass. Next gate: full npm install, TypeScript/ESLint and Next production build on a machine with working npm registry access.
