import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fetchOfficialSnapshot } from '../server/officialSnapshot.ts';
import { writeSnapshotAtomic } from '../server/snapshotStore.ts';
import { assertFreshSnapshot } from '../server/snapshotValidation.ts';

async function main(): Promise<void> {
  const snapshot = await fetchOfficialSnapshot();
  const output = path.resolve(process.cwd(), process.env.VORTEX_SNAPSHOT_PATH ?? 'public/data/fpl-snapshot.json');
  assertFreshSnapshot(snapshot);
  await mkdir(path.dirname(output), { recursive: true });
  await writeSnapshotAtomic(output, snapshot);
  const sizeKb = Math.round((Buffer.byteLength(JSON.stringify(snapshot)) / 1024) * 10) / 10;
  console.log(`Snapshot refreshed: ${snapshot.players.length} players, ${snapshot.fixtures.length} fixtures, ${sizeKb} KB`);
  console.log(`Season ${snapshot.meta.season} · current GW ${snapshot.meta.currentEventId} · next GW ${snapshot.meta.nextEventId}`);
  console.log(`Saved to ${output}`);
}

main().catch((error) => {
  console.error('Snapshot refresh failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});


