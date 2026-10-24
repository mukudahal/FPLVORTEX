import { NextResponse } from "next/server";
import { FplError } from "@/lib/fpl";
import { loadRawBootstrap, loadFixtures, loadEntry, loadEntryHistory, loadTransfers, loadPicks } from "@/server/fplData";
import { normalizePlayer } from "@/lib/fplNormalize";
import {
  computeFreeTransfers,
  computePlayerXPts,
  computePositionPriors,
  computeSellingPrices,
} from "@/lib/xpts";
import type {
  SlimElement,
  SlimTeam,
} from "@/lib/types";
import type { PlanPlayer, PlanResponse } from "@/lib/planTypes";

export const dynamic = "force-dynamic";

const MAX_GWS = 10;

const order = (value: unknown): number | null => {
  const number = Number(value);
  return value != null && Number.isFinite(number) && number > 0 ? number : null;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId) || entryId < 1) {
    return NextResponse.json({ error: "Invalid team ID." }, { status: 400 });
  }

  const url = new URL(req.url);
  const gwsParam = Number(url.searchParams.get("gws") ?? MAX_GWS);
  const horizon = Math.max(
    1,
    Math.min(MAX_GWS, Number.isInteger(gwsParam) ? gwsParam : MAX_GWS),
  );

  try {
    const [rawBs, fixtures, entry, history, transfers] = await Promise.all([
      loadRawBootstrap(),
      loadFixtures(),
      loadEntry(entryId),
      loadEntryHistory(entryId),
      loadTransfers(entryId),
    ]);

    const currentGw =
      entry.current_event ?? rawBs.events.find((e) => e.is_current)?.id ?? 1;
    const nextGw =
      rawBs.events.find((e) => e.is_next)?.id ?? Math.min(38, currentGw + 1);

    const picks = await loadPicks(entryId, currentGw);

    const elements = rawBs.elements.map(normalizePlayer);
    const elementsMap = new Map<number, SlimElement>();
    elements.forEach((e) => elementsMap.set(e.id, e));
    const teamsMap = new Map<number, SlimTeam>();
    rawBs.teams.forEach((t) => teamsMap.set(t.id, t));

    const gws = Array.from({ length: horizon }, (_, i) => nextGw + i).filter(
      (g) => g <= 38,
    );
    if (gws.length === 0) gws.push(Math.min(38, nextGw));
    const lastGw = gws[gws.length - 1];
    const teamGamesPlayed = Math.max(currentGw, 1);

    const priors = computePositionPriors(elements);

    const rawById = new Map<number, Record<string, unknown>>();
    rawBs.elements.forEach((r) => rawById.set(Number(r.id), r));

    const players: PlanPlayer[] = elements
      .filter((e) => e.element_type <= 4)
      .map((el) => ({
        id: el.id,
        code: el.code,
        name: el.web_name,
        team: el.team,
        type: el.element_type,
        cost: el.now_cost,
        status: el.status,
        news: el.news,
        chance: el.chance_of_playing_next_round,
        owned: Number(el.selected_by_percent) || 0,
        form: Number(el.form) || 0,
        net: el.transfers_in_event - el.transfers_out_event,
        pen: order(rawById.get(el.id)?.penalties_order),
        fk: order(rawById.get(el.id)?.direct_freekicks_order),
        ck: order(rawById.get(el.id)?.corners_and_indirect_freekicks_order),
        xp: gws.map(
          (gw) =>
            Math.round(
              computePlayerXPts(
                el,
                gw,
                fixtures,
                teamsMap,
                teamGamesPlayed,
                Math.max(0, gw - nextGw),
                priors,
              ).xPts * 10,
            ) / 10,
        ),
      }));

    // Fixtures for the planning window plus 4 GWs, so a "next 5" strip
    // starting at the last planned GW is still complete.
    const planFixtures = fixtures
      .filter((f) => f.event != null && f.event >= nextGw && f.event <= lastGw + 4)
      .map((f) => ({
        gw: f.event as number,
        h: f.team_h,
        a: f.team_a,
        hd: f.team_h_difficulty,
        ad: f.team_a_difficulty,
      }));

    const deadlines: Record<number, string> = {};
    for (const ev of rawBs.events) deadlines[ev.id] = ev.deadline_time;

    const { sellingPrices } = computeSellingPrices(
      picks.picks,
      transfers,
      elementsMap,
    );

    const body: PlanResponse = {
      entryId,
      currentGw,
      nextGw,
      gws,
      deadlines,
      bank: picks.entry_history.bank,
      freeTransfers: computeFreeTransfers(history, entry.started_event ?? 1),
      picks: picks.picks.map((p) => ({
        element: p.element,
        position: p.position,
        isCaptain: p.is_captain,
        isVice: p.is_vice_captain,
      })),
      sellingPrices,
      teams: rawBs.teams.map((t) => ({
        id: t.id,
        code: t.code,
        short: t.short_name,
        name: t.name,
      })),
      fixtures: planFixtures,
      players,
      computedAt: new Date().toISOString(),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error(`[FPL Vortex /api/plan/${entryId} error]`, err);
    const status = err instanceof FplError ? err.status : 500;
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not build the plan for this team.",
      },
      { status },
    );
  }
}
