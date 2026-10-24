# Step 7 — Validated runtime configuration

**Implemented. Deployment configuration remains environment-specific and unverified.**

- Replaced insecure hard-coded `drizzle.config.json` with `drizzle.config.ts` loading `.env.local` and `.env`, with no baked-in password.
- Added validated `src/lib/runtimeConfig.ts` for database, public domain, cron credentials and opt-in LLM settings; no default claim of API model access.
- Wired database, cron routes, AI explainer and SEO metadata into the same validation rules.
- Documented every referenced runtime variable in `.env.example` with no live secrets.
- Added `npm run check:env` to fail missing deployment credentials without echoing their values.
- Added 3 config tests; `npm run test:planning` 36/36 passed.

Next releases must pass `npm run check:env` and test live PostgreSQL and provider credentials in a private staging environment. Do not put secrets inside this ZIP.
