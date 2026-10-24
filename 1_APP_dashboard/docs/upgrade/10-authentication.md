# Step 10 — Account authentication and manager watchlist

**Source implementation complete; production activation blocked pending PostgreSQL migrations, email sender credentials, live integration tests and security review.**

- `migrations/0003_auth.sql`: HTTP-only session-token hash storage, purpose-bound one-time verification/reset tokens, database-backed hashed identity rate limits.
- `src/lib/authCrypto.ts`: random 256-bit tokens; SHA-256 token digests; salted Node `scrypt` password hashing; timing-safe verification; 12-character minimum.
- `src/server/auth.ts`, `authTokens.ts`, `authEmail.ts`: secure session cookies (14-day expiry), origin checks, one-time token transactions, password reset revoking all sessions, Resend transactional email integration.
- Routes `/api/auth/register`, `/login`, `/logout`, `/me`, `/verify`, `/resend`, `/request-reset`, `/reset`, `/manager`; public `/login`, `/register`, `/account`, `/auth/verify`, `/auth/forgot`, `/auth/reset` pages.
- Manager ID linking is an **opt-in public manager watchlist**, not verified FPL account ownership. It never grants access to the manager's protected data.
- Authentication does not imply ownership authorization in legacy data routes. Step 11 implements this before production release.
- Requires configured `DATABASE_URL`, `RESEND_API_KEY`, `AUTH_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL`; origin validation expects configured site origin. OAuth/SSO is not built.
- Test database + live email sandbox must verify session lifecycle, email verification, concurrency, token expiry, reset/revocation, rate limits, and cookie security.

**Security concerns for deployment stage:** application-level rate limits should be backed by trusted edge IP rate limiting; production must not trust arbitrary forwarded IP headers. Complete pen test, origin review and expiry cleanup in Steps 53–58.
