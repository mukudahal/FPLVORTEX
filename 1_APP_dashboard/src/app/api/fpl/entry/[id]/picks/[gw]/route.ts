import { NextResponse } from "next/server";
import { FplError } from "@/lib/fpl";
import { loadPicks } from "@/server/fplData";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; gw: string }> },
) {
  const { id, gw } = await params;
  const entryId = Number(id);
  const gwNum = Number(gw);
  if (!Number.isInteger(entryId) || entryId < 1) {
    return NextResponse.json({ error: "Invalid team ID." }, { status: 400 });
  }
  if (!Number.isInteger(gwNum) || gwNum < 1 || gwNum > 38) {
    return NextResponse.json({ error: "Invalid gameweek." }, { status: 400 });
  }
  try {
    const picks = await loadPicks(entryId, gwNum);
    return NextResponse.json(picks);
  } catch (err) {
    if (err instanceof FplError && err.status === 404) {
      return NextResponse.json(
        { error: "No squad found for this gameweek." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Could not load squad picks." },
      { status: 502 },
    );
  }
}
