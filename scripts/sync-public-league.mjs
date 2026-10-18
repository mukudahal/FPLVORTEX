/** Explicit operator sync. No official FPL or proprietary provider APIs. */
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseOpenFootball, leagueCoverage, PUBLIC_LEAGUE_RAW } from '../src/public-league.mjs';
import { publicLeaguePath } from './public-league-store.mjs';

export async function syncPublicLeague({fetcher=fetch,dryRun=false,now=new Date(),targetPath=publicLeaguePath}={}) {
  const result=await fetcher(PUBLIC_LEAGUE_RAW,{redirect:'error',signal:AbortSignal.timeout(15_000),headers:{accept:'application/json'}});
  if(!result.ok)throw new Error(`OpenFootball HTTP ${result.status}`);
  const size=Number(result.headers.get('content-length')||0);
  if(size>1_000_000)throw new RangeError('OpenFootball dataset exceeds size cap');
  // Limit response body even for chunked transfer encoding and missing Content-Length.
  const reader=result.body?.getReader();
  if(!reader)throw new Error('No dataset response body');
  const parts=[];let count=0;
  while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>1_000_000){await reader.cancel();throw new RangeError('OpenFootball dataset exceeds size cap')}parts.push(value);}
  const bytes=new Uint8Array(count);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  const rawText=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const season=parseOpenFootball(JSON.parse(rawText));
  const coverage=leagueCoverage(season,now);
  if(!dryRun){
    await mkdir(dirname(targetPath),{recursive:true});
    const temp=`${targetPath}.${process.pid}.tmp`;
    try{await writeFile(temp,rawText,{flag:'wx',mode:0o644});await rename(temp,targetPath);}finally{await rm(temp,{force:true});}
  }
  return {dryRun,bytes:count,...coverage};
}
if(import.meta.url===`file://${process.argv[1]}`){
  syncPublicLeague({dryRun:process.argv.includes('--dry-run')})
    .then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error('Public dataset sync failed:',error.message);process.exitCode=1;});
}