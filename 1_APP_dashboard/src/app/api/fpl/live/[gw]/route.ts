import { NextResponse } from "next/server";
import { FplError } from "@/lib/fpl";
import { loadLiveGameweek } from "@/server/fplData";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gw: string }> },
) {
  const { gw } = await params;
  const gwNum = Number(gw);
  if (!Number.isInteger(gwNum) || gwNum < 1 || gwNum > 38) {
    return NextResponse.json({ error: "Invalid gameweek." }, { status: 400 });
  }
  try {
    // Short TTL: this powers live points during matches.
    const raw = await loadLiveGameweek(gwNum);
    const slim = {
      elements: raw.elements.map((e) => ({ id: e.id, stats: e.stats, explain: e.explain })),
    };
    return NextResponse.json(slim);
  } catch (err) {
    const status = err instanceof FplError && err.status === 404 ? 404 : 502;
    return NextResponse.json(
      { error: "Could not load live gameweek data." },
      { status },
    );
  }
}
