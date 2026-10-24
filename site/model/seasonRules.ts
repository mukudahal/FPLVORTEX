import { MAX_FREE_TRANSFERS, MAX_PLAYERS_PER_CLUB, TRANSFER_HIT_COST, pointsHit, nextFreeTransfers, sellingPrice, type PlanningChip } from "./scoring";

/** Official 2026/27 season policy. One chip of each type per half, GW1 FH unavailable. */
export const RULES_2026_27 = Object.freeze({
  season: "2026/27",
  gameweeks: 38,
  chipHalfBoundary: 19,
  maxFreeTransfers: MAX_FREE_TRANSFERS,
  hitCost: TRANSFER_HIT_COST,
  maxPerClub: MAX_PLAYERS_PER_CLUB,
  squadSize: 15,
  positionCounts: { 1: 2, 2: 5, 3: 5, 4: 3 } as const,
  startingXI: 11,
  maxBudgetTenths: 1000,
  firstFreeHitGameweek: 2,
  transferDeadlineLeadMinutes: 90,
  chips: ["wc", "fh", "bb", "tc"] as readonly PlanningChip[],
});
export type SeasonChip = PlanningChip;
export interface SeasonChipUse { gw: number; chip: SeasonChip }
export interface SquadCandidate { id: number; team: number; position: number; priceTenths: number }
export interface SquadValidation { legal: boolean; errors: string[]; totalTenths: number }

export function validateSeasonChipPlan(chips: readonly SeasonChipUse[]): string[] {
  const errors: string[] = [];
  const used = new Set<string>();
  const chipByGw = new Map<number, SeasonChip>();
  for (const { gw, chip } of chips) {
    if (!Number.isInteger(gw) || gw < 1 || gw > 38) { errors.push(`Gameweek ${gw} is out of season.`); continue; }
    if (!(RULES_2026_27.chips as readonly string[]).includes(chip)) { errors.push(`Unknown chip ${chip}.`); continue; }
    const half = gw <= RULES_2026_27.chipHalfBoundary ? 1 : 2;
    if (used.has(`${half}:${chip}`)) errors.push(`${chip} is already used in half ${half}.`);
    used.add(`${half}:${chip}`);
    if (chipByGw.has(gw)) errors.push(`More than one chip selected in GW${gw}.`);
    chipByGw.set(gw, chip);
    if (chip === "fh" && gw === 1) errors.push("Free Hit cannot be played in GW1.");
  }
  for (const { gw, chip } of chips) {
    if (chip === "fh" && chipByGw.get(gw - 1) === "fh") errors.push(`Free Hit cannot be played in consecutive gameweeks (GW${gw - 1}/GW${gw}).`);
  }
  return [...new Set(errors)];
}

export function validateSquad(squad: readonly SquadCandidate[], availableTenths: number = RULES_2026_27.maxBudgetTenths): SquadValidation {
  const errors: string[] = [];
  if (!Number.isInteger(availableTenths) || availableTenths < 0) errors.push("Invalid budget.");
  if (squad.length !== RULES_2026_27.squadSize) errors.push("Squad must contain 15 players.");
  if (new Set(squad.map((p) => p.id)).size !== squad.length) errors.push("Duplicate player in squad.");
  let totalTenths = 0;
  const clubs = new Map<number, number>();
  const positions = new Map<number, number>();
  for (const player of squad) {
    if (!Number.isInteger(player.priceTenths) || player.priceTenths < 0) errors.push(`Invalid price for player ${player.id}.`);
    if (!Number.isInteger(player.team) || player.team < 1) errors.push(`Invalid club for player ${player.id}.`);
    totalTenths += player.priceTenths;
    clubs.set(player.team, (clubs.get(player.team) ?? 0) + 1);
    positions.set(player.position, (positions.get(player.position) ?? 0) + 1);
  }
  for (const [club, count] of clubs) if (count > RULES_2026_27.maxPerClub) errors.push(`Club ${club} has ${count} players; maximum three.`);
  for (const [position, required] of Object.entries(RULES_2026_27.positionCounts)) {
    if ((positions.get(Number(position)) ?? 0) !== required) errors.push(`Position ${position} must have ${required} players.`);
  }
  if (totalTenths > availableTenths) errors.push(`Squad exceeds available budget by ${totalTenths - availableTenths} tenths.`);
  return { legal: errors.length === 0, errors, totalTenths };
}

export function advanceTransferState(freeTransfers: number, transfersMade: number, chip?: SeasonChip): {
  freeTransfersNext: number; hitPoints: number;
} {
  const hitPoints = pointsHit(transfersMade, freeTransfers, chip === "wc" || chip === "fh");
  return { freeTransfersNext: nextFreeTransfers(freeTransfers, transfersMade, chip), hitPoints };
}

export function transferBankAfterSale(purchasePriceTenths: number, currentPriceTenths: number, bankTenths: number): number {
  if (!Number.isInteger(bankTenths) || bankTenths < 0) throw new RangeError("Invalid bank balance.");
  return bankTenths + sellingPrice(purchasePriceTenths, currentPriceTenths);
}
