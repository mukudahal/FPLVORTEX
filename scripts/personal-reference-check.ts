import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseCsvRows } from '../server/odds';
import type { Snapshot } from '../src/lib/types';

type ReferenceRow = { id:number; name:string; eventPoints:number|null; totalPoints?:number|null; minutes?:number|null; xgi90?:number|null; xgc90?:number|null; defcon?:number|null };
const normalized = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const numeric = (s:string|undefined) => s?.trim() && Number.isFinite(Number(s)) ? Number(s) : null;
const digest = (raw:string) => createHash('sha256').update(raw).digest('hex');

export function compareSettledReference(snapshot:Snapshot, rows:ReferenceRow[], settledGw:number) {
  const players=new Map(snapshot.players.map(p=>[p.id,p]));
  if (settledGw!==snapshot.meta.currentEventId || !snapshot.gameweeks.some(g=>g.id===settledGw&&g.finished&&g.dataChecked)) return {status:'stale-or-unsettled' as const};
  if (new Set(rows.map(r=>r.id)).size!==rows.length || rows.some(r=>!Number.isInteger(r.id)||!r.name)) return {status:'invalid-identity' as const};
  let matched=0, eventCompared=0, eventAgrees=0, totalCompared=0, totalAgrees=0;
  const disagreements: {id:number; field:string; reference:unknown; official:unknown}[]=[];
  for (const r of rows) {
    const p=players.get(r.id);
    if (!p || !normalized(p.fullName||p.name).endsWith(normalized(r.name)) && normalized(p.name)!==normalized(r.name)) {
      disagreements.push({id:r.id,field:'identity',reference:r.name,official:p?.name??null}); continue;
    }
    matched++;
    for (const [field,value,official] of [['eventPoints',r.eventPoints,p.eventPoints],['totalPoints',r.totalPoints,p.totalPoints]] as const) {
      if (value==null) continue;
      if (field==='eventPoints') { eventCompared++; if(value===official) eventAgrees++; }
      else {totalCompared++; if(value===official) totalAgrees++;}
      if(value!==official) disagreements.push({id:r.id,field,reference:value,official});
    }
  }
  return {status:'compared' as const,rows:rows.length,matched,eventCompared,eventAgrees,totalCompared,totalAgrees,disagreementCount:disagreements.length,disagreements:disagreements.slice(0,30)};
}

export async function checkPersonalReferences(snapshot:Snapshot, settledGw:number) {
  const checkedAt=new Date().toISOString();
  const spreadsheet = await (async()=>{
    try {
      const raw=await readFile('data/reference/fpl-planner-sheet.json','utf8');
      const data=JSON.parse(raw);
      if (data.season!==snapshot.meta.season || data.settledGw!==settledGw || !Array.isArray(data.rows) || data.rows.some((r:{gw:number})=>r.gw!==settledGw)) return {status:'stale-or-invalid',source:data.source,settledGw:data.settledGw};
      return {source:data.source,settledGw,checkedAt,retrievedAt:data.retrievedAt,sha256:digest(raw),...compareSettledReference(snapshot,data.rows,settledGw),excludedColumns:data.excludedColumns};
    } catch { return {status:'unavailable'}; }
  })();
  const season=snapshot.meta.season.replace(/^(\d{4})\/(\d{2})$/, '$1-20$2');
  const coreUrl='https://raw.githubusercontent.com/olbauday/FPL-Core-Insights/main/data/'+season+'/By%20Gameweek/GW'+settledGw+'/player_gameweek_stats.csv';
  const fplCore=await (async()=>{
    try {
      if (!/^\d{4}-\d{4}$/.test(season)||settledGw<1) return {status:'unavailable',source:coreUrl};
      const res=await fetch(coreUrl,{signal:AbortSignal.timeout(15000),redirect:'error'});
      if(!res.ok) return {status:'unavailable',source:coreUrl,httpStatus:res.status};
      const raw=await res.text(), parsed=parseCsvRows(raw);
      if (!parsed.length||parsed.some(r=>numeric(r.gw)!==settledGw||numeric(r.id)==null||!r.web_name||numeric(r.total_points)==null)) return {status:'invalid-schema-or-gameweek',source:coreUrl};
      const rows=parsed.map(r=>({id:Number(r.id),name:r.web_name,eventPoints:numeric(r.total_points)}));
      return {source:coreUrl,settledGw,checkedAt,sha256:digest(raw),...compareSettledReference(snapshot,rows,settledGw)};
    } catch {return {status:'unavailable',source:coreUrl};}
  })();
  return {checkedAt,settledGw,spreadsheet,fplCore,opta:{status:'no verified licensed direct feed'},use:'Cross-checks only; no source modifies the independent forecast mean or overrides official data.'};
}
