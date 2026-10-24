// Shared shapes for the /plan dashboard (API route + client).

export interface PlanTeam {
  id: number;
  code: number;
  short: string;
  name: string;
}

export interface PlanFixture {
  gw: number;
  h: number; // home team id
  a: number; // away team id
  hd: number; // difficulty for the home team
  ad: number; // difficulty for the away team
}

export interface PlanPlayer {
  id: number;
  code: number;
  name: string;
  team: number;
  type: number; // 1 GK, 2 DEF, 3 MID, 4 FWD
  cost: number; // tenths of a million
  status: string;
  news: string;
  chance: number | null;
  owned: number; // selected by %
  form: number;
  net: number; // transfers in minus out this gameweek
  pen: number | null; // penalty taker order (1 = first choice)
  fk: number | null; // direct free-kick taker order
  ck: number | null; // corner / indirect free-kick taker order
  xp: number[]; // xPts per gameweek, aligned with PlanResponse.gws
}

export interface PlanPick {
  element: number;
  position: number;
  isCaptain: boolean;
  isVice: boolean;
}

export interface PlanResponse {
  entryId: number;
  currentGw: number;
  nextGw: number;
  gws: number[];
  deadlines: Record<number, string>;
  bank: number; // tenths of a million
  freeTransfers: number;
  picks: PlanPick[];
  sellingPrices: Record<number, number>;
  teams: PlanTeam[];
  fixtures: PlanFixture[];
  players: PlanPlayer[];
  computedAt: string;
}

export interface PlanTransfer {
  out: number; // element id leaving the squad
  in: number; // element id joining the squad
}

/** Shape stored in saved_plans.data (and localStorage) for the dashboard. */
export interface SavedPlanData {
  kind: "plan-dashboard";
  v: 2;
  startGw: number;
  transfers: Record<string, PlanTransfer[]>; // keyed by gameweek
}
