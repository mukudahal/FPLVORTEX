import { NextResponse } from 'next/server';
import { loadEntry, loadBootstrap, loadLeagueStandings, loadPicks, loadEntryHistory } from '@/server/fplData';
import type { AnalysisCohort, AnalysisTier } from '@/lib/liveAnalysis';

export const dynamic = 'force-dynamic';
const cache = new Map<string,{until:number; value:AnalysisCohort}>();
const inflight = new Map<string,Promise<AnalysisCohort>>();
const tiers: AnalysisTier[] = ['top100','top1k','top10k','top100k','near','overall'];

async function build(id:number,gw:number,tier:AnalysisTier):Promise<AnalysisCohort> {
  const entry = await loadEntry(id);
  const overall = entry.leagues?.classic.find(l=>l.name==='Overall');
  if (!overall) throw new Error('The official overall league is unavailable for this team.');
  let low=1, high=100;
  if(tier==='top1k')high=1000;
  if(tier==='top10k')high=10000;
  if(tier==='top100k')high=100000;
  if(tier==='near') {low=Math.max(1,(entry.summary_overall_rank??1)-500);high=low+999;}
  if(tier==='overall') {
    const raw=await loadBootstrap();
    high=raw.total_players;
  }
  const first=Math.ceil(low/50), last=Math.ceil(high/50);
  const pages=[...new Set([first,first+Math.floor((last-first)/3),first+Math.floor(2*(last-first)/3),last])];
  const standings=await Promise.allSettled(pages.map(page=>loadLeagueStandings(overall.id, page, 300)));
  const rows=standings.flatMap(r=>r.status==='fulfilled'?r.value.standings.results:[]);
  const candidates=standings.flatMap(r=>{
    if(r.status!=='fulfilled')return [];
    const list=r.value.standings.results;
    const take=Math.min(list.length,Math.ceil(12/pages.length));
    return Array.from({length:take},(_,i)=>list[Math.floor((i+0.5)*list.length/take)]);
  });
  const unique=[...new Map(candidates.map(r=>[r.entry,r])).values()];
  const managers=await Promise.all(unique.map(async row=>{
    const [picks,history]=await Promise.allSettled([
      loadPicks(row.entry, gw, 120),
      loadEntryHistory(row.entry, 300),
    ]);
    if(picks.status!=='fulfilled')return null;
    return {rank:row.rank,picks:picks.value,chipsUsed:history.status==='fulfilled'?history.value.chips.filter(c=>c.event<=gw):null};
  }));
  const successful=managers.filter((m):m is NonNullable<typeof m>=>m!==null);
  if(!successful.length)throw new Error('Could not load a rank-tier sample from official FPL. Try again shortly.');
  return {gw,tier,sampledAt:new Date().toISOString(),requested:12,managers:successful,
    fromRank:rows.length?Math.min(...rows.map(r=>r.rank)):null,toRank:rows.length?Math.max(...rows.map(r=>r.rank)):null,
    failed:Math.max(0,12-successful.length)};
}

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;const entry=Number(id);const url=new URL(req.url);
  const gw=Number(url.searchParams.get('gw'));const tier=(url.searchParams.get('tier')??'near') as AnalysisTier;
  if(!Number.isInteger(entry)||entry<1||!Number.isInteger(gw)||gw<1||gw>38||!tiers.includes(tier))return NextResponse.json({error:'Invalid team, gameweek or rank tier.'},{status:400});
  const key=tier==='near'?`${entry}:${gw}:${tier}`:`${gw}:${tier}`;const saved=cache.get(key);
  if(saved&&saved.until>Date.now())return NextResponse.json(saved.value);
  let pending=inflight.get(key);
  if(!pending){pending=build(entry,gw,tier);inflight.set(key,pending);}
  try {
    const value=await pending;
    if(cache.size>=24)cache.delete(cache.keys().next().value!);
    cache.set(key,{until:Date.now()+120000,value});
    return NextResponse.json(value);
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Rank-tier data unavailable.'},{status:502});}
  finally{inflight.delete(key);}
}
