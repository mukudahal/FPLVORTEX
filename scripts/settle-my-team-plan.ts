import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { fetchFplJson } from '../server/http';
import { fetchOfficialSnapshot } from '../server/officialSnapshot';
import { writeImmutableArchive } from '../server/forecastArchive';
import { scoreLineup } from '../src/lib/repoModel/monteCarlo';
import { positionToType } from '../src/lib/repoModel/fplReviewSimulator';
import { mapOfficialChipToPlanningChip } from '../src/lib/freeTransfers';
import type { Snapshot } from '../src/lib/types';
import type { Report } from './export-my-team-plan';

type OfficialPoints = {elements:{id:number; stats:{total_points:number; minutes:number; played:boolean}}[]};
type PublicPicks = { active_chip:string|null; entry_history:{event:number;points:number;event_transfers_cost:number;overall_rank:number|null};
  picks:{element:number;position:number;is_captain:boolean;is_vice_captain:boolean}[];
  automatic_subs:{element_in:number;element_out:number}[] };
type Transfer = {event:number;element_in:number;element_out:number;time:string};

export function settleWeek(report:Report, gw:number, snapshot:Snapshot, live:OfficialPoints, picks:PublicPicks,
  transfers:Transfer[], observedAt:string) {
  const week=report.weeks.find(w=>w.gw===gw);
  const event=snapshot.gameweeks.find(e=>e.id===gw);
  const issued=Date.parse(report.computedAt), snapshotAt=Date.parse(report.snapshotAt);
  const firstDeadline=Date.parse(report.weeks[0]?.deadline??''), seen=Date.parse(observedAt);
  const deadline=Date.parse(event?.deadlineTime??'');
  if (!week?.fixedHoldLineup || !report.provenance?.snapshotId) throw new Error('No frozen hold lineup or snapshot identity in this recommendation.');
  if (![issued,snapshotAt,firstDeadline,seen,deadline].every(Number.isFinite) || snapshotAt>issued ||
      issued>=firstDeadline || issued>=deadline || seen<=deadline || snapshot.meta.season!==report.season ||
      !event?.finished || !event.dataChecked || !snapshot.meta.upstreamOk || snapshot.meta.stale || picks.entry_history?.event!==gw) {
    throw new Error('Requires a pre-deadline recommendation and matching final, checked official gameweek.');
  }
  const byId=new Map(live.elements.map(r=>[r.id,r.stats]));
  const positions=new Map([...report.weeks[0].currentSquad,...week.finalSquad].map(p=>[p.id,positionToType(p.position)]));
  const hold=week.fixedHoldLineup;
  const advised={starters:week.starters.map(p=>p.id),bench:week.bench.map(p=>p.id),captainId:week.captain.id,viceId:week.vice.id};
  const required=[...new Set([...hold.starters,...hold.bench,...advised.starters,...advised.bench])];
  if (byId.size!==live.elements.length || required.some(id=>{
    const s=byId.get(id);
    return !positions.has(id)||!s||!Number.isInteger(s.total_points)||!Number.isInteger(s.minutes)||s.minutes<0||typeof s.played!=='boolean';
  })) throw new Error('Incomplete official participation or points for a frozen lineup.');
  const outcome={pts:(id:number)=>byId.get(id)!.total_points, played:(id:number)=>byId.get(id)!.played, position:(id:number)=>positions.get(id)!};
  const advisedNet=scoreLineup(advised,outcome,week.chip??undefined)-week.hitCost;
  const held=scoreLineup(hold,outcome);
  const noChip=scoreLineup(advised,outcome)-week.hitCost;
  const sameIds=(a:number[],b:number[])=>a.length===b.length&&a.every(id=>b.includes(id));
  if (picks.picks.length!==15 || new Set(picks.picks.map(p=>p.element)).size!==15 || !Array.isArray(picks.automatic_subs) ||
      !Array.isArray(transfers) || !Number.isInteger(picks.entry_history.points) || !Number.isInteger(picks.entry_history.event_transfers_cost)) throw new Error('Invalid public picks or manager result.');
  const initialOrder=[...picks.picks].sort((a,b)=>a.position-b.position).map(p=>p.element);
  for (const sub of [...picks.automatic_subs].reverse()) {
    const a=initialOrder.indexOf(sub.element_in),b=initialOrder.indexOf(sub.element_out);
    if (a<0 || b<0) throw new Error('Autosubstitution incompatible with published squad.');
    [initialOrder[a],initialOrder[b]]=[initialOrder[b],initialOrder[a]];
  }
  const realCaptain=picks.picks.find(p=>p.is_captain)?.element;
  const realVice=picks.picks.find(p=>p.is_vice_captain)?.element;
  const actualTransfers=transfers.filter(t=>t.event===gw);
  const actualChip=picks.active_chip==null?null:mapOfficialChipToPlanningChip(picks.active_chip);
  if (actualChip===undefined || realCaptain===undefined || realVice===undefined) throw new Error('Unrecognised official chip or armbands.');
  const capId=outcome.played(advised.captainId)?advised.captainId:outcome.played(advised.viceId)?advised.viceId:null;
  const capExtra=capId===null?0:outcome.pts(capId);
  const actualHit=picks.entry_history.event_transfers_cost;
  const execution={squad:sameIds(initialOrder,week.finalSquad.map(p=>p.id)),xi:sameIds(initialOrder.slice(0,11),advised.starters),
    captain:realCaptain===advised.captainId,vice:realVice===advised.viceId,chip:week.chip===actualChip,
    benchOrder:initialOrder.slice(11).filter(id=>positions.get(id)!==1).join(',')===advised.bench.filter(id=>positions.get(id)!==1).join(','),
    buys:sameIds(actualTransfers.map(t=>t.element_in),week.transfers.map(t=>t.incoming.id)),
    sales:sameIds(actualTransfers.map(t=>t.element_out),week.transfers.map(t=>t.out.id)),hit:actualHit===week.hitCost};
  return {gw,observedAt,entryId:report.entryId,season:report.season,computedAt:report.computedAt,snapshotAt:report.snapshotAt,
    inputId:report.provenance.snapshotId,modelVersion:report.provenance.modelVersion,revision:report.provenance.revision,
    expectedPoints:week.xPts,realisedAdviceNet:advisedNet,realisedFixedHold:held,realisedGain:advisedNet-held,
    predictionMinusActual:week.xPts-advisedNet,realisedCaptainExtra:capExtra*(week.chip==='tc'?2:1),
    captainRegretAmongAdvisedXI:Math.max(...advised.starters.map(id=>outcome.played(id)?outcome.pts(id):capExtra))-capExtra,
    sameSquadScoringChipEffect:week.chip==='bb'||week.chip==='tc'?advisedNet-noChip:null,
    actualManagerNet:picks.entry_history.points-actualHit,managerOverallRank:picks.entry_history.overall_rank,
    actualCaptain:realCaptain,actualVice:realVice,actualChip,actualTransfers,execution,followedAll:Object.values(execution).every(Boolean),
    playerOutcomes:required.map(id=>({id,...{points:outcome.pts(id),played:outcome.played(id),minutes:byId.get(id)!.minutes}})),
    limitations:['Manager standings are public deadline outcomes. League movement needs observations at both deadlines. Transfer effects include subsequent locked lineup decisions. Hindsight captain regret is diagnostic.']};
}

async function main() {
  const [input,output]=process.argv.slice(2);
  if (!input || !output) throw new Error('Supply an immutable pre-deadline .json.gz recommendation and private settlement directory.');
  const raw=gunzipSync(await readFile(input));
  const report=JSON.parse(raw.toString()) as Report;
  const identity=createHash('sha256').update(raw).digest('hex');
  const snapshot=await fetchOfficialSnapshot();
  if (snapshot.meta.season!==report.season) throw new Error('Incompatible season. Use its original official outcome archive.');
  if (!Number.isSafeInteger(report.entryId)||report.entryId<=0) throw new Error('Invalid manager identity.');
  const events=report.horizon.filter(g=>snapshot.gameweeks.some(e=>e.id===g&&e.finished&&e.dataChecked));
  if (!events.length) {console.log('No final checked gameweeks in this recommendation.');return;}
  const [root,transfers]=await Promise.all([fetchFplJson<{id:number}>('/entry/'+report.entryId+'/'),fetchFplJson<Transfer[]>('/entry/'+report.entryId+'/transfers/')]);
  if (root.id!==report.entryId) throw new Error('Manager identity mismatch.');
  const folder=join(output,identity);
  const results:ReturnType<typeof settleWeek>[]=[];
  for (const gw of events) {
    const file=join(folder,'gw'+gw+'.json.gz');
    const readExisting=async()=>JSON.parse(gunzipSync(await readFile(file)).toString()) as ReturnType<typeof settleWeek>;
    let settled:ReturnType<typeof settleWeek>;
    try {settled=await readExisting();}
    catch (error) {
      if ((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;
      const [points,picks]=await Promise.all([fetchFplJson<OfficialPoints>('/event/'+gw+'/live/'),fetchFplJson<PublicPicks>('/entry/'+report.entryId+'/event/'+gw+'/picks/')]);
      settled=settleWeek(report,gw,snapshot,points,picks,transfers,new Date().toISOString());
      if (!await writeImmutableArchive(file,settled)) settled=await readExisting();
    }
    results.push(settled);
  }
  for (const n of [1,3,5]) {
    const rows=results.slice(0,n);
    if (rows.length!==n || !rows.every((row,i)=>row.gw===report.horizon[i])) continue;
    const sum=(key:'realisedAdviceNet'|'realisedFixedHold'|'actualManagerNet')=>rows.reduce((total,r)=>total+r[key],0);
    await writeImmutableArchive(join(folder,'first-'+n+'-weeks.json.gz'),{entryId:report.entryId,season:report.season,recommendationSha256:identity,
      modelVersion:report.provenance?.modelVersion,revision:report.provenance?.revision,issuedAt:report.computedAt,observedAt:rows.at(-1)!.observedAt,
      gameweeks:rows.map(r=>r.gw),advice:sum('realisedAdviceNet'),hold:sum('realisedFixedHold'),manager:sum('actualManagerNet'),gainVsHold:sum('realisedAdviceNet')-sum('realisedFixedHold')});
  }
  console.log('Recorded '+results.length+' final gameweeks for recommendation '+identity+'.');
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
