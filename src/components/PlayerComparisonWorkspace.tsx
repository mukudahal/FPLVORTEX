import {useEffect,useMemo,useRef,useState} from 'react';
import type {EnrichedPlayer, FplTeam, Position, Snapshot} from '../lib/types';
import {formatPrice,formatPercent} from '../lib/format';
import {parsePlayerInjuryDetails} from '../lib/analytics';
import {RANGE_METRICS, summarizePlayerRange, type OfficialPlayerHistory, type RangeMetric} from '../lib/playerHistory';
import {addComparisonPlayer,removeComparisonPlayer,moveComparisonPlayer,initialComparisonIds} from '../lib/playerComparisonSelection';
import {PlayerAvatar} from './PlayerAvatar';
import {ClubBadge} from './ClubBadge';

type ResponseState = {state:'loading'|'ready'|'error';data?:OfficialPlayerHistory;error?:string};
interface Props {players:EnrichedPlayer[];teams:FplTeam[];snapshot:Snapshot;}
export function PlayerComparisonWorkspace({players,teams,snapshot}:Props) {
 const [ids,setIds]=useState<number[]>(()=>initialComparisonIds(window.location.hash));
 const [query,setQuery]=useState('');
 const [position,setPosition]=useState<Position|'ALL'>('ALL');
 const [club,setClub]=useState<number|'ALL'>('ALL');
 const [maxPrice,setMaxPrice]=useState(16);
 const completed=snapshot.gameweeks.filter(g=>g.finished && g.dataChecked).map(g=>g.id);
 const lastCompleted=Math.max(0,...completed);
 const [startGw,setStartGw]=useState(Math.max(1,lastCompleted-4));
 const [endGw,setEndGw]=useState(Math.max(1,lastCompleted));
 const [metrics,setMetrics]=useState<RangeMetric[]>(RANGE_METRICS.map(s=>s.key));
 const [responses,setResponses]=useState<Record<number,ResponseState>>({});
 const latestResponses=useRef(responses);
 latestResponses.current=responses;
 const byId=useMemo(()=>new Map(players.map(p=>[p.id,p])),[players]);
 const selected=ids.map(id=>byId.get(id)).filter((p):p is EnrichedPlayer=>Boolean(p));
 const available=useMemo(()=>players.filter(p=>{
  if(position!=='ALL'&&p.position!==position)return false;
  if(club!=='ALL'&&p.teamId!==club)return false;
  if(p.price>maxPrice)return false;
  const needle=query.trim().toLowerCase();
  return !needle || p.fullName.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle) || p.team.name.toLowerCase().includes(needle);
 }).slice(0,80),[players,position,club,maxPrice,query]);

 useEffect(()=>{
  const controller=new AbortController();
  for(const id of ids) {
   if(!byId.has(id)||latestResponses.current[id]?.state==='ready')continue;
   setResponses(prev=>({...prev,[id]:{state:'loading'}}));
   void fetch('/api/vortex/player-history/'+id,{headers:{accept:'application/json'},cache:'no-store',signal:controller.signal})
     .then(async result=>{
       if(!result.ok)throw Error('Official FPL history request failed ('+result.status+')');
       return await result.json() as OfficialPlayerHistory;
     })
     .then(payload=>{
       if(controller.signal.aborted)return;
       if(payload.playerId!==id||payload.source!=='official-fpl-element-summary'||!Array.isArray(payload.matches))throw Error('FPL history identity or source could not be verified');
       setResponses(prev=>({...prev,[id]:{state:'ready',data:payload}}));
     })
     .catch((error:unknown)=>{
       if(!controller.signal.aborted)setResponses(prev=>({...prev,[id]:{state:'error',error:error instanceof Error?error.message:'Unavailable'}}));
     });
  }
  return ()=>controller.abort();
 },[ids,byId]);

 const updateIds=(next:number[])=>{
  setIds(next);
  // URL in this dedicated tab supports direct navigation and reload.
  const queryString=next.length?'?ids='+next.join(','):'';
  window.history.replaceState(null,'',window.location.pathname+window.location.search+'#/compare'+queryString);
 };
 const chooseMetric=(key:RangeMetric)=>{
  setMetrics(old=>old.includes(key)?old.filter(s=>s!==key):[...old,key]);
 };
 return <section className="vx-h2h-workspace" aria-label="H2H Player Comparison workspace">
  <header className="vx-h2h-title">
   <span className="panel__eyebrow">FPL VORTEX · OFFICIAL FPL PLAYER HISTORY</span>
   <h1>H2H Player Comparison</h1>
   <p>Compare five or more players side by side. Recorded statistics cover only selected completed Gameweeks; current price, ownership and availability are NOT historical totals.</p>
  </header>
  <div className="vx-h2h-layout">
   <aside className="panel vx-h2h-selector" aria-label="Player selection">
    <h2>Find players</h2>
    <label>Search by name or team<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a player…" />{query && <button type="button" onClick={()=>setQuery('')} aria-label="Clear player search">Clear</button>}</label>
    <label>Position<select value={position} onChange={e=>setPosition(e.target.value as Position|'ALL')}>
     {(['ALL','GKP','DEF','MID','FWD'] as const).map(pos=><option key={pos}>{pos}</option>)}
    </select></label>
    <label>Team<select value={club} onChange={e=>setClub(e.target.value==='ALL'?'ALL':Number(e.target.value))}>
     <option value="ALL">All clubs</option>{teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}
    </select></label>
    <label>Max price {formatPrice(maxPrice)}<input type="range" min="4" max="16" step=".5" value={maxPrice} onChange={e=>setMaxPrice(Number(e.target.value))} /></label>
    <p role="status">{ids.length} selected · up to 8</p>
    <div className="vx-h2h-search-results">
     {available.map(p=><button key={p.id} type="button" disabled={ids.includes(p.id)||ids.length>=8}
       aria-label={'Add '+p.fullName} onClick={()=>updateIds(addComparisonPlayer(ids,p.id))}>
       <span>{p.name} <small>{p.position} · {p.team.shortName}</small></span><span>{ids.includes(p.id)?'Added':'Add +'}</span>
     </button>)}
     {!available.length && <p>No players match these filters.</p>}
    </div>
   </aside>
   <section className="panel vx-h2h-main" aria-label="Aligned player comparisons">
    <div className="vx-h2h-header"><h2>Comparison · {ids.length} players</h2>
     <span>{lastCompleted===0?'No settled Gameweeks yet':'GW'+startGw+'–GW'+endGw+' · settled records only'}</span>
    </div>
    {!selected.length && <p className="vx-h2h-empty">Select players from the left panel to compare their recorded performances.</p>}
    <div className="vx-h2h-cards" role="region" aria-label="Side-by-side player cards, scroll horizontally" tabIndex={0}>
     {selected.map(p=>{
      const record=responses[p.id];
      const totals=record?.state==='ready'&&record.data?summarizePlayerRange(record.data.matches,startGw,endGw):null;
      const flag=parsePlayerInjuryDetails(p);
      return <article className="vx-h2h-player-card" key={p.id} aria-label={p.fullName+' comparison'}>
       <div className="vx-h2h-player-top"><PlayerAvatar code={p.code} teamCode={p.team.code} name={p.name} fullName={p.fullName} teamShort={p.team.shortName} position={p.position} size="lg" />
        <h3>{p.fullName}</h3><div className="vx-h2h-team"><ClubBadge teamCode={p.team.code} shortName={p.team.shortName} teamName={p.team.name} size="sm" /> {p.position} · {p.team.shortName}</div>
        <div className="vx-h2h-current"><span>Current price <strong>{formatPrice(p.price)}</strong></span>
        <span>Current selected-by <strong>{formatPercent(p.ownership)}</strong></span>
        <span>Current status <strong>{flag.statusLabel}</strong></span></div>
       </div>
       {record?.state==='loading'&&<p role="status">Loading official match history…</p>}
       {record?.state==='error'&&<p role="alert">{record.error} <button type="button" onClick={()=>setIds(current=>[...current])}>Retry</button></p>}
       {record?.state==='ready'&&record.data?.matches.length===0&&<p>No recorded match history available.</p>}
       <div className="vx-h2h-metrics">
        {RANGE_METRICS.filter(m=>metrics.includes(m.key)).map(metric=><div key={metric.key}>
         <span>{metric.label}</span><strong>{totals?.[metric.key]===null||totals?.[metric.key]===undefined?'—':totals[metric.key]?.toFixed(metric.key==='xG'||metric.key==='xA'?2:0)}</strong>
        </div>)}
       </div>
       <small>Range: official per-fixture FPL data only. Missing fields show —.</small>
      </article>;
     })}
    </div>
   </section>
   <aside className="panel vx-h2h-settings" aria-label="Selected players and range controls">
    <h2>Selected players ({ids.length})</h2>
    <button type="button" className="button button--ghost button--sm" onClick={()=>updateIds([])} disabled={!ids.length}>Clear all</button>
    <ol className="vx-h2h-selection-list">{selected.map((p,index)=><li key={p.id}>
     <span>{index+1}. {p.name}</span>
     <div>
      <button type="button" onClick={()=>updateIds(moveComparisonPlayer(ids,p.id,-1))} disabled={index===0} aria-label={'Move '+p.name+' up'}>↑</button>
      <button type="button" onClick={()=>updateIds(moveComparisonPlayer(ids,p.id,1))} disabled={index===selected.length-1} aria-label={'Move '+p.name+' down'}>↓</button>
      <button type="button" onClick={()=>updateIds(removeComparisonPlayer(ids,p.id))} aria-label={'Remove '+p.name}>×</button>
     </div></li>)}</ol>
    <h3>Recorded GW range</h3>
    <div className="vx-h2h-range">
     <label>Start GW<select value={startGw} disabled={!lastCompleted} onChange={e=>setStartGw(Math.min(Number(e.target.value),endGw))}>
      {Array.from({length:lastCompleted},(_,i)=>i+1).map(gw=><option key={gw} value={gw}>GW{gw}</option>)}
     </select></label>
     <label>End GW<select value={endGw} disabled={!lastCompleted} onChange={e=>setEndGw(Math.max(startGw,Number(e.target.value)))}>
      {Array.from({length:lastCompleted},(_,i)=>i+1).map(gw=><option key={gw} value={gw}>GW{gw}</option>)}
     </select></label>
    </div>
    <h3>Statistics ({metrics.length})</h3>
    <div className="vx-h2h-stat-controls">{RANGE_METRICS.map(metric=><label key={metric.key}>
     <input type="checkbox" checked={metrics.includes(metric.key)} onChange={()=>chooseMetric(metric.key)} />{metric.label}
    </label>)}</div>
    <p className="vx-h2h-disclosure">Source: public FPL element-summary per-match history. Current status/price/ownership from snapshot ({snapshot.meta.generatedAt}). No forecast values are mixed with recorded totals.</p>
   </aside>
  </div>
 </section>;
}
