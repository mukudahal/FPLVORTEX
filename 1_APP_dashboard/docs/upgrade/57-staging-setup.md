# Stage-only infrastructure & deployment checklist

- Node 22, Vercel preview/staging project, secured `DATABASE_URL` (Postgres), dedicated queue worker (not a serverless ephemeral function), Node/Python optimizer requirements, durable cache, HTTPS origin.
- Add `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET` (32+ random bytes), email provider key and `OPENAI_API_KEY` + verified `FPL_COPILOT_MODEL` when enabling optional features.
- In staging: back up database, apply migrations 0001–0009, validate 2026/27 chip invariants, manually sign up two test accounts, test unauthorized reads, confirm reports are opt-in only and not shared.
- Run cron/worker once in staging with idempotency tests and observe snapshots, job retries, model-health response and report JSON archive.
- Run `npm run test:smoke` against real HTTPS staging, then all functional browser tests.
- Set up retention/deletion for manager data, migrations backup, Postgres metrics, HTTP error tracking, source freshness, job backlog, report failures, API spend and model drift.
- Enable automated reports only for opted-in users. Email delivery, subscription billing and public promotional claims remain OFF until reviewed.
- Production promotion is intentionally not performed by this source ZIP. No service keys, subscriptions or live payment charges are provisioned.

## Fail-closed production gate

Run `npm run check:release` after separately collecting staging verification evidence into
`docs/upgrade/STAGING_EVIDENCE.json` (not included and never forged). Twelve explicit checks must each
have a `status: "passed"` and a verifiable `evidence` reference. Absence of evidence blocks release.
A prior dry run, passing Node unit tests, or a static TypeScript syntax check does NOT meet this gate.
