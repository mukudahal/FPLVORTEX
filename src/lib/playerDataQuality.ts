import type { FplTeam, Player, PlayerDataQuality, PlayerDataQualitySource } from './types';

type RawRow = Record<string, unknown>;

const FPL_STATUSES = new Set(['a', 'd', 'i', 's', 'u', 'n']);

function validPositiveInteger(value: unknown): number | null {
  const numeric = typeof value === 'number' || typeof value === 'string' && value.trim()
    ? Number(value) : Number.NaN;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function validNumeric(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Audit original upstream values before normalization can turn missing fields into zero.
 * An import timestamp does NOT certify when FPL last updated an individual field.
 */
export function auditPlayerData(
  rows: readonly RawRow[],
  teams: readonly RawRow[],
  observedAt: string,
  source: PlayerDataQualitySource = 'official-bootstrap',
): PlayerDataQuality {
  const knownTeams = new Set(teams.map(t => validPositiveInteger(t.id)).filter((id): id is number => id !== null));
  const seen = new Set<number>();
  let validIds = 0;
  let uniqueIds = 0;
  let validTeamRefs = 0;
  let validPrices = 0;
  let validOwnership = 0;
  let validStatuses = 0;
  let validChanceValues = 0;
  let newsItems = 0;
  let datedNewsItems = 0;
  let undatedNewsItems = 0;
  let invalidNewsDates = 0;
  let latestNewsAddedAt: string | null = null;

  for (const row of rows) {
    const id = validPositiveInteger(row.id);
    if (id !== null) {
      validIds++;
      if (!seen.has(id)) { uniqueIds++; seen.add(id); }
    }
    if (validPositiveInteger(row.team) !== null && knownTeams.has(Number(row.team))) validTeamRefs++;
    const price = validNumeric(row.now_cost);
    if (price !== null && Number.isInteger(price) && price > 0) validPrices++;
    const owned = validNumeric(row.selected_by_percent);
    if (owned !== null && owned >= 0 && owned <= 100) validOwnership++;
    if (typeof row.status === 'string' && FPL_STATUSES.has(row.status)) validStatuses++;
    const chance = row.chance_of_playing_next_round;
    if (chance === null || chance === undefined ||
      (validNumeric(chance) !== null && validNumeric(chance)! >= 0 && validNumeric(chance)! <= 100)) {
      validChanceValues++;
    }

    const news = typeof row.news === 'string' ? row.news.trim() : '';
    if (!news) continue; // No news is ordinary; not evidence of a missing record.
    newsItems++;
    const newsAdded = row.news_added;
    if (newsAdded === null || newsAdded === undefined || newsAdded === '') {
      undatedNewsItems++;
      continue;
    }
    const timestamp = typeof newsAdded === 'string' ? Date.parse(newsAdded) : Number.NaN;
    const observationTime = Date.parse(observedAt);
    if (!Number.isFinite(timestamp) ||
      (Number.isFinite(observationTime) && timestamp > observationTime + 60_000)) {
      invalidNewsDates++;
    } else {
      datedNewsItems++;
      const iso = new Date(timestamp).toISOString();
      if (!latestNewsAddedAt || iso > latestNewsAddedAt) latestNewsAddedAt = iso;
    }
  }

  const total = rows.length;
  const completeRequiredFields = total > 0 &&
    [validIds, uniqueIds, validTeamRefs, validPrices, validOwnership, validStatuses, validChanceValues]
      .every(count => count === total);
  return {
    source,
    status: source === 'normalized-snapshot' ? 'unverified' : completeRequiredFields ? 'checked' : 'incomplete',
    observedAt,
    sourceUpdatedAt: null,
    playerCount: total,
    validIds,
    uniqueIds,
    validTeamRefs,
    validPrices,
    validOwnership,
    validStatuses,
    validChanceValues,
    newsItems,
    datedNewsItems,
    undatedNewsItems,
    invalidNewsDates,
    latestNewsAddedAt,
  };
}

/** Static snapshots lack original input fields; inspect values without asserting raw completeness. */
export function auditNormalizedPlayers(
  players: readonly Player[],
  teams: readonly FplTeam[],
  observedAt: string,
): PlayerDataQuality {
  return auditPlayerData(players.map(player => ({
    id: player.id,
    team: player.teamId,
    now_cost: player.cost,
    selected_by_percent: player.ownership,
    status: player.status,
    chance_of_playing_next_round: player.chance,
    news: player.news,
    news_added: player.newsAdded ?? null,
  })), teams.map(team => ({ id: team.id })), observedAt, 'normalized-snapshot');
}

export function playerDataQualityNotice(audit: PlayerDataQuality | undefined): string {
  if (!audit) return 'Player data audit unavailable — raw field completeness not verified.';
  const coverage = [
    `IDs ${audit.validIds}/${audit.playerCount} (unique ${audit.uniqueIds})`,
    `club links ${audit.validTeamRefs}/${audit.playerCount}`,
    `prices ${audit.validPrices}/${audit.playerCount}`,
    `ownership ${audit.validOwnership}/${audit.playerCount}`,
    `statuses ${audit.validStatuses}/${audit.playerCount}`,
    `play chances ${audit.validChanceValues}/${audit.playerCount}`,
  ].join(' · ');
  const state = audit.status === 'unverified'
    ? 'Normalized fallback only — original FPL fields cannot be verified'
    : audit.status === 'checked'
      ? 'Raw FPL player fields validated (not a freshness guarantee)'
      : 'Incomplete/invalid raw player fields detected';
  const news = `news text present ${audit.newsItems}, timestamped ${audit.datedNewsItems}, undated ${audit.undatedNewsItems}, invalid dates ${audit.invalidNewsDates}`;
  return `Player data: ${state}. ${coverage}. ${news}. Snapshot observed: ${audit.observedAt || 'unknown'}; upstream per-field update time: unknown.`;
}
