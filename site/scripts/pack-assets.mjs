import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const prior=await readFile(resolve(root,'worker/index.js'),'utf8');
const start=prior.lastIndexOf('\nconst assets = ');
const end=prior.lastIndexOf('\nexport default createWorker(assets);');
if(start<0||end<=start)throw new Error('Compile the model with prepare-model.mjs before packaging.');
const assets=JSON.parse(prior.slice(start+'\nconst assets = '.length,end).trim().replace(/;$/,''));
const hashes=JSON.parse(await readFile(resolve(root,'model-build.json'),'utf8'));
for(const [name,expected] of Object.entries(hashes)){
  const source=await readFile(resolve(root,'model',name));
  if(createHash('sha256').update(source).digest('hex')!==expected)throw new Error('Math source changed: run prepare-model.mjs with TypeScript before packaging.');
}
delete assets['/player-photo-overrides.js'];
for(const [name,type] of [['index.html','text/html'],['app.js','application/javascript'],['style.css','text/css'],['dashboard.js','application/javascript'],['analysis.js','application/javascript'],['gameweek-points.js','application/javascript'],['availability.js','application/javascript'],['forecasts.js','application/javascript'],['forecast-data.js','application/javascript'],['gameweek-points.js','application/javascript'],['player-images.js','application/javascript'],['icons.js','application/javascript'],['appearance.js','application/javascript'],['logo.svg','image/svg+xml'],['videos.json','application/json']]){
  assets['/'+name]={content:await readFile(resolve(root,'ui',name),'utf8'),type:type+'; charset=utf-8'};
}
assets['/fonts/manrope.ttf']={content:(await readFile(resolve(root,'ui/fonts/manrope.ttf'))).toString('base64'),type:'font/ttf',encoding:'base64'};
assets['/fonts/OFL.txt']={content:await readFile(resolve(root,'ui/fonts/OFL.txt'),'utf8'),type:'text/plain; charset=utf-8'};
const handler=await readFile(resolve(root,'worker/handler.js'),'utf8');
assets['/brand/fpl-vortex-lion.jpg']={content:(await readFile(resolve(root,'ui/brand/fpl-vortex-lion.jpg'))).toString('base64'),type:'image/jpeg',encoding:'base64'};
await writeFile(resolve(root,'worker/index.js'),handler+'\nconst assets = '+JSON.stringify(assets)+';\nexport default createWorker(assets);\n');
console.log('Packed current interface with verified, unchanged compiled math.');
