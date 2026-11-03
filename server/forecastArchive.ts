import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, open, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Snapshot } from '../src/lib/types.ts';
import { buildPlayerForecastContext, playerGameweekPoints, playerGameweekExpectedMinutes } from '../src/lib/playerTableForecast.ts';
import { assertFreshSnapshot } from './snapshotValidation.ts';

const hash = (text:string) => createHash('sha256').update(text).digest('hex');
export async function productionModelVersion() {
  const modules=['analytics','fixtures','playerTableForecast','snapshotFreshness','freshnessPolicy','types',
    'repoModel/xpts','repoModel/playerModel','repoModel/minutes','repoModel/probability','repoModel/scoring','repoModel/seasonRules'];
  const sources=await Promise.all(modules.map(async name=>name+'\n'+await readFile('src/lib/'+name+'.ts','utf8')));
  return 'typescript-mechanistic-'+hash(sources.join('\n')).slice(0,16);
}

/** New observations only. Never back-date a forecast or regenerate a past deadline. */
export function createForecastArchive(snapshot:Snapshot, modelVersion:string, now=new Date()) {
  assertFreshSnapshot(snapshot,now.getTime());
  if(!modelVersion.trim())throw Error('A model version is required');
  const next=snapshot.gameweeks.find(g=>g.id===snapshot.meta.nextEventId);
  const deadline=Date.parse(next?.deadlineTime??'');
  if(!Number.isFinite(deadline)||deadline<=now.getTime()||next?.finished)throw Error('Only a future pre-deadline forecast may be archived');
  if(snapshot.meta.repoData||snapshot.fixtures.some(f=>f.marketOdds)||snapshot.players.some(p=>p.gwProjections))throw Error('Archive requires official-only inputs, not a mixed-source enriched snapshot');
  const inputId=hash(JSON.stringify(snapshot));
  const ctx=buildPlayerForecastContext(snapshot);
  const gws=snapshot.gameweeks.filter(g=>g.id>=next!.id&&g.id<next!.id+10&&Date.parse(g.deadlineTime)>now.getTime()).map(g=>g.id);
  const predictions=snapshot.players.map(p=>({playerId:p.id,gameweeks:gws.map(gw=>({
    gw, points:playerGameweekPoints(ctx,p,gw), expectedMinutes:playerGameweekExpectedMinutes(ctx,p,gw),
  }))}));
  return {schemaVersion:1,source:'prospective-only' as const,computedAt:now.toISOString(),retrievedAt:snapshot.meta.generatedAt,
    inputId,modelVersion,season:snapshot.meta.season,targetGw:next!.id,deadlineAt:next!.deadlineTime,
    calibration:'unverified' as const,missingValue:'null; unavailable forecast or no scheduled fixture',snapshot,predictions};
}
export async function saveForecastArchive(snapshot:Snapshot,root='data/forecast-archive',now=new Date()) {
  const model=await productionModelVersion();
  const season=snapshot.meta.season.replace('/','-');
  const directory=path.join(root,season,'gw'+snapshot.meta.nextEventId);
  const file=path.join(directory,now.toISOString().slice(0,10)+'-'+model+'.json.gz');
  // Once per UTC day/GW/model version; existing observations are immutable.
  try { await readFile(file); return {file,created:false}; } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error; }
  const archive=createForecastArchive(snapshot,model,now);
  await mkdir(directory,{recursive:true});
  return {file,created:await writeImmutableArchive(file,archive)};
}

/** Atomic publication without replacing an earlier observation. */
export async function writeImmutableArchive(file:string,payload:unknown) {
  await mkdir(path.dirname(file),{recursive:true});
  const temp=file+'.'+randomUUID()+'.tmp';
  try {
    const handle=await open(temp,'wx',0o600);
    try {await handle.writeFile(gzipSync(JSON.stringify(payload)));await handle.sync();}
    finally {await handle.close();}
    try {await link(temp,file);return true;}
    catch(error) {if((error as NodeJS.ErrnoException).code==='EEXIST')return false;throw error;}
  } finally {await unlink(temp).catch(()=>undefined);}
}

export function matchSettledOutcomes(archive:ReturnType<typeof createForecastArchive>,snapshot:Snapshot,payload:unknown,observedAt=new Date().toISOString()) {
  assertFreshSnapshot(snapshot);
  const event=snapshot.gameweeks.find(g=>g.id===archive.targetGw);
  if(snapshot.meta.season!==archive.season||!event?.finished||!event.dataChecked||Date.parse(observedAt)<Date.parse(archive.deadlineAt))throw Error('Outcome gameweek is not settled');
  const elements=(payload as {elements?:unknown[]}|null)?.elements;
  if(!Array.isArray(elements))throw Error('Official settled elements unavailable');
  const scores=new Map<number,number>();
  for(const item of elements){
    const row=item as {id?:number;stats?:{total_points?:number}};
    if(!Number.isSafeInteger(row?.id)||!row.id||scores.has(row.id)||!Number.isFinite(row.stats?.total_points))throw Error('Invalid/duplicate official outcome');
    scores.set(row.id,row.stats!.total_points!);
  }
  if(archive.predictions.some(p=>!scores.has(p.playerId)))throw Error('Official outcomes incomplete for archived players');
  return {schemaVersion:1,source:'official-fpl-event-live',observedAt,season:archive.season,targetGw:archive.targetGw,inputId:archive.inputId,modelVersion:archive.modelVersion,
    outcomes:archive.predictions.map(p=>({playerId:p.playerId,points:scores.get(p.playerId)})),calibration:'not-evaluated'};
}
