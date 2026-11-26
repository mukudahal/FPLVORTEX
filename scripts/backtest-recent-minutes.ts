/** Retrospective shadow test. Historical official event payloads can include later corrections. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { evaluateForecastArchive, probabilityScores, summarizeForecastErrors } from './evaluate-forecast-archive';
import type { Snapshot } from '../src/lib/types';

type Observation={minutes:number;starts:number};
type EventFile={elements:Array<{id:number;stats:Observation & {total_points:number};explain:Array<{fixture:number}>}>};
type Scored={season:string;gw:number;playerId:number;position:string;status:string;actual:Observation;production:number;seasonMean:number;
  estimates:Record<number,ReturnType<typeof recentMinutes>>};

export function recentMinutes(observations:readonly Observation[], window:number, availability:number) {
  const sample=observations.slice(-window);
  if (!sample.length) return null;
  if (!Number.isInteger(window)||window<1||!Number.isFinite(availability)||availability<0||availability>1||
    sample.some(m=>!Number.isInteger(m.minutes)||m.minutes<0||m.minutes>90||![0,1].includes(m.starts))) throw new RangeError('Invalid minutes sample.');
  const mean=(items:Observation[],field:(m:Observation)=>number)=>items.reduce((sum,m)=>sum+field(m),0)/items.length;
  const starters=sample.filter(m=>m.starts===1), subs=sample.filter(m=>m.starts===0&&m.minutes>0);
  return {n:sample.length,expectedMinutes:availability*mean(sample,m=>m.minutes),pStart:availability*starters.length/sample.length,
    p60:availability*mean(sample,m=>Number(m.minutes>=60)),pSub:availability*subs.length/sample.length,
    pZero:1-availability*mean(sample,m=>Number(m.minutes>0)),
    minutesIfStarting:starters.length?mean(starters,m=>m.minutes):null,minutesIfSub:subs.length?mean(subs,m=>m.minutes):null};
}

async function run(root:string,version:string,dir:string) {
  const evaluation=await evaluateForecastArchive(root,version);
  const windows=[3,5,8,15];
  const candidates:Scored[]=[];
  for (const week of evaluation.selected) {
    const f=JSON.parse(gunzipSync(await readFile(week.file)).toString()) as {snapshot:Snapshot;predictions:{playerId:number;gameweeks:{gw:number;expectedMinutes:number|null}[]}[]};
    const fixtureMap=new Map(f.snapshot.fixtures.map(fx=>[fx.id,fx]));
    const canonical=await readFile(week.file.replace(/\.json\.gz$/,'.outcome.json.gz'));
    const finalPoints=new Map((JSON.parse(gunzipSync(canonical).toString()).outcomes as {playerId:number;points:number}[]).map(p=>[p.playerId,p.points]));
    const history=new Map<number,Observation[]>();
    const load=async(gw:number):Promise<EventFile>=>JSON.parse(await readFile(join(dir,week.season.replace('/','-')+'-gw'+gw+'.json'),'utf8'));
    // Sort by time of each individual match, including postponed or out-of-order rounds.
    const previous:{at:number;pid:number;stats:Observation}[]=[];
    for (const g of f.snapshot.gameweeks.filter(g=>g.finished && g.dataChecked && g.id!==week.gw)) {
      const historical=await load(g.id);
      for (const p of historical.elements) {
        if (p.explain.length!==1) continue;
        const fx=fixtureMap.get(p.explain[0].fixture),at=Date.parse(fx?.kickoffTime??'');
        if (fx?.event!==g.id||!fx.finished||!Number.isFinite(at)||at+86400000>=Date.parse(week.computedAt)) continue;
        previous.push({at,pid:p.id,stats:p.stats});
      }
    }
    for (const p of previous.sort((a,b)=>a.at-b.at)) {
      const rows=history.get(p.pid)??[]; rows.push(p.stats);history.set(p.pid,rows);
    }
    const observed=new Map((await load(week.gw)).elements.map(p=>[p.id,p]));
    const projected=new Map(f.predictions.map(p=>[p.playerId,p.gameweeks.find(g=>g.gw===week.gw)?.expectedMinutes]));
    for (const p of f.snapshot.players) {
      const actual=observed.get(p.id),xp=projected.get(p.id),past=history.get(p.id);
      if (!actual || actual.stats.total_points!==finalPoints.get(p.id) || xp==null || !past?.length || actual.explain.length!==1) continue;
      const fixture=fixtureMap.get(actual.explain[0].fixture);
      const clubGames=f.snapshot.fixtures.filter(f=>f.finished && (f.teamH===p.teamId||f.teamA===p.teamId)).length;
      if (!clubGames || fixture?.event!==week.gw || ![fixture.teamA,fixture.teamH].includes(p.teamId)) continue;
      // Unknown injury probabilities remain missing. No current news is backfilled.
      const availability=p.chance==null?(p.status==='a'?1:null):p.chance/100;
      if (availability==null) continue;
      candidates.push({season:week.season,gw:week.gw,playerId:p.id,position:p.position,status:p.status,actual:actual.stats,
        production:xp,seasonMean:p.minutes/clubGames,
        estimates:Object.fromEntries(windows.map(w=>[w,recentMinutes(past,w,availability)]))});
    }
  }
  const groups=evaluation.selected;
  if (groups.length<2) return {modelVersion:version,insufficientData:true,matchedRows:candidates.length};
  const last=groups.at(-1)!;
  const target=candidates.filter(r=>r.gw===last.gw&&r.season===last.season);
  const trainingKeys=new Set(groups.filter(g=>Date.parse(g.observedAt)<Date.parse(last.computedAt)).map(g=>g.season+':'+g.gw));
  const training=candidates.filter(r=>trainingKeys.has(r.season+':'+r.gw));
  const summary=(rows:Scored[],value:(r:Scored)=>number)=>summarizeForecastErrors(rows.map(r=>({prediction:value(r),actual:r.actual.minutes})),15);
  const tuning=windows.map(window=>({window,minutes:summary(training,r=>r.estimates[window]!.expectedMinutes)}));
  const best=tuning.filter(t=>t.minutes).sort((a,b)=>a.minutes!.mae-b.minutes!.mae || a.window-b.window)[0];
  if (!best || !target.length) return {modelVersion:version,insufficientData:true,matchedRows:candidates.length};
  const value=(r:Scored)=>r.estimates[best.window]!;
  return {modelVersion:version,kind:'retrospective shadow test on frozen forecast-date rosters',tuning,selectedWindow:best.window,
    tuningRows:training.length,holdout:{season:last.season,gw:last.gw,n:target.length},
    expectedMinutes:{recent:summary(target,r=>value(r).expectedMinutes),vortex:summary(target,r=>r.production),seasonMean:summary(target,r=>r.seasonMean)},
    start:probabilityScores(target.map(r=>({prediction:value(r).pStart,actual:r.actual.starts}))),
    sixtyMinutes:probabilityScores(target.map(r=>({prediction:value(r).p60,actual:Number(r.actual.minutes>=60)}))),
    byPosition:Object.fromEntries([...new Set(target.map(r=>r.position))].map(pos=>[pos,summary(target.filter(r=>r.position===pos),r=>value(r).expectedMinutes)])),
    byAvailability:Object.fromEntries([...new Set(target.map(r=>r.status))].map(status=>[status,summary(target.filter(r=>r.status===status),r=>value(r).expectedMinutes)])),
    limitations:['Official match statistics were retrieved after the historical deadlines. Only previously final, checked fixtures in each original snapshot enter the lagged features. Publication-time revisions or retroactive player listings cannot be ruled out.',
      'Single-fixture outcomes only. Selection uses mean absolute minutes error from earlier settled target weeks. Short windows can imply probabilities of exactly zero or one.',
      'One held-out deadline cannot validate replacing the production minutes model. No press-conference, domestic cup, European or international duty data is present.']};
}

if (process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [root,version,dir]=process.argv.slice(2);
  if (!root||!version||!dir) throw new Error('Supply archive directory, model version and official event JSON directory.');
  console.log(JSON.stringify(await run(root,version,dir),null,2));
}
