import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { managers } from "@/db/schema";
import type { RecentManager } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db
      .select({
        id: managers.id,
        playerName: managers.playerName,
        teamName: managers.teamName,
        overallRank: managers.overallRank,
        totalPoints: managers.totalPoints,
      })
      .from(managers)
      .orderBy(desc(managers.lastViewedAt))
      .limit(8);
    const body: RecentManager[] = rows;
    return NextResponse.json(body);
  } catch {
    return NextResponse.json([] as RecentManager[]);
  }
}
