import { NextResponse } from "next/server";
import { loadPicks, loadEntryHistory } from "@/server/fplData";
import type { EntryHistory, PicksResponse, RivalData } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RivalMeta {
  entry: number;
  name: string;
  playerName: string;
  total: number;
  rank: number;
}

/**
 * Batch-load picks + history for up to 5 rival entries.
 * Query: ?gw=5&rivals=123:Name:Player:Total:Rank,... (meta passed from standings
 * to avoid extra entry/ fetches; kept simple & rate-limit friendly).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const gw = Number(url.searchParams.get("gw"));
  if (!Number.isInteger(gw) || gw < 1 || gw > 38) {
    return NextResponse.json({ error: "Invalid gameweek." }, { status: 400 });
  }
  let metas: RivalMeta[];
  try {
    metas = JSON.parse(url.searchParams.get("rivals") ?? "[]") as RivalMeta[];
  } catch {
    return NextResponse.json({ error: "Invalid rivals payload." }, { status: 400 });
  }
  metas = metas
    .filter((m) => Number.isInteger(m.entry) && m.entry > 0)
    .slice(0, 5);

  const out: RivalData[] = [];
  for (const m of metas) {
    let picks: PicksResponse | null = null;
    let history: EntryHistory | null = null;
    try {
      picks = await loadPicks(m.entry, gw, 120);
    } catch {
      picks = null;
    }
    try {
      history = await loadEntryHistory(m.entry, 300);
    } catch {
      history = null;
    }
    out.push({
      entry: m.entry,
      name: String(m.name ?? ""),
      playerName: String(m.playerName ?? ""),
      total: Number(m.total) || 0,
      rank: Number(m.rank) || 0,
      picks: picks?.picks ?? null,
      activeChip: picks?.active_chip ?? null,
      chipsUsed: (history?.chips ?? []).map((c) => ({
        name: c.name,
        event: c.event,
      })),
      history: (history?.current ?? []).map((h) => ({
        event: h.event,
        total_points: h.total_points,
      })),
    });
  }
  return NextResponse.json(out);
}
