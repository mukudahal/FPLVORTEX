import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(import.meta.dirname,'..');
const assets = {};
const hashes = {};
for (const [name,type] of [['index.html','text/html'],['app.js','application/javascript'],['style.css','text/css'],['dashboard.js','application/javascript'],['player-images.js','application/javascript'],['logo.svg','image/svg+xml'],['videos.json','application/json']]) assets['/'+name]={content:await readFile(resolve(root,'ui',name),'utf8'),type:type+'; charset=utf-8'};
for (const name of await readdir(resolve(root,'model'))) {
  if (!name.endsWith('.ts')) continue;
  const source = await readFile(resolve(root,'model',name),'utf8');
  hashes[name] = createHash('sha256').update(source).digest('hex');
  const compiled = ts.transpileModule(source,{fileName:name,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,strict:true}}).outputText.replace(/(from\s+["'])(\.\.?\/[^"']+)(["'])/g,(_,prefix,path,suffix)=>prefix+path+'.js'+suffix);
  assets['/model/'+name.replace(/\.ts$/,'.js')]={content:compiled,type:'application/javascript; charset=utf-8'};
}
const handler=await readFile(resolve(root,'worker/handler.js'),'utf8');
assets['/brand/fpl-vortex-lion.jpg']={content:(await readFile(resolve(root,'ui/brand/fpl-vortex-lion.jpg'))).toString('base64'),type:'image/jpeg',encoding:'base64'};
await writeFile(resolve(root,'worker/index.js'),handler+'\nconst assets = '+JSON.stringify(assets)+';\nexport default createWorker(assets);\n');
await writeFile(resolve(root,'model-build.json'),JSON.stringify(hashes,null,2)+'\n');
console.log('Prepared '+Object.keys(assets).length+' embedded assets from the shared math source.');
