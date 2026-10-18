import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLicensedSnapshot } from '../dist/js/data-contract.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentsList = process.argv.slice(2);
function argumentValue(flag) {
  const index = argumentsList.indexOf(flag);
  if (index === -1 || index + 1 >= argumentsList.length || argumentsList[index + 1].startsWith('--')) {
    throw new Error(`Required option missing: ${flag}`);
  }
  return argumentsList[index + 1];
}

async function main() {
  const inputPath = resolve(argumentValue('--input'));
  const dataDirectory = resolve(process.env.FPLVORTEX_DATA_DIR || join(appRoot, 'data'));
  const validateOnly = argumentsList.includes('--validate-only');
  const sourceStats = await readFile(inputPath);
  if (sourceStats.length > 5_000_000) throw new RangeError('Snapshot exceeds 5 MB limit');
  const snapshot = validateLicensedSnapshot(JSON.parse(sourceStats.toString('utf8')));
  const normalized = JSON.stringify(snapshot);
  const digest = createHash('sha256').update(normalized).digest('hex');
  if (validateOnly) {
    console.log(JSON.stringify({ valid: true, digest, players: snapshot.players.length, source: snapshot.rights.sourceName, published: false }));
    return;
  }
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const lockPath = join(dataDirectory, '.import.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  let tempPath = '';
  try {
    const indexPath = join(dataDirectory, 'current.json');
    let existing;
    try { existing = JSON.parse(await readFile(indexPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing?.capturedAt && Date.parse(existing.capturedAt) > Date.parse(snapshot.capturedAt)) {
      throw new Error('Refusing to replace a newer snapshot with older observations');
    }
    const snapshotPath = join(dataDirectory, `${digest}.json`);
    await writeFile(snapshotPath, normalized, { flag: 'wx', mode: 0o600 }).catch(error => {
      if (error.code !== 'EEXIST') throw error;
    });
    tempPath = join(dataDirectory, `.current-${process.pid}-${digest.slice(0, 12)}.tmp`);
    await writeFile(tempPath, JSON.stringify({ schemaVersion: 1, digest, capturedAt: snapshot.capturedAt }), { flag: 'wx', mode: 0o600 });
    await rename(tempPath, indexPath);
    tempPath = '';
    console.log(JSON.stringify({ valid: true, digest, players: snapshot.players.length, source: snapshot.rights.sourceName, published: true }));
  } finally {
    if (tempPath) await rm(tempPath, { force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

main().catch(error => {
  console.error(`Snapshot import refused: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});