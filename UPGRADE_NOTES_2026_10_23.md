# FPL Vortex — Premium Decision OS (October 23, 2026)

## What this upgrade adds

- Premium, responsive command-center dashboard and refreshed dark/light styles. These are original styles; reference-site source, brand assets, and proprietary UI artwork are not copied.
- New captaincy radar and live `1 / 3 / 5` gameweek projections using the Vortex `computePlayerXPts` engine: position-aware priors, minutes and injury probability, fixture difficulty, defensive contribution, bonus and GW blanks/doubles.
- Interactive player ranking by combined xPts, immediate xPts, price value, and ownership-adjusted differential upside; low-risk toggle and week-by-week fixture forecast heatmaps.
- An opt-in reasoning-model analyst (`gpt-6-astra` by default) through the official OpenAI Responses API. The model explains the deterministic optimizer result and does not replace numbers, invent transfers, or promise finishing positions. With `FPL_AI_ENABLED=false` or no API key, the deterministic copilot remains functional.
- Authenticated background warm-up endpoint, `GET /api/cron/refresh`; status endpoint, `GET /api/automation/status`; production cron entry in `vercel.json` once daily at 10:00 UTC for Hobby compatibility. On-demand cache continues using the existing API TTL. Scheduled jobs require a deployed production project.
- Environment template `.env.example`; no keys embedded in the project.

## Setup

```bash
cd 1_APP_dashboard
npm ci
cp .env.example .env.local
# Configure DATABASE_URL for an existing PostgreSQL database, and apply your existing DB migrations.
npm run typecheck
npm run test:planning
npm run dev
```

If you have the Vercel project configured, set `CRON_SECRET` (random 16+ characters) in project settings, deploy the new `vercel.json`, and check `/api/automation/status` after the first scheduled run. **Without Postgres, data persistence and server-driven routes are not functional.** The API currently contains a graceful in-memory / stale-cache path for failures, not a persistent alternative.

To enable the stronger model, set `FPL_AI_ENABLED=true`, add your own `OPENAI_API_KEY` on the server, and optionally set `FPL_COPILOT_MODEL=gpt-6.1-sol` for lower cost. The OpenAI API is billed separately; see the provider's current pricing. Public users invoking `/api/copilot` can trigger billable model calls when enabled: **add authentication and request rate limiting before public launch**.

Vercel's Hobby plan currently supports scheduled jobs at most once daily, without exact execution-minute guarantees. On Pro, you can change `vercel.json` to more frequent cron intervals. Vercel crons use UTC; exact America/New_York wall-clock delivery with daylight saving requires date-aware scheduling outside the static cron expression.

## Scope and provenance

- FPLCore.com and FPLReview.com were used as **public feature references** only. The new visuals, application code, copy, and projections remain independently built.
- FPLReview's Massive Data projections, elite ownership, and proprietary optimizer are **not included**. Connecting a licensed export or authorized source is a separate integration.
- Official Premier League player photographs/club crests are currently fetched through the project's preexisting public image resolvers; confirm each source's licensing and permitted use before publishing a paid product.
- Not connected to the user's desktop, GitHub repo, Vercel project, or FPLCore.com domain. The supplied ZIP is the source of the modified copy.
