import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { getEntry, getHealth, getLeague, getSnapshot } from '../server/fpl.ts';
import {
  enrichSnapshotWithRepoData,
  getRepoBenchmarks,
  getRepoVideos,
  REPO_SEASON_RULES_2026_27,
} from '../server/repoData.ts';
import type { Snapshot } from '../src/lib/types.ts';

test('loads primary repository benchmark CSV and enriches snapshot players', async () => {
  const benchmarks = await getRepoBenchmarks(9);
  assert.equal(benchmarks.count, 667);
  assert.deepEqual(benchmarks.horizonEvents, [9, 10, 11, 12, 13]);
  assert.ok(benchmarks.players[0].expectedPoints > 5);

  const rawSnapshot = JSON.parse(await readFile(path.resolve(process.cwd(), 'public/data/fpl-snapshot.json'), 'utf8')) as Snapshot;
  const enrichedSnapshot = await enrichSnapshotWithRepoData(rawSnapshot);
  assert.equal(enrichedSnapshot.meta.repoData?.benchmarkPlayers, 667);
  assert.equal(enrichedSnapshot.meta.repoData?.configuredEntryId, 145784);
  assert.equal(enrichedSnapshot.meta.repoData?.seasonRules, REPO_SEASON_RULES_2026_27.season);

  const haaland = enrichedSnapshot.players.find((player) => player.name === 'Haaland');
  assert.ok(haaland);
  assert.ok((haaland.repoExpectedMinutes ?? 0) > 70);
  assert.ok((haaland.repoHorizon5Xpts ?? 0) > 25);
});

test('loads @FPLVORTEX channel briefings with repository fallback', async () => {
  const videos = await getRepoVideos();
  assert.equal(videos.channelId, 'UCDU7nEIN72xoiR3NtxCT6CQ');
  assert.ok(videos.videos.length >= 25);
  assert.match(videos.videos[0].url, /^https:\/\/www\.youtube\.com\/watch\?v=/);
});

test('falls back cleanly to snapshot data for snapshot, entry, and classic league', async () => {
  const health = await getHealth();
  assert.equal(health.ok, true);
  assert.equal(health.players, 669);
  assert.equal(health.fixtures, 380);

  const snapshot = await getSnapshot();
  assert.equal(snapshot.players.length, 669);
  assert.ok(snapshot.meta.repoData);

  const exampleEntry = await getEntry('5112705');
  assert.equal(exampleEntry.id, 5112705);
  assert.equal(exampleEntry.teamName, 'shankhoose club fc');
  assert.equal(exampleEntry.picks.length, 15);
  assert.equal(exampleEntry.activeChip, 'bboost');
  assert.equal(exampleEntry.history.points, 120);
  assert.equal(exampleEntry.projectedPoints, 91.6);

  const repoEntry = await getEntry('145784');
  assert.equal(repoEntry.id, 145784);
  assert.equal(repoEntry.picks.length, 15);
  assert.equal(repoEntry.players.length, 15);

  const league = await getLeague('314');
  assert.equal(league.id, 314);
  assert.equal(league.name, 'Overall');
  assert.equal(league.standings.length, 50);
  assert.equal(league.standings[0].entryName, 'Jake Crow Sliced Jam');
  assert.equal(league.standings[0].total, 685);
});

test('preserves brand-kit font, tokens, and default dark theme configuration', async () => {
  const root = process.cwd();
  const fontStat = await stat(path.join(root, 'public/fonts/InterVariable.woff2'));
  const brandFontStat = await stat(path.join(root, 'brand-kit/fonts/InterVariable.woff2'));
  assert.equal(fontStat.size, brandFontStat.size);
  assert.ok(fontStat.size > 40_000);

  const tokensCss = await readFile(path.join(root, 'brand-kit/design-tokens.css'), 'utf8');
  assert.match(tokensCss, /--brand-mint:\s*#5BF5D6/i);
  assert.match(tokensCss, /--brand-violet:\s*#7772FF/i);
  assert.match(tokensCss, /--brand-pink:\s*#FF5BC8/i);

  const indexHtml = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.match(indexHtml, /<html[^>]+data-theme="dark"/);
  assert.match(indexHtml, /\/fonts\/InterVariable\.woff2/);

  const mainTsx = await readFile(path.join(root, 'src/main.tsx'), 'utf8');
  const tokensIdx = mainTsx.indexOf('../brand-kit/design-tokens.css');
  const stylesIdx = mainTsx.indexOf('./styles.css');
  assert.ok(tokensIdx !== -1 && stylesIdx !== -1 && tokensIdx < stylesIdx);
});
