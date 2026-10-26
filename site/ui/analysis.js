import { gameweekPoints } from './gameweek-points.js';
import { playerAvailability } from './availability.js';

/** Pure gameweek analysis maths. No DOM access: the same functions run in the browser and in checks. */
export const POSITION_NAMES = {1:'GK',2:'DEF',3:'MID',4:'FWD'};
export const ANALYSIS_SORTS = ['contribution','points','minutes','forecast','name'];

const asArray = value => Array.isArray(value) ? value : [];
const numeric = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const sum = (rows, read) => rows.reduce((total, row) => total + (read(row) ?? 0), 0);

function liveStats(live) {
  return new Map(asArray(live).filter(entry => Number.isFinite(entry?.id)).map(entry => [entry.id, entry.stats ?? {}]));
}

function fixtureInfo(player, fixtures, teams, gameweek) {
  const matches = asArray(fixtures).filter(fixture => fixture?.event === gameweek && (fixture.team_h === player.team || fixture.team_a === player.team));
  const label = matches.map(fixture => {
    const home = fixture.team_h === player.team;
    const opponent = teams.get(home ? fixture.team_a : fixture.team_h)?.short_name ?? '?';
    return `${opponent} (${home ? 'H' : 'A'})`;
  }).join(', ') || 'BLANK';
  const difficulty = matches.length ? Math.max(...matches.map(fixture => numeric(fixture.team_h === player.team ? fixture.team_h_difficulty : fixture.team_a_difficulty) ?? 0)) : null;
  return {label, count: matches.length, difficulty: difficulty || null, blank: matches.length === 0, finished: matches.length > 0 && matches.every(fixture => fixture.finished || fixture.finished_provisional)};
}

/** Normalise a manager's 15 picks into rows with official live points and the next-GW model outlook. */
export function pickRows({picks, live, players, teams, fixtures, gameweek, forecasts}) {
  const stats = liveStats(live);
  const clubs = new Map(asArray(teams).filter(team => Number.isFinite(team?.id)).map(team => [team.id, team]));
  const catalogue = new Map(asArray(players).filter(player => Number.isFinite(player?.id)).map(player => [player.id, player]));
  return asArray(picks).flatMap((pick, index) => {
    const player = catalogue.get(pick?.element);
    if (!player) return [];
    const starter = Number(pick.position) <= 11;
    const multiplier = numeric(pick.multiplier) ?? (starter ? 1 : 0);
    const detail = stats.get(pick.element) ?? {};
    const points = numeric(detail.total_points);
    const minutes = numeric(detail.minutes);
    const forecast = forecasts?.get?.(pick.element) ?? null;
    return [{
      id: pick.element,
      player,
      name: player.web_name ?? `Player ${pick.element}`,
      club: clubs.get(player.team)?.short_name ?? '—',
      position: player.element_type,
      positionName: POSITION_NAMES[player.element_type] ?? '—',
      starter,
      captain: Boolean(pick.is_captain),
      vice: Boolean(pick.is_vice_captain),
      multiplier,
      slot: numeric(pick.position) ?? index + 1,
      minutes,
      points,
      contribution: points === null ? null : points * Math.max(0, multiplier),
      forecast,
      fixture: fixtureInfo(player, fixtures, clubs, gameweek),
      availability: playerAvailability(player),
      price: numeric(player.now_cost) === null ? null : numeric(player.now_cost) / 10,
    }];
  });
}

/** Sort with missing values last in either direction; never turn an unknown value into zero. */
export function sortAnalysisRows(rows, key = 'contribution', direction = -1) {
  if (!ANALYSIS_SORTS.includes(key)) throw new RangeError('Unsupported analysis sort');
  const value = row => key === 'name' ? row.name.toLowerCase() : key === 'forecast' ? (numeric(row.forecast?.xPts) ?? null) : (numeric(row[key]) ?? null);
  return [...asArray(rows)].sort((first, second) => {
    const left = value(first), right = value(second);
    if (left === null || right === null) return left === null && right === null ? first.id - second.id : left === null ? 1 : -1;
    return direction * (typeof left === 'string' ? left.localeCompare(right) : left - right) || first.id - second.id;
  });
}

/** Post-gameweek review: where the points came from, what was left on the bench, and form. */
export function analyzeGameweek({picks, live, players, teams, fixtures, gameweek, forecasts, forecastGameweek, history, event, officialPoints, transferCost = 0, rank, previousRank}) {
  const rows = pickRows({picks, live, players, teams, fixtures, gameweek, forecasts});
  const total = gameweekPoints({picks, live, players, fixtures, gameweek, event, officialPoints, transferCost});
  const starters = rows.filter(row => row.starter);
  const bench = rows.filter(row => !row.starter);
  const captain = rows.find(row => row.captain) ?? null;
  const vice = rows.find(row => row.vice) ?? null;
  const captainExtra = captain && captain.points !== null && captain.multiplier > 1 ? captain.points * (captain.multiplier - 1) : null;
  const benchUnusedRows = bench.filter(row => row.multiplier === 0);
  const benchUnused = benchUnusedRows.length && benchUnusedRows.every(row => row.points !== null) ? sum(benchUnusedRows, row => row.points) : null;
  const positions = [1, 2, 3, 4].map(position => {
    const group = starters.filter(row => row.position === position);
    return {position, label: POSITION_NAMES[position], count: group.length, points: sum(group, row => row.contribution), complete: group.length > 0 && group.every(row => row.contribution !== null)};
  });
  const scored = rows.filter(row => row.contribution !== null);
  const best = sortAnalysisRows(scored, 'contribution').slice(0, 3);
  const flagged = rows.filter(row => row.availability.flagged).sort((first, second) => (first.availability.severity === 'unavailable' ? 0 : 1) - (second.availability.severity === 'unavailable' ? 0 : 1) || first.id - second.id);
  const forecastPool = starters.filter(row => numeric(row.forecast?.xPts) !== null);
  const captainRadar = [...forecastPool].sort((first, second) => second.forecast.xPts - first.forecast.xPts || first.id - second.id).slice(0, 3);
  const timeline = asArray(history).filter(entry => Number.isInteger(entry?.event) && entry.event <= gameweek).sort((first, second) => first.event - second.event);
  const current = timeline.find(entry => entry.event === gameweek) ?? null;
  const previous = timeline.find(entry => entry.event === gameweek - 1) ?? null;
  const derivedRank = numeric(current?.overall_rank) ?? numeric(rank);
  const derivedPreviousRank = numeric(previous?.overall_rank) ?? numeric(previousRank);
  const average = numeric(event?.average_entry_score);
  return {
    rows, starters, bench, total, average,
    vsAverage: total !== null && average !== null ? total - average : null,
    captain, vice, captainExtra,
    benchUnused,
    benchBoost: bench.some(row => row.multiplier > 0),
    benchCount: bench.length,
    positions,
    positionTotal: sum(positions.filter(group => group.complete), group => group.points),
    positionsComplete: positions.every(group => group.complete),
    best,
    blanks: starters.filter(row => row.minutes === 0 && row.fixture.finished).length,
    used: starters.filter(row => (row.minutes ?? 0) > 0).length,
    formation: `${positions[1].count}-${positions[2].count}-${positions[3].count}`,
    hit: numeric(transferCost) ?? 0,
    rank: derivedRank,
    previousRank: derivedPreviousRank,
    rankChange: derivedRank !== null && derivedPreviousRank !== null ? derivedPreviousRank - derivedRank : null,
    form: timeline.slice(-5).map(entry => ({event: entry.event, points: numeric(entry.points), total: numeric(entry.total_points), rank: numeric(entry.overall_rank), gwRank: numeric(entry.rank)})),
    captainRadar,
    risks: flagged.slice(0, 6),
    forecastGameweek: numeric(forecastGameweek),
    complete: rows.length > 0 && scored.length === rows.length,
  };
}

function captainOf(rows) {
  return rows.find(row => row.captain) ?? null;
}

/** Head-to-head comparison of two public FPL teams for one gameweek. */
export function compareTeams({homePicks, awayPicks, live, players, teams, fixtures, gameweek, event, homeOfficialPoints, awayOfficialPoints, homeTransferCost = 0, awayTransferCost = 0, homeRank, awayRank, homeChip, awayChip}) {
  const homeRows = pickRows({picks: homePicks, live, players, teams, fixtures, gameweek});
  const awayRows = pickRows({picks: awayPicks, live, players, teams, fixtures, gameweek});
  const homeScore = gameweekPoints({picks: homePicks, live, players, fixtures, gameweek, event, officialPoints: homeOfficialPoints, transferCost: homeTransferCost});
  const awayScore = gameweekPoints({picks: awayPicks, live, players, fixtures, gameweek, event, officialPoints: awayOfficialPoints, transferCost: awayTransferCost});
  const awayIds = new Set(awayRows.map(row => row.id));
  const homeIds = new Set(homeRows.map(row => row.id));
  const shared = homeRows.filter(row => awayIds.has(row.id));
  const homeOnly = homeRows.filter(row => !awayIds.has(row.id));
  const awayOnly = awayRows.filter(row => !homeIds.has(row.id));
  const differentials = [...homeOnly, ...awayOnly];
  const contributionTotal = rows => rows.length && rows.every(row => row.contribution !== null) ? sum(rows, row => row.contribution) : null;
  const homeDiff = contributionTotal(homeOnly), awayDiff = contributionTotal(awayOnly);
  const homeCaptain = captainOf(homeRows), awayCaptain = captainOf(awayRows);
  const rankHome = numeric(homeRank), rankAway = numeric(awayRank);
  return {
    homeScore, awayScore,
    margin: homeScore !== null && awayScore !== null ? homeScore - awayScore : null,
    homeRows, awayRows, shared, homeOnly, awayOnly, differentials,
    homeCaptain, awayCaptain,
    captainsSame: Boolean(homeCaptain && awayCaptain && homeCaptain.id === awayCaptain.id),
    differentialPoints: homeDiff !== null && awayDiff !== null ? homeDiff - awayDiff : null,
    homeRank: rankHome, awayRank: rankAway,
    rankGap: rankHome !== null && rankAway !== null ? rankAway - rankHome : null,
    homeChip: typeof homeChip === 'string' ? homeChip : null,
    awayChip: typeof awayChip === 'string' ? awayChip : null,
  };
}
