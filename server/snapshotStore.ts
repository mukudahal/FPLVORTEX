import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Snapshot } from '../src/lib/types.ts';
import { assertFreshSnapshot } from './snapshotValidation.ts';

/** Runtime recovery is separate from the immutable release's committed fallback.
 * Render's filesystem survives a process restart, not a redeploy. The scheduled
 * committed snapshot remains the durable cross-deployment recovery mechanism.
 */
function recoveryPath() {
  return process.env.VORTEX_RECOVERY_PATH ?? path.join(tmpdir(), 'fpl-vortex', 'official-snapshot.json');
}
export async function writeSnapshotAtomic(file: string, snapshot: Snapshot) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(`${JSON.stringify(snapshot)}\n`, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temp, file);
  } finally { await unlink(temp).catch(() => undefined); }
}
export async function persistRecoverySnapshot(snapshot: Snapshot) {
  assertFreshSnapshot(snapshot);
  await writeSnapshotAtomic(recoveryPath(), snapshot);
}
export async function readRecoverySnapshot(): Promise<Snapshot | null> {
  try {
    const s = JSON.parse(await readFile(recoveryPath(), 'utf8')) as Snapshot;
    // Validate shape, provenance and original timestamp. Age is evaluated by the
    // serving layer; an old recovery never receives a new retrieval timestamp.
    assertFreshSnapshot(s, Date.now(), Number.MAX_SAFE_INTEGER);
    return s;
  } catch { return null; }
}
