import { loadBootstrap, loadFixtures, loadEntry, loadEntryHistory, loadTransfers, loadPicks, loadLiveGameweek } from "@/server/fplData";
import { runCoreOptimizer } from "@/lib/optimizer";
import type { LiveResponse, OptimizerResponse } from "@/lib/types";

/** One optimizer entrypoint shared by interactive GET and background jobs. */
export async function computeOptimizerForEntry(entryId: number, horizon: number): Promise<OptimizerResponse> {
  if (!Number.isSafeInteger(entryId) || entryId < 1 || !Number.isInteger(horizon) || horizon < 1 || horizon > 10) {
    throw new RangeError("Invalid optimizer entry or horizon.");
  }
  const [rawBs, fixtures, entry, history, transfers] = await Promise.all([
    loadBootstrap(),
    loadFixtures(),
    loadEntry(entryId),
    loadEntryHistory(entryId),
    loadTransfers(entryId),
    ]);

  const currentGw =
    entry.current_event ??
    rawBs.events.find((e) => e.is_current)?.id ??
    1;
  const nextGw =
    rawBs.events.find((e) => e.is_next)?.id ??
    Math.min(38, currentGw + 1);

  const picks = await loadPicks(entryId, currentGw);

    // Load live stats for up to the 3 most recent completed/current GWs for backtesting
  const completedGws = rawBs.events
    .filter((e) => e.finished || e.is_current)
    .map((e) => e.id)
    .slice(-3);

  const liveByGw = new Map<number, LiveResponse>();
    for (const gw of completedGws) {
    try {
    const live = await loadLiveGameweek(gw, 300);
      liveByGw.set(gw, live);
    } catch (liveErr) {
      console.error(
        `[FPL Vortex /api/optimizer/${entryId} live GW${gw} fetch warning]`,
        liveErr instanceof Error ? liveErr.message : liveErr,
      );
    }
    }

  const elements = rawBs.elements;

  const result = await runCoreOptimizer({
    entryId,
    currentGw,
    nextGw,
    horizon,
    picks,
    transfers,
    history,
    elements,
    teams: rawBs.teams,
    events: rawBs.events,
    fixtures,
    chips: rawBs.chips ?? [],
    liveByGw,
    startedEvent: entry.started_event ?? 1,
    });

  return result;
}
