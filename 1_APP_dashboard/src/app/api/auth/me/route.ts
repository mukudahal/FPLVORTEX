import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const user = await currentUser(request);
  return NextResponse.json({ user }, { headers: { "cache-control": "no-store" } });
}
