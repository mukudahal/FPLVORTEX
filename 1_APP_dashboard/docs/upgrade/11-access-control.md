# Step 11 — Ownership controls on private stored data

**Applied in source; database integration + negative-user tests remain a production blocker.**

- `migrations/0004_saved_plan_ownership.sql` adds `owner_user_id` to legacy `saved_plans`, preserves rows, and adds an owner-filter index. Old rows are NULL-owned **and intentionally inaccessible**; they are not silently transferred to any user based on a public FPL entry ID.
- `/api/plans` GET, POST, DELETE require a verified session from Step 10. Mutation routes validate same-site Origin, and all reads/mutations filter `owner_user_id` and `entry_id` (and plan ID for updates/deletes). Missing/not-owned IDs return 404.
- New plans are saved under the authenticated principal, not the client-supplied owner. Max 3 active cloud plans per user/entry is serialized via a PostgreSQL transaction advisory lock.
- Uses a bounded streamed JSON request reader to reject chunked oversized writes. Protects plan request sizes and validates name, ID, and projection inputs. The guest planner continues working with existing browser-local storage, while Cloud Plans shows a clear sign-in callout.
- Manager link records are explicitly scoped by authenticated user; a public FPL manager ID is only a watchlist item and does not establish FPL ownership.
- Schema prepared for scenario, solver, simulation, and report ownership; those private APIs do not yet exist and must apply the same owner query rule when introduced.
- **Outstanding:** Test user-A/user-B separation and per-request race conditions against a real PostgreSQL instance; verify RLS or equivalent server auth for every future data route; add staff/admin permission audits; ensure private job output cannot be downloaded by another user.
- Public FPL data endpoints remain public; expensive optimizer jobs will require quotas and authentication before public deployment in Steps 15 and 53.
