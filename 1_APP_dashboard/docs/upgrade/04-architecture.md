# Step 04 — FPL VORTEX production architecture (ADR-0001)

Status: **APPROVED BASELINE / DESIGN COMPLETE**. Implementations occur in their respective numbered upgrade steps; this ADR alone does not claim they are deployed.

## Product and stack

Keep Next.js 16 App Router, React 19, TypeScript 5, Tailwind 4 and PostgreSQL/Drizzle. Retain the current TS analytical engine and Python/PuLP solver. Prefer typed interfaces and backward-compatible migrations to introducing another framework or duplicate compute service.

**One engine, multiple consumers.** Model/fixture/scenario calculations have exactly one owning service. Dashboard, Gameweek Review, Planner, Captaincy, Threats, Mini-League and Reports read those outputs; they do not re-implement statistical formulas.

## Logical boundaries

```text
Data sources (official permitted FPL + explicitly licensed inputs)
  -> ingestion adapters (validate, deduplicate, record freshness, classify terms of use)
  -> PostgreSQL snapshots (raw source hash, timestamp, season, event)
  -> analytical model runs (model version, training horizon, parameter hash)
  -> optimizer/Monte Carlo job queue (immutable input, seed, constraints)
  -> result read-model API (versioned JSON contracts and authorized query)
  -> premium React views + presentations + AI explanations
```

- `src/lib/fpl.ts` remains the FPL client until extraction to `src/server/data/fplSource.ts` in Step 12.
- `src/lib/xpts.ts` remains the **only** xPts/minutes primitive until Step 19/20 calibration; use run data, not copied formulas.
- `src/lib/planEngine.ts` is the canonical transfer legality/plan domain basis; integrate current `lineup.ts` carefully in Step 6.
- `src/lib/monteCarlo.ts` is the only random-outcome simulation engine; isolate its pure functions before asynchronous worker routing.
- `src/lib/solver.py` is the only CBC/PuLP MILP owner, with a documented TS fallback; web APIs should eventually submit jobs rather than synchronously invoking Python.
- `src/lib/intelligence.ts` owns differential and threat calculations, with named cohorts and uncertainty levels.
- `src/lib/aiAnalyst.ts` explains deterministic, validated model/solver results and cannot invent or override numerical predictions.
- `src/app/api/**` routes authenticate, validate input, enforce quotas, call a service/repository and serialize typed outputs. No route owns scoring formulas.
- `src/components/**` renders and controls UI state but does not implement hidden alternative predictors.

## Core immutable contracts

All projections, plans and reports must carry:

```ts
type AnalyticsProvenance = {
  season: string;                   // e.g., "2026/27"
  gameweek: number;                 // 1..38
  snapshotId: string;              // immutable data run
  snapshotCapturedAt: string;      // UTC ISO 8601
  modelVersion: string;
  modelRunId: string;
  sourceAgeSeconds: number;
};

type Projection = AnalyticsProvenance & {
  playerId: number;
  expectedMinutes: number;
  pStart: number;
  pAppear: number;
  p60: number;
  expectedPoints: number;
  expectedPointsP10: number | null;
  expectedPointsP90: number | null;
  components: Record<string, number>;
};

type ScenarioRun = {
  id: string;
  userId: string;
  entryId: number;
  baselineSnapshotId: string;
  modelRunId: string;
  seed: number;
  horizonGameweeks: number[];
  chipConstraints: Record<string, unknown>;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
};
```

These types are an interface specification until the versioned contracts are implemented in Step 13; they are **not** currently production outputs.

## Persistence ownership

| Domain | Canonical persistence | Owner | Introduced in |
| --- | --- | --- | --- |
| Users and manager link | users, manager_links | Identity service | Steps 9–11 |
| FPL entities | clubs, players, fixtures, gameweek states | Ingestion | Step 12 |
| Raw historical evidence | data_snapshots and source items | Data repository | Step 13 |
| Forecasts | projection_runs, player_projections | Prediction engine | Steps 18–22 |
| Manual decisions | plans, plan_actions, saved scenarios | Planner | Steps 5–6, 26 |
| Optimizer tasks | solver_runs and decisions | Async solver worker | Steps 15, 24–25 |
| Simulation paths | simulation_runs and metrics | Monte Carlo worker | Step 23 |
| League membership/exposure | mini_leagues and memberships | League intelligence | Steps 30–33 |
| Market/fitness | price snapshots, forecasts, availability events | Market data jobs | Steps 28–29 |
| Presentation | report_runs and reusable payloads | Reporting worker | Steps 49–51 |

No duplicate `xpts_by_tab`, `price_predictions_for_planner`, or independently recalculated caption/slide scores.

## Canonical navigation and URL contract

| Main tab | Canonical route | Subtabs / major sections |
| --- | --- | --- |
| Dashboard | `/dashboard/[entryId]` | Overview / Decision priorities / Forecast / Risk alerts |
| Gameweek Review (tab 2) | `/review/[entryId]/[gw]` | Live / Actual vs xPts / Captain & bench / Transfer outcomes / Rank & rivals |
| Team Planner (tab 3) | `/planner/[entryId]` | Planner / Simulation / Chips Strategy / Price Increases / Injury List |
| Mini-League | `/league/[leagueId]` | Table / Rivals / Projected position / Exposure / H2H |
| Threats & Must-Own | `/threats/[entryId]` | Threats / EO / Must-own / Differentials |
| Captaincy | `/captaincy/[entryId]` | Decision table / Distribution / Vice captain / EO exposure |
| Transfers & Solver | `/transfers/[entryId]` | Hold vs candidate / Optimizer / Constraints / Tradeoffs |
| Players | `/players` | Player finder / Comparisons / Projections |
| Fixtures | `/fixtures` | Calendar / Difficulty / Blanks / Doubles |
| Reports | `/reports/[entryId]/[gw]` | HTML Slides / PDF / PPTX / 4K PNG / Archive |
| Status | `/status` | Sources / Models / Jobs / Accuracy |
| Settings | `/settings` | Team binding / Plan sharing / Account / Subscription |

Keep `/team/[id]`, `/plan/[id]`, and `/planner` working until backward-compatible migration + browser tests. Never redirect them blindly if workflows/data would be lost.

## Decision invariants

1. **Rules must be season-versioned** and tested against official rule sources; never hardcode assumed FT/chip carryover semantics across seasons.
2. **Review uses pre-deadline snapshot**, not a rebuilt post-deadline prediction, avoiding hindsight contamination.
3. **Scenario A/B uses the same world**, paired random draws/seed and projection snapshot.
4. **Probabilities must be calibrated**; display a price signal index when a probability has not been validated.
5. **Must-own is relative to best feasible replacement** within squad budget, rules and risk mode; it is not merely a highly owned player's label.
6. **Unlicensed proprietary projections are not training data**; only owner-provided licensed data may be blended in.
7. **Ownership/EO sampled cohorts must be labeled** with sample count; never claim exact top-X ownership based on tiny samples.
8. **Server authorization is required** for saved plans, solver jobs, paid AI and report generation.
9. **GET endpoints read only**; price refresh and backtesting are worker write jobs.
10. **No silent downgrade** from failed Python solver to a potentially non-equivalent heuristic; label fallback and bound constraints.
11. **Costly work stays off the request path** and enforces timeout, concurrency, budget and cancel controls.
12. **Web charts and slide deck consume identical report data**, with the same `snapshotId` and `modelVersion`.

## Dependency-directed implementation sequence

1–4 foundation audits/architecture -> 5–7 canonical planner, shared domain rules, env -> 8–14 schema/migrations and ingestion -> 15–18 workers, season rules, reproducibility -> 19–27 predictions, optimizer, simulation and chip decisions -> 28–34 market/league/threats/captaincy -> 35–48 premium UI domains and AI -> 49–54 reports/operations/experience -> 55–59 QA, CI, staging, production -> 60–61 subscription and monitoring improvements.

**Deployment gate:** never deploy or apply migrations as a side effect of unpacking this ZIP. Secrets, production DB, rate limiting, and current official FPL season rules must be verified independently during their allocated steps.
