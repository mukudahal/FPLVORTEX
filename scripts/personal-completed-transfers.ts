import type { EntryData, Snapshot } from '../src/lib/types';
import { sellingPrice } from '../src/lib/repoModel/scoring';

export type CompletedTransfer = { outId: number; inId: number; sellTenths: number; buyTenths: number };
export type CompletedMoves = { gameweek: number; moves: CompletedTransfer[] };

export function applyCompletedFreeTransfers(snapshot: Snapshot, entry: EntryData, completed: CompletedMoves) {
  if (!completed || completed.gameweek !== snapshot.meta.nextEventId || !Array.isArray(completed.moves) ||
      !completed.moves.length || completed.moves.length > entry.freeTransfers) {
    throw new Error('Completed moves must be free transfers for the next official gameweek. Check the gameweek and your remaining allowance.');
  }
  if (!Number.isInteger(entry.freeTransfers) || entry.freeTransfers < 0 ||
      !Number.isInteger(entry.history.bank) || entry.history.bank < 0 ||
      (entry.recentTransfers ?? []).some(move => move.event >= completed.gameweek)) {
    throw new Error('The public squad or transfer allowance cannot be reconciled safely. Supply a verified opening state.');
  }
  const squad = entry.picks.map(p=>p.element);
  const sellingPrices = Object.fromEntries(entry.picks.map(p=>[p.element,Math.round((p.sellingPrice??NaN)*10)]));
  const players = new Map(snapshot.players.map(p=>[p.id,p]));
  let bankTenths = entry.history.bank;
  for (const move of completed.moves) {
    if (!move || [move.outId,move.inId,move.sellTenths,move.buyTenths].some(n=>!Number.isInteger(n) || n<=0)) {
      throw new Error('Each completed move needs player IDs and actual sale and purchase prices in tenths of a million.');
    }
    const slot = squad.indexOf(move.outId);
    const outgoing = players.get(move.outId), incoming = players.get(move.inId);
    if (slot < 0 || squad.includes(move.inId) || !outgoing || !incoming || outgoing.position !== incoming.position) {
      throw new Error('The completed moves do not reconcile with the verified opening squad.');
    }
    bankTenths += move.sellTenths - move.buyTenths;
    if (bankTenths < 0) throw new Error('The completed move prices imply an over-budget squad. Check the bank and actual transfer prices.');
    squad[slot] = incoming.id;
    delete sellingPrices[outgoing.id];
    sellingPrices[incoming.id] = sellingPrice(move.buyTenths,incoming.cost);
  }
  return {
    squad, bankTenths, sellingPrices, freeTransfers:entry.freeTransfers-completed.moves.length,
    chipsUsed:entry.chipsUsed,
  };
}
