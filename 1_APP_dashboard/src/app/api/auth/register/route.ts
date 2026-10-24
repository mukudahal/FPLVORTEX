import { NextResponse } from "next/server";
import { pool } from "@/db";
import { hashPassword, normalizeEmail, validatePassword } from "@/lib/authCrypto";
import { enforceAuthRateLimit, rejectUntrustedOrigin } from "@/server/auth";
import { mailIsConfigured, sendAuthEmail } from "@/server/authEmail";
import { createAuthToken } from "@/server/authTokens";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const rejected = rejectUntrustedOrigin(request);
  if (rejected) return rejected;
  if (!mailIsConfigured()) return NextResponse.json({ error: "Account verification email is not configured." }, { status: 503 });
  let email: string;
  let password: string;
  let displayName: string;
  try {
    const body = await request.json() as Record<string, unknown>;
    email = normalizeEmail(body.email);
    validatePassword(body.password);
    password = body.password;
    displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 80) : "";
  } catch {
    return NextResponse.json({ error: "Enter a valid email and a password of at least 12 characters." }, { status: 400 });
  }
  if (!await enforceAuthRateLimit(request, email, "register", 5)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  try {
    const hash = await hashPassword(password);
    const result = await pool.query<{ id: string }>(`
      INSERT INTO app_users(email,password_hash,display_name) VALUES ($1,$2,$3) RETURNING id`,
      [email, hash, displayName]);
    const userId = result.rows[0]?.id;
    if (!userId) throw new Error("Database insert did not return user identifier.");
    await sendAuthEmail(email, await createAuthToken(userId, "verify"), "verify");
    return NextResponse.json({ message: "Check your inbox to verify your account." }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Account already exists. Sign in or request a password reset." }, { status: 409 });
    }
    console.error("[auth register] unavailable", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Registration is temporarily unavailable. Existing accounts can request a verification email." }, { status: 503 });
  }
}
