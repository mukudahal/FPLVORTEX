import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const root = resolve(import.meta.dirname,'..');
await promisify(execFile)(process.execPath,[resolve(root,'scripts/pack-assets.mjs')],{cwd:root});
const source = await readFile(resolve(root,'worker/index.js'),'utf8');
const start = source.lastIndexOf('\nconst assets = ');
const end = source.lastIndexOf('\nexport default createWorker(assets);');
if (start < 0 || end <= start) throw new Error('The compiled asset bundle is missing.');
const assets = JSON.parse(source.slice(start+'\nconst assets = '.length,end).trim().replace(/;$/,''));
const output = resolve(root,'dist-vercel');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for (const [route,asset] of Object.entries(assets)) {
  const destination = resolve(output,'.'+route);
  if (!destination.startsWith(output+'/')) throw new Error('Invalid asset path.');
  await mkdir(dirname(destination),{recursive:true});
  await writeFile(destination,asset.encoding==='base64'?Buffer.from(asset.content,'base64'):asset.content);
}
console.log('Built Vercel static assets. API requests use api/index.mjs.');
