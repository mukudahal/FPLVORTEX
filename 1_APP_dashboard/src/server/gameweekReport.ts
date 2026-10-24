import { loadBootstrap, loadEntry, loadEntryHistory, loadPicks, loadLiveGameweek } from "./fplData";
import { createGameweekReport } from "@/lib/reportPayload";

export async function loadGameweekReport(entryId: number, gw: number) {
  if (!Number.isSafeInteger(entryId) || entryId < 1 || !Number.isSafeInteger(gw) || gw < 1 || gw > 38) throw new RangeError("Invalid manager or gameweek.");
  const [bootstrap, entry, history, picks, live] = await Promise.all([
    loadBootstrap(), loadEntry(entryId), loadEntryHistory(entryId),
    loadPicks(entryId, gw).catch(() => null), loadLiveGameweek(gw).catch(() => null),
  ]);
  return createGameweekReport({ bootstrap, entry, history, picks, live, gw, generatedAt: new Date().toISOString() });
}
