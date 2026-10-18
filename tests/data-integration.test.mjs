import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { sampleSnapshot } from './fixtures.mjs';

function importSnapshot(filePath, dataDirectory, validateOnly = false) {
  return spawnSync(process.execPath, ['scripts/import-snapshot.mjs', '--input', filePath, ...(validateOnly ? ['--validate-only'] : [])], {
    cwd: process.cwd(), env: {...process.env,FPLVORTEX_DATA_DIR:dataDirectory}, encoding:'utf8', timeout:10_000
  });
}
async function withTempDirectory(callback) {
  const dir = await mkdtemp(join(tmpdir(), 'vortex-test-'));
  try { return await callback(dir); } finally { await rm(dir,{recursive:true,force:true}); }
}

test('import is content-addressed, atomic and idempotent', async () => withTempDirectory(async dir => {
  const source = join(dir, 'licensed.json');
  const store = join(dir, 'snapshots');
  await writeFile(source, JSON.stringify(sampleSnapshot()));
  const onlyValidate = importSnapshot(source, store, true);
  assert.equal(onlyValidate.status,0, onlyValidate.stderr);
  await assert.rejects(() => readdir(store), {code:'ENOENT'});
  const result = importSnapshot(source, store);
  assert.equal(result.status,0, result.stderr);
  assert.equal(importSnapshot(source,store).status,0);
  const pointer = JSON.parse(await readFile(join(store,'current.json'),'utf8'));
  assert.match(pointer.digest,/^[a-f0-9]{64}$/);
  assert.deepEqual((await readdir(store)).sort(), [`${pointer.digest}.json`,'current.json'].sort());
}));
test('failed rights validation produces no published snapshot', async () => withTempDirectory(async dir => {
  const source = join(dir,'bad.json');
  const store = join(dir,'snapshots');
  const input = sampleSnapshot();
  input.rights.endUserDisplayPermitted = false;
  await writeFile(source,JSON.stringify(input));
  const result = importSnapshot(source,store);
  assert.notEqual(result.status,0);
  await assert.rejects(() => readdir(store),{code:'ENOENT'});
}));
test('older source cannot replace a newer imported snapshot', async () => withTempDirectory(async dir => {
  const source = join(dir,'licensed.json');
  const store = join(dir,'snapshots');
  const input = sampleSnapshot();
  await writeFile(source,JSON.stringify(input));
  assert.equal(importSnapshot(source,store).status,0);
  const pointer = JSON.parse(await readFile(join(store,'current.json'),'utf8'));
  input.capturedAt='2026-10-16T18:00:00Z';
  await writeFile(source,JSON.stringify(input));
  const refused=importSnapshot(source,store);
  assert.notEqual(refused.status,0);
  assert.equal(JSON.parse(await readFile(join(store,'current.json'),'utf8')).digest,pointer.digest);
}));

test('API distinguishes demo data from licensed data and forbids mutation', async () => withTempDirectory(async dir => {
  const source = join(dir,'licensed.json');
  const store = join(dir,'snapshots');
  await writeFile(source,JSON.stringify(sampleSnapshot()));
  const server = spawn(process.execPath,['scripts/serve.mjs'],{
    cwd:process.cwd(),env:{...process.env,PORT:'0',FPLVORTEX_DATA_DIR:store},stdio:['ignore','pipe','pipe']
  });
  try {
    const port = await new Promise((resolve,reject) => {
      const deadline = setTimeout(() => reject(new Error('Server did not start')), 5000);
      server.once('error',error=>{clearTimeout(deadline);reject(error);});
      server.stdout.on('data',chunk=>{
        const match=String(chunk).match(/localhost:(\d+)/);
        if(match){clearTimeout(deadline);resolve(Number(match[1]));}
      });
    });
    const base=`http://127.0.0.1:${port}`;
    const health=await fetch(`${base}/api/v1/health`);
    assert.equal(health.status,200);
    assert.equal((await health.json()).ok,true);
    assert.equal((await (await fetch(`${base}/api/v1/data/status`)).json()).mode,'demo');
    assert.equal((await fetch(`${base}/api/v1/data/players`)).status,503);
    assert.equal((await fetch(`${base}/api/v1/data/status`,{method:'POST'})).status,405);
    const sample=await (await fetch(`${base}/api/v1/model/distribution?playerId=1`)).json();
    assert.equal(sample.mode,'illustrative');
    assert.equal(sample.trained,false);
    assert.equal((await fetch(`${base}/api/v1/model/distribution?playerId=x`)).status,400);
    assert.equal((await fetch(`${base}/api/v1/model/distribution?playerId=1000`)).status,404);
    const imported=importSnapshot(source,store);
    assert.equal(imported.status,0,imported.stderr);
    const status=await (await fetch(`${base}/api/v1/data/status`)).json();
    assert.equal(status.mode,'licensed');
    assert.equal(status.live,false);
    assert.equal(status.playerCount,2);
    const players=await (await fetch(`${base}/api/v1/data/players`)).json();
    assert.equal(players.players.length,2);
    assert.equal(players.players[0].imageCode,undefined);
    assert.equal((await fetch(`${base}/api/v1/data/players`,{method:'HEAD'})).status,200);
  } finally {
    server.kill('SIGTERM');
  }
}));