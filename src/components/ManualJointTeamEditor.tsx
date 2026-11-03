import { useMemo, useState, type FormEvent } from 'react';
import type { EnrichedPlayer, EntryData, Position, Snapshot } from '../lib/types';
import {
  MANUAL_CHIPS, type ManualJointTeamInput, type ManualOwnedPlayer,
  type ManualChipStatuses, type ManualChipStatus, type ManualHalf,
} from '../lib/manualJointTeam';

const positions:Position[]=[
  'GKP','GKP','DEF','DEF','DEF','DEF','DEF',
  'MID','MID','MID','MID','MID','FWD','FWD','FWD',
];
const labels:Record<string,string>={
  wildcard:'Wildcard',free_hit:'Free Hit',bench_boost:'Bench Boost',
  triple_captain:'Triple Captain',
};
const blankStatuses=():ManualChipStatuses=>Object.fromEntries(
  MANUAL_CHIPS.map(chip=>[chip,{1:'unknown',2:'unknown'}]),
) as ManualChipStatuses;

function initialRows(entry:EntryData|null|undefined,players:EnrichedPlayer[]):ManualOwnedPlayer[] {
  const byId=new Map(players.map(p=>[p.id,p]));
  const seen=new Set<number>();
  return positions.map(position=>{
    const previous=entry?.picks.find(p=>byId.get(p.element)?.position===position&&!seen.has(p.element));
    const id=previous?.element??0;
    if(id)seen.add(id);
    // Player names can be prefetched from PUBLIC history for convenience.
    // Prices are NEVER copied from incomplete historical purchase records.
    return {playerId:id,purchaseTenths:Number.NaN,sellingTenths:Number.NaN};
  });
}
const moneyInput=(amount:number):string=>Number.isFinite(amount)?String(amount/10):'';
const moneyValue=(value:string):number=>value.trim()===''?Number.NaN:Number(value)*10;

export function ManualJointTeamEditor(props:{
  snapshot:Snapshot;
  players:EnrichedPlayer[];
  entry?:EntryData|null;
  horizon:number;
  disabled?:boolean;
  pending?:boolean;
  onCompare:(data:ManualJointTeamInput)=>void;
  onChanged?:()=>void;
}) {
  const {snapshot,players,entry,horizon,disabled,pending,onCompare,onChanged}=props;
  const [rows,setRows]=useState<ManualOwnedPlayer[]>(()=>initialRows(entry,players));
  const [bank,setBank]=useState('');
  const [ft,setFt]=useState('');
  const [statuses,setStatuses]=useState<ManualChipStatuses>(blankStatuses);
  const [gw19FH,setGw19FH]=useState<'yes'|'no'|'unknown'>('unknown');
  const [acknowledged,setAcknowledged]=useState(false);
  const byId=useMemo(()=>new Map(players.map(p=>[p.id,p])),[players]);
  const activeHalves=([1,2] as const).filter(half=>
    (half===1 ? snapshot.meta.nextEventId<=19 :
      snapshot.meta.nextEventId+horizon-1>=20));
  const changed=()=>onChanged?.();
  const setRow=(i:number,updates:Partial<ManualOwnedPlayer>)=>{
    setRows(prev=>prev.map((r,j)=>j===i?{...r,...updates}:r));
    changed();
  };
  const chipStatus=(chip:keyof ManualChipStatuses,half:ManualHalf,status:ManualChipStatus)=>{
    setStatuses(prev=>({...prev,[chip]:{...prev[chip],[half]:status}}));
    changed();
  };

  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    onCompare({
      gameweek:snapshot.meta.nextEventId,
      players:rows.map(r=>({...r})),
      bankTenths:moneyValue(bank),
      freeTransfers:ft.trim()===''?Number.NaN:Number(ft),
      chipStatuses:statuses,fhPlayedInGw19:gw19FH,acknowledged,
    });
  };
  return <form onSubmit={submit} aria-label="Manager-entered current FPL team" className="manual-joint-team">
    <p><strong>Manager-entered input · NOT verified by your FPL account.</strong> Check your current FPL Pick Team and Transfers pages. Public historical squad IDs are offered for convenience only. Nothing is submitted to Fantasy Premier League or saved automatically.</p>
    <p>Every purchase and selling value must come from your current FPL screen. Current market prices and position/club rules are checked against the live public FPL data. Unknown chip status is never treated as an available chip.</p>
    <div className="manual-joint-table" role="group" aria-label="15 current FPL players and prices">
      <div className="manual-joint-table__head" aria-hidden="true">
        <strong>Position</strong><strong>Player</strong><strong>Buy £m</strong><strong>Sell £m</strong><strong>Now £m</strong>
      </div>
      {rows.map((row,i)=>{
        const player=byId.get(row.playerId);
        return <div key={i} className="manual-joint-table__row">
          <label htmlFor={`manual-player-${i}`}>{positions[i]} {i+1}</label>
          <select id={`manual-player-${i}`} value={row.playerId||''}
            onChange={e=>setRow(i,{playerId:Number(e.target.value)})}
            required aria-label={`${positions[i]} ${i+1} current player`}>
            <option value="">Select player</option>
            {players.filter(p=>p.position===positions[i]).sort((a,b)=>a.name.localeCompare(b.name))
              .map(p=><option value={p.id} key={p.id}>{p.name} · {p.team?.shortName??p.teamId}</option>)}
          </select>
          <input type="number" step=".1" min="3.5" max="30" required
            aria-label={`Purchase price for ${player?.name??positions[i]}`}
            value={moneyInput(row.purchaseTenths)}
            onChange={e=>setRow(i,{purchaseTenths:moneyValue(e.target.value)})}/>
          <input type="number" step=".1" min="3.5" max="30" required
            aria-label={`Selling price for ${player?.name??positions[i]}`}
            value={moneyInput(row.sellingTenths)}
            onChange={e=>setRow(i,{sellingTenths:moneyValue(e.target.value)})}/>
          <span>{player? (player.cost/10).toFixed(1):'—'}</span>
        </div>;
      })}
    </div>
    <div style={{display:'flex',flexWrap:'wrap',gap:16,marginTop:16}}>
      <label>Bank (£m)
        <input type="number" step=".1" min="0" max="100" value={bank}
          placeholder="From FPL Transfers" required
          onChange={e=>{setBank(e.target.value);changed();}}/>
      </label>
      <label>Free transfers (0–5)
        <input type="number" step="1" min="0" max="5" value={ft}
          required onChange={e=>{setFt(e.target.value);changed();}}/>
      </label>
    </div>
    <fieldset style={{marginTop:16}}>
      <legend>Chip availability (2026/27, separate GW1–19 and GW20–38 allocations)</legend>
      {MANUAL_CHIPS.map(chip=><div key={chip} style={{display:'flex',flexWrap:'wrap',gap:16,alignItems:'center',marginBottom:8}}>
        <strong style={{minWidth:130}}>{labels[chip]}</strong>
        {activeHalves.map(half=><label key={half}>Half {half} ({half===1?'GW1–19':'GW20–38'})
          <select value={statuses[chip][half]} aria-label={`${labels[chip]} half ${half} status`}
            onChange={e=>chipStatus(chip,half,e.target.value as ManualChipStatus)}>
            <option value="unknown">Unknown (excluded)</option>
            <option value="available">Unused and available</option>
            <option value="unavailable">Used / unavailable</option>
          </select>
        </label>)}
      </div>)}
      {snapshot.meta.nextEventId===20&&<label>
        Was your first-half Free Hit used in GW19?
        <select value={gw19FH} onChange={e=>{setGw19FH(e.target.value as typeof gw19FH);changed();}}>
          <option value="unknown">Not sure</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>}
    </fieldset>
    <label style={{display:'block',marginTop:16}}>
      <input type="checkbox" checked={acknowledged}
        onChange={e=>{setAcknowledged(e.target.checked);changed();}}/>
      {' '}I checked these 15 players, purchase and selling prices, bank, free transfers and chip statuses against my current FPL account. I understand these figures are manager-entered and not independently authenticated.
    </label>
    <button type="submit" disabled={disabled||pending||!acknowledged} style={{marginTop:12}}>
      {pending?'Running bounded joint analysis…':'Validate manual team and compare joint strategies'}
    </button>
  </form>;
}
