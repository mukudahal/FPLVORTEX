import type { Fixture } from "./types";

export interface RefreshDue {
  hourSlot: string;
  tenMinuteSlot: string;
  liveGameweek: number | null;
}

function utcSlot(now: Date, minutes: number): string {
  const epochMinutes = Math.floor(now.getTime() / 60_000);
  return new Date(Math.floor(epochMinutes / minutes) * minutes * 60_000).toISOString();
}

export function eligibleLiveGameweek(fixtures: Fixture[], at: Date): number | null {
  const now = at.getTime();
  if (!Number.isFinite(now)) throw new RangeError("Invalid refresh time.");
  const live = fixtures.filter((fixture) => {
    if (fixture.finished || fixture.event == null || !fixture.kickoff_time) return false;
    const kickoff = Date.parse(fixture.kickoff_time);
    return Number.isFinite(kickoff) && now >= kickoff - 15 * 60_000 && now <= kickoff + 5 * 60 * 60_000;
  });
  return live.length ? Math.min(...live.map((fixture) => fixture.event!)) : null;
}

export function calculateRefreshSchedule(fixtures: Fixture[], at: Date): RefreshDue {
  if (!Number.isFinite(at.getTime())) throw new RangeError("Invalid schedule timestamp.");
  return {
    hourSlot: utcSlot(at, 60),
    tenMinuteSlot: utcSlot(at, 10),
    liveGameweek: eligibleLiveGameweek(fixtures, at),
  };
}
