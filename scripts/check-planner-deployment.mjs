import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = 'https://fplvortex.onrender.com';
const assets = await readdir('dist/assets');
const worker = assets.find(name => /^planner\.worker-.*\.js$/.test(name));
if (!worker) throw Error('Production worker asset missing from build');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = hash(await readFile('dist/assets/' + worker));
let matched = false;
for (let attempt = 0; attempt < 24; attempt++) {
  try {
    const res = await fetch(base + '/assets/' + worker + '?verify=' + process.env.GITHUB_SHA, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (res.ok && hash(Buffer.from(await res.arrayBuffer())) === expected) {
      matched = true;
      console.log('Live planner worker matches the tested production build:', worker, expected);
      break;
    }
  } catch (error) {
    console.log('Waiting for automatic deployment:', error.message);
  }
  if (attempt < 23) await new Promise(resolve => setTimeout(resolve, 10000));
}
if (!matched) throw Error('The live site has not served the tested planner worker yet. Check the automatic deployment.');
