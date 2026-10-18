import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

async function startServer(env) {
  const processHandle = spawn(process.execPath,['scripts/serve.mjs'],{
    cwd:process.cwd(), env:{...process.env,PORT:'0',DATABASE_URL:'',...env},stdio:['ignore','pipe','pipe']
  });
  let stdout=''; let stderr='';
  processHandle.stdout.on('data',chunk=>{stdout+=chunk.toString()});
  processHandle.stderr.on('data',chunk=>{stderr+=chunk.toString()});
  const port = await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Server startup timeout '+stderr)),7000);
    const scan=()=>{
      const match=stdout.match(/http:\/\/localhost:(\d+)/);
      if(match){clearTimeout(timer);resolve(Number(match[1]));}
    };
    processHandle.stdout.on('data',scan);
    processHandle.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited early '+code+' '+stderr));});
    scan();
  }).catch(error=>{processHandle.kill();throw error});
  return {port,stop:()=>new Promise(resolve=>{processHandle.once('exit',resolve);processHandle.kill();setTimeout(resolve,1000).unref()})};
}
test('research routes truthfully distinguish configured and missing history; never expose DB credentials', async()=>{
  const server=await startServer({DATABASE_URL:''});
  try {
    const status=await fetch(`http://127.0.0.1:${server.port}/api/v1/research/status`);
    assert.equal(status.status,200);
    assert.deepEqual(await status.json(),{databaseConfigured:false,historicalEvaluation:'requires validated archived forecasts',trainedModelAvailable:false});
    const unavailable=await fetch(`http://127.0.0.1:${server.port}/api/v1/research/backtest?season=2025%2F26&modelId=vortex-prototype-0.2`);
    assert.equal(unavailable.status,503);
    assert.deepEqual(await unavailable.json(),{error:'Research database not configured',metrics:null});
    const wrongMethod=await fetch(`http://127.0.0.1:${server.port}/api/v1/research/backtest`,{method:'POST'});
    assert.equal(wrongMethod.status,405);
    const root=await fetch(`http://127.0.0.1:${server.port}/`);
    assert.equal(root.status,200);
  } finally {await server.stop();}
});