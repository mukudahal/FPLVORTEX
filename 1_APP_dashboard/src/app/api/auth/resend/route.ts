import { NextResponse } from "next/server";
import { pool } from "@/db";
import { normalizeEmail } from "@/lib/authCrypto";
import { enforceAuthRateLimit, rejectUntrustedOrigin } from "@/server/auth";
import { mailIsConfigured, sendAuthEmail } from "@/server/authEmail";
import { createAuthToken } from "@/server/authTokens";

export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  const rejected = rejectUntrustedOrigin(request);
  if (rejected) return rejected;
  let email: string;
  try { email = normalizeEmail((await request.json() as { email?: unknown }).email); }
  catch { return NextResponse.json({ error: "Invalid email." }, { status: 400 }); }
  if (!await enforceAuthRateLimit(request, email, "verify-resend", 3)) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  if (!mailIsConfigured()) return NextResponse.json({ error: "Email service unavailable." }, { status: 503 });
  const users = await pool.query<{ id: string }>(`SELECT id FROM app_users WHERE LOWER(email)=$1 AND email_verified_at IS NULL LIMIT 1`, [email]);
  if (users.rows[0]) {
    try { await sendAuthEmail(email, await createAuthToken(users.rows[0].id, "verify"), "verify"); }
    catch { console.error("[auth resend] delivery unavailable"); }
  }
  return NextResponse.json({ message: "If an unverified account exists, a verification link has been sent." });
}
