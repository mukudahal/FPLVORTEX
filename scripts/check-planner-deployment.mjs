import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = 'https://fplvortex.onrender.com';
const assets = await readdir('dist/assets');
const worker = assets.find(name => /^planner\.worker-.*\.js$/.test(name));
if (!worker) throw Error('Production worker asset missing from build');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = hash(await readFile('dist/assets/' + worker));
const html = await readFile('dist/index.html', 'utf8');
const entry = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
if (!entry) throw Error('Production application entry asset missing');
const entryHash = hash(await readFile('dist'+entry));
let matched = false;
for (let attempt = 0; attempt < 24; attempt++) {
  try {
    const res = await fetch(base + '/assets/' + worker + '?verify=' + process.env.GITHUB_SHA, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    const entryRes = await fetch(base + entry + '?verify=' + process.env.GITHUB_SHA, {signal: AbortSignal.timeout(15000), cache:'no-store'});
    const liveHtml = await fetch(base + '/?verify=' + process.env.GITHUB_SHA, {signal:AbortSignal.timeout(15000),cache:'no-store'});
    if (res.ok && hash(Buffer.from(await res.arrayBuffer())) === expected && entryRes.ok && hash(Buffer.from(await entryRes.arrayBuffer())) === entryHash && (await liveHtml.text()).includes(entry)) {
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

