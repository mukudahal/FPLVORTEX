import { NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { savedPlans } from "@/db/schema";
import { currentUser, rejectUntrustedOrigin } from "@/server/auth";
import { PayloadTooLargeError, readJsonLimited } from "@/server/requestBody";

export const dynamic = "force-dynamic";

const MAX_PLANS = 3;
const MAX_PLAN_BYTES = 64 * 1024;

function positiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function unauthorized(): Response {
  return NextResponse.json({ error: "Sign in to manage saved plans." }, { status: 401 });
}

export async function GET(req: Request): Promise<Response> {
  const user = await currentUser(req);
  if (!user) return unauthorized();
  const entryId = positiveId(new URL(req.url).searchParams.get("entry"));
  if (!entryId) return NextResponse.json({ error: "Invalid entry." }, { status: 400 });
  const rows = await db.select().from(savedPlans)
    .where(and(eq(savedPlans.ownerUserId, user.id), eq(savedPlans.entryId, entryId), eq(savedPlans.active, true)))
    .orderBy(asc(savedPlans.createdAt));
  return NextResponse.json(rows, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  const rejected = rejectUntrustedOrigin(req);
  if (rejected) return rejected;
  const user = await currentUser(req);
  if (!user) return unauthorized();
  let body: Record<string, unknown>;
  try {
    const parsed = await readJsonLimited(req);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new SyntaxError("invalid object");
    body = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return NextResponse.json({ error: "Plan is too large." }, { status: 413 });
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const entryId = positiveId(body.entryId);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  const savedId = body.id === undefined || body.id === null ? null : positiveId(body.id);
  const points = Number(body.projectedPoints ?? 0);
  const data = body.data;
  if (!entryId || !name || savedId === null && body.id !== undefined && body.id !== null ||
      data === null || typeof data !== "object" || Array.isArray(data) ||
      !Number.isFinite(points) || Math.abs(points) > 100000 ||
      Buffer.byteLength(JSON.stringify(data), "utf8") > MAX_PLAN_BYTES) {
    return NextResponse.json({ error: "Invalid plan contents." }, { status: 400 });
  }

  if (savedId !== null) {
    const rows = await db.update(savedPlans)
      .set({ name, data, projectedPoints: points, updatedAt: new Date() })
      .where(and(eq(savedPlans.id, savedId), eq(savedPlans.entryId, entryId), eq(savedPlans.ownerUserId, user.id)))
      .returning();
    return rows[0]
      ? NextResponse.json(rows[0], { headers: { "cache-control": "no-store" } })
      : NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  const created = await db.transaction(async (tx) => {
    // The advisory transaction lock serializes the 3-plan limit for one owner+entry.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${user.id}), ${entryId})`);
    const existing = await tx.select({ id: savedPlans.id }).from(savedPlans)
      .where(and(eq(savedPlans.ownerUserId, user.id), eq(savedPlans.entryId, entryId), eq(savedPlans.active, true)));
    if (existing.length >= MAX_PLANS) return null;
    const result = await tx.insert(savedPlans)
      .values({ ownerUserId: user.id, entryId, name, data, projectedPoints: points })
      .returning();
    return result[0] ?? null;
  });
  if (!created) return NextResponse.json({ error: `Maximum ${MAX_PLANS} saved plans.` }, { status: 409 });
  return NextResponse.json(created, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function DELETE(req: Request): Promise<Response> {
  const rejected = rejectUntrustedOrigin(req);
  if (rejected) return rejected;
  const user = await currentUser(req);
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const id = positiveId(url.searchParams.get("id"));
  const entryId = positiveId(url.searchParams.get("entry"));
  if (!id || !entryId) return NextResponse.json({ error: "Invalid parameters." }, { status: 400 });
  const rows = await db.delete(savedPlans)
    .where(and(eq(savedPlans.id, id), eq(savedPlans.entryId, entryId), eq(savedPlans.ownerUserId, user.id)))
    .returning({ id: savedPlans.id });
  return rows.length
    ? NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } })
    : NextResponse.json({ error: "Plan not found." }, { status: 404 });
}
