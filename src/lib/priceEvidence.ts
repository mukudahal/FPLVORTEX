/** Provenance of the CURRENT manager's original acquisition/selling basis.
 *
 * Unlike a current market price, a real FPL selling value depends on what
 * the manager paid. Public historical picks sometimes omit purchase_price.
 * A GW1 cost reconstructed from a player's total season cost movement is
 * an ESTIMATE, never official verification of an existing purchase basis.
 */
export type PurchasePriceEvidence =
  | 'official-selling-price'
  | 'official-purchase-price'
  | 'official-transfer-history'
  | 'inferred-season-start';

const validTenths = (input: unknown): boolean => {
  if (input === '' || input === null || input === undefined) return false;
  const value = Number(input);
  return Number.isInteger(value) && value >= 35 && value <= 300;
};

export function classifyPurchasePriceEvidence(
  explicitPurchaseTenths: unknown,
  explicitSellingTenths: unknown,
  latestTransferInTenths?: number,
): PurchasePriceEvidence {
  if (validTenths(explicitSellingTenths)) return 'official-selling-price';
  if (validTenths(explicitPurchaseTenths)) return 'official-purchase-price';
  if (validTenths(latestTransferInTenths)) return 'official-transfer-history';
  return 'inferred-season-start';
}
