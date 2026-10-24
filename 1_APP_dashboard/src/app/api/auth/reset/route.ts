import { NextResponse } from "next/server";
import { isValidToken, validatePassword } from "@/lib/authCrypto";
import { rejectUntrustedOrigin } from "@/server/auth";
import { consumeAuthToken } from "@/server/authTokens";

export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  const rejected = rejectUntrustedOrigin(request);
  if (rejected) return rejected;
  let token: string;
  let password: string;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!isValidToken(body.token)) throw new Error("bad token");
    validatePassword(body.password);
    token = body.token;
    password = body.password;
  } catch { return NextResponse.json({ error: "Invalid or expired link or password shorter than 12 characters." }, { status: 400 }); }
  const changed = await consumeAuthToken(token, "reset", password);
  return changed
    ? NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } })
    : NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
}
