import { NextResponse } from "next/server";
import { consumeAuthToken } from "@/server/authTokens";

export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  let token: unknown;
  try { token = (await request.json() as { token?: unknown }).token; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const verified = await consumeAuthToken(token, "verify");
  return verified
    ? NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } })
    : NextResponse.json({ error: "Invalid or expired verification link." }, { status: 400 });
}
