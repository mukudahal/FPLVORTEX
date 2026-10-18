import type { Player, Position } from './model.js';

export const SNAPSHOT_VERSION = 1 as const;
export type DataRights = {
  sourceName: string;
  sourceReference: string;
  licenseReference: string;
  verifiedBy: string;
  verifiedAt: string;
  automatedProcessingPermitted: boolean;
  endUserDisplayPermitted: boolean;
  modelTrainingPermitted: boolean;
};
export type LicensedSnapshot = {
  schemaVersion: typeof SNAPSHOT_VERSION;
  season: string;
  gameweek: number;
  capturedAt: string;
  rights: DataRights;
  players: Player[];
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, maxLength = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${label} must be a nonempty string (max ${maxLength})`);
  }
  return value.trim();
}
function finiteNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be a finite number from ${min} to ${max}`);
  }
  return value;
}
function integer(value: unknown, label: string, min: number, max: number): number {
  const parsed = finiteNumber(value, label, min, max);
  if (!Number.isInteger(parsed)) throw new RangeError(`${label} must be an integer`);
  return parsed;
}
function timestamp(value: unknown, label: string, now: Date): string {
  const iso = text(value, label, 40);
  const milliseconds = Date.parse(iso);
  if (!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(iso) || !Number.isFinite(milliseconds)) {
    throw new TypeError(`${label} must be an ISO-8601 timestamp with timezone`);
  }
  if (milliseconds > now.getTime() + 5 * 60_000) throw new RangeError(`${label} cannot be in the future`);
  return new Date(milliseconds).toISOString();
}
const positions = new Set<Position>(['GKP', 'DEF', 'MID', 'FWD']);
const statuses = new Set<Player['status']>(['available', 'doubt', 'out']);

/** Validate independently provided, authorized data. This does not verify the underlying license. */
export function validateLicensedSnapshot(value: unknown, now = new Date()): LicensedSnapshot {
  if (!Number.isFinite(now.getTime())) throw new TypeError('Invalid validation clock');
  const input = record(value, 'snapshot');
  if (input.schemaVersion !== SNAPSHOT_VERSION) throw new RangeError('Unsupported snapshot schema version');
  const season = text(input.season, 'season', 7);
  if (!/^20\d{2}\/\d{2}$/.test(season) || (+season.slice(2, 4) + 1) % 100 !== +season.slice(5)) {
    throw new TypeError('Season must look like 2026/27');
  }
  const gameweek = integer(input.gameweek, 'gameweek', 1, 38);
  const capturedAt = timestamp(input.capturedAt, 'capturedAt', now);
  const rightsInput = record(input.rights, 'rights');
  const rights: DataRights = {
    sourceName: text(rightsInput.sourceName, 'rights.sourceName', 120),
    sourceReference: text(rightsInput.sourceReference, 'rights.sourceReference', 500),
    licenseReference: text(rightsInput.licenseReference, 'rights.licenseReference', 500),
    verifiedBy: text(rightsInput.verifiedBy, 'rights.verifiedBy', 120),
    verifiedAt: timestamp(rightsInput.verifiedAt, 'rights.verifiedAt', now),
    automatedProcessingPermitted: rightsInput.automatedProcessingPermitted === true,
    endUserDisplayPermitted: rightsInput.endUserDisplayPermitted === true,
    modelTrainingPermitted: rightsInput.modelTrainingPermitted === true
  };
  if (!rights.automatedProcessingPermitted || !rights.endUserDisplayPermitted) {
    throw new Error('Source is not approved for automated ingestion and end-user display');
  }
  if (!Array.isArray(input.players) || input.players.length < 1 || input.players.length > 800) {
    throw new RangeError('players must contain 1 to 800 records');
  }
  const seenIds = new Set<number>();
  let horizon: number | undefined;
  const players = input.players.map((entry: unknown, index: number): Player => {
    const source = record(entry, `players[${index}]`);
    const prefix = `players[${index}]`;
    const id = integer(source.id, `${prefix}.id`, 1, 20_000_000);
    if (seenIds.has(id)) throw new Error(`Duplicate player ID ${id}`);
    seenIds.add(id);
    const name = text(source.name, `${prefix}.name`, 120);
    const club = text(source.club, `${prefix}.club`, 6);
    if (!/^[A-Z]{2,6}$/.test(club)) throw new TypeError(`${prefix}.club must be an uppercase club code`);
    if (typeof source.position !== 'string' || !positions.has(source.position as Position)) throw new TypeError(`${prefix}.position is invalid`);
    if (typeof source.status !== 'string' || !statuses.has(source.status as Player['status'])) throw new TypeError(`${prefix}.status is invalid`);
    if (!Array.isArray(source.fixtures) || source.fixtures.length < 1 || source.fixtures.length > 14) {
      throw new RangeError(`${prefix}.fixtures must cover 1–14 gameweeks`);
    }
    const fixtures = source.fixtures.map((fdr: unknown, fixtureIndex: number) => integer(fdr, `${prefix}.fixtures[${fixtureIndex}]`, 1, 5));
    if (horizon === undefined) horizon = fixtures.length;
    if (horizon !== fixtures.length) throw new RangeError('All players must share one fixture horizon');
    return {
      id, name, club,
      position: source.position as Position,
      status: source.status as Player['status'],
      price: finiteNumber(source.price, `${prefix}.price`, 3, 25),
      ownership: finiteNumber(source.ownership, `${prefix}.ownership`, 0, 100),
      form: finiteNumber(source.form, `${prefix}.form`, 0, 30),
      xg90: finiteNumber(source.xg90, `${prefix}.xg90`, 0, 5),
      xa90: finiteNumber(source.xa90, `${prefix}.xa90`, 0, 5),
      expectedMinutes: finiteNumber(source.expectedMinutes, `${prefix}.expectedMinutes`, 0, 90),
      fixtures
      // Portraits are deliberately excluded; licensing for data does not grant photo rights.
    };
  });
  return { schemaVersion: SNAPSHOT_VERSION, season, gameweek, capturedAt, rights, players };
}

export type SnapshotStatus = {
  mode: 'demo' | 'licensed';
  live: false;
  trainedModelAvailable: false;
  capturedAt: string | null;
  ageMinutes: number | null;
  stale: boolean;
  season: string | null;
  gameweek: number | null;
  playerCount: number;
  forecastHorizon: number;
  rights: Pick<DataRights, 'sourceName' | 'sourceReference' | 'licenseReference' | 'modelTrainingPermitted'> | null;
};

export function snapshotStatus(snapshot: LicensedSnapshot | null, now = new Date(), staleAfterMinutes = 360): SnapshotStatus {
  if (!snapshot) {
    return { mode: 'demo', live: false, trainedModelAvailable: false, capturedAt: null, ageMinutes: null, stale: true, season: null, gameweek: null, playerCount: 0, forecastHorizon: 0, rights: null };
  }
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - Date.parse(snapshot.capturedAt)) / 60_000));
  return {
    mode: 'licensed', live: false, trainedModelAvailable: false, capturedAt: snapshot.capturedAt,
    ageMinutes, stale: ageMinutes > staleAfterMinutes, season: snapshot.season, gameweek: snapshot.gameweek,
    playerCount: snapshot.players.length, forecastHorizon: snapshot.players[0]?.fixtures.length ?? 0,
    rights: {
      sourceName: snapshot.rights.sourceName,
      sourceReference: snapshot.rights.sourceReference,
      licenseReference: snapshot.rights.licenseReference,
      modelTrainingPermitted: snapshot.rights.modelTrainingPermitted
    }
  };
}