import { NextResponse } from "next/server";
import { pool } from "@/db";
import { normalizeEmail, verifyPassword } from "@/lib/authCrypto";
import { enforceAuthRateLimit, newSession, rejectUntrustedOrigin, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const rejected = rejectUntrustedOrigin(request);
  if (rejected) return rejected;
  let email: string;
  let password: unknown;
  try {
    const body = await request.json() as Record<string, unknown>;
    email = normalizeEmail(body.email);
    password = body.password;
  } catch { return NextResponse.json({ error: "Invalid credentials." }, { status: 400 }); }
  if (!await enforceAuthRateLimit(request, email, "login", 8)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const result = await pool.query<{ id: string; password_hash: string | null; email_verified_at: Date | null }>(`
    SELECT id, password_hash, email_verified_at FROM app_users WHERE LOWER(email)=$1 LIMIT 1`, [email]);
  const user = result.rows[0];
  if (!user || !await verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }
  if (!user.email_verified_at) {
    return NextResponse.json({ error: "Verify your email address before signing in." }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await newSession(user.id), sessionCookieOptions());
  response.headers.set("cache-control", "no-store");
  return response;
}
