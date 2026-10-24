# FPL VORTEX — Premium Website Engineering Upgrade

This is a **multi-page Next.js source project**, not a one-page graphics sample. Existing Vortex UI and analytical capabilities are preserved as the implementation moves through the 61-step upgrade plan.

## Current staged implementation

See `docs/upgrade/PROGRESS.csv` for the unique, sequential 61-step ledger.

- Steps 1–5: baseline Git history, audit, architecture, one canonical Team Planner and backward-compatible draft parsing.
- Step 6: one FPL scoring engine for XI, captaincy, chips, transfer hits, selling prices and rollover.
- Step 7: no hardcoded database credentials; validated runtime environment.
- Step 8: transactionally safe, checksummed migration runner with legacy baseline adoption.
- Step 9: season-scoped FPL data, snapshots, predictions, simulations, league, market and reporting database entities.
- Step 10: secure account/session routes, email verification and password reset, manager watchlist; email and DB service are not connected in the ZIP.
- Step 11: authenticated ownership of cloud saved plans; anonymous local planner drafts still function. Unclaimed old database records stay quarantined.
- Step 12: central validated official-FPL source adapters and one canonical player/fixture normalization flow across dashboard, planner, optimizer, rivals, pricing and reporting feeds.
- Step 13: canonical SHA-256 snapshots of FPL source inputs; append-only database trigger and idempotent scheduled capture; PostgreSQL deployment pending.
- Step 14: resilient FPL gateway with timeouts, bounded retries, bounded stale fallback, response freshness metadata and upstream validation; distributed quotas need staging tests.
- Step 15: Postgres-backed optimizer/refresh job queue, authenticated submit/poll, dedicated Node background worker and leased retries; live worker not deployed.
- Step 16: guarded 10-minute schedule that queues hourly official-FPL refresh plus fixture-aware in-match live snapshots; needs paid-compatible Cron + deployed worker.

**Testing scope:** Planning tests, security unit tests, migration static tests, and TypeScript syntax checks are not a substitute for a clean Next.js production build, PostgreSQL integration tests, or a production security review. These remain release blockers until CI/staging evidence is recorded.

## Local setup (safe defaults)

```bash
cd FPL_VORTEX_FINAL/1_APP_dashboard
npm ci
cp .env.example .env.local
# Put your own DATABASE_URL and other optional keys in .env.local; never commit them.
npm run db:migrate:dry-run
# For fresh DB only, after making a DB backup: npm run db:migrate
# For existing DB without migration history, see docs/upgrade/08-migrations.md
npm run test:planning
npm run typecheck
npm run lint
npm run build
npm run dev
```

Server prerequisites: PostgreSQL, Node.js 22, Python/PuLP/CBC for advanced optimizer, a verified outgoing mail domain + `RESEND_API_KEY` for account verification, `CRON_SECRET` for scheduled sync, and OpenAI API credentials with a **verified supported model ID** only if AI explanations are enabled. AI explanations never replace numerical projections.

## Source and licensing

Reference layouts inspired an **original** FPL VORTEX experience. This ZIP does not contain FPLReview's paid proprietary models. FPL imagery and football data availability/terms must be reviewed before commercial deployment.

## Deployment

Do not run migrations or deploy this archive automatically. Staging database, HTTPS domain, mail service, authorization tests, secret configuration and a clean production build are required.

## Stage 04 — Steps 17–61 (source-level implementation pass)

**Read `docs/upgrade/04-stage04-progress.md` first.** It contains exactly one entry per step 17–61, source paths, completion status and known blocks. `docs/upgrade/PROGRESS.csv` remains the canonical 61-step tracker.

New premium website sections include Gameweek Review, Team Planner subtabs (Simulation, Chips Strategy, Price Increases, Injury List), Mini-League and sampled effective ownership, Threats and Must-Own, Captaincy, Player Forecasts, Reports, and the Data/Model Status view. All heuristic outputs label their evidence and uncertainty. The original home dashboard, players and fixtures continue to exist.

The `scripts/reporting/` folder can render a **verified three-slide 4K PNG + PowerPoint + PDF** layout from an observed FPL report JSON. An intentionally synthetic example is in `scripts/reporting/demo-output/`; never publish that sample as real results. Automated reports are opt-in and archived to the authenticated account, **not emailed or posted**.

**Validation:** 100 Node planning/static/integration checks passed; migration dry-run verifies 0001–0009; 170 TS/TSX files parse syntactically. **Full package installation, compiler typechecking, lint, production build, database integration, browser QA and deployment remain blocked/unverified**. `npm run check:release` fails closed until independent staging evidence is provided. Stripe/billing is not implemented. Do not treat this ZIP as an operational commercial service.
