import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { validateLicensedSnapshot, snapshotStatus } from '../dist/js/data-contract.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = resolve(process.env.FPLVORTEX_DATA_DIR || join(root, 'data'));
export async function readCurrentSnapshot() {
  let pointer;
  try { pointer = JSON.parse(await readFile(join(dataDirectory, 'current.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!pointer || pointer.schemaVersion !== 1 || typeof pointer.digest !== 'string' || !/^[0-9a-f]{64}$/.test(pointer.digest)) {
    throw new Error('Invalid snapshot pointer');
  }
  const content = await readFile(join(dataDirectory, `${pointer.digest}.json`), 'utf8');
  if (createHash('sha256').update(content).digest('hex') !== pointer.digest) throw new Error('Snapshot digest mismatch');
  const snapshot = validateLicensedSnapshot(JSON.parse(content));
  if (snapshot.capturedAt !== pointer.capturedAt) throw new Error('Snapshot timestamp mismatch');
  return { digest: pointer.digest, snapshot };
}
export async function getDatasetStatus() {
  const result = await readCurrentSnapshot();
  return { ...snapshotStatus(result?.snapshot ?? null), digest: result?.digest ?? null };
}