import {
  boolean,
  bigint,
  bigserial,
  doublePrecision,
  index,
  primaryKey,
  uniqueIndex,
  uuid,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Generic cache for FPL API responses (key = API path).
export const apiCache = pgTable("api_cache", {
  key: text("key").primaryKey(),
  data: jsonb("data").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Managers (FPL entries) that have been viewed in this app.
export const managers = pgTable("managers", {
  id: integer("id").primaryKey(), // FPL entry id
  playerName: text("player_name").notNull().default(""),
  teamName: text("team_name").notNull().default(""),
  region: text("region").notNull().default(""),
  overallRank: integer("overall_rank"),
  totalPoints: integer("total_points"),
  viewCount: integer("view_count").notNull().default(1),
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Periodic snapshots of player price/transfer state (Phase 3 momentum model).
export const priceSnapshots = pgTable("price_snapshots", {
  id: serial("id").primaryKey(),
  elementId: integer("element_id").notNull(),
  nowCost: integer("now_cost").notNull(),
  transfersInEvent: integer("transfers_in_event").notNull(),
  transfersOutEvent: integer("transfers_out_event").notNull(),
  selectedByPercent: real("selected_by_percent").notNull(),
  changePercent: real("change_percent"), // FPL's own progress metric if present
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
});

// Every price prediction we make + the real outcome, for running accuracy %.
export const pricePredictions = pgTable("price_predictions", {
  id: serial("id").primaryKey(),
  elementId: integer("element_id").notNull(),
  webName: text("web_name").notNull(),
  direction: text("direction").notNull(), // 'rise' | 'fall'
  probability: real("probability").notNull(), // 0..1 at prediction time
  priceAt: integer("price_at").notNull(), // now_cost when predicted
  predictedAt: timestamp("predicted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  windowEnds: timestamp("window_ends", { withTimezone: true }).notNull(),
  outcome: text("outcome").notNull().default("pending"), // pending|correct|wrong
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// Saved multi-GW plans (Phase 9). data holds the full plan JSON.
export const savedPlans = pgTable("saved_plans", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull(),
  ownerUserId: uuid("owner_user_id").references(() => appUsers.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  data: jsonb("data").notNull(),
  projectedPoints: real("projected_points").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [index("saved_plans_owner_entry_active_idx").on(table.ownerUserId, table.entryId, table.active, table.createdAt)]);

// FotMob player ID mappings (Update 4: look up once, reuse forever, retry no_match every 7 days).
export const fotmobMappings = pgTable("fotmob_mappings", {
  fplPlayerCode: integer("fpl_player_code").primaryKey(),
  fotmobId: integer("fotmob_id"),
  matchedAt: timestamp("matched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  status: text("status").notNull(), // 'matched' | 'no_match'
});

// Player image working source resolutions (Update 4 dev status tracking).
export const playerImageResolutions = pgTable("player_image_resolutions", {
  fplPlayerCode: integer("fpl_player_code").primaryKey(),
  source: text("source").notNull(), // 'fpl' | 'fotmob' | 'placeholder' (legacy rows may say 'shirt'; ignored)
  fotmobId: integer("fotmob_id"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Step 9 additive persistence. Existing tables above remain untouched.
export const appUsers = pgTable("app_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull().default(""),
  role: text("role").notNull().default("member"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("app_users_email_ci_unique").on(sql`lower(${table.email})`)]);

export const managerLinks = pgTable("manager_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  entryId: integer("entry_id").notNull(),
  nickname: text("nickname").notNull().default(""),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("manager_links_user_entry_idx").on(table.userId, table.entryId),
  index("manager_links_entry_idx").on(table.entryId),
]);

export const fplTeams = pgTable("fpl_teams", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  season: text("season").notNull(),
  fplTeamId: integer("fpl_team_id").notNull(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  code: integer("code"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("fpl_teams_season_fpl_id_idx").on(table.season, table.fplTeamId)]);

export const fplPlayers = pgTable("fpl_players", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  season: text("season").notNull(),
  fplElementId: integer("fpl_element_id").notNull(),
  teamId: bigint("team_id", { mode: "number" }).references(() => fplTeams.id, { onDelete: "set null" }),
  webName: text("web_name").notNull(),
  position: integer("position").notNull(),
  nowCost: integer("now_cost").notNull(),
  attributes: jsonb("attributes").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("fpl_players_season_element_idx").on(table.season, table.fplElementId),
  index("fpl_players_team_idx").on(table.teamId),
  index("fpl_players_season_position_idx").on(table.season, table.position),
]);

export const fplFixtures = pgTable("fpl_fixtures", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  season: text("season").notNull(),
  fplFixtureId: integer("fpl_fixture_id").notNull(),
  gameweek: integer("gameweek"),
  homeTeamId: bigint("home_team_id", { mode: "number" }).notNull().references(() => fplTeams.id, { onDelete: "restrict" }),
  awayTeamId: bigint("away_team_id", { mode: "number" }).notNull().references(() => fplTeams.id, { onDelete: "restrict" }),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true }),
  finished: boolean("finished").notNull().default(false),
  details: jsonb("details").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("fpl_fixtures_season_fpl_id_idx").on(table.season, table.fplFixtureId),
  index("fpl_fixtures_season_gw_idx").on(table.season, table.gameweek),
  index("fpl_fixtures_home_idx").on(table.homeTeamId),
  index("fpl_fixtures_away_idx").on(table.awayTeamId),
]);

export const dataSnapshots = pgTable("data_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  season: text("season").notNull(),
  gameweek: integer("gameweek").notNull(),
  source: text("source").notNull(),
  contentSha256: text("content_sha256").notNull(),
  payload: jsonb("payload").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("data_snapshots_content_idx").on(table.season, table.gameweek, table.source, table.contentSha256),
  index("data_snapshots_latest_idx").on(table.season, table.gameweek, table.source, table.capturedAt),
]);

export const modelRuns = pgTable("model_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotId: uuid("snapshot_id").notNull().references(() => dataSnapshots.id, { onDelete: "restrict" }),
  modelVersion: text("model_version").notNull(),
  parametersSha256: text("parameters_sha256").notNull(),
  status: text("status").notNull().default("pending"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [index("model_runs_snapshot_idx").on(table.snapshotId, table.createdAt)]);

export const playerProjections = pgTable("player_projections", {
  modelRunId: uuid("model_run_id").notNull().references(() => modelRuns.id, { onDelete: "cascade" }),
  playerId: bigint("player_id", { mode: "number" }).notNull().references(() => fplPlayers.id, { onDelete: "restrict" }),
  gameweek: integer("gameweek").notNull(),
  expectedPoints: doublePrecision("expected_points").notNull(),
  expectedMinutes: doublePrecision("expected_minutes").notNull(),
  pStart: doublePrecision("p_start"),
  pAppear: doublePrecision("p_appear"),
  p60: doublePrecision("p_60"),
  p10: doublePrecision("p10"),
  p90: doublePrecision("p90"),
  components: jsonb("components").notNull().default({}),
}, (table) => [
  primaryKey({ columns: [table.modelRunId, table.playerId, table.gameweek] }),
  index("player_projections_player_gw_idx").on(table.playerId, table.gameweek),
]);

export const savedScenarios = pgTable("saved_scenarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  entryId: integer("entry_id").notNull(),
  snapshotId: uuid("snapshot_id").references(() => dataSnapshots.id, { onDelete: "set null" }),
  modelRunId: uuid("model_run_id").references(() => modelRuns.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  draft: jsonb("draft").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("saved_scenarios_user_updated_idx").on(table.userId, table.updatedAt),
  index("saved_scenarios_entry_idx").on(table.entryId),
  index("saved_scenarios_snapshot_idx").on(table.snapshotId),
  index("saved_scenarios_model_idx").on(table.modelRunId),
]);

export const scenarioActions = pgTable("scenario_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  scenarioId: uuid("scenario_id").notNull().references(() => savedScenarios.id, { onDelete: "cascade" }),
  gameweek: integer("gameweek").notNull(),
  ordering: integer("ordering").notNull().default(0),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
}, (table) => [
  uniqueIndex("scenario_actions_order_idx").on(table.scenarioId, table.gameweek, table.ordering),
  index("scenario_actions_scenario_idx").on(table.scenarioId, table.gameweek),
]);

export const solverRuns = pgTable("solver_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  scenarioId: uuid("scenario_id").notNull().references(() => savedScenarios.id, { onDelete: "cascade" }),
  modelRunId: uuid("model_run_id").references(() => modelRuns.id, { onDelete: "set null" }),
  seed: integer("seed").notNull().default(1),
  status: text("status").notNull().default("queued"),
  constraints: jsonb("constraints").notNull().default({}),
  result: jsonb("result"),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
  index("solver_runs_user_recent_idx").on(table.userId, table.createdAt),
  index("solver_runs_scenario_idx").on(table.scenarioId, table.createdAt),
  index("solver_runs_model_idx").on(table.modelRunId),
]);

export const simulationRuns = pgTable("simulation_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  scenarioId: uuid("scenario_id").notNull().references(() => savedScenarios.id, { onDelete: "cascade" }),
  modelRunId: uuid("model_run_id").references(() => modelRuns.id, { onDelete: "set null" }),
  seed: integer("seed").notNull(),
  draws: integer("draws").notNull(),
  status: text("status").notNull().default("queued"),
  metrics: jsonb("metrics"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
  index("simulation_runs_user_recent_idx").on(table.userId, table.createdAt),
  index("simulation_runs_scenario_idx").on(table.scenarioId, table.createdAt),
  index("simulation_runs_model_idx").on(table.modelRunId),
]);

export const miniLeagues = pgTable("mini_leagues", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fplLeagueId: integer("fpl_league_id").notNull().unique(),
  name: text("name").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leagueMemberships = pgTable("league_memberships", {
  leagueId: bigint("league_id", { mode: "number" }).notNull().references(() => miniLeagues.id, { onDelete: "cascade" }),
  entryId: integer("entry_id").notNull(),
  lastRank: integer("last_rank"),
  lastPoints: integer("last_points"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.leagueId, table.entryId] }),
  index("league_memberships_entry_idx").on(table.entryId),
]);

export const priceEvents = pgTable("price_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  season: text("season").notNull(),
  playerId: bigint("player_id", { mode: "number" }).notNull().references(() => fplPlayers.id, { onDelete: "cascade" }),
  priceTenths: integer("price_tenths").notNull(),
  transfersIn: integer("transfers_in").notNull().default(0),
  transfersOut: integer("transfers_out").notNull().default(0),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  sourceSnapshotId: uuid("source_snapshot_id").references(() => dataSnapshots.id, { onDelete: "set null" }),
}, (table) => [
  index("price_events_player_date_idx").on(table.playerId, table.observedAt),
  index("price_events_snapshot_idx").on(table.sourceSnapshotId),
]);

export const availabilityEvents = pgTable("availability_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  playerId: bigint("player_id", { mode: "number" }).notNull().references(() => fplPlayers.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  availabilityProbability: doublePrecision("availability_probability"),
  source: text("source").notNull(),
  evidence: text("evidence"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  sourceSnapshotId: uuid("source_snapshot_id").references(() => dataSnapshots.id, { onDelete: "set null" }),
}, (table) => [
  index("availability_events_player_date_idx").on(table.playerId, table.observedAt),
  index("availability_events_snapshot_idx").on(table.sourceSnapshotId),
]);

export const reportRuns = pgTable("report_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  scenarioId: uuid("scenario_id").references(() => savedScenarios.id, { onDelete: "set null" }),
  snapshotId: uuid("snapshot_id").references(() => dataSnapshots.id, { onDelete: "set null" }),
  modelRunId: uuid("model_run_id").references(() => modelRuns.id, { onDelete: "set null" }),
  gameweek: integer("gameweek").notNull(),
  format: text("format").notNull(),
  status: text("status").notNull().default("queued"),
  payload: jsonb("payload").notNull().default({}),
  artifactKey: text("artifact_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("report_runs_user_recent_idx").on(table.userId, table.createdAt),
  index("report_runs_scenario_idx").on(table.scenarioId),
  index("report_runs_snapshot_idx").on(table.snapshotId),
  index("report_runs_model_idx").on(table.modelRunId),
]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => appUsers.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  details: jsonb("details").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_events_actor_recent_idx").on(table.actorUserId, table.occurredAt)]);

// Step 10: sessions and one-time tokens store digests only, never raw credentials.
export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("auth_sessions_user_idx").on(table.userId),
  index("auth_sessions_expiry_idx").on(table.expiresAt),
]);

export const authTokens = pgTable("auth_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  purpose: text("purpose").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("auth_tokens_user_purpose_idx").on(table.userId, table.purpose),
  index("auth_tokens_expiry_idx").on(table.expiresAt),
]);

export const authRateLimits = pgTable("auth_rate_limits", {
  identityKey: text("identity_key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backgroundJobs = pgTable("background_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobKey: text("job_key").notNull().unique(),
  userId: uuid("user_id").references(() => appUsers.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull().default({}),
  result: jsonb("result"),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  workerId: text("worker_id"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
  index("background_jobs_claim_idx").on(table.scheduledAt, table.createdAt),
  index("background_jobs_owner_status_idx").on(table.userId, table.status, table.createdAt),
]);
