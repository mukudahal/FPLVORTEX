/** Financial and chip eligibility gate for a future joint-chip Solver request.
 *
 * Public historical FPL picks can omit actual acquisition prices; some VORTEX
 * views compute a fallback from season-long price change. That fallback is
 * useful for display but NOT admissible as exact Solver budget evidence.
 *
 * This module never fetches account data and never changes a saved plan.
 * The calling server must first fetch a fresh official entry (force=true).
 */
import type { EntryData } from './types';
import { verifiedChipInventory, type VerifiedChipInventory } from './verifiedChipInventory';

export interface VerifiedJointManagerState {
  entryId: number;
  gameweek: number;
  verifiedAt: string;
  squadIds: number[];
  sellingPricesTenths: Record<number, number>;
  bankTenths: number;
  freeTransfersNow: number;
  chips: VerifiedChipInventory;
}

const inTenths = (pounds: number): number => Math.round(pounds * 10);

export function verifiedJointManagerState(
  entry: EntryData | null | undefined,
  squadIds: readonly number[],
  startGw: number,
  now: Date = new Date(),
): VerifiedJointManagerState {
  const chips = verifiedChipInventory(entry, startGw, now);
  if (!entry) throw new RangeError('No official current entry available.');
  // Public /entry/.../event/.../picks and /entry/.../transfers do NOT prove
  // that the manager has no unsubmitted chip, pending transfer or cash
  // adjustment. Their public, locked-gameweek roster may be useful for
  // analysis, but may NOT certify an actionable exact chip budget.
  // A future authenticated /my-team/ implementation must stamp this
  // evidence ONLY after verifying the requested entry ID and full roster.
  if (entry.managerStateSource !== 'authenticated-current-team') {
    throw new RangeError('Official public FPL picks are historical: authenticated current-team data is required to verify pending transfers, chips and cash before exact joint optimization.');
  }
  const picks = entry.picks;
  if (!Array.isArray(picks) || picks.length !== 15 ||
      squadIds.length !== 15 || new Set(squadIds).size !== 15 ||
      !picks.every(p => Number.isInteger(p.element) && squadIds.includes(p.element)) ||
      new Set(picks.map(p => p.element)).size !== 15) {
    throw new RangeError('The original 15-man squad must match the verified official FPL entry.');
  }
  // Historic pick bank is authoritative only if no post-lock transfers were
  // made and the full official transfer feed was successfully counted.
  if (entry.postLockTransfersUsed !== 0) {
    throw new RangeError('Current bank is not verified: refresh transfers or reconcile post-lock purchases.');
  }
  if (!entry.history || !Number.isInteger(entry.history.bank) || entry.history.bank < 0 ||
      !Number.isInteger(entry.history.event) || entry.history.event > startGw ||
      startGw - entry.history.event > 1 ||
      !Number.isInteger(entry.freeTransfers) ||
      entry.freeTransfers < 0 || entry.freeTransfers > 5) {
    throw new RangeError('Official bank, Gameweek, or free-transfer state is missing or incompatible.');
  }
  const sellingPricesTenths: Record<number, number> = {};
  for (const p of picks) {
    // A computed FPL selling price based on an official buy/transfer record
    // is mathematically well defined. A reconstruction from total season
    // price movement is not a verified transaction acquisition basis.
    if (p.priceBasisSource !== 'official-selling-price' &&
        p.priceBasisSource !== 'official-purchase-price' &&
        p.priceBasisSource !== 'official-transfer-history') {
      throw new RangeError(`Player ${p.element} has inferred/unverified FPL selling value.`);
    }
    const sale = p.sellingPrice;
    if (typeof sale !== 'number' || !Number.isFinite(sale) || sale <= 0 ||
        sale > 30 || Math.abs(sale * 10 - inTenths(sale)) > 1e-7) {
      throw new RangeError(`Player ${p.element} does not have a valid £0.1m selling value.`);
    }
    sellingPricesTenths[p.element] = inTenths(sale);
  }
  return {
    entryId: entry.id, gameweek: startGw,
    verifiedAt: chips.provenanceCheckedAt,
    squadIds: [...squadIds],
    sellingPricesTenths,
    bankTenths: entry.history.bank,
    freeTransfersNow: entry.freeTransfers,
    chips,
  };
}
