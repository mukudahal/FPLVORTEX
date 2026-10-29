import { readFile } from 'node:fs/promises';
import { assertFreshSnapshot } from '../server/snapshotValidation.ts';

const file = process.env.VORTEX_SNAPSHOT_PATH ?? 'public/data/fpl-snapshot.json';
try {
  const snapshot: unknown = JSON.parse(await readFile(file, 'utf8'));
  assertFreshSnapshot(snapshot);
  console.log(`Snapshot verified: generated ${snapshot.meta.generatedAt}, ${snapshot.players.length} players, ${snapshot.fixtures.length} fixtures`);
} catch (error) {
  console.error('Snapshot verification failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
