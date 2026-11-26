import { fetchFplJson } from '../server/http';
import { computeDynamicFreeTransfers, mapOfficialChipToPlanningChip, normalizeChipHistory } from '../src/lib/freeTransfers';
import { sellingPrice } from '../src/lib/repoModel/scoring';
import type { EntryData, Snapshot } from '../src/lib/types';

type RawPick={element:number;purchase_price?:number;selling_price?:number};
type Picks={picks:RawPick[];active_chip:string|null;entry_history:{event:number;bank:number}};
type Transfer={event:number;element_in:number;element_out:number;element_in_cost:number;time:string};
type History={current:{event:number;event_transfers:number;points:number;event_transfers_cost:number;overall_rank:number|null}[];
  chips?:{name:string;event:number}[]};

export function reconcilePublicFinances(snapshot:Snapshot,started:number,picks:Picks,initial:Picks,history:History,transfers:Transfer[]) {
  const current=snapshot.meta.currentEventId;
  const fail=(why:string):never=>{throw new Error(why+'. Supply manager-confirmed current state.');};
  if (picks.entry_history?.event!==current || !Number.isInteger(picks.entry_history.bank) || picks.entry_history.bank<0 ||
      !Number.isInteger(started)||started<1||started>current || initial.entry_history?.event!==started ||
      !Array.isArray(initial.picks)||initial.picks.length!==15 || !Array.isArray(picks.picks)||picks.picks.length!==15 ||
      new Set(picks.picks.map(p=>p.element)).size!==15 || new Set(initial.picks.map(p=>p.element)).size!==15) fail('Incomplete public bank, acquisition history or picks');
  if (!Array.isArray(history?.current)||!Array.isArray(transfers)) fail('Incomplete public transfer ledger');
  const chipHistory=normalizeChipHistory(history);
  if (!chipHistory) fail('Unverified chip history prevents public FT and selling-price reconstruction');
  if (mapOfficialChipToPlanningChip(picks.active_chip)==='fh' || transfers.some(t=>t.event>current)) fail('Temporary squad or upcoming transfers require current financial state');
  const events=[...history.current].sort((a,b)=>a.event-b.event);
  if (events.length!==current-started+1 || events.some((g,i)=>g.event!==started+i || !Number.isInteger(g.event_transfers)||g.event_transfers<0)) fail('Gap in published manager history');
  const freeTransfers=computeDynamicFreeTransfers({startedEvent:started,historyPayload:history});
  const freeHits=new Set(chipHistory!.filter(c=>mapOfficialChipToPlanningChip(c.name)==='fh').map(c=>c.event));
  const basis=new Map(initial.picks.map(p=>[p.element,{price:p.purchase_price,source:'opening-pick'}]));
  const ledger=[...transfers].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  for (const t of ledger) {
    if (!Number.isFinite(Date.parse(t.time))||!Number.isInteger(t.event)||t.event<started||!Number.isInteger(t.element_in_cost)||t.element_in_cost<=0) fail('Invalid public transfer');
    if (freeHits.has(t.event)||t.event===started) continue;
    basis.delete(t.element_out);
    basis.set(t.element_in,{price:t.element_in_cost,source:'official permanent transfer-in'});
  }
  const lookup=new Map(snapshot.players.map(p=>[p.id,p]));
  const prices:Record<number,number>={},methods:Record<number,string>={};
  for (const pick of picks.picks) {
    const p=lookup.get(pick.element),record=basis.get(pick.element);
    if (!p) throw new Error('Official player missing from snapshot');
    let price=pick.selling_price;
    let method='official effective sale';
    if (price==null) {
      let purchase=pick.purchase_price??record?.price;
      method=pick.purchase_price!=null?'official purchase at picks':record?.source??'unverified';
      if (purchase==null && started===1 && record?.source==='opening-pick' && Number.isInteger(p.costChangeStart)) {
        purchase=p.cost-p.costChangeStart!;
        method='verified GW1 ownership and official season price change';
      }
      if (purchase==null || !Number.isInteger(purchase)||purchase<=0) fail('Missing acquisition basis for player '+p.id);
      price=sellingPrice(purchase!,p.cost);
    }
    if (!Number.isInteger(price)||price<=0||price>p.cost) fail('Invalid selling price for player '+p.id);
    prices[p.id]=price;
    methods[p.id]=method;
  }
  if (basis.size!==15 || picks.picks.some(p=>!basis.has(p.element))) fail('Permanent transfer ledger does not reproduce public picks');
  return {bank:picks.entry_history.bank,freeTransfers,prices,methods,chipsUsed:chipHistory};
}

export async function verifyPublicEntry(snapshot:Snapshot,entry:EntryData) {
  const base='/entry/'+entry.id+'/';
  const read = async <T>(path:string) => {
    try { return await fetchFplJson<T>(path,{timeoutMs:25_000,retries:1}); }
    catch (error) { throw new Error('Could not verify official '+path+' ('+(error instanceof Error?error.message:'request failed')+').'); }
  };
  const root=await read<{id:number;started_event:number;current_event:number}>(base);
  if (root.id!==entry.id||root.current_event!==snapshot.meta.currentEventId) throw new Error('Official entry identity/gameweek mismatch.');
  const picksUrl=base+'event/'+root.current_event+'/picks/',initialUrl=base+'event/'+root.started_event+'/picks/';
  const current=read<Picks>(picksUrl);
  const [picks,initial,history,transfers]=await Promise.all([current,initialUrl===picksUrl?current:read<Picks>(initialUrl),
    read<History>(base+'history/'),read<Transfer[]>(base+'transfers/')]);
  const state=reconcilePublicFinances(snapshot,root.started_event,picks,initial,history,transfers);
  if (entry.picks.some(p=>!Object.hasOwn(state.prices,p.element))) throw new Error('Current public squad disagrees with the deployment entry. Refresh or supply manager-confirmed data.');
  const retrievedAt=new Date().toISOString();
  const checked:EntryData={...entry,history:{...entry.history,bank:state.bank},freeTransfers:state.freeTransfers,chipsUsed:state.chipsUsed,
    picks:entry.picks.map(p=>({...p,sellingPrice:state.prices[p.element]/10})),activeChip:picks.active_chip};
  return {entry:checked,history,publicStateEvidence:{retrievedAt,sourceUrls:[base,picksUrl,initialUrl,base+'history/',base+'transfers/']
    .map(p=>(process.env.FPL_API_BASE??'https://fantasy.premierleague.com/api').replace(/\/$/,'')+p),effectiveSaleBasis:state.methods}};
}
