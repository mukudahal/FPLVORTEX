# Step 16 — Scheduled FPL source and live updates

Status: **SOURCE IMPLEMENTED; production scheduling requires hosting/worker configuration**.

- `vercel.json`: requests `/api/cron/schedule` every ten minutes. **This frequency requires a compatible paid hosting plan**, not a default free-tier Cron guarantee. It is not active until deployed with `CRON_SECRET`.
- `src/app/api/cron/schedule/route.ts`: constant-time Bearer-secret check, FPL fixture access through Step 12 source adapters, only enqueues jobs. No long-running analysis executes inside the scheduled web request.
- `src/lib/refreshSchedule.ts`: stable UTC hourly job-key slot for bootstrap/fixtures; ten-minute live slot is active only from 15 minutes before a scheduled kickoff through up to five hours after, and never for finished or blank-gameweek fixtures. Keyed to the fixture's actual gameweek.
- `src/server/jobs/queue.ts`: per-slot idempotent insert with deduplication of recently pending jobs so slow workers do not accumulate hourly duplicates.
- `migrations/0007_live_automation.sql`: add `live` job type through a forward-only migration rather than mutating migration 0006.
- `src/server/jobs/runner.ts`: refresh jobs persist immutable official bootstrap/fixture inputs. Live jobs persist immutable official gameweek/live player inputs, and both update last-run status entries consumed by `/api/automation/status`.
- Completed tests: deterministic slot keys, out-of-match exclusion, finished/blank exclusions, authorized cron queue wiring and additive migration checks.

**Not yet shipped:** worker hosting, Vercel Cron activation, post-GW review notifications or image slide publishing. Reports at 05:30 and 17:20 America/New_York (with DST) require the renderer + delivery system in Steps 50–51; this implementation schedules data collection only and makes no claim that reports are being sent.
