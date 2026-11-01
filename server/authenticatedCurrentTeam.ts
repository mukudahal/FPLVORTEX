/** Server-only adapter for a consented FPL authenticated, READ-ONLY session.
 *
 * The caller must supply a trusted provider that performs only the two GETs
 * /me/ and /my-team/{id}/ under the same authenticated FPL session. Never
 * forward cookies, passwords, session tokens or /me/ personal data to VORTEX
 * clients or store them in FPL VORTEX. There is deliberately NO default
 * provider: FPL offers no documented third-party OAuth delegation.
 *
 * Inputs accepted here come from a server-managed authenticated read, NOT
 * client-submitted JSON or public /entry/{id}/ picks.
 */
import type { EntryData, EntryPick, Snapshot } from '../src/lib/types.ts';
import { mapOfficialChipToPlanningChip } from '../src/lib/freeTransfers.ts';
import { sellingPrice as computeSellingTenths } from '../src/lib/repoModel/scoring.ts';
import { enrichPlayers } from '../src/lib/analytics.ts';

export type AuthenticatedFplRead = (
  path: '/me/' | `/my-team/${number}/`,
) => Promise<unknown>;

type ChipName = 'wildcard' | 'free_hit' | 'bench_boost' | 'triple_captain';
const canonicalChip = (input:unknown): ChipName | null => {
  const value = mapOfficialChipToPlanningChip(input);
  if (value === 'wc') return 'wildcard';
  if (value === 'fh') return 'free_hit';
  if (value === 'bb') return 'bench_boost';
  if (value === 'tc') return 'triple_captain';
  return null;
};

const integer = (raw:unknown, label:string, min:number, max:number):number => {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min || raw > max)
    throw new RangeError(`Unverified authenticated FPL ${label}.`);
  return raw;
};

const record = (raw:unknown, label:string):Record<string,unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new RangeError(`Unverified authenticated FPL ${label}.`);
  return raw as Record<string,unknown>;
};

const twoHalves = (raw:readonly number[]):Array<1|2> =>
  raw.filter((h):h is 1|2=>h===1||h===2);

function parsePrivateChips(
  raw:unknown,
  publicEntry:EntryData,
  gw:number,
):Partial<Record<ChipName,Array<1|2>>> {
  if (!Array.isArray(raw) || !raw.length)
    throw new RangeError('Authenticated FPL chip inventory was not supplied.');
  const available:Partial<Record<ChipName,Array<1|2>>> = {};
  const seenCurrent=new Set<ChipName>();
  const half=gw<=19?1:2;
  for (const item of raw) {
    const chip = record(item,'chip row');
    const name = canonicalChip(chip.name);
    if (!name) throw new RangeError('Unknown authenticated FPL chip in inventory.');
    const from = integer(chip.start_event,'chip start',1,38);
    const to = integer(chip.stop_event,'chip end',1,38);
    if (from>to || (from<=19)!==(to<=19))
      throw new RangeError('Authenticated FPL chip availability has an invalid half-season.');
    const status=chip.status_for_entry;
    if (status!=='available' && status!=='unavailable' && status!=='played')
      throw new RangeError('Unknown authenticated FPL chip availability.');
    if (chip.is_pending === true || chip.is_active === true)
      throw new RangeError('An FPL chip is already pending or active.');
    if (status === 'played' && !publicEntry.chipsUsed?.some(p =>
      canonicalChip(p.name)===name && (p.event<=19?1:2)===(from<=19?1:2)))
      throw new RangeError('Authenticated chip is marked played without matching official history.');
    if (from<=gw && to>=gw) {
      if (seenCurrent.has(name))
        throw new RangeError('Duplicate current-half authenticated FPL chip.');
      seenCurrent.add(name);
      if (status==='available') {
        const previouslyUsed=publicEntry.chipsUsed?.some(p=>
          canonicalChip(p.name)===name && (p.event<=19?1:2)===half);
        if (previouslyUsed)
          throw new RangeError('Authenticated chip eligibility contradicts official played history.');
        available[name]=twoHalves([half]);
      }
    }
  }
  if (seenCurrent.size!==4)
    throw new RangeError('Incomplete current-half authenticated FPL chip inventory.');
  return available;
}

export async function readAuthenticatedCurrentTeam(
  entryId:number,
  gw:number,
  publicEntry:EntryData,
  snapshot:Snapshot,
  read:AuthenticatedFplRead,
  now:Date=new Date(),
):Promise<EntryData> {
  integer(entryId,'manager ID',1,999999999);
  integer(gw,'next Gameweek',1,38);
  if (snapshot.meta.nextEventId!==gw || snapshot.meta.stale ||
      !snapshot.meta.upstreamOk || !snapshot.meta.isLive)
    throw new RangeError('Fresh official current-Gameweek player market is required.');
  const age=now.getTime()-Date.parse(publicEntry.generatedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 60_000)
    throw new RangeError('Official public FPL history must be freshly retrieved.');
  if (publicEntry.id!==entryId || publicEntry.source!=='live' ||
      publicEntry.provenance?.kind!=='official' ||
      publicEntry.provenance.requestedIdVerified!==true ||
      !Array.isArray(publicEntry.chipsUsed) ||
      publicEntry.managerStateSource!=='public-locked-snapshot') {
    throw new RangeError('Fresh verified public FPL manager history is required before private validation.');
  }
  const profile = record(await read('/me/'), 'current user');
  const user = record(profile.player,'current user identity');
  const ownedEntry = integer(user.entry,'authenticated manager identity',1,999999999);
  if (ownedEntry!==entryId)
    throw new RangeError('Authenticated FPL session belongs to a different manager.');
  const payload=record(await read(`/my-team/${entryId}/`),'current squad');
  if (payload.active_chip !== null && payload.active_chip !== undefined &&
      payload.active_chip !== '')
    throw new RangeError('A chip is already active on the current FPL account.');
  const rawPicks=payload.picks;
  if (!Array.isArray(rawPicks) || rawPicks.length!==15)
    throw new RangeError('Authenticated current team must contain 15 players.');
  const originalCost = new Map(snapshot.players.map(p=>[p.id, p.cost]));
  const picks:EntryPick[]=[];
  const owners=new Set<number>(),positions=new Set<number>();
  let captainCount=0,viceCount=0;
  for (const raw of rawPicks) {
    const p=record(raw,'current pick');
    const id=integer(p.element,'pick ID',1,999999);
    const position=integer(p.position,'pick position',1,15);
    const purchase=integer(p.purchase_price,'purchase price in 0.1m',35,300);
    const selling=integer(p.selling_price,'selling price in 0.1m',35,300);
    if (owners.has(id)||positions.has(position))
      throw new RangeError('Duplicate player or squad position in authenticated current team.');
    owners.add(id);positions.add(position);
    const market=originalCost.get(id);
    // Market values must be validated against the independently refreshed
    // official bootstrap snapshot (not a client claim); entry.players may
    // lack a newly added player, so fail closed on that roster change.
    if (market===undefined || !Number.isInteger(market) ||
        selling!==computeSellingTenths(purchase,market))
      throw new RangeError('Current FPL player price or selling cost does not reconcile to market.');
    if (typeof p.is_captain!=='boolean' || typeof p.is_vice_captain!=='boolean')
      throw new RangeError('Authenticated current captain state is incomplete.');
    if (p.is_captain) captainCount++;
    if (p.is_vice_captain) viceCount++;
    if (p.is_captain && p.is_vice_captain)
      throw new RangeError('Current captain and vice captain cannot be the same player.');
    picks.push({
      element:id,position,
      multiplier:integer(p.multiplier,'lineup multiplier',0,3),
      isCaptain:p.is_captain,isViceCaptain:p.is_vice_captain,
      purchasePrice:purchase/10,sellingPrice:selling/10,
      priceBasisSource:'official-selling-price',
    });
  }
  if (captainCount!==1 || viceCount!==1)
    throw new RangeError('Current FPL squad must include one captain and one vice captain.');
  const transfers=record(payload.transfers,'current transfers');
  const made=integer(transfers.made,'current GW transfers',0,99);
  const bank=integer(transfers.bank,'current bank in 0.1m',0,2000);
  const cost=integer(transfers.cost,'transfer hit cost',0,200);
  // Do not guess how FPL encodes FT rollover after confirmed transfers or
  // during WC/FH. Support only the unambiguous no-committed-transfer state.
  if (made!==0 || cost!==0)
    throw new RangeError('Confirmed current-GW transfers need a separate banked-FT reconciliation.');
  const freeTransfers=integer(transfers.limit,'available free transfers',0,5);
  const available=parsePrivateChips(payload.chips,publicEntry,gw);
  const playerIndex=new Map(enrichPlayers(snapshot,'balanced').map(p=>[p.id,p]));
  if (picks.some(p=>!playerIndex.has(p.element)))
    throw new RangeError('Current FPL squad has players missing from the official live market.');
  const timestamp=now.toISOString();
  // Never mutate the public, cacheable entry and never include /me/ PII,
  // access cookies or the private raw FPL JSON in this result.
  return {
    ...publicEntry,
    generatedAt:timestamp,source:'live',
    managerStateSource:'authenticated-current-team',
    authenticatedAvailableChipHalves:available,
    activeChip:null,
    freeTransfers,postLockTransfersUsed:0,
    history:{...publicEntry.history,bank},
    picks,
    // Render the exact private 15-player current squad, including recently
    // transferred players absent from the last published public picks.
    players:picks.map(p=>playerIndex.get(p.element)!),
  };
}
