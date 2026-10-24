import { NextResponse } from "next/server";
import { loadFixturesDetailed } from "@/server/fplData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await loadFixturesDetailed();
    return NextResponse.json(result.data, { headers: {
      "cache-control": "no-store", "x-fpl-data-status": result.status,
      "x-fpl-fetched-at": result.fetchedAt,
    } });
  } catch {
    return NextResponse.json(
      { error: "Could not load fixtures." },
      { status: 502 },
    );
  }
}
