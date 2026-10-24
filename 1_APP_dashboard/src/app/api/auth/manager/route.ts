import { NextResponse } from "next/server";
import { pool } from "@/db";
import { currentUser, rejectUntrustedOrigin } from "@/server/auth";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const rows = await pool.query<{ id: string; entry_id: number; nickname: string; is_primary: boolean }>(
    "SELECT id, entry_id, nickname, is_primary FROM manager_links WHERE user_id=$1 ORDER BY is_primary DESC, created_at", [user.id]);
  return NextResponse.json({ managers: rows.rows }, { headers: { "cache-control": "no-store" } });
}
export async function POST(request: Request): Promise<Response> {
  const rejected = rejectUntrustedOrigin(request);
  if (rejected) return rejected;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  let entryId: number;
  let nickname: string;
  try {
    const body = await request.json() as Record<string, unknown>;
    entryId = Number(body.entryId);
    if (!Number.isSafeInteger(entryId) || entryId <= 0) throw new Error("invalid entryId");
    nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 64) : "";
  } catch { return NextResponse.json({ error: "Invalid manager ID." }, { status: 400 }); }
  const result = await pool.query(`INSERT INTO manager_links(user_id,entry_id,nickname)
    VALUES ($1,$2,$3) ON CONFLICT (user_id,entry_id) DO UPDATE SET nickname=EXCLUDED.nickname
    RETURNING id, entry_id, nickname, is_primary`, [user.id, entryId, nickname]);
  return NextResponse.json({ manager: result.rows[0] }, { status: 201 });
}
