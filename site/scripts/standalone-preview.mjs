import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const root=resolve(import.meta.dirname,'..');
const modules={};
for(const name of await readdir(resolve(root,'model'))){if(name.endsWith('.ts'))modules['/model/'+name.replace(/\.ts$/,'.js')]=await readFile(resolve(root,'model',name),'utf8');}
for(const name of ['app.js','dashboard.js'])modules['/'+name]=await readFile(resolve(root,'ui',name),'utf8');
const factories=Object.entries(modules).map(([name,source])=>JSON.stringify(name)+':function(module,exports,require){\n'+ts.transpileModule(source,{fileName:name,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText+'\n}').join(',\n');
const videos=await readFile(resolve(root,'ui/videos.json'),'utf8');
const script=`(()=>{const originalFetch=window.fetch.bind(window);window.fetch=(input,options)=>{const url=String(input);if(url==='/videos.json')return Promise.resolve(new Response(${JSON.stringify(videos)},{headers:{'content-type':'application/json'}}));if(url.startsWith('/api/'))return Promise.resolve(new Response('{}',{status:503}));return originalFetch(input,options);};const factories={${factories}};const cache={};function load(name,parent='/app.js'){if(name.startsWith('.'))name=new URL(name,'https://preview.local'+parent).pathname;if(!name.endsWith('.js'))name+='.js';if(cache[name])return cache[name].exports;if(!factories[name])throw new Error('Missing preview module '+name);const module={exports:{}};cache[name]=module;factories[name](module,module.exports,specifier=>load(specifier,name));return module.exports;}load('/app.js');})();`;
let html=await readFile(resolve(root,'ui/index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="/style.css">','<style>'+await readFile(resolve(root,'ui/style.css'),'utf8')+'</style>');
const logo=Buffer.from(await readFile(resolve(root,'ui/logo.svg'),'utf8')).toString('base64');
html=html.replace('src="/logo.svg"','src="data:image/svg+xml;base64,'+logo+'"');
html=html.replace('href="/" aria-label="FPL Vortex home"','href="#" aria-label="FPL Vortex home" onclick="location.reload();return false;"');
html=html.replace('<script type="module" src="/app.js"></script>','<script>'+script.replaceAll('</script','<\\/script')+'</script>');
const output=resolve(root,'../DASHBOARD_PREVIEW.html');await writeFile(output,html);console.log(output);
