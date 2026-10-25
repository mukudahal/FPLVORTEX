import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import vercelHandler from '../api/index.mjs';
import { readFile } from 'node:fs/promises';
const context={waitUntil:()=>{}};
for(const [path,type] of [['/','text/html'],['/app.js','javascript'],['/availability.js','javascript'],['/player-images.js','javascript'],['/appearance.js','javascript'],['/icons.js','javascript'],['/style.css','text/css'],['/fonts/manrope.ttf','font/ttf'],['/model/xpts.js','javascript'],['/model/forecastBenchmark.js','javascript']]){
  const response=await worker.fetch(new Request('https://example.test'+path),{},context);
  assert.equal(response.status,200,path);
  assert.ok(response.headers.get('content-type').includes(type));
  const text=await response.text();assert.ok(text.length>100);
  if(path==='/')assert.ok(text.includes('Independent model · Unvalidated'));
}
assert.equal((await worker.fetch(new Request('https://example.test/missing'),{},context)).status,404);
assert.equal((await worker.fetch(new Request('https://example.test/',{method:'POST'}),{},context)).status,405);
assert.equal(await (await worker.fetch(new Request('https://example.test/',{method:'HEAD'}),{},context)).text(),'');
const logo=await worker.fetch(new Request('https://example.test/brand/fpl-vortex-lion.jpg'),{},context);
assert.equal(logo.headers.get('content-type'),'image/jpeg');
assert.deepEqual(Buffer.from(await logo.arrayBuffer()),await readFile(new URL('../ui/brand/fpl-vortex-lion.jpg',import.meta.url)));
const originalFetch=globalThis.fetch;
const originalCaches=Object.getOwnPropertyDescriptor(globalThis,'caches');
try{
  // The hosted runtime denies the default Cache API; this must not block FPL requests.
  Object.defineProperty(globalThis,'caches',{configurable:true,get(){throw new Error('This Worker is not permitted to access the default cache.');}});
  globalThis.fetch=async url=>{
    assert.ok(String(url).startsWith('https://fantasy.premierleague.com/api/'));
    return Response.json({elements:[{id:1,code:223094}],teams:[{id:1}],events:[{id:8}]});
  };
  const official=await worker.fetch(new Request('https://example.test/api/bootstrap'),{},context);
  assert.equal(official.status,200);
  assert.equal(official.headers.get('x-data-source'),'Official FPL API');
  assert.equal(official.headers.get('cache-control'),'public, max-age=900');
  assert.equal((await official.json()).elements.length,1);
  const routed=await vercelHandler.fetch(new Request('https://example.test/api/index?fplRoute=bootstrap'));
  assert.equal(routed.status,200);
  assert.equal((await routed.json()).elements.length,1);
  assert.equal((await vercelHandler.fetch(new Request('https://example.test/api/index?fplRoute=https://example.org/'))).status,404);
  const manager=await worker.fetch(new Request('https://example.test/api/entry/1'),{},context);
  assert.equal(manager.status,200);
  assert.equal(manager.headers.get('cache-control'),'private, max-age=60');
  globalThis.fetch=async()=>new Response('blocked',{status:403});
  const response=await worker.fetch(new Request('https://example.test/api/bootstrap'),{},context);
  assert.equal(response.status,503);
  assert.ok((await response.json()).error.includes('unavailable'));
}finally{
  globalThis.fetch=originalFetch;
  if(originalCaches)Object.defineProperty(globalThis,'caches',originalCaches);
  else delete globalThis.caches;
}
console.log('Worker routes, asset types, HEAD/POST behavior, restricted-cache regression and upstream degradation passed.');
