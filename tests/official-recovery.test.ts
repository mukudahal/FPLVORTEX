import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { persistRecoverySnapshot, readRecoverySnapshot } from '../server/snapshotStore.ts';
import { classifyRefreshError } from '../server/refreshDiagnostics.ts';
import { UpstreamHttpError } from '../server/http.ts';

// Synthetic transport fixtures, never used as forecast or live-account evidence.
const bootstrap = {
  teams: Array.from({length:20}, (_,i)=>({ id:i+1, code:i+1, name:`Team ${i+1}`, short_name:`T${i+1}` })),
  elements: Array.from({length:400}, (_,i)=>({id:i+1, team:i%20+1, element_type:i%4+1, now_cost:50, status:'a', selected_by_percent:'1.0'})),
  events: Array.from({length:38},(_,i)=>({id:i+1, deadline_time:new Date(Date.UTC(2026,7,1+i*7)).toISOString(), is_current:i===0,is_next:i===1,finished:false})),
};
const fixtures = Array.from({length:380}, (_,i)=>({id:i+1,event:Math.floor(i/10)+1,team_h:i%20+1,team_a:(i+1)%20+1}));

test('official refresh coalesces, persists inputs, survives optional feed failure and discloses outage', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'vortex-recovery-test-'));
  const previous={offline:process.env.VORTEX_OFFLINE,recovery:process.env.VORTEX_RECOVERY_PATH,ttl:process.env.FPL_CACHE_LIVE_SECONDS};
  delete process.env.VORTEX_OFFLINE;
  process.env.VORTEX_RECOVERY_PATH=path.join(dir,'recovery.json');
  process.env.FPL_CACHE_LIVE_SECONDS='1';
  const original=globalThis.fetch, clock=Date.now;
  let fail=false, count=0, gate:Promise<void>|null=null;
  let release=()=>{};
  globalThis.fetch=(async (url: string|URL|Request)=>{
    if (String(url).endsWith('/bootstrap-static/')) {
      count++;
      if(gate)await gate;
      if(fail)throw new UpstreamHttpError('FPL upstream 503',503);
      return Response.json(bootstrap);
    }
    if(String(url).endsWith('/fixtures/'))return Response.json(fixtures);
    if(String(url).includes('/event/'))return Response.json({elements:[]});
    throw new TypeError('optional feed unavailable');
  }) as typeof fetch;
  try {
    const fpl=await import('../server/fpl.ts');
    const [a,b]=await Promise.all([fpl.getSnapshot(true),fpl.getSnapshot(true)]);
    assert.equal(a,b,'concurrent callers must share one refresh');
    assert.equal(count,1);
    assert.equal(a.meta.upstreamOk,true);
    assert.equal(a.meta.stale,false);
    const saved=JSON.parse(await readFile(process.env.VORTEX_RECOVERY_PATH,'utf8'));
    assert.equal(saved.meta.generatedAt,a.meta.generatedAt);
    assert.equal(saved.players.length,400);
    assert.equal((await readRecoverySnapshot())?.meta.generatedAt,a.meta.generatedAt);
    assert.deepEqual((await readdir(dir)).sort(),['recovery.json']);
    // Expiring the cache must not invent a failed upstream connection while a
    // refresh is pending. The original retrieval time remains unchanged.
    Date.now=()=>clock()+2000;
    gate=new Promise<void>(r=>{release=r});
    const pending=fpl.getSnapshot(true);
    const cached=await fpl.getSnapshotFast();
    assert.equal(cached.meta.generatedAt,a.meta.generatedAt);
    assert.equal(cached.meta.upstreamOk,true);
    assert.equal(cached.meta.stale,false);
    release(); await pending; gate=null;
    Date.now=clock;
    fail=true;
    const outage=await fpl.getSnapshot(true);
    assert.equal(outage.meta.stale,true);
    assert.equal(outage.meta.upstreamOk,false);
    const h=await fpl.getHealth();
    assert.equal((h.refresh as any).lastError.kind,'http');
    assert.equal((h.refresh as any).lastError.status,503);
    assert.equal((h.refresh as any).persistence,'saved');
    assert.equal(JSON.parse(await readFile(process.env.VORTEX_RECOVERY_PATH,'utf8')).meta.generatedAt,outage.meta.generatedAt);
    await assert.rejects(persistRecoverySnapshot(outage));
    await writeFile(process.env.VORTEX_RECOVERY_PATH,'{broken');
    assert.equal(await readRecoverySnapshot(),null);
  } finally {
    release(); globalThis.fetch=original; Date.now=clock;
    for(const [key,value] of Object.entries({VORTEX_OFFLINE:previous.offline,VORTEX_RECOVERY_PATH:previous.recovery,FPL_CACHE_LIVE_SECONDS:previous.ttl})) {
      if(value===undefined)delete process.env[key]; else process.env[key]=value;
    }
    await rm(dir,{recursive:true,force:true});
  }
});

test('diagnostics never echo raw URLs, credentials or upstream bodies',()=>{
  assert.deepEqual(classifyRefreshError(new UpstreamHttpError('secret url',429)),{kind:'http',status:429});
  assert.deepEqual(classifyRefreshError(new DOMException('secret','TimeoutError')),{kind:'timeout',status:null});
  assert.deepEqual(classifyRefreshError(new TypeError('secret')),{kind:'network',status:null});
  assert.deepEqual(classifyRefreshError(new Error('secret')),{kind:'invalid-payload',status:null});
});
