import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import worker from '../worker/index.js';
const port=Number(process.env.PORT ?? 4173);
const qaDirectory=process.env.FPL_QA_DIRECTORY;
const server=createServer(async(incoming,outgoing)=>{
  try{
    const pathname=new URL(incoming.url,'http://127.0.0.1').pathname;
    if(qaDirectory&&pathname==='/__responsive'){
      const html=await readFile(resolve(qaDirectory,'responsive.html'));
      outgoing.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});outgoing.end(html);return;
    }
    if(qaDirectory&&/^\/api\/(?:bootstrap|fixtures|entry\/[1-9]\d{0,9}|history\/[1-9]\d{0,9}|picks\/[1-9]\d{0,9}\/\d{1,2}|live\/\d{1,2})$/.test(pathname)){
      const data=await readFile(resolve(qaDirectory,pathname.slice(5).replaceAll('/','-')+'.json'));
      outgoing.writeHead(200,{'content-type':'application/json','cache-control':'no-store','x-qa-source':'Captured official API response'});outgoing.end(data);return;
    }
    const result=await worker.fetch(new Request('http://127.0.0.1:'+port+incoming.url,{method:incoming.method}),{}, {waitUntil:promise=>promise.catch(()=>{})});outgoing.writeHead(result.status,Object.fromEntries(result.headers));outgoing.end(Buffer.from(await result.arrayBuffer()));
  }
  catch{outgoing.writeHead(500);outgoing.end('Preview error');}
});
server.on('error',error=>{console.error('Preview unavailable: '+error.message);process.exitCode=1;});
server.listen(port,'0.0.0.0',()=>console.log('Local: http://127.0.0.1:'+port));
