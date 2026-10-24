'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HomePitch, type HomePitchCardData } from '@/components/home/HomePitch';
import { PlayerPhoto } from '@/components/PlayerPhoto';
import { useJson } from '@/lib/useJson';
import { cohortStats, fixtureState, liveContributions, resolveLiveTeam, type AnalysisCohort, type AnalysisContribution, type AnalysisTier } from '@/lib/liveAnalysis';
import type { EntryResponse, Fixture, LiveResponse, Pick, PicksResponse, SlimBootstrap, SlimElement } from '@/lib/types';

const TIERS: {id:AnalysisTier;label:string}[] = [
  {id:'top100',label:'Top 100'},{id:'top1k',label:'Top 1K'},{id:'top10k',label:'Top 10K'},
  {id:'top100k',label:'Top 100K'},{id:'near',label:'Near your rank'},{id:'overall',label:'Overall'},
];
const CHIPS = [{id:'wildcard',name:'Wildcard',short:'WC'},{id:'freehit',name:'Free Hit',short:'FH'},{id:'bboost',name:'Bench Boost',short:'BB'},{id:'3xc',name:'Triple Captain',short:'TC'}];
const signed = (n:number,digits=1) => `${n>0?'+':''}${n.toFixed(digits)}`;
function Panel({title,kicker,children,className=''}:{title:string;kicker?:string;children:ReactNode;className?:string}) {
  return <section className={`analysis-card ${className}`}><header className="analysis-card-heading">{kicker?<span className="analysis-eyebrow">{kicker}</span>:null}<h2>{title}</h2></header>{children}</section>;
}
function Metric({label,value,tone=''}:{label:string;value:ReactNode;tone?:string}) {
  return <div className={`analysis-metric ${tone} ${String(value).length>5?'long':''}`}><dt>{label}</dt><dd>{value}</dd></div>;
}

interface Observed extends AnalysisContribution { observedAt:string; }
function EventsFeed({teamId,gw,live,fixtures,elements,teams,multiplier,eo,hasSample}:{
  teamId:string;gw:number;live:LiveResponse;fixtures:Fixture[];elements:Map<number,SlimElement>;
  teams:Map<number,SlimBootstrap['teams'][number]>;multiplier:Map<number,number>;eo:Map<number,number>;hasSample:boolean;
}) {
  const contributions=useMemo(()=>liveContributions(live),[live]);
  const previous=useRef<{key:string;rows:AnalysisContribution[]}|null>(null);
  const [observed,setObserved]=useState<{key:string;rows:Observed[]}>({key:'',rows:[]});
  const [game,setGame]=useState('all');const [low,setLow]=useState(true);const [bonus,setBonus]=useState(true);
  const key=`vortex-live-events-${teamId}-${gw}`;
  useEffect(()=>{
    let prior=previous.current?.key===key?previous.current.rows:null;
    let saved:Observed[]=[];
    if(!prior)try{
      const stored=JSON.parse(localStorage.getItem(key)??'null');
      if(stored?.v===1&&Array.isArray(stored.snapshot)&&Array.isArray(stored.rows)&&
        stored.snapshot.every((r:AnalysisContribution)=>r&&typeof r.id==='string'&&typeof r.points==='number')&&
        stored.rows.every((r:Observed)=>r&&typeof r.id==='string'&&typeof r.points==='number'&&typeof r.observedAt==='string')) {prior=stored.snapshot;saved=stored.rows.slice(0,100);}
    }catch{}
    if(prior){
      const priorMap=new Map(prior.map(r=>[r.id,r]));const nowMap=new Map(contributions.map(r=>[r.id,r]));
      const delta:Observed[]=[];
      for(const id of new Set([...priorMap.keys(),...nowMap.keys()])){
        const before=priorMap.get(id);const after=nowMap.get(id);const points=(after?.points??0)-(before?.points??0);
        if(points){const row=after??before!;delta.push({...row,points,value:(after?.value??0)-(before?.value??0),observedAt:new Date().toISOString()});}
      }
      // This effect subscribes to new official snapshots; timestamps record when changes were observed.
      setObserved(current=>({key,rows:[...delta,...(current.key===key?current.rows:saved)].slice(0,100)}));
    }else{
      setObserved({key,rows:[]});
    }
    previous.current={key,rows:contributions};
  },[key,contributions]);
  useEffect(()=>{
    if(observed.key===key)try{localStorage.setItem(key,JSON.stringify({v:1,snapshot:contributions,rows:observed.rows}));}catch{}
  },[key,contributions,observed]);
  const impact=(r:AnalysisContribution)=>hasSample?((multiplier.get(r.element)??0)-(eo.get(r.element)??0))*r.points:null;
  const include=(r:AnalysisContribution)=> (game==='all'||r.fixture===Number(game))&&(bonus||r.label!=='Bonus')&&
    (!low||(hasSample?Math.abs(impact(r)??0)>=0.02:(multiplier.get(r.element)??0)>0));
  const changes=(observed.key===key?observed.rows:[]).filter(include);
  const snapshots=[...contributions].filter(include).sort((a,b)=>Math.abs(impact(b)??b.points)-Math.abs(impact(a)??a.points));
  const render=(r:AnalysisContribution,observedAt?:string)=>{
    const player=elements.get(r.element);const f=fixtures.find(f=>f.id===r.fixture);const delta=impact(r);
    return <details className="analysis-event" key={`${r.id}:${observedAt??'snapshot'}`}>
      <summary><span className="analysis-event-player">{player?<PlayerPhoto code={player.code} alt={player.web_name} className="analysis-event-photo"/>:null}<span className="analysis-event-mark" aria-hidden="true">{r.label==='Goal'?'↗':r.label==='Bonus'?'✦':'•'}</span></span><span className="min-w-0 flex-1"><strong>{r.label} <span className="analysis-muted">·</span> {player?.web_name??`Player ${r.element}`}</strong><small className="analysis-event-meta"><span className={observedAt?'analysis-observed-tag':'analysis-snapshot-tag'}>{observedAt?`Observed ${new Date(observedAt).toLocaleTimeString()}`:'Current GW snapshot'}</span>{f?<span>{teams.get(f.team_h)?.short_name} {f.team_h_score??'–'}–{f.team_a_score??'–'} {teams.get(f.team_a)?.short_name}</span>:null}</small></span><span className={`analysis-impact ${delta!==null&&delta<0?'negative':'positive'}`}>{delta===null?'—':`${signed(delta,2)} pts`}<small>{hasSample?'vs tier sample':'Comparison loading'}</small></span></summary>
      <p className="analysis-event-detail">{signed(r.points,0)} FPL points per player × (your multiplier {multiplier.get(r.element)??0} − sample effective ownership {hasSample?`${((eo.get(r.element)??0)*100).toFixed(1)}%`:'unavailable'}). {observedAt?'Observation time may differ from the match event time.':'This is a scoring snapshot, not a timed match event.'}</p>
    </details>;
  };
  return <Panel title="Live action" kicker="04 / Your gameweek as it unfolds">
    <div className="analysis-feed-controls"><label>Match<select aria-label="Filter live action by match" value={game} onChange={e=>setGame(e.target.value)}><option value="all">All matches</option>{fixtures.map(f=><option key={f.id} value={f.id}>{teams.get(f.team_h)?.short_name} v {teams.get(f.team_a)?.short_name}</option>)}</select></label>
      <label><input type="checkbox" checked={low} onChange={e=>setLow(e.target.checked)}/> Hide low impact (&lt;0.02 pts)</label><label><input type="checkbox" checked={bonus} onChange={e=>setBonus(e.target.checked)}/> Include bonus changes</label></div>
    <div className="analysis-feed">
      <p className="analysis-note">Official scoring snapshots refresh every minute. Changes are recorded while this view is open; earlier snapshots have no event timestamp. Point effects use the selected tier sample.</p>
      {changes.length?<><h3 className="analysis-subheading">Observed updates</h3>{changes.map(r=>render(r,r.observedAt))}</>:<p className="analysis-observing"><span className="analysis-live-dot"/> Watching for the next scoring update</p>}
      <h3 className="analysis-subheading">Current scoring contributions</h3>{snapshots.length?snapshots.slice(0,30).map(r=>render(r)):<p className="analysis-note">No scoring contributions match these filters yet.</p>}
    </div>
  </Panel>;
}

export function AnalysisLiveView({teamId,gw,entry,bootstrap,picks,live,fixtures,lastUpdated,onPrevious,onNext,canPrevious,canNext,reviewDetails}:{
  teamId:string;gw:number;entry:EntryResponse;bootstrap:SlimBootstrap;picks:PicksResponse;live:LiveResponse;fixtures:Fixture[];
  lastUpdated:Date|null;reviewDetails:ReactNode;onPrevious:()=>void;onNext:()=>void;canPrevious:boolean;canNext:boolean;
}) {
  const [post,setPost]=useState(true);const [tier,setTier]=useState<AnalysisTier>('near');
  const cohort=useJson<AnalysisCohort>(`/api/analysis/${teamId}?gw=${gw}&tier=${tier}`,120000);
  const elements=useMemo(()=>new Map(bootstrap.elements.map(e=>[e.id,e])),[bootstrap.elements]);
  const teams=useMemo(()=>new Map(bootstrap.teams.map(t=>[t.id,t])),[bootstrap.teams]);
  const liveMap=useMemo(()=>new Map(live.elements.map(e=>[e.id,e.stats])),[live]);
  const resolved=useMemo(()=>resolveLiveTeam(picks,elements,liveMap,fixtures),[picks,elements,liveMap,fixtures]);
  const matchingCohort=cohort.data?.tier===tier&&cohort.data.gw===gw?cohort.data:null;
  const sample=useMemo(()=>matchingCohort?cohortStats(matchingCohort,elements,liveMap,fixtures,post):null,[matchingCohort,elements,liveMap,fixtures,post]);
  const shown=post?resolved.after:resolved.before;
  const multiplier=new Map(shown.map(p=>[p.element,p.multiplier]));
  const score=post?resolved.afterPoints:resolved.beforePoints;
  const published=entry.history.current.find(h=>h.event===gw);
  const previous=entry.history.current.find(h=>h.event===gw-1);
  const rank=gw===entry.entry.current_event?entry.entry.summary_overall_rank??picks.entry_history.overall_rank??published?.overall_rank:picks.entry_history.overall_rank??published?.overall_rank;
  const previousRank=previous?.overall_rank??null;
  const polling=gw===entry.entry.current_event&&!bootstrap.events.find(e=>e.id===gw)?.finished;
  const gain=rank&&previousRank?previousRank-rank:null;
  const change=gain!==null&&previousRank?gain/previousRank*100:null;
  const previousTotal=previous?.total_points??(gw===entry.entry.started_event?0:picks.entry_history.total_points-picks.entry_history.points+picks.entry_history.event_transfers_cost);
  const projectedTotal=previousTotal+score;
  const active=shown.filter(p=>p.position<=11);
  const bench=shown.filter(p=>p.position>11).sort((a,b)=>a.position-b.position);
  const pending=active.filter(p=>fixtureState(elements.get(p.element)?.team??-1,fixtures).pending).length;
  const playing=active.filter(p=>fixtureState(elements.get(p.element)?.team??-1,fixtures).live).length;
  const exposures=bootstrap.elements.filter(e=>e.element_type<=4).map(e=>{
    const mult=multiplier.get(e.id)??0;const eo=sample?.eo.get(e.id)??0;const points=liveMap.get(e.id)?.total_points??0;
    return {e,mult,eo,points,edge:mult-eo,impact:(mult-eo)*points};
  });
  const differentials=sample?exposures.filter(x=>x.mult>0&&x.edge>0).sort((a,b)=>b.impact-a.impact||b.edge-a.edge).slice(0,4):[];
  const threats=sample?exposures.filter(x=>x.edge<0).sort((a,b)=>a.impact-b.impact||a.edge-b.edge).slice(0,4):[];
  const owned=exposures.filter(x=>x.mult>0);
  const star=sample?[...owned].sort((a,b)=>b.impact-a.impact)[0]:undefined;
  const flop=[...owned].filter(x=>!fixtureState(x.e.team,fixtures).pending).sort((a,b)=>a.points-b.points)[0];
  const missed=threats[0];
  const topCaptains=sample?[...sample.captains].sort((a,b)=>b[1]-a[1]).slice(0,4):[];
  const triples=sample?[...sample.triples].sort((a,b)=>b[1]-a[1]).slice(0,3):[];
  const toPitchCard=(p:Pick):HomePitchCardData|null=>{
    const e=elements.get(p.element);if(!e)return null;
    const state=fixtureState(e.team,fixtures);const stats=liveMap.get(e.id);
    const fixtureLabel=fixtures.filter(f=>f.team_h===e.team||f.team_a===e.team).map(f=>`${teams.get(f.team_h===e.team?f.team_a:f.team_h)?.short_name??'–'} (${f.team_h===e.team?'H':'A'})`).join(', ')||'BLANK';
    return {element:e,pick:{...p,is_captain:p.multiplier>=2,is_vice_captain:p.is_vice_captain&&p.multiplier<2&&p.position<=11},
      points:(stats?.total_points??0)*(p.position>11?1:p.multiplier),showPoints:(stats?.minutes??0)>0||state.done||state.live,fixtureLabel,live:state.live,
      comparisonLabel:sample?`EO ${((sample.eo.get(e.id)??0)*100).toFixed(1)}%`:'EO —'};
  };
  const starterCards=active.map(toPitchCard).filter((c):c is HomePitchCardData=>c!==null);
  const benchCards=bench.map(toPitchCard).filter((c):c is HomePitchCardData=>c!==null);
  const impactCard=(x:typeof exposures[number])=><div key={x.e.id} className="analysis-exposure"><PlayerPhoto code={x.e.code} alt={x.e.web_name} className="h-16 w-12 object-contain"/><strong>{x.e.web_name}</strong><span>{x.points} pts <small>· EO {(x.eo*100).toFixed(1)}%</small></span><b className={x.edge<0?'negative':'positive'}>{signed(x.edge*100,0)}% exposure</b><small className={x.impact<0?'negative':'positive'}>{signed(x.impact,2)} pts vs sample</small><span className="analysis-status">{fixtureState(x.e.team,fixtures).live?'Playing':fixtureState(x.e.team,fixtures).done?'Finished':'To play'}</span></div>;
  return <div className="analysis-live">
    <div className="analysis-toolbar"><div><span className="analysis-eyebrow">FPL VORTEX / MATCHDAY INTELLIGENCE</span><h1>Analysis <em>Live</em></h1><p>Gameweek {gw} · {entry.entry.name}</p></div><div className="analysis-sync"><span className="analysis-live-dot"/> {polling?'Auto refresh · 60 sec':'Completed gameweek'}<small>{lastUpdated?`Points checked ${lastUpdated.toLocaleTimeString()}`:'Waiting for official points'}</small><div className="flex justify-end gap-2 mt-2"><button aria-label="Previous analysis gameweek" className="analysis-button" onClick={onPrevious} disabled={!canPrevious}>‹</button><button aria-label="Next analysis gameweek" className="analysis-button" onClick={onNext} disabled={!canNext}>›</button></div></div></div>
    <div className="analysis-top-grid">
      <Panel title="Your live squad" kicker="01 / The pitch" className="analysis-squad">
        <div className="analysis-pitch-toolbar"><div className="analysis-segment"><button aria-pressed={!post} onClick={()=>setPost(false)}>Deadline XI</button><button aria-pressed={post} onClick={()=>setPost(true)}>With auto-subs</button></div><span>{picks.active_chip?CHIPS.find(c=>c.id===picks.active_chip)?.name??picks.active_chip:'No chip active'}</span></div>
        <HomePitch starters={starterCards} bench={benchCards} className="analysis-home-pitch"/>
        <p className="analysis-note">{resolved.substitutions.length?resolved.substitutions.map(s=>`${elements.get(s.in)?.web_name} on for ${elements.get(s.out)?.web_name}`).join(' · '):'No confirmed automatic substitutions yet.'} {resolved.provisional?'Scores after substitutions remain provisional until FPL processes the gameweek.':''}</p>
      </Panel>
      <div className="analysis-right">
        <Panel title="Gameweek overview" kicker="02 / Compact performance desk">
          <div className="analysis-rank"><div><span className="analysis-eyebrow">PUBLISHED OVERALL RANK</span><strong>{rank?.toLocaleString()??'—'}</strong></div><span className={`analysis-rank-change ${gain!==null&&gain<0?'negative':'positive'}`}>{gain===null?'First gameweek':`${gain>=0?'↑':'↓'} ${Math.abs(gain).toLocaleString()}`}<small>{change===null?'':`${signed(change,2)}% from GW${gw-1}`}</small></span></div>
          <dl className="analysis-metrics"><Metric label={post?'Live net points':'Deadline XI points'} value={score} tone="gold"/><Metric label="Projected total" value={projectedTotal}/><Metric label="Bench points" value={bench.reduce((sum,p)=>sum+(liveMap.get(p.element)?.total_points??0),0)}/><Metric label="Playing now" value={playing}/><Metric label="Players remaining" value={pending}/><Metric label="GW average · official" value={bootstrap.events.find(e=>e.id===gw)?.average_entry_score??'—'}/><Metric label="Previous rank" value={previousRank?.toLocaleString()??'—'}/><Metric label="GW rank · published" value={(gw===entry.entry.current_event?entry.entry.summary_event_rank??picks.entry_history.rank:picks.entry_history.rank)?.toLocaleString()??'—'}/><Metric label="Published total" value={picks.entry_history.total_points}/><Metric label="Rank percentile" value={rank?`Top ${(rank/bootstrap.total_players*100).toFixed(2)}%`:'—'}/><Metric label="Vs tier live mean" value={sample?.average!==null&&sample?.average!==undefined?signed(score-sample.average):'—'} tone="gold"/><Metric label="Rank change · published" value={change===null?'—':`${signed(change,2)}%`}/></dl>
          <div className="analysis-cost"><span>Transfers <b>{picks.entry_history.event_transfers}</b></span><span>Transfer cost <b>{picks.entry_history.event_transfers_cost?`−${picks.entry_history.event_transfers_cost}`:0} pts</b></span><span>Auto-sub change <b className="positive">{signed(resolved.afterPoints-resolved.beforePoints,0)} pts</b></span></div>
          <div className="analysis-rule"/>
          <div className="analysis-standouts">{[{label:'Biggest lift',data:star,tone:'gold'},{label:'Quiet return',data:flop,tone:''},{label:'Main threat',data:missed,tone:'negative'}].map(({label,data,tone})=><div className={tone} key={label}><span>{label}</span>{data?<><PlayerPhoto code={data.e.code} alt={data.e.web_name} className="h-12 w-10 object-contain"/><strong>{data.e.web_name}</strong><b>{label==='Quiet return'?`${data.points} pts`:`${signed(data.impact,2)} pts`}</b></>:<small>{sample?'No completed return':'Loading comparison'}</small>}</div>)}</div>
          <p className="analysis-note">Rank and GW rank are FPL’s latest published values. Projected total uses live points after transfer costs; it is not a recalculated live rank.</p>
          <div className="analysis-comparison-heading"><h3>Captains & chips</h3><span>Rank-tier samples</span></div>
          <div className="analysis-tier-tabs">{TIERS.map(t=><button key={t.id} aria-pressed={tier===t.id} onClick={()=>setTier(t.id)}>{t.label}</button>)}</div>
          {cohort.error&&!sample?<div role="status" className="analysis-note negative">{cohort.error} <button className="analysis-button" onClick={cohort.refresh}>Retry</button></div>:!sample?<p role="status" className="analysis-tier-loading"><span className="analysis-live-dot"/> Loading {TIERS.find(t=>t.id===tier)?.label} — fetching official teams…</p>:<>
            {cohort.error?<p role="status" className="analysis-note negative">Refresh failed; showing the last successful {TIERS.find(t=>t.id===tier)?.label} sample. <button className="analysis-button" onClick={cohort.refresh}>Retry</button></p>:null}
            <div className="analysis-sample-meta" data-tier={tier}><b>{sample.n} managers sampled</b><span>Live mean {sample.average?.toFixed(1)} pts</span></div>
            <div className="analysis-chip-labels"><span>CHIP</span><span>THIS GW</span><span>USED BY GW{gw}</span></div>{CHIPS.map(c=><div className="analysis-chip-row" key={c.id}><strong title={c.name}>{c.short}</strong><b>{(sample.current[c.id]/sample.n*100).toFixed(1)}%</b><span>{sample.historyCount?`${(sample.overall[c.id]/sample.historyCount*100).toFixed(1)}%`:'—'}</span></div>)}
            <p className="analysis-note">No chip this GW: {(sample.current.none/sample.n*100).toFixed(1)}%</p><div className="analysis-rule"/>
            <h3 className="analysis-subheading">Leading captains</h3><div className="analysis-captains">{topCaptains.map(([id,count])=>{const e=elements.get(id);return <div key={id}><PlayerPhoto code={e?.code??0} alt={e?.web_name??'Player'} className="h-9 w-7 object-contain"/><strong>{e?.web_name??id}</strong><b>{(count/sample.n*100).toFixed(1)}%</b></div>;})}</div>
            <h3 className="analysis-subheading">Triple captains</h3>{triples.length?<div className="analysis-captains">{triples.map(([id,count])=><div key={id}><strong>{elements.get(id)?.web_name??id}</strong><b>{(count/sample.n*100).toFixed(1)}%</b></div>)}</div>:<p className="analysis-note">No triple captain in this sample.</p>}
            <p className="analysis-note">Systematic sample from current published rank tiers, not exact tier totals. EO includes captain multipliers. {cohort.data?.failed?`${cohort.data.failed} of ${cohort.data.requested} teams unavailable. `:''}{sample.historyCount<sample.n?`Chip history available for ${sample.historyCount}/${sample.n} managers. `:''}Sample updated {cohort.data?new Date(cohort.data.sampledAt).toLocaleTimeString():''}.</p>
          </>}
        </Panel>
      </div>
    </div>
    <div className="analysis-rule wide"/>
    <div className="analysis-exposure-grid"><Panel title="Your differentials" kicker="03 / Where you gain ground"><div className="analysis-exposures">{differentials.map(impactCard)}</div>{!differentials.length?<p className="analysis-note">{sample?'No positive exposure edges in this sample.':'Waiting for the selected tier sample.'}</p>:null}</Panel><Panel title="Your threats" kicker="Where the field can hurt"><div className="analysis-exposures">{threats.map(impactCard)}</div>{!threats.length?<p className="analysis-note">{sample?'No negative exposure edges in this sample.':'Waiting for the selected tier sample.'}</p>:null}</Panel></div>
    <EventsFeed key={`${teamId}-${gw}`} teamId={teamId} gw={gw} live={live} fixtures={fixtures} elements={elements} teams={teams} multiplier={multiplier} eo={sample?.eo??new Map()} hasSample={Boolean(sample)}/>
    <details className="analysis-card analysis-hindsight"><summary>Points breakdown & hindsight <span>Former Review details</span></summary><div>{reviewDetails}</div></details>
    <p className="analysis-note analysis-source">Source: <a href="https://fantasy.premierleague.com/" target="_blank" rel="noreferrer">Official Fantasy Premier League</a>. Live points refresh every minute; comparison samples every two minutes.</p>
  </div>;
}
