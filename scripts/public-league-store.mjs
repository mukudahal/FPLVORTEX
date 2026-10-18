import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseOpenFootball } from '../src/public-league.mjs';

export const publicLeaguePath = fileURLToPath(new URL('../datasets/openfootball-2026-27.json', import.meta.url));
export async function readPublicLeague() {
  try { return parseOpenFootball(JSON.parse(await readFile(publicLeaguePath,'utf-8'))); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}