import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Snapshot, HistoricalTeamStrength } from '../src/lib/types.ts';

interface Match { season: string; kickoff: string; home: number; away: number; homeGoals: number; awayGoals: number }
interface ArchiveVersion { observedAt: string; kickoffTime: string; homeGoals: number; awayGoals: number }
interface Archive { schemaVersion: number; season: string; source: string; matches: Array<{ homeTeamCode: number; awayTeamCode: number; versions: ArchiveVersion[] }> }
const HISTORY_DIR = process.env.VORTEX_MATCH_ARCHIVE_DIR ?? 'data/fpl-match-history';
const HALF_LIFE_DAYS = 365;
const SHRINK_MATCHES = 8;
const HOME_AVERAGE = 1.55;
const AWAY_AVERAGE = 1.25;
const validNum = (v: number) => Number.isFinite(v) && v >= 0;

/** Production-only provisional score model. This is not a historical backtest. */
export function historicalStrengths(snapshot: Snapshot, historical: Match[]): NonNullable<Snapshot['historicalTeamModel']> | null {
  const cutoff = Date.parse(snapshot.meta.generatedAt);
  if (!Number.isFinite(cutoff)) return null;
  const currentSeason = snapshot.meta.season.replace('/', '-');
  const teams = new Map(snapshot.teams.map(t => [t.id, t.code]));
  const unique = new Map<string, Match>();
  // Previous-season history only; current season always comes from the FPL snapshot.
  for (const match of historical) {
    const kickoff = Date.parse(match.kickoff);
    if (match.season >= currentSeason || !Number.isFinite(kickoff) || kickoff + 3 * 3600_000 > cutoff || !validNum(match.homeGoals) || !validNum(match.awayGoals) || !match.home || !match.away || match.home === match.away) continue;
    const key = `${match.season}:${match.home}:${match.away}`;
    if (unique.has(key)) throw new Error(`Duplicate historical match ${key}`);
    unique.set(key, match);
  }
  const currentKeys = new Set<string>();
  for (const f of snapshot.fixtures) {
    const home = teams.get(f.teamH), away = teams.get(f.teamA), kickoff = Date.parse(f.kickoffTime ?? '');
    if (!f.finished || !home || !away || home === away || !Number.isFinite(kickoff) || kickoff + 3 * 3600_000 > cutoff || f.teamHScore === null || f.teamAScore === null || !validNum(f.teamHScore) || !validNum(f.teamAScore)) continue;
    const key = `${currentSeason}:${home}:${away}`;
    if (currentKeys.has(key)) throw new Error(`Duplicate current-season match ${key}`);
    currentKeys.add(key);
    unique.set(key, { season: currentSeason, kickoff: f.kickoffTime!, home, away, homeGoals: f.teamHScore, awayGoals: f.teamAScore });
  }
  if (!unique.size) return null;
  const sums = new Map<number, { hW: number; aW: number; hFor: number; hAgainst: number; aFor: number; aAgainst: number }>();
  function forTeam(code: number) {
    const sum = sums.get(code) ?? { hW: 0, aW: 0, hFor: 0, hAgainst: 0, aFor: 0, aAgainst: 0 };
    sums.set(code, sum); return sum;
  }
  for (const m of unique.values()) {
    const days = (cutoff - Date.parse(m.kickoff)) / 86_400_000;
    const w = 2 ** (-days / HALF_LIFE_DAYS);
    const h = forTeam(m.home), a = forTeam(m.away);
    h.hW += w; h.hFor += w * m.homeGoals; h.hAgainst += w * m.awayGoals;
    a.aW += w; a.aFor += w * m.awayGoals; a.aAgainst += w * m.homeGoals;
  }
  const clamp = (x: number) => Math.max(0.55, Math.min(1.8, x));
  const strengths: Record<string, HistoricalTeamStrength> = {};
  for (const team of snapshot.teams) {
    const s = sums.get(team.code);
    if (!s || s.hW + s.aW < 0.1) continue;
    strengths[String(team.id)] = {
      atkH: clamp((s.hFor + SHRINK_MATCHES * HOME_AVERAGE) / ((s.hW + SHRINK_MATCHES) * HOME_AVERAGE)),
      defWeakH: clamp((s.hAgainst + SHRINK_MATCHES * AWAY_AVERAGE) / ((s.hW + SHRINK_MATCHES) * AWAY_AVERAGE)),
      atkA: clamp((s.aFor + SHRINK_MATCHES * AWAY_AVERAGE) / ((s.aW + SHRINK_MATCHES) * AWAY_AVERAGE)),
      defWeakA: clamp((s.aAgainst + SHRINK_MATCHES * HOME_AVERAGE) / ((s.aW + SHRINK_MATCHES) * HOME_AVERAGE)),
    };
  }
  return { method: 'historical-goals-v1', asOf: snapshot.meta.generatedAt, matches: unique.size, strengths };
}

async function readHistory(cutoff: number): Promise<Match[]> {
  const folder = path.resolve(process.cwd(), HISTORY_DIR);
  const csv = await readFile(path.join(folder, 'vaastav-2018-2026.csv'), 'utf8');
  const lines = csv.trim().split(/\r?\n/);
  if (lines.shift() !== 'season,source,source_match_id,gameweek,kickoff_utc,home_team_code,away_team_code,home_goals,away_goals,home_xg,away_xg') throw new Error('Unexpected history CSV format');
  const matches: Match[] = lines.map(line => {
    const c = line.split(',');
    if (c.length !== 11 || c[1] !== 'vaastav' || !c[5] || !c[6] || !c[7] || !c[8]) throw new Error('Invalid historical CSV row');
    return { season: c[0], kickoff: c[4], home: Number(c[5]), away: Number(c[6]), homeGoals: Number(c[7]), awayGoals: Number(c[8]) };
  });
  for (const name of await readdir(folder)) {
    if (!/^\d{4}-\d{2}\.json$/.test(name)) continue;
    const archive = JSON.parse(await readFile(path.join(folder, name), 'utf8')) as Archive;
    if (archive.schemaVersion !== 1 || archive.source !== 'official-fpl' || !Array.isArray(archive.matches) || `${archive.season.replace('/', '-')}.json` !== name) throw new Error(`Invalid match archive ${name}`);
    for (const row of archive.matches) {
      const version = [...row.versions].filter(v => Number.isFinite(Date.parse(v.observedAt)) && Date.parse(v.observedAt) <= cutoff).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
      if (version) matches.push({ season: archive.season.replace('/', '-'), kickoff: version.kickoffTime, home: row.homeTeamCode, away: row.awayTeamCode, homeGoals: version.homeGoals, awayGoals: version.awayGoals });
    }
  }
  return matches;
}

export async function enrichWithMatchHistory(snapshot: Snapshot): Promise<Snapshot> {
  try {
    const history = await readHistory(Date.parse(snapshot.meta.generatedAt));
    const model = historicalStrengths(snapshot, history);
    if (model) return { ...snapshot, historicalTeamModel: model };
    const { historicalTeamModel: _ignored, ...rest } = snapshot;
    return rest;
  } catch (error) {
    console.warn('[match-history] unavailable, using existing team model:', error instanceof Error ? error.message : error);
    const { historicalTeamModel: _ignored, ...rest } = snapshot;
    return rest;
  }
}
