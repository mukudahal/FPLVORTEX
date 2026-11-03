import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type {AddressInfo} from 'node:net';
import type {Snapshot} from '../src/lib/types.ts';

test('public history API validates identity, only returns settled GWs, and fails honestly',async()=>{
 process.env.VORTEX_NO_LISTEN='1';
 const original=globalThis.fetch;
 const snapshot=JSON.parse(await readFile('public/data/fpl-snapshot.json','utf8')) as Snapshot;
 const playerId=snapshot.players[0].id;
 const settled=snapshot.gameweeks.find(g=>g.finished&&g.dataChecked)!.id;
 const future=snapshot.meta.nextEventId;
 let fail=false;
 globalThis.fetch=(async(input:RequestInfo|URL,options?:RequestInit)=>{
  if(String(input).startsWith('http://127.0.0.1:'))return original(input,options);
  if(String(input).includes('/element-summary/')){
   if(fail)return new Response('',{status:503});
   return Response.json({history:[
    {element:playerId,fixture:1,round:settled,total_points:-1,minutes:90},
    {element:playerId,fixture:2,round:future,total_points:9,minutes:90},
   ]});
  }
  throw new TypeError('Synthetic unavailable upstream');
 }) as typeof fetch;
 const {app}=await import('../server/index.ts');
 const server=app.listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const url='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 try {
  assert.equal((await fetch(url+'/api/vortex/player-history/nope')).status,400);
  assert.equal((await fetch(url+'/api/vortex/player-history/999999999')).status,404);
  const res=await fetch(url+'/api/vortex/player-history/'+playerId);
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.playerId,playerId);assert.equal(body.source,'official-fpl-element-summary');
  assert.equal(body.matches.length,1);assert.equal(body.matches[0].totalPoints,-1);
  fail=true;
  const refresh=await fetch(url+'/api/vortex/refresh',{method:'POST'});
  assert.equal(refresh.status,503);assert.equal((await refresh.json()).ok,false);
  assert.equal((await fetch(url+'/api/vortex/player-history/'+playerId)).status,503);
  assert.equal((await fetch(url+'/api/vortex/solver/joint-manual',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404);
 } finally {
  // Drain the short bounded background refresh before restoring the transport.
  const {getSnapshot}=await import('../server/fpl.ts');await getSnapshot(true);
  globalThis.fetch=original;
  await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 }
});
