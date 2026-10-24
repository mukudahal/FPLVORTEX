import { NextResponse } from "next/server";
import { FplError } from "@/lib/fpl";
import { loadLeagueStandings } from "@/server/fplData";
import type { LeagueStandings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const leagueId = Number(id);
  if (!Number.isInteger(leagueId) || leagueId < 1) {
    return NextResponse.json({ error: "Invalid league ID." }, { status: 400 });
  }
  try {
    const raw = await loadLeagueStandings(leagueId);
    const body: LeagueStandings = {
      league: { id: raw.league.id, name: raw.league.name },
      standings: {
        results: raw.standings.results.slice(0, 20).map((r) => ({
          id: r.id,
          entry: r.entry,
          entry_name: r.entry_name,
          player_name: r.player_name,
          rank: r.rank,
          last_rank: r.last_rank,
          total: r.total,
          event_total: r.event_total,
        })),
      },
    };
    return NextResponse.json(body);
  } catch (err) {
    const status = err instanceof FplError && err.status === 404 ? 404 : 502;
    return NextResponse.json(
      { error: "Could not load league standings." },
      { status },
    );
  }
}
