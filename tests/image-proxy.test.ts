import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import type {AddressInfo} from 'node:net';

test('image proxy caches in writable storage and still serves fetched bytes when disk fails',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'vortex-images-test-'));
 process.env.VORTEX_NO_LISTEN='1';process.env.VORTEX_IMAGE_CACHE_PATH=path.join(dir,'cache');
 const original=globalThis.fetch;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(400,7)]);
 globalThis.fetch=(async(input:RequestInfo|URL,options?:RequestInit)=>{
  if(String(input).startsWith('http://127.0.0.1:'))return original(input,options);
  return new Response(png,{headers:{'content-type':'image/png'}});
 }) as typeof fetch;
 const {app}=await import('../server/index.ts');const server=app.listen(0,'127.0.0.1');
 await new Promise<void>(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 try {
  let r=await fetch(base+'/api/img/player/223094');assert.equal(r.status,200);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);
  assert.deepEqual(await readFile(path.join(dir,'cache','player-223094.png')),png);
  await rm(path.join(dir,'cache'),{recursive:true});await writeFile(path.join(dir,'cache'),'disk unavailable fixture');
  for(const endpoint of ['/api/img/player/123456','/api/img/badge/43']){
   r=await fetch(base+endpoint);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');
   assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);
  }
 } finally {globalThis.fetch=original;await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));await rm(dir,{recursive:true,force:true});}
});
