import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateHistoryBundle, evaluateBacktest } from '../src/historical-validation.mjs';
import { createDatabasePool, storeHistory } from './history-store.mjs';

async function main() {
  const argumentsList = process.argv.slice(2);
  const inputIndex = argumentsList.indexOf('--input');
  const inputPath = inputIndex>=0 ? argumentsList[inputIndex+1] : null;
  if (!inputPath || inputPath.startsWith('--')) throw new Error('Usage: --input <path> [--validate-only | --write]');
  const validateOnly = argumentsList.includes('--validate-only');
  const write = argumentsList.includes('--write');
  if (validateOnly === write) throw new Error('Choose exactly one of --validate-only or --write');
  const bytes = await readFile(resolve(inputPath));
  if (bytes.length>12_000_000) throw new RangeError('Import exceeds 12 MB');
  const bundle = validateHistoryBundle(JSON.parse(bytes.toString('utf8')));
  const digest = createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
  if (validateOnly) {
    console.log(JSON.stringify({valid:true,digest,observations:bundle.observations.length,trainable:bundle.rights.modelTrainingPermitted,
      metrics:evaluateBacktest(bundle.observations),persisted:false},null,2));
    return;
  }
  const pool = await createDatabasePool();
  try {
    const client = await pool.connect();
    try { console.log(JSON.stringify(await storeHistory(client,bundle))); }
    finally { client.release(); }
  } finally { await pool.end(); }
}
main().catch(error=>{console.error(`Historical import refused: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;});