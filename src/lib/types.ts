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
  selectedByPercent: number;
  status: string;
  chance: number | null;
  news: string;
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
}

export interface RepoDataMeta {
  benchmarkFile: string;
  benchmarkPlayers: number;
  videosFile: string;
  videosCount: number;
  channelId: string;
  configuredEntryId: number;
  seasonRules: string;
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
  repoData?: RepoDataMeta;
}

export interface Snapshot {
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

export interface EnrichedPlayer extends Player {
  team: FplTeam;
  projection: number;
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
}

export interface FixtureCell {
  event: number;
  difficulty: number;
  fixtures: Fixture[];
  label: string;
  isBlank: boolean;
  isDouble: boolean;
}

export interface FixtureRow {
  team: FplTeam;
  cells: FixtureCell[];
  next3: number;
  next5: number;
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
  averageOwnership: number;
  averageConfidence: number;
  riskScore: number;
  generatedAt: string;
}

export interface TransferSuggestion {
  out: EnrichedPlayer;
  incoming: EnrichedPlayer;
  gain: number;
  costChange: number;
  reason: string;
}

export interface EntryPick {
  element: number;
  position: number;
  multiplier: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
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

export interface EntryData {
  id: number;
  name: string;
  teamName: string;
  region: string;
  startedEvent: number;
  favouriteTeamId: number | null;
  overallRank: number | null;
  overallPoints: number | null;
  currentEvent: number;
  activeChip: string | null;
  history: EntryHistory;
  picks: EntryPick[];
  players: EnrichedPlayer[];
  projectedPoints: number;
  squadValue: number;
  source: DataSource;
  generatedAt: string;
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
  capturedAt: string;
  source: 'live' | 'repository';
  videos: VideoItem[];
}

export interface RepoBenchmarkRow {
  fplId: number;
  name: string;
  team: string;
  position: Position;
  price: number;
  expectedMinutes: number;
  expectedPoints: number;
  horizon5Points: number;
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
