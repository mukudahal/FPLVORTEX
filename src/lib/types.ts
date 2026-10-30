export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';
export type RiskProfile = 'balanced' | 'safe' | 'differential' | 'upside';
export type DataSource = 'live' | 'cache' | 'snapshot' | 'offline';

export interface FplTeam {
  id: number;
  code: number;
  name: string;
  shortName: string;
  position: number;
  played: number;
  points: number;
  form: string | null;
  strength: number;
  strengthAttackHome: number;
  strengthAttackAway: number;
  strengthDefenceHome: number;
  strengthDefenceAway: number;
}

export interface Gameweek {
  id: number;
  name: string;
  shortName: string;
  deadlineTime: string;
  finished: boolean;
  dataChecked: boolean;
  isCurrent: boolean;
  isNext: boolean;
  isPrevious: boolean;
  averageEntryScore: number;
  highestScore: number | null;
  mostSelected: number | null;
  mostCaptained: number | null;
  topElement: number | null;
  highestScoringEntry: number | null;
  chipPlays: Array<{ chipName: string; numPlayed: number }>;
  transfersMade: number;
  rankedCount: number;
}

export interface FixtureMarketOdds {
  provider: 'the-odds-api' | 'football-data' | 'espn';
  bookmaker: string;
  updatedAt: string;
  /** A genuine bookmaker quote time, or unknown when the feed exposes only retrieval time. */
  quoteTimeSource?: 'bookmaker' | 'unknown';
  /** When FPL VORTEX fetched the quote feed; never presented as a bookmaker quote time. */
  retrievedAt?: string;
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  totalLine?: number | null;
  oddsOver?: number | null;
  oddsUnder?: number | null;
  homeWin: number;
  draw: number;
  awayWin: number;
  homeXg: number;
  awayXg: number;
  homeCs: number;
  awayCs: number;
  overround1x2: number;
}

export interface MarketOddsMeta {
  /** All current, unsettled fixtures in the next three GWs, not the entire season. */
  next3Coverage?: import('./marketCoverage').MarketCoverageReport;
  /** Provider fetch diagnostics contain no API keys and do not prove bookmaker quotes are current. */
  feedDiagnostics?: Array<{ provider: string; access: 'configured' | 'not-configured' | 'public'; fetched: boolean; parsedRows: number }>;
  status: 'live' | 'partial' | 'fallback';
  provider: string;
  matchedFixtures: number;
  /** Matches with odds in the next gameweek, unlike matchedFixtures (all gameweeks). */
  matchedUpcomingFixtures?: number;
  upcomingFixtures: number;
  apiKeyConfigured: boolean;
  updatedAt: string;
}

export interface Fixture {
  id: number;
  event: number;
  kickoffTime: string | null;
  finished: boolean;
  started: boolean;
  minutes: number;
  teamH: number;
  teamA: number;
  teamHScore: number | null;
  teamAScore: number | null;
  teamHDifficulty: number;
  teamADifficulty: number;
  marketOdds?: FixtureMarketOdds | null;
}

export interface Player {
  id: number;
  code: number;
  name: string;
  fullName: string;
  teamId: number;
  position: Position;
  price: number;
  cost: number;
  totalPoints: number;
  eventPoints: number;
  ppg: number;
  form: number;
  ownership: number;
  minutes: number;
  starts: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  saves: number;
  bonus: number;
  bps: number;
  influence: number;
  creativity: number;
  threat: number;
  ict: number;
  xG: number;
  xA: number;
  xGI: number;
  xGC: number;
  defensiveContribution: number;
  transfersIn: number;
  transfersOut: number;
  transfersInEvent: number;
  transfersOutEvent: number;
  costChangeEvent?: number;
  costChangeStart?: number;
  selectedByPercent: number;
  status: string;
  chance: number | null;
  news: string;
  newsAdded?: string | null;
  epNext: number;
  epThis: number;
  dreamteamCount: number;
  cornersOrder: number | null;
  freekicksOrder: number | null;
  penaltiesOrder: number | null;
  birthDate: string | null;
  repoExpectedMinutes?: number | null;
  repoBenchmarkXpts?: number | null;
  repoHorizon5Xpts?: number | null;
  gwProjections?: Record<number, number>;
  gwExpectedMinutes?: Record<number, number>;
}

export interface VerifiedEvidenceNote {
  playerId?: number;
  teamId: number;
  checkedAt: string;
  sourceUrl: string;
  summary: string;
  monitor: boolean;
}

export interface RepoDataMeta {
  benchmarkFile: string;
  benchmarkPlayers: number;
  /** Date inferred from CSV filename, not a verified publication timestamp. */
  projectionFileDate?: string | null;
  /** Distinct GWs with imported values, not full per-player coverage. */
  projectionGameweeks?: number[];
  videosFile: string;
  videosCount: number;
  channelId: string;
  configuredEntryId: number | null;
  configuredEntryName: string;
  seasonRules: string;
  verifiedNotes?: VerifiedEvidenceNote[];
}

export type PlayerDataQualitySource = 'official-bootstrap' | 'normalized-snapshot';
export interface PlayerDataQuality {
  source: PlayerDataQualitySource;
  status: 'checked' | 'incomplete' | 'unverified';
  /** Local normalization/snapshot time, not the last upstream player-field update. */
  observedAt: string;
  /** FPL bootstrap does not provide an aggregate last-modified timestamp. */
  sourceUpdatedAt: null;
  playerCount: number;
  validIds: number;
  uniqueIds: number;
  validTeamRefs: number;
  validPrices: number;
  validOwnership: number;
  validStatuses: number;
  validChanceValues: number;
  /** Empty news is valid; these fields count advisory text and dates only. */
  newsItems: number;
  datedNewsItems: number;
  undatedNewsItems: number;
  invalidNewsDates: number;
  latestNewsAddedAt: string | null;
}

export interface SnapshotMeta {
  source: DataSource;
  generatedAt: string;
  servedAt: string;
  season: string;
  currentEventId: number;
  nextEventId: number;
  isLive: boolean;
  refreshSeconds: number;
  totalPlayers: number;
  fixtureCount: number;
  upstreamOk: boolean;
  stale: boolean;
  version: number;
  exampleEntryId: number | null;
  exampleLeagueId: number;
  fallbackNotice?: string;
  repoData?: RepoDataMeta;
  oddsMeta?: MarketOddsMeta;
  /** Read-only coverage/provenance audit; never mutates player inputs or forecast scores. */
  playerDataQuality?: PlayerDataQuality;
  /** Set when the snapshot file was mirrored from a published deployment (`npm run data:mirror`). */
  mirroredFrom?: string;
  mirroredAt?: string;
}

/** Provisional goal-based strengths, computed server-side from completed matches. */
export interface HistoricalTeamStrength {
  atkH: number;
  atkA: number;
  defWeakH: number;
  defWeakA: number;
}

export interface Snapshot {
  historicalTeamModel?: { method: 'historical-goals-v1'; asOf: string; matches: number; strengths: Record<string, HistoricalTeamStrength> };
  meta: SnapshotMeta;
  teams: FplTeam[];
  gameweeks: Gameweek[];
  players: Player[];
  fixtures: Fixture[];
}

export interface ProjectionContext {
  projectionStartEventId: number;
  completedEvents: number;
  fixtureIndex: Map<number, Fixture[]>;
  teamIndex: Map<number, FplTeam>;
  maxEventId: number;
}

export interface ModelComponentBreakdown {
  modelXPts: number;
  expectedMinutes: number;
  pStart: number;
  p60Plus: number;
  appearance: number;
  attacking: number;
  goal: number;
  assist: number;
  cleanSheet: number;
  defcon: number;
  saves: number;
  bonus: number;
  concededPenalty: number;
  cardsPenalty: number;
  csProb: number;
  optaXP5Gw: number;
  optaXPNext: number;
  fiveGwEaseScore: number;
}

export interface EnrichedPlayer extends Player {
  team: FplTeam;
  projection: number;
  horizon5Projection: number;
  confidence: number;
  value: number;
  fixtureScore: number;
  fixtureDelta: number;
  momentum: number;
  availability: number;
  roleScore: number;
  leverage: number;
  reasons: string[];
  sparkline: number[];
  modelBreakdown: ModelComponentBreakdown;
}

export interface FixtureCell {
  event: number;
  difficulty: number;
  fixtures: Fixture[];
  label: string;
  isBlank: boolean;
  isDouble: boolean;
  lambdaFor?: number;
  lambdaAgainst?: number;
  csProb?: number;
  winProb?: number;
}

export interface FixtureRow {
  team: FplTeam;
  cells: FixtureCell[];
  next3: number;
  next5: number;
  easeSum5: number;
  avgLambdaFor: number;
  avgCsProb: number;
  swing: number;
  rank: number;
}

export interface SquadPlayer extends EnrichedPlayer {
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
}

export interface SquadResult {
  squad: SquadPlayer[];
  starters: SquadPlayer[];
  bench: SquadPlayer[];
  captain: SquadPlayer;
  viceCaptain: SquadPlayer;
  formation: string;
  cost: number;
  projectedPoints: number;
  horizon5Points?: number;
  averageOwnership: number;
  averageConfidence: number;
  riskScore: number;
  generatedAt: string;
}

export interface TransferSuggestion {
  out: EnrichedPlayer;
  incoming: EnrichedPlayer;
  gain: number;
  horizonGain?: number;
  costChange: number;
  reason: string;
}

export interface EntryPick {
  element: number;
  position: number;
  multiplier: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  purchasePrice?: number;
  sellingPrice?: number;
}

export interface EntryHistory {
  event: number;
  points: number;
  totalPoints: number;
  rank: number;
  overallRank: number;
  bank: number;
  value: number;
  eventTransfers: number;
  eventTransfersCost: number;
  pointsOnBench: number;
}

export interface EntryTransferRecord {
  event: number;
  elementIn: number;
  elementOut: number;
  elementInCost: number;
  elementOutCost: number;
  time: string;
}

export interface EntryData {
  id: number;
  name: string;
  teamName: string;
  region: string;
  startedEvent: number;
  favouriteTeamId: number | null;
  overallRank: number | null;
  /** Prior completed GW overall rank, from official FPL history; null if unverified. */
  previousOverallRank?: number | null;
  overallPoints: number | null;
  freeTransfers: number;
  currentEvent: number;
  activeChip: string | null;
  history: EntryHistory;
  picks: EntryPick[];
  players: EnrichedPlayer[];
  projectedPoints: number;
  squadValue: number;
  recentTransfers?: EntryTransferRecord[];
  source: DataSource;
  generatedAt: string;
  /** Archive and demo records are not the user's verified current FPL team. */
  provenance?: {
    kind: 'official' | 'archived' | 'demo';
    requestedIdVerified: boolean;
    sourceCapturedAt: string | null;
  };
}

export interface LeagueStanding {
  rank: number;
  lastRank: number;
  entry: number;
  playerName: string;
  entryName: string;
  eventTotal: number;
  total: number;
}

export interface LeagueData {
  id: number;
  name: string;
  created: string | null;
  closed: boolean;
  standings: LeagueStanding[];
  source: DataSource;
  generatedAt: string;
  /** Explicitly separate genuine FPL league standings from a dated local archive. */
  provenance?: {
    kind: 'official' | 'archived';
    requestedIdVerified: boolean;
    sourceCapturedAt: string | null;
  };
}

export interface VideoItem {
  id: string;
  title: string;
  published: string;
  thumbnail: string;
  url: string;
}

export interface VideosResponse {
  channelId: string;
  channelTitle: string;
  /** Original archive capture; NOT a successful RSS check or video publication date. */
  capturedAt: string;
  source: 'live' | 'repository' | 'mixed' | 'static-export';
  archiveCapturedAt?: string;
  feedCheckedAt?: string | null;
  liveFeedItems?: number;
  archivedItems?: number;
  videos: VideoItem[];
}

export interface RepoBenchmarkRow {
  fplId: number;
  name: string;
  team: string;
  position: Position;
  price: number;
  /** Null when the target GW has no imported value; never back/forward filled. */
  expectedMinutes: number | null;
  expectedPoints: number | null;
  /** Null unless all five consecutive GWs have imported xPts values. */
  horizon5Points: number | null;
}

export interface RepoBenchmarksResponse {
  sourceFile: string;
  targetEventId: number;
  horizonEvents: number[];
  count: number;
  players: RepoBenchmarkRow[];
}

export interface ApiError {
  error: string;
  detail?: string;
  source?: DataSource;
}
