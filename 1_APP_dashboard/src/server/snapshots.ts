import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dataSnapshots } from "@/db/schema";
import { fingerprintSnapshot, seasonForFirstDeadline } from "@/lib/snapshotIdentity";
import type { FplRawBootstrap } from "@/lib/fplNormalize";
import type { Fixture, LiveResponse } from "@/lib/types";

export interface StoredSnapshotReference {
  id: string;
  source: string;
  season: string;
  gameweek: number;
  contentSha256: string;
  capturedAt: string;
}

/** A validated scheduled refresh is the sole writer; snapshots are never overwritten. */
export async function captureOfficialFplSnapshots(
  bootstrap: FplRawBootstrap,
  fixtures: Fixture[],
): Promise<StoredSnapshotReference[]> {
  const firstGameweek = [...bootstrap.events]
    .sort((left, right) => Number(left.id) - Number(right.id))[0];
  if (!firstGameweek || typeof firstGameweek.deadline_time !== "string") {
    throw new Error("Cannot identify source FPL season from the first deadline.");
  }
  const season = seasonForFirstDeadline(firstGameweek.deadline_time);
  const latest = bootstrap.events.find((event) => event.is_next) ??
    bootstrap.events.find((event) => event.is_current);
  const gameweek = Math.max(1, Math.min(38, Number(latest?.id ?? 38)));
  const records = [
    fingerprintSnapshot(season, gameweek, "official:fpl:bootstrap", bootstrap),
    fingerprintSnapshot(season, gameweek, "official:fpl:fixtures", fixtures),
  ];

  return db.transaction(async (transaction) => {
    const result: StoredSnapshotReference[] = [];
    for (const record of records) {
      await transaction.insert(dataSnapshots).values(record).onConflictDoNothing({
        target: [dataSnapshots.season, dataSnapshots.gameweek, dataSnapshots.source, dataSnapshots.contentSha256],
      });
      const stored = await transaction.select({
        id: dataSnapshots.id, source: dataSnapshots.source, season: dataSnapshots.season,
        gameweek: dataSnapshots.gameweek, contentSha256: dataSnapshots.contentSha256,
        capturedAt: dataSnapshots.capturedAt,
      }).from(dataSnapshots).where(and(
        eq(dataSnapshots.season, record.season),
        eq(dataSnapshots.gameweek, record.gameweek),
        eq(dataSnapshots.source, record.source),
        eq(dataSnapshots.contentSha256, record.contentSha256),
      )).limit(1);
      if (!stored[0]) throw new Error("Saved FPL data snapshot could not be resolved.");
      result.push({ ...stored[0], capturedAt: stored[0].capturedAt.toISOString() });
    }
    return result;
  });
}

/** Resolve a frozen model input by source and GW; verify digest before returning. */
export async function loadLatestOfficialSnapshot(
  season: string,
  gameweek: number,
  source: string,
): Promise<{ id: string; payload: unknown; sha256: string; capturedAt: string } | null> {
  if (!/^\d{4}\/\d{2}$/.test(season) || !Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38
      || !/^official:fpl:[a-z0-9-]{3,40}$/.test(source)) {
    throw new RangeError("Invalid snapshot query.");
  }
  const rows = await db.select().from(dataSnapshots).where(and(
    eq(dataSnapshots.season, season),
    eq(dataSnapshots.gameweek, gameweek),
    eq(dataSnapshots.source, source),
  )).orderBy(desc(dataSnapshots.capturedAt)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const expected = fingerprintSnapshot(season, gameweek, source, row.payload);
  if (expected.contentSha256 !== row.contentSha256) {
    throw new Error(`Snapshot integrity mismatch for ${row.id}.`);
  }
  return { id: row.id, payload: row.payload, sha256: row.contentSha256,
    capturedAt: row.capturedAt.toISOString() };
}

/** Capture changing live-points inputs separately so post-GW reviews can replay them. */
export async function captureOfficialFplLiveSnapshot(
  bootstrap: FplRawBootstrap,
  gameweek: number,
  live: LiveResponse,
): Promise<StoredSnapshotReference> {
  const firstGameweek = [...bootstrap.events].sort((left, right) => Number(left.id) - Number(right.id))[0];
  if (!firstGameweek || typeof firstGameweek.deadline_time !== "string") {
    throw new Error("Cannot determine live source season.");
  }
  const fingerprint = fingerprintSnapshot(
    seasonForFirstDeadline(firstGameweek.deadline_time), gameweek, "official:fpl:live", live,
  );
  await db.insert(dataSnapshots).values(fingerprint).onConflictDoNothing({
    target: [dataSnapshots.season, dataSnapshots.gameweek, dataSnapshots.source, dataSnapshots.contentSha256],
  });
  const rows = await db.select().from(dataSnapshots).where(and(
    eq(dataSnapshots.season, fingerprint.season),
    eq(dataSnapshots.gameweek, fingerprint.gameweek),
    eq(dataSnapshots.source, fingerprint.source),
    eq(dataSnapshots.contentSha256, fingerprint.contentSha256),
  )).limit(1);
  if (!rows[0]) throw new Error("Live snapshot was not saved.");
  return { id: rows[0].id, source: rows[0].source, season: rows[0].season,
    gameweek: rows[0].gameweek, contentSha256: rows[0].contentSha256,
    capturedAt: rows[0].capturedAt.toISOString() };
}
