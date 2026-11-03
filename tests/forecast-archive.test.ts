import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createForecastArchive,saveForecastArchive} from '../server/forecastArchive.ts';
import type {Snapshot} from '../src/lib/types.ts';

test('forecast archive is prospective, versioned, reproducible and immutable',async()=>{
 const s=JSON.parse(await readFile('public/data/fpl-snapshot.json','utf8')) as Snapshot;
 const now=new Date();s.meta={...s.meta,generatedAt:now.toISOString(),upstreamOk:true,stale:false};
 s.gameweeks.find(g=>g.id===s.meta.nextEventId)!.deadlineTime=new Date(now.getTime()+86400000).toISOString();
 const a=createForecastArchive(s,'fixture-model-v1',now),b=createForecastArchive(s,'fixture-model-v1',now);
 assert.equal(a.inputId,b.inputId);assert.deepEqual(a.predictions,b.predictions);
 assert.equal(a.retrievedAt,s.meta.generatedAt);assert.equal(a.calibration,'unverified');
 assert.throws(()=>createForecastArchive(s,'v1',new Date(now.getTime()+2*86400000)));
 const mixed=structuredClone(s);mixed.meta.repoData={} as any;
 assert.throws(()=>createForecastArchive(mixed,'v1',now),/official-only/);
 const dir=await mkdtemp(path.join(tmpdir(),'vortex-archive-'));
 try {
  const first=await saveForecastArchive(s,dir,now);
  const bytes=await readFile(first.file);
  const decoded=JSON.parse(gunzipSync(bytes).toString());
  assert.equal(decoded.inputId,a.inputId);
  s.players[0].cost++;
  const second=await saveForecastArchive(s,dir,now);
  assert.equal(second.created,false);assert.deepEqual(await readFile(first.file),bytes);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('settled matching refuses future, wrong-season and incomplete outcomes; preserves negatives',async()=>{
 const {matchSettledOutcomes}=await import('../server/forecastArchive.ts');
 const s=JSON.parse(await readFile('public/data/fpl-snapshot.json','utf8')) as Snapshot;
 const now=new Date();s.meta={...s.meta,generatedAt:now.toISOString(),upstreamOk:true,stale:false};
 const event=s.gameweeks.find(g=>g.id===s.meta.nextEventId)!;
 event.deadlineTime=new Date(now.getTime()+60000).toISOString();
 const a=createForecastArchive(s,'test-fixture-v1',now);
 const payload={elements:s.players.map((p,i)=>({id:p.id,stats:{total_points:i===0?-2:0}}))};
 assert.throws(()=>matchSettledOutcomes(a,s,payload));
 event.finished=true;event.dataChecked=true;
 const observed=new Date(now.getTime()+120000).toISOString();
 const result=matchSettledOutcomes(a,s,payload,observed);
 assert.equal(result.inputId,a.inputId);assert.equal(result.outcomes[0].points,-2);
 assert.throws(()=>matchSettledOutcomes(a,s,{elements:payload.elements.slice(1)},observed),/incomplete/);
 const wrong={...s,meta:{...s.meta,season:'2025/26'}};
 assert.throws(()=>matchSettledOutcomes(a,wrong,payload,observed));
});
