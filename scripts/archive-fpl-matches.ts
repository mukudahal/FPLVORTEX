import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Snapshot } from '../src/lib/types.ts';

interface MatchVersion {
  observedAt: string;
  event: number;
  kickoffTime: string;
  homeGoals: number;
  awayGoals: number;
}
interface ArchivedMatch {
  fixtureId: number;
  homeTeamCode: number;
  awayTeamCode: number;
  versions: MatchVersion[];
}
export interface MatchArchive {
  schemaVersion: 1;
  season: string;
  source: 'official-fpl';
  matches: ArchivedMatch[];
}
const positiveInteger = (v: number) => Number.isSafeInteger(v) && v > 0;
const validScore = (v: number | null): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const validDate = (v: string) => /(?:Z|[+-]\d\d:\d\d)$/i.test(v) && Number.isFinite(Date.parse(v));

/** Merge observations without inventing historical availability or double-counting fixtures. */
export function mergeMatchArchive(snapshot: Snapshot, previous?: MatchArchive): MatchArchive {
  const { season, generatedAt, upstreamOk, stale } = snapshot.meta;
  if (!/^\d{4}\/\d{2}$/.test(season) || Number(season.slice(5)) !== (Number(season.slice(0, 4)) + 1) % 100) throw new Error('Invalid season');
  if (!upstreamOk || stale || !validDate(generatedAt)) throw new Error('Only healthy, timestamped snapshots may be archived');
  if (previous && (previous.schemaVersion !== 1 || previous.season !== season || previous.source !== 'official-fpl' || !Array.isArray(previous.matches))) throw new Error('Invalid or mismatched archive');
  const matches = structuredClone(previous?.matches ?? []);
  const byId = new Map<number, ArchivedMatch>();
  const pairs = new Set<string>();
  for (const match of matches) {
    const pair = `${match.homeTeamCode}:${match.awayTeamCode}`;
    if (!positiveInteger(match.fixtureId) || !positiveInteger(match.homeTeamCode) || !positiveInteger(match.awayTeamCode) || match.homeTeamCode === match.awayTeamCode || byId.has(match.fixtureId) || pairs.has(pair) || !match.versions.length) throw new Error('Invalid or duplicate archived fixture');
    let last = -Infinity;
    for (const v of match.versions) {
      const time = Date.parse(v.observedAt);
      if (!validDate(v.observedAt) || !validDate(v.kickoffTime) || time <= last || time < Date.parse(v.kickoffTime) || !validScore(v.homeGoals) || !validScore(v.awayGoals) || !Number.isSafeInteger(v.event) || v.event < 0) throw new Error('Invalid archived version');
      last = time;
    }
    pairs.add(pair);
    byId.set(match.fixtureId, match);
  }
  const latestObservedAt = matches.flatMap(match => match.versions.map(version => Date.parse(version.observedAt))).reduce((a, b) => Math.max(a, b), -Infinity);
  if (Date.parse(generatedAt) < latestObservedAt) throw new Error('Older snapshot cannot update archive');
  const teams = new Map<number, number>();
  for (const team of snapshot.teams) {
    if (!positiveInteger(team.id) || !positiveInteger(team.code) || teams.has(team.id) || [...teams.values()].includes(team.code)) throw new Error('Invalid or duplicate team');
    teams.set(team.id, team.code);
  }
  const seen = new Set<number>();
  for (const fixture of snapshot.fixtures) {
    if (!positiveInteger(fixture.id) || seen.has(fixture.id)) throw new Error('Invalid or duplicate fixture ID');
    seen.add(fixture.id);
    if (!fixture.finished) continue;
    const home = teams.get(fixture.teamH), away = teams.get(fixture.teamA);
    if (!home || !away || home === away || !fixture.kickoffTime || !validDate(fixture.kickoffTime) || Date.parse(generatedAt) < Date.parse(fixture.kickoffTime) || !validScore(fixture.teamHScore) || !validScore(fixture.teamAScore) || !Number.isSafeInteger(fixture.event) || fixture.event < 0) throw new Error(`Invalid finished fixture ${fixture.id}`);
    const next: MatchVersion = { observedAt: generatedAt, event: fixture.event, kickoffTime: fixture.kickoffTime, homeGoals: fixture.teamHScore, awayGoals: fixture.teamAScore };
    const match = byId.get(fixture.id);
    if (match) {
      if (match.homeTeamCode !== home || match.awayTeamCode !== away) throw new Error(`Teams changed for fixture ${fixture.id}`);
      const last = match.versions.at(-1)!;
      if (Date.parse(generatedAt) < Date.parse(last.observedAt)) throw new Error('Older snapshot cannot update archive');
      const changed = last.event !== next.event || last.kickoffTime !== next.kickoffTime || last.homeGoals !== next.homeGoals || last.awayGoals !== next.awayGoals;
      if (changed) {
        if (Date.parse(generatedAt) === Date.parse(last.observedAt)) throw new Error('Conflicting observation timestamp');
        match.versions.push(next);
      }
    } else {
      const pair = `${home}:${away}`;
      if (pairs.has(pair)) throw new Error(`Duplicate team pairing: ${pair}`);
      const added = { fixtureId: fixture.id, homeTeamCode: home, awayTeamCode: away, versions: [next] };
      pairs.add(pair); byId.set(fixture.id, added); matches.push(added);
    }
  }
  matches.sort((a, b) => a.fixtureId - b.fixtureId);
  return { schemaVersion: 1, season, source: 'official-fpl', matches };
}

async function main() {
  const snapshotPath = process.env.VORTEX_SNAPSHOT_PATH ?? 'public/data/fpl-snapshot.json';
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as Snapshot;
  if (!/^\d{4}\/\d{2}$/.test(snapshot.meta?.season ?? '')) throw new Error('Invalid season');
  const directory = process.env.VORTEX_MATCH_ARCHIVE_DIR ?? 'data/fpl-match-history';
  const output = path.join(directory, `${snapshot.meta.season.replace('/', '-')}.json`);
  let previous: MatchArchive | undefined;
  try { previous = JSON.parse(await readFile(output, 'utf8')) as MatchArchive; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const archive = mergeMatchArchive(snapshot, previous);
  await mkdir(directory, { recursive: true });
  const temp = `${output}.tmp`;
  await writeFile(temp, `${JSON.stringify(archive, null, 2)}\n`);
  await rename(temp, output);
  console.log(`Archived ${archive.matches.length} unique completed matches for ${archive.season} in ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error('Match archive failed:', error); process.exitCode = 1; });
}
