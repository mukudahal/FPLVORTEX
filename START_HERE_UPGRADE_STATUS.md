# FPL VORTEX — Stage 03 Cumulative Upgrade (Steps 01–16)

Source archive: `FPL_VORTEX_PREMIUM_AUTOMATED_UPGRADE.zip` remains unchanged. This package is a **multi-page Next.js source project**, **not a deployed website**.

## Progress

- **01–05:** Source preservation and baseline, feature inventory, production architecture, unified Team Planner (with outstanding clean-build validation).
- **06:** Canonical scoring and transfer rules.
- **07:** Runtime/environment validation with no hardcoded database secrets.
- **08:** Transactional, checksummed migrations with legacy database adoption.
- **09:** Season-scoped player, fixture, predictions, simulations, leagues, pricing and reporting schema.
- **10:** Email-account authentication, verification, password resets, sessions and public FPL manager watchlist.
- **11:** Saved-plan authentication and owner isolation.
- **12:** Central typed source adapters and normalized official FPL data.
- **13:** Append-only SHA-256 snapshots of official bootstrap/fixtures and live data.
- **14:** Bounded upstream timeouts, retries, stale-cache behavior and freshness indicators.
- **15:** Durable, owned optimizer/refresh job queue with leased retries and a dedicated Node 22 worker.
- **16:** Authenticated 10-minute scheduler that queues hourly bootstrap/fixtures and gameweek-scoped in-match live updates.
- **17–61:** **PENDING**; tracked in `1_APP_dashboard/docs/upgrade/PROGRESS.csv`.

## Verification and limitations

- **76/76 source-level regression tests passed**, including newly added tests, and **139 TS/TSX files passed syntax-transpile checks**.
- SQL migrations 0001–0007 pass dry-run validation, **not live PostgreSQL execution**.
- The full Next.js production build, TypeScript semantic typecheck, lint, production auth flow, database performance, background-worker lifecycle, and live API integrations remain unverified because dependencies/credentials/hosting were unavailable in the development runtime.
- The source is preserved in `1_APP_dashboard/.git` with step-by-step commits and change documentation.
- No database migration, cron schedule, account email, worker, external service, or public site was deployed or activated.
- A ten-minute Vercel Cron schedule may require a paid plan; a persistent worker and valid `CRON_SECRET`/`DATABASE_URL` are required for automation.
- Proprietary FPLReview projections, licensed media, subscription management and actual scheduled graphic report publishing are **not implemented**.

## Next task

**Step 17: implement officially verified, season-specific FPL scoring, transfers and chip rules.** Preserve the existing results and run regression tests before marking the step complete.

See `1_APP_dashboard/UPGRADE_README.md`, `docs/upgrade/PROGRESS.csv`, and `docs/upgrade/16-scheduled-automation.md` for detailed implementation notes.
