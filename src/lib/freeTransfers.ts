import { clamp, numberValue } from './format.ts';
import {
  MAX_FREE_TRANSFERS,
  nextFreeTransfers,
  sellingPrice as computeOfficialSellingPriceTenths,
  type PlanningChip,
} from './repoModel/scoring.ts';

export interface RawEntryHistoryRow {
  event?: unknown;
  event_transfers?: unknown;
  overall_rank?: unknown;
}

export interface RawEntryChipPlay {
  name?: unknown;
  event?: unknown;
}

export interface RawEntryHistoryPayload {
  current?: RawEntryHistoryRow[];
  chips?: RawEntryChipPlay[];
}

export function mapOfficialChipToPlanningChip(rawChip: unknown): PlanningChip | undefined {
  if (typeof rawChip !== 'string') return undefined;
  const normalized = rawChip.trim().toLowerCase();
  if (normalized === 'wildcard' || normalized === 'wc') return 'wc';
  if (normalized === 'freehit' || normalized === 'free_hit' || normalized === 'fh') return 'fh';
  if (normalized === 'bboost' || normalized === 'bench_boost' || normalized === 'bb') return 'bb';
  if (normalized === '3xc' || normalized === 'triple_captain' || normalized === 'tc') return 'tc';
  return undefined;
}

export interface ComputeFreeTransfersInput {
  startedEvent?: number;
  explicitFreeTransfers?: unknown;
  historyPayload?: RawEntryHistoryPayload | null;
  singleGwEventTransfers?: number;
  singleGwActiveChip?: string | null;
  postLockTransfersUsed?: number;
}

/**
 * Dynamically computes a manager's exact available Free Transfers entering the upcoming Gameweek
 * by replaying official FPL `/entry/{id}/history/` GW-by-GW transfer usage and chip preservation
 * rules (`WC`/`FH` preserve banked FTs up to 5; each completed GW banks +1 FT up to 5).
 */
export function computeDynamicFreeTransfers(input: ComputeFreeTransfersInput): number {
  const explicit =
    input.explicitFreeTransfers !== null &&
    input.explicitFreeTransfers !== undefined &&
    input.explicitFreeTransfers !== ''
      ? Number(input.explicitFreeTransfers)
      : Number.NaN;

  if (Number.isFinite(explicit) && explicit >= 0) {
    return clamp(Math.round(explicit), 0, MAX_FREE_TRANSFERS);
  }

  const historyRows = Array.isArray(input.historyPayload?.current)
    ? [...input.historyPayload!.current!]
        .map((row) => ({
          event: Math.round(numberValue(row?.event, 0)),
          transfers: Math.max(0, Math.round(numberValue(row?.event_transfers, 0))),
        }))
        .filter((row) => row.event >= 1 && row.event <= 38)
        .sort((a, b) => a.event - b.event)
    : [];

  if (historyRows.length > 0) {
    const chipByEvent = new Map<number, PlanningChip>();
    if (Array.isArray(input.historyPayload?.chips)) {
      for (const chipPlay of input.historyPayload!.chips!) {
        const ev = Math.round(numberValue(chipPlay?.event, 0));
        const mapped = mapOfficialChipToPlanningChip(chipPlay?.name);
        if (ev >= 1 && mapped) {
          chipByEvent.set(ev, mapped);
        }
      }
    }

    const openingEvent = Math.max(
      1,
      Math.round(numberValue(input.startedEvent, historyRows[0].event || 1)),
    );
    let ft = 1;
    for (const row of historyRows) {
      if (row.event <= openingEvent) {
        // Squad creation gameweek does not consume or roll an extra FT beyond the 1 FT entering openingEvent + 1.
        continue;
      }
      const chip = chipByEvent.get(row.event);
      ft = nextFreeTransfers(ft, row.transfers, chip);
    }

    const extraUsed = Math.max(0, Math.round(numberValue(input.postLockTransfersUsed, 0)));
    return clamp(ft - extraUsed, 0, MAX_FREE_TRANSFERS);
  }

  // Fallback when only the latest GW's `entry_history` is available (offline single-GW archive).
  const singleTransfers = Math.max(0, Math.round(numberValue(input.singleGwEventTransfers, 0)));
  const singleChip = mapOfficialChipToPlanningChip(input.singleGwActiveChip);
  const rolled = nextFreeTransfers(1, singleTransfers, singleChip);
  const extraUsed = Math.max(0, Math.round(numberValue(input.postLockTransfersUsed, 0)));
  return clamp(rolled - extraUsed, 0, MAX_FREE_TRANSFERS);
}

/**
 * Dynamically resolves a squad player's `purchasePrice` and official FPL `sellingPrice` (in £m)
 * using explicit pick data when available, most recent transfer-in cost from `/transfers/`,
 * or GW1 starting cost (`now_cost - cost_change_start`), plus FPL's 50%-profit-rounded-down rule.
 */
export function resolveSquadPurchaseAndSellingPrices(
  player: { cost: number; price: number; costChangeStart?: number },
  explicitPurchaseTenths?: unknown,
  explicitSellingTenths?: unknown,
  latestTransferInTenths?: number,
): { purchasePrice: number; sellingPrice: number } {
  const currentTenths = Math.max(
    35,
    Math.round(player.cost > 0 ? player.cost : player.price * 10),
  );

  const parsedExplicitBuy =
    explicitPurchaseTenths !== null &&
    explicitPurchaseTenths !== undefined &&
    explicitPurchaseTenths !== ''
      ? Number(explicitPurchaseTenths)
      : Number.NaN;

  const parsedExplicitSell =
    explicitSellingTenths !== null &&
    explicitSellingTenths !== undefined &&
    explicitSellingTenths !== ''
      ? Number(explicitSellingTenths)
      : Number.NaN;

  let purchaseTenths: number;
  if (Number.isFinite(parsedExplicitBuy) && parsedExplicitBuy >= 35) {
    purchaseTenths = Math.round(parsedExplicitBuy);
  } else if (
    typeof latestTransferInTenths === 'number' &&
    Number.isFinite(latestTransferInTenths) &&
    latestTransferInTenths >= 35
  ) {
    purchaseTenths = Math.round(latestTransferInTenths);
  } else {
    const startDelta =
      typeof player.costChangeStart === 'number' && Number.isFinite(player.costChangeStart)
        ? Math.round(player.costChangeStart)
        : 0;
    purchaseTenths = Math.max(35, currentTenths - startDelta);
  }

  const sellingTenths =
    Number.isFinite(parsedExplicitSell) && parsedExplicitSell >= 35
      ? Math.round(parsedExplicitSell)
      : computeOfficialSellingPriceTenths(purchaseTenths, currentTenths);

  return {
    purchasePrice: purchaseTenths / 10,
    sellingPrice: sellingTenths / 10,
  };
}

/** Normalize complete official history. A partial / unknown chip is NOT unused.
 *
 * Planner/solver entitlements must fail closed when an upstream response
 * contains an unrecognized chip code, malformed event or duplicate use.
 * Silently filtering those rows would invent extra available chips.
 */
export function normalizeChipHistory(payload?: RawEntryHistoryPayload | null): Array<{ name: string; event: number }> | undefined {
  if (!Array.isArray(payload?.chips)) return undefined;
  const officialNames: Record<PlanningChip, string> = { wc: 'wildcard', fh: 'freehit', bb: 'bboost', tc: '3xc' };
  const records: Array<{ name: string; event: number }> = [];
  const seen = new Set<string>();
  for (const use of payload.chips) {
    const chip = mapOfficialChipToPlanningChip(use?.name);
    const event = use?.event;
    if (!chip || typeof event !== 'number' || !Number.isInteger(event) || event < 1 || event > 38) return undefined;
    const half = event <= 19 ? 1 : 2;
    const key = `${chip}:${half}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    records.push({ name: officialNames[chip], event });
  }
  return records;
}
