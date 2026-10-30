# FPL VORTEX — Supabase Auth / private plans / DATA RLS (P0 staging gate)

**Status:** Schema migration and structural audit prepared on a development branch. **Not applied, not provisioned, not running in production.**  
**Project:** `mukudahal/FPLVORTEX`, current Render Vite/Express frontend.  
**Prerequisite:** Connect the user's **Supabase** integration and select a distinct STAGING project; never infer a project/database URL or commit a password.

## Architecture decision and scoped implementation

- `supabase/migrations/20261030_000001_vortex_plans_admin.sql` establishes private per-account 10-GW scenarios and immutable JSONB revisions. Each revision has an owner-bound composite foreign key, stored source snapshot/model version, and a 1MB payload limit. Actual transfer/lineup/chip legality remains enforced by the versioned server model, **not** implied by a JSON document passing an RLS check.
- `vortex_private.admin_grants` is inaccessible to the public and authenticated database roles. A server/service-role operator must deliberately grant admin membership to an account *after identity verification and MFA*. There is no route where a user can grant themselves admin.
- `vortex_private.is_vortex_admin()` is a security-definer membership check with sealed `search_path` in a schema excluded from public Data API exposure; `public.vortex_admin_data_runs` is readable only by authenticated admins, and writable only by trusted service-role workers. Never store provider API keys or raw licensed feeds in the diagnostics table.
- There is no shared, hardcoded DATA password. Passwords are set privately through Supabase Auth and should use MFA. **Do not reuse a password posted in chat.**
- The existing root browser-local plan slots stay operational during the migration. No local user plan is uploaded or replaced without the user's consent and a verified account.

## Exact staging acceptance procedure

1. Connect Supabase. Identify an isolated staging project and verified Auth credentials; keep admin/user secrets only in the Supabase dashboard and hosting secret store. Set up two distinct staging users, A and B, and one admin after MFA.
2. Snapshot staging schema and check for existing objects. Dry-run the migration against staging, review privileges, execute it as an authorized migrations operator. Never use the production Render DB.
3. Run `supabase/tests/20261030_rls_structural_audit.sql` in staging. It checks RLS switches, the 7 expected policies, anon denial, immutable revisions, admin-only diagnostics and sealed admin membership function. Passing this structural check is **not** a substitute for authenticated API behavior tests.
4. **End-to-end two-user verification with real authenticated session/JWT contexts:** anonymous reads/writes denied; A can create and read own plan; B cannot read, modify, delete, overwrite, or create a revision for A's plan; a user cannot change `owner_id`; a scenario revision cannot be edited/deleted after insertion; conflicting revision numbers fail without changing the old revision; plan deletion follows RLS and cascades only owner-specific revisions.
5. **DATA admin verification:** anonymous and user B denied direct REST/admin route access; admin can SELECT safe diagnostics; user A cannot self-grant admin; neither ordinary user nor admin browser can directly INSERT diagnostics; only trusted background worker can record a run. API authorization must be checked **server-side** as well as by RLS.
6. Build authenticated plan APIs / UI against tested staging schema: save/list/duplicate/revise and compare; explicit version conflicts; undo with a new revision; no silent source-driven overwrite. Then implement protected DATA diagnostics and update controls with audit log, cancellation and role checking.
7. Run Playwright E2E, DB authorization tests, and a restore/rollback rehearsal. Production migration remains blocked until the user authorizes rollout and correct Supabase project is connected.

## Do not do

- Do **not** place private service-role keys into `NEXT_PUBLIC_*`, Vite `VITE_*`, browser localStorage, logs, GitHub files, model prompts, public API or source maps.
- Do **not** apply this migration to Render's existing app or declare that a protected DATA tab is live.
- Do **not** equate a link hidden from navigation with secure access.
- Do **not** promote custom Next.js/Drizzle sessions as already integrated with Supabase Auth.
- Do **not** create a paid project/service without an explicit request.
- Do **not** claim RLS tests passed until actual staging PostgreSQL and two-user tests have run.

## Next dependent code tasks

- Supabase connection and project access (external user action).
- Session verification middleware and a strongly typed owner-only scenario repository adapter in the chosen runtime.
- Plan revisions / team price and chip validation before write.
- Admin server routes with enforced permission checks and structured audit.
- Staging E2E and production release authorization.

**Completion is gated by the real connected service, not by the existence of SQL text in the repository.**
