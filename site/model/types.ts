import type { PlayerFixtureModel } from "./playerModel";

// Slimmed shapes shared between API routes and client components.

export interface SlimEvent {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
  average_entry_score: number | null;
  highest_score: number | null;
  most_captained: number | null;
  most_selected: number | null;
}

export interface SlimTeam {
  id: number;
  code: number;
  name: string;
  short_name: string;
  strength: number;
  strength_attack_home?: number;
  strength_attack_away?: number;
  strength_defence_home?: number;
  strength_defence_away?: number;
}

export interface PriceProjection {
  offset: number;
  projected_percent: string;
  likelihood: number; // -3..3
}

export interface SlimElement {
  id: number;
  code: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: number; // 1 GK, 2 DEF, 3 MID, 4 FWD, 5 MGR
  now_cost: number; // tenths of a million
  cost_change_event: number;
  total_points: number;
  event_points: number;
  form: string;
  points_per_game: string;
  selected_by_percent: string;
  status: string; // a, d, i, s, u, n
  news: string;
  news_added: string | null;
  chance_of_playing_next_round: number | null;
  chance_of_playing_this_round: number | null;
  ep_next: string;
  ep_this: string | null;
  minutes: number;
  starts: number;
  starts_per_90: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  clean_sheets_per_90: number;
  saves: number;
  saves_per_90: number;
  bonus: number;
  bps: number;
  defensive_contribution: number;
  defensive_contribution_per_90: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  cost_change_start: number;
  transfers_in_event: number;
  transfers_out_event: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  expected_goals_per_90: number;
  expected_assists_per_90: number;
  expected_goal_involvements_per_90: number;
  expected_goals_conceded_per_90: number;
  price_change_percent: number | null; // signed progress toward change
  price_change_hourly_rate: number | null;
  price_change_projections: PriceProjection[] | null;
  price_change_locked_until: string | null;
}

export interface ChipDef {
  name: string;
  number: number;
  start_event: number;
  stop_event: number;
}

export interface SlimBootstrap {
  events: SlimEvent[];
  teams: SlimTeam[];
  elements: SlimElement[];
  chips: ChipDef[];
  total_players: number;
  currentEvent: number | null;
  nextEvent: number | null;
}

export interface Fixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string | null;
  started: boolean | null;
  finished: boolean;
  finished_provisional?: boolean;
  minutes: number;
}

export interface LiveElementStats {
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  saves: number;
  bonus: number;
  bps: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  total_points: number;
  defensive_contribution?: number;
  starts?: number;
  expected_goals?: string;
  expected_assists?: string;
  expected_goals_conceded?: string;
}

export interface LiveElement {
  id: number;
  stats: LiveElementStats;
  explain?: { fixture: number; stats: { identifier: string; points: number; value: number }[] }[];
}

export interface LiveResponse {
  elements: LiveElement[];
}

export interface Pick {
  element: number;
  position: number; // 1..15
  multiplier: number; // 0 benched, 1, 2 captain, 3 TC
  is_captain: boolean;
  is_vice_captain: boolean;
}

export interface PicksResponse {
  active_chip: string | null;
  automatic_subs: { entry: number; element_in: number; element_out: number }[];
  entry_history: {
    event: number;
    points: number;
    total_points: number;
    rank: number | null;
    overall_rank: number | null;
    event_transfers: number;
    event_transfers_cost: number;
    bank: number;
    value: number;
    points_on_bench: number;
  };
  picks: Pick[];
}

export interface EntrySummary {
  id: number;
  player_first_name: string;
  player_last_name: string;
  name: string; // team name
  player_region_name: string;
  started_event: number;
  summary_overall_points: number | null;
  summary_overall_rank: number | null;
  summary_event_points: number | null;
  summary_event_rank: number | null;
  current_event: number | null;
  last_deadline_bank: number | null;
  last_deadline_value: number | null;
  last_deadline_total_transfers: number;
  leagues?: {
    classic: {
      id: number;
      name: string;
      league_type: string; // 'x' = private classic, 's' = public/system
      entry_rank: number | null;
      entry_last_rank: number | null;
    }[];
  };
}

export interface LeagueStandingRow {
  id: number;
  entry: number;
  entry_name: string;
  player_name: string;
  rank: number;
  last_rank: number;
  total: number;
  event_total: number;
}

export interface LeagueStandings {
  league: { id: number; name: string };
  standings: { results: LeagueStandingRow[] };
}

export interface RivalData {
  entry: number;
  name: string;
  playerName: string;
  total: number;
  rank: number;
  picks: Pick[] | null;
  activeChip: string | null;
  chipsUsed: { name: string; event: number }[];
  history: { event: number; total_points: number }[];
}

export interface HistoryGw {
  event: number;
  points: number;
  total_points: number;
  rank: number | null;
  overall_rank: number | null;
  event_transfers: number;
  event_transfers_cost: number;
  bank: number;
  value: number;
  points_on_bench: number;
}

export interface EntryHistory {
  current: HistoryGw[];
  past: { season_name: string; total_points: number; rank: number }[];
  chips: { name: string; time: string; event: number }[];
}

export interface EntryResponse {
  entry: EntrySummary;
  history: EntryHistory;
}

export interface Transfer {
  element_in: number;
  element_in_cost: number;
  element_out: number;
  element_out_cost: number;
  event: number;
  time: string;
}

export interface ElementSummary {
  fixtures: {
    id: number;
    event: number | null;
    is_home: boolean;
    difficulty: number;
    team_h: number;
    team_a: number;
    kickoff_time: string | null;
  }[];
  history: {
    element: number;
    fixture: number;
    round: number;
    opponent_team: number;
    was_home: boolean;
    total_points: number;
    minutes: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    bonus: number;
    value: number;
    expected_goal_involvements: string;
  }[];
  history_past: {
    season_name: string;
    total_points: number;
    minutes: number;
    goals_scored: number;
    assists: number;
  }[];
}

export interface RecentManager {
  id: number;
  playerName: string;
  teamName: string;
  overallRank: number | null;
  totalPoints: number | null;
}

// ---------- Section 0: Core Engine & Optimizer types ----------

export interface PlayerXPtsBreakdown {
  elementId: number;
  gw: number;
  p60: number; // P(plays 60+ min) 0..1
  pSub: number; // P(plays 1..59 min) 0..1
  appearancePts: number;
  goalPts: number;
  assistPts: number;
  cleanSheetPts: number;
  bonusPts: number;
  defensivePts: number;
  savePts: number;
  cardPts: number; // negative
  csProb: number; // average clean-sheet probability per fixture (GK/DEF/MID), else 0
  fixtureModels?: PlayerFixtureModel[];
  otherPts?: number;
  xPts: number; // our model Estimate
  epNext: number; // FPL ep_next cross-check
  confidence: number; // 0..99%
  fixtureCount: number; // 0 = blank, 1 = single, 2+ = double
  fixturesLabel: string;
}

export interface BacktestMetrics {
  gwsTested: number[];
  sampleSize: number;
  mae: number; // Mean Absolute Error (pts)
  rmse: number;
  epNextMae: number; // MAE of the strongest naive baseline (kept under its legacy name)
  baselineName?: string;
  modelBeatsBaseline?: boolean;
  method?: "walk-forward" | "reconstructed-history";
  historicalContextComplete?: boolean;
  within2PtsPct: number;
  rankCorrelation: number;
  quality: "good" | "moderate" | "poor";
  verdict: string;
}

export interface OptimizerTransferMove {
  outId: number;
  inId: number;
  sellingPrice: number; // tenths
  buyPrice: number; // tenths
  xPtsOutNextGw: number;
  xPtsInNextGw: number;
  xPtsGainNextGw: number;
  xPtsGainHorizon: number;
}

export interface OptimizerOptionComparison {
  id: "roll" | "transfer1" | "transfer2" | "chip";
  label: string;
  action: "ROLL" | "TRANSFER" | "PLAY_CHIP";
  chip?: string | null;
  transfers: OptimizerTransferMove[];
  hitCost: number; // 0, 4, 8...
  nextGwXPts: number;
  horizonXPts: number;
  xPtsGainVsRoll: number; // raw gain before hit
  netGainVsRoll: number; // xPtsGainVsRoll - hitCost
  winner: boolean;
  why: string;
}

export interface ChipGwSimulation {
  gw: number;
  xPtsWithChip: number;
  xPtsNoChip: number;
  gain: number;
  reason: string;
  starters: number[];
  bench: number[]; // [gk, sub1, sub2, sub3]
  captainId: number;
  viceId: number;
}

export interface ChipSimulationSummary {
  chip: string; // wildcard | freehit | bboost | 3xc
  available: boolean;
  usedGw: number | null;
  expiresGw: number;
  expiryDeadline: string | null;
  expiringSoon: boolean;
  bestGw: number | null;
  bestGain: number;
  gainNow: number;
  meaningful: boolean;
  verdictLine: string;
  topGws: ChipGwSimulation[]; // top 4 ranked by gain
  bestPitch: ChipGwSimulation | null;
}

export interface ActionStep {
  type: "do" | "dont";
  dateLabel: string;
  text: string;
  category: "deadline" | "price" | "press" | "injury" | "lineup";
}

/** A per-gameweek summary: average and an 80% range (10th to 90th percentile). */
export interface McBand {
  gw: number;
  mean: number;
  p10: number;
  p90: number;
}

export interface McPathSummary {
  id: string; // hold | transfer1 | transfer2 | wildcard
  label: string;
  hitCost: number;
  mean: number;
  median: number;
  sd: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  /** Gain over holding, after hit costs. Null for the hold path itself. */
  deltaMean: number | null;
  deltaP10: number | null;
  deltaP90: number | null;
  /** Strict probability of beating hold; calibration is applied only when explicitly supplied. */
  probBeatsHold: number | null;
  /** The uncorrected simulation share, for transparency. */
  probBeatsHoldRaw: number | null;
  probDrawsHold?: number | null;
  perGw: McBand[];
  /** Cumulative gain over holding by gameweek, including hit costs. */
  cumDelta: McBand[] | null;
}

export interface McCaptainRisk {
  id: number;
  mean: number;
  p10: number;
  p90: number;
  /** Chance of scoring 2 points or fewer. */
  pBlank: number;
  /** Chance of scoring 9 points or more. */
  pHaul: number;
  /** Chance of outscoring the recommended captain. Null for the recommended captain. */
  pBeatsPick: number | null;
  isPick: boolean;
}

export interface MonteCarloSummary {
  draws: number;
  horizon: number;
  gws: number[];
  seed: number;
  recommendedPathId: string;
  paths: McPathSummary[];
  captains: McCaptainRisk[];
  assumptions: string[];
}

export interface OptimizerResponse {
  entryId: number;
  currentGw: number;
  nextGw: number;
  horizon: number;
  solverEngine: string; // e.g. "Python PuLP (CBC MILP)"
  solverRunMs: number;
  cached: boolean;
  cacheKey: string;
  monteCarlo?: MonteCarloSummary | null;
  computedAt: string;
  freeTransfersNow: number;
  freeTransfersAfterRoll: number;
  freeTransfersAfterMove: number;
  rollThresholdXPts: number; // computed value of banking an FT
  bankedTransferValueNextGw: number;
  currentPicks?: PicksResponse;
  sellingPrices: Record<number, number>; // elementId -> selling price (tenths)
  purchasePrices: Record<number, number>; // elementId -> purchase price (tenths)
  xPtsNextGw: Record<number, PlayerXPtsBreakdown>;
  xPtsByGw: Record<number, Record<number, number>>; // gw -> elementId -> xPts
  options: OptimizerOptionComparison[];
  winner: OptimizerOptionComparison;
  recommendedDecision: "ROLL" | "TRANSFER";
  recommendedChipDecision: {
    action: "PLAY" | "HOLD";
    chip: string | null;
    gainNow: number;
    bestFutureGw: number | null;
    bestFutureChip: string | null;
    bestFutureGain: number;
    why: string;
  };
  optimizedNextGw: {
    squad: number[]; // 15
    starters: number[]; // 11
    bench: number[]; // 4 ordered: [benchGK, sub1, sub2, sub3]
    captainId: number;
    viceId: number;
    newPlayerIds: number[];
    transfers: OptimizerTransferMove[];
    hitCost: number;
    xiXPts: number;
    captainXPts: number; // extra points from captain
    benchXPts: number;
    totalXPts: number; // xiXPts + captainXPts - hitCost
    formation: string;
    confidence: number;
    whyLine: string;
  };
  multiGwPlan: {
    gw: number;
    squad: number[];
    starters: number[];
    bench: number[];
    captainId: number;
    viceId: number;
    transfers: OptimizerTransferMove[];
    chip: string | null;
    hitCost: number;
    ftBefore: number;
    ftAfter: number;
    bankAfter: number;
    projectedXPts: number;
  }[];
  chipSimulations: ChipSimulationSummary[];
  next6DaysPlan: ActionStep[];
  backtest: BacktestMetrics;
}

