import { NextResponse } from "next/server";
import { rejectUntrustedOrigin, revokeSession, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth";

export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  const rejected = rejectUntrustedOrigin(request);
  if (rejected) return rejected;
  await revokeSession(request);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
