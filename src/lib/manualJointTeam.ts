/** Manually attested FPL CURRENT team: never official /my-team authentication.
 *
 * Validates user-provided prices/FT/chips against fresh PUBLIC player IDs,
 * position/club quotas and FPL half-profit arithmetic. It proves that the
 * inputs are internally consistent, NOT that the manager owns this squad.
 *
 * No passwords, cookies or login tokens are collected or persisted.
 */
import type { Snapshot } from './types';
import type { JointChipName, VerifiedChipInventory } from './verifiedChipInventory';

export type ManualChipStatus = 'available' | 'unavailable' | 'unknown';
export type ManualHalf = 1 | 2;
export const MANUAL_CHIPS: JointChipName[] = [
  'wildcard','free_hit','bench_boost','triple_captain',
];
export type ManualChipStatuses = Record<JointChipName, Record<ManualHalf, ManualChipStatus>>;
export interface ManualOwnedPlayer {
  playerId: number;
  /** The manager's PURCHASE price and SELLING price from FPL, in £0.1m. */
  purchaseTenths: number;
  sellingTenths: number;
}
export interface ManualJointTeamInput {
  gameweek: number;
  players: ManualOwnedPlayer[];
  bankTenths: number;
  freeTransfers: number;
  chipStatuses: ManualChipStatuses;
  /** Only needed when beginning in GW20 and claiming second-half FH. */
  fhPlayedInGw19: 'yes' | 'no' | 'unknown';
  /** A deliberate affirmative review of all manually transcribed figures. */
  acknowledged: boolean;
}
export interface ValidatedManualJointTeam {
  provenance: 'manager-entered-unverified';
  enteredAt: string;
  gameweek: number;
  squadIds: number[];
  sellingPricesTenths: Record<number,number>;
  purchasePricesTenths: Record<number,number>;
  bankTenths: number;
  freeTransfers: number;
  chips: VerifiedChipInventory;
  unknownChips: string[];
}

const integer = (value:unknown,min:number,max:number,label:string) => {
  if (typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)
    throw new RangeError(`${label} must be a whole number between ${min} and ${max}.`);
  return value;
};
/** FPL sells drops at market, rises at purchase + floor(half the gain). */
export function fplSellingPriceTenths(purchaseTenths:number, marketTenths:number):number {
  integer(purchaseTenths,35,300,'Purchase price');
  integer(marketTenths,35,300,'Market price');
  return marketTenths<=purchaseTenths
    ? marketTenths
    : purchaseTenths+Math.floor((marketTenths-purchaseTenths)/2);
}

const quotas:Record<string,number>={GKP:2,DEF:5,MID:5,FWD:3};

export function validateManualJointTeam(
  input:ManualJointTeamInput,
  snapshot:Snapshot,
  horizon:number,
  now:Date=new Date(),
):ValidatedManualJointTeam {
  if (!input||typeof input!=='object'||input.acknowledged!==true)
    throw new RangeError('Confirm that the manually entered values match your current FPL Pick Team screen.');
  const start=integer(input.gameweek,1,38,'Starting Gameweek');
  integer(horizon,1,10,'Planning horizon');
  if(start+horizon-1>38)
    throw new RangeError('The planning horizon cannot exceed GW38.');
  if(snapshot.meta.stale||!snapshot.meta.isLive||!snapshot.meta.upstreamOk||
     snapshot.meta.nextEventId!==start)
    throw new RangeError('A fresh live official FPL player/fixture snapshot for this Gameweek is required.');
  if (!Array.isArray(input.players)||input.players.length!==15)
    throw new RangeError('Manually enter exactly 15 current players.');
  const official=new Map(snapshot.players.map(p=>[p.id,p]));
  const players=new Set<number>(),counts:Record<string,number>={GKP:0,DEF:0,MID:0,FWD:0};
  const clubs=new Map<number,number>();
  const purchasePricesTenths:Record<number,number>={};
  const sellingPricesTenths:Record<number,number>={};
  for(const owned of input.players) {
    if(!owned||typeof owned!=='object')throw new RangeError('Player input is malformed.');
    const id=integer(owned.playerId,1,999999,'Player ID');
    if(players.has(id))throw new RangeError(`Duplicate squad player: ${id}.`);
    const market=official.get(id);
    if(!market)throw new RangeError(`Player ${id} was not found in the official current FPL snapshot.`);
    const purchase=integer(owned.purchaseTenths,35,300,`Player ${id} purchase price (tenths)`);
    const selling=integer(owned.sellingTenths,35,300,`Player ${id} selling price (tenths)`);
    if(selling!==fplSellingPriceTenths(purchase,market.cost))
      throw new RangeError(`Player ${id} selling price does not match FPL half-profit rules and current market price.`);
    if(!(market.position in quotas))
      throw new RangeError(`Player ${id} has an unknown FPL position.`);
    players.add(id);
    counts[market.position]=(counts[market.position]??0)+1;
    clubs.set(market.teamId,(clubs.get(market.teamId)??0)+1);
    purchasePricesTenths[id]=purchase;
    sellingPricesTenths[id]=selling;
  }
  for(const [position,quota] of Object.entries(quotas))
    if(counts[position]!==quota)
      throw new RangeError(`Squad must have ${quota} ${position} (got ${counts[position]??0}).`);
  if([...clubs.values()].some(n=>n>3))
    throw new RangeError('A current FPL squad cannot contain more than three players from one club.');
  const bank=integer(input.bankTenths,0,1000,'Bank (£0.1m units)');
  const ft=integer(input.freeTransfers,0,5,'Banked free transfers');
  if(!input.chipStatuses||typeof input.chipStatuses!=='object')
    throw new RangeError('Manual chip availability is missing.');
  const firstHalf=start<=19?1:2;
  const lastHalf=start+horizon-1<=19?1:2;
  const inv:VerifiedChipInventory={
    entryId:0,
    // This is when the manager ENTERED the data, not an official retrieval.
    provenanceCheckedAt:now.toISOString(),
    scoring_chip_halves:{},squad_chip_halves:{},
    first_half_fh_used_gw19:input.fhPlayedInGw19==='yes',
  };
  const unknownChips:string[]=[];
  for(const chip of MANUAL_CHIPS) {
    const row=input.chipStatuses[chip];
    if(!row||typeof row!=='object')
      throw new RangeError(`Missing ${chip} availability.`);
    for(const half of [1,2] as const) {
      const status=row[half];
      if(status!=='available'&&status!=='unavailable'&&status!=='unknown')
        throw new RangeError(`Invalid ${chip} status for season half ${half}.`);
      if(half<firstHalf||half>lastHalf)continue;
      if(status==='unknown') {
        unknownChips.push(`${chip} (half ${half})`);
        continue; // unknown is NEVER an unused/available chip
      }
      if(status!=='available')continue;
      if(chip==='wildcard'||chip==='free_hit')
        (inv.squad_chip_halves[chip]??=[]).push(half);
      else
        (inv.scoring_chip_halves[chip]??=[]).push(half);
    }
  }
  if(start===20 && inv.squad_chip_halves.free_hit?.includes(2) &&
      input.fhPlayedInGw19==='unknown') {
    // No speculative consecutive FH; manager must check GW19 use.
    throw new RangeError('For GW20 Free Hit, confirm whether FH was played in GW19.');
  }
  if(input.fhPlayedInGw19!=='yes'&&input.fhPlayedInGw19!=='no'&&
     input.fhPlayedInGw19!=='unknown')
    throw new RangeError('GW19 Free Hit history must be yes, no or unknown.');
  return {
    provenance:'manager-entered-unverified',enteredAt:now.toISOString(),
    gameweek:start,squadIds:[...players],sellingPricesTenths,
    purchasePricesTenths,bankTenths:bank,freeTransfers:ft,
    chips:inv,unknownChips,
  };
}
