import { pool } from "@/db";
import { isValidToken, issueToken, tokenDigest } from "@/lib/authCrypto";
import { readPublicSiteUrl } from "@/lib/runtimeConfig";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: "member" | "admin";
}

export const SESSION_AGE_SECONDS = 60 * 60 * 24 * 14;
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-vortex_session" : "vortex_session";

export function trustedOrigin(request: Request): boolean {
  const received = request.headers.get("origin");
  try { return received === new URL(readPublicSiteUrl()).origin; }
  catch { return false; }
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const entry of header.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const value = entry.slice(separator + 1).trim();
    return isValidToken(value) ? value : null;
  }
  return null;
}

export async function currentUser(request: Request): Promise<AuthUser | null> {
  const token = readSessionCookie(request);
  if (!token) return null;
  const result = await pool.query<{
    id: string; email: string; display_name: string; role: "member" | "admin";
  }>(`SELECT u.id, u.email, u.display_name, u.role
     FROM auth_sessions s JOIN app_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.email_verified_at IS NOT NULL
     LIMIT 1`, [tokenDigest(token)]);
  const user = result.rows[0];
  return user ? { id: user.id, email: user.email, displayName: user.display_name, role: user.role } : null;
}

export async function newSession(userId: string): Promise<string> {
  const { plain, digest } = issueToken();
  await pool.query(`INSERT INTO auth_sessions(user_id, token_hash, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '14 days')`, [userId, digest]);
  return plain;
}

export async function revokeSession(request: Request): Promise<void> {
  const token = readSessionCookie(request);
  if (token) await pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [tokenDigest(token)]);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const,
    path: "/", maxAge: SESSION_AGE_SECONDS,
  };
}

/** Rate-limited by hashed email and remote address; avoids echoing or storing the address. */
export async function enforceAuthRateLimit(request: Request, email: string, action: string, limit = 5): Promise<boolean> {
  const remote = (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
  const digest = tokenDigest(`${action}|${email}`);
  const remoteDigest = tokenDigest(`${action}|ip|${remote}`);
  const result = await pool.query<{ attempts: number }>(`
    INSERT INTO auth_rate_limits(identity_key, attempts, window_started_at)
    VALUES($1, 1, NOW())
    ON CONFLICT(identity_key) DO UPDATE SET
      attempts = CASE WHEN auth_rate_limits.window_started_at <= NOW() - INTERVAL '15 minutes'
        THEN 1 ELSE auth_rate_limits.attempts + 1 END,
      window_started_at = CASE WHEN auth_rate_limits.window_started_at <= NOW() - INTERVAL '15 minutes'
        THEN NOW() ELSE auth_rate_limits.window_started_at END
    RETURNING attempts`, [digest]);
  const ipResult = await pool.query<{ attempts: number }>(`
    INSERT INTO auth_rate_limits(identity_key, attempts, window_started_at)
    VALUES($1, 1, NOW())
    ON CONFLICT(identity_key) DO UPDATE SET
      attempts = CASE WHEN auth_rate_limits.window_started_at <= NOW() - INTERVAL '15 minutes'
        THEN 1 ELSE auth_rate_limits.attempts + 1 END,
      window_started_at = CASE WHEN auth_rate_limits.window_started_at <= NOW() - INTERVAL '15 minutes'
        THEN NOW() ELSE auth_rate_limits.window_started_at END
    RETURNING attempts`, [remoteDigest]);
  return (result.rows[0]?.attempts ?? limit + 1) <= limit &&
    (ipResult.rows[0]?.attempts ?? limit * 6 + 1) <= limit * 6;
}

export function rejectUntrustedOrigin(request: Request): Response | null {
  return trustedOrigin(request) ? null : Response.json({ error: "Invalid request origin." }, { status: 403 });
}
