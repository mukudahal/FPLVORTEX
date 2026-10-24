import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { managers } from "@/db/schema";
import { FplError } from "@/lib/fpl";
import { loadEntry, loadEntryHistory } from "@/server/fplData";
import type { EntryResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId) || entryId < 1) {
    return NextResponse.json({ error: "Invalid team ID." }, { status: 400 });
  }
  try {
    const [entry, history] = await Promise.all([loadEntry(entryId), loadEntryHistory(entryId)]);

    // Track this manager for the "recent teams" list (non-fatal on failure).
    try {
      await db
        .insert(managers)
        .values({
          id: entryId,
          playerName:
            `${entry.player_first_name} ${entry.player_last_name}`.trim(),
          teamName: entry.name,
          region: entry.player_region_name ?? "",
          overallRank: entry.summary_overall_rank ?? null,
          totalPoints: entry.summary_overall_points ?? null,
        })
        .onConflictDoUpdate({
          target: managers.id,
          set: {
            playerName:
              `${entry.player_first_name} ${entry.player_last_name}`.trim(),
            teamName: entry.name,
            overallRank: entry.summary_overall_rank ?? null,
            totalPoints: entry.summary_overall_points ?? null,
            viewCount: sql`${managers.viewCount} + 1`,
            lastViewedAt: new Date(),
          },
        });
    } catch {
      // ignore tracking failures
    }

    const body: EntryResponse = { entry, history };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof FplError && err.status === 404) {
      return NextResponse.json(
        { error: `No FPL team found with ID ${entryId}. Double-check the number.` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Could not load this team from the FPL API." },
      { status: 502 },
    );
  }
}
