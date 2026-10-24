# Step 15 — Durable background jobs

Status: **SOURCE IMPLEMENTED; production integration outstanding**.

- `migrations/0006_background_jobs.sql`: idempotency keys, authenticated owner column, constrained job kinds, 3 attempts by default, lease fields, scheduled retries and job-claim indexes.
- `src/server/jobs/queue.ts`: Postgres queue with transactionally serialized per-owner active job caps, idempotent optimizer requests, atomic `FOR UPDATE SKIP LOCKED` leasing, lease renewal, exponential retry and terminal failure recovery.
- `src/server/jobs/runner.ts`: dedicated Node worker executes optimizer calculations in its own process, or refreshes official snapshots. It shares `computeOptimizerForEntry` with the existing synchronous endpoint; no duplicate optimizer rules.
- `src/app/api/jobs` (POST) + `src/app/api/jobs/[id]` (GET): account-protected submit and poll endpoints. Submit requires `Origin`, an entry ID, horizon (1–10) and client-generated UUID `requestId`. Jobs are private to the submitting user.
- `npm run worker` / `npm run worker:once`: Node 22's TypeScript transformation plus a local path-alias loader; no new npm dependencies. Configure `.env.local` with DATABASE_URL and start the worker as a persistent container/VM or separately managed process, **not** a serverless UI handler. `worker:once` is suitable for a scripted smoke test.
- For original UI backward compatibility, `/api/optimizer/[id]` still supports the synchronous GET. Move client traffic to POST queue + polling as part of planner UI integration (Step 39), and put resource quotas on legacy GET (Step 53).

**Not verified:** live PostgreSQL SKIP LOCKED contention, process supervision, transaction locks, Python/CBC environment, deployment worker uptime and resource budgets. Job execution needs a live host; adding a queue alone does not start a production worker.
