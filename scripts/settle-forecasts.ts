import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fetchFplJson} from '../server/http.ts';
import {matchSettledOutcomes,writeImmutableArchive,type createForecastArchive} from '../server/forecastArchive.ts';
import type {Snapshot} from '../src/lib/types.ts';
const root='data/forecast-archive';
const snapshot=JSON.parse(await readFile(process.env.VORTEX_SNAPSHOT_PATH??'public/data/fpl-snapshot.json','utf8')) as Snapshot;
const feeds=new Map<number,unknown>();
let files:string[]=[];
try {files=await readdir(root,{recursive:true});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
for(const relative of files.filter(f=>f.endsWith('.json.gz')&&!f.endsWith('.outcome.json.gz'))){
 const file=path.join(root,relative),target=file.replace(/\.json\.gz$/,'.outcome.json.gz');
 try {await readFile(target);continue;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const archive=JSON.parse(gunzipSync(await readFile(file)).toString()) as ReturnType<typeof createForecastArchive>;
 const event=snapshot.gameweeks.find(g=>g.id===archive.targetGw);
 if(archive.season!==snapshot.meta.season||!event?.finished||!event.dataChecked)continue;
 if(!feeds.has(event.id))feeds.set(event.id,await fetchFplJson(`/event/${event.id}/live/`));
 const outcome=matchSettledOutcomes(archive,snapshot,feeds.get(event.id));
 console.log('Settled archive',relative,await writeImmutableArchive(target,outcome));
}
