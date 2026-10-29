import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

process.env.VORTEX_OFFLINE = '1';

import { getEntry, getHealth, getLeague, getSnapshot } from '../server/fpl.ts';
import {
  enrichSnapshotWithRepoData,
  getRepoBenchmarks,
  getRepoVideos,
  REPO_SEASON_RULES_2026_27,
} from '../server/repoData.ts';
import type { Snapshot } from '../src/lib/types.ts';

test('loads primary repository benchmark CSV (667 players) as Tier-1 data source', async () => {
  const benchmarks = await getRepoBenchmarks(8);
  assert.equal(benchmarks.count, 667);
  assert.deepEqual(benchmarks.horizonEvents, [8, 9, 10, 11, 12]);
  assert.ok((benchmarks.players[0].expectedPoints ?? 0) > 5);

  const rawSnapshot = JSON.parse(
    await readFile(path.resolve(process.cwd(), 'public/data/fpl-snapshot.json'), 'utf8'),
  ) as Snapshot;
  const enrichedSnapshot = await enrichSnapshotWithRepoData(rawSnapshot);
  assert.equal(enrichedSnapshot.players.length, 667);
  assert.equal(enrichedSnapshot.meta.exampleEntryId, null);
  assert.equal(enrichedSnapshot.meta.repoData?.benchmarkPlayers, 667);
  assert.equal(enrichedSnapshot.meta.repoData?.projectionFileDate, '2026-10-15');
  assert.deepEqual(enrichedSnapshot.meta.repoData?.projectionGameweeks, [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.equal(enrichedSnapshot.meta.repoData?.configuredEntryId, null);
  assert.equal(enrichedSnapshot.meta.repoData?.seasonRules, REPO_SEASON_RULES_2026_27.season);

  const haaland = enrichedSnapshot.players.find((player) => player.id === 411);
  assert.ok(haaland);
  assert.equal(haaland.name, 'Haaland');
  assert.equal(haaland.code, 223094);
  assert.ok((haaland.repoExpectedMinutes ?? 0) > 70);
  assert.ok((haaland.repoHorizon5Xpts ?? 0) > 25);
});

test('never backfills future imported xPts/xMins from GW16 or invents 5GW coverage', async () => {
  const beyond = await getRepoBenchmarks(17);
  assert.deepEqual(beyond.horizonEvents, [17, 18, 19, 20, 21]);
  assert.equal(beyond.count, 667);
  for (const row of beyond.players) {
    assert.equal(row.expectedPoints, null);
    assert.equal(row.expectedMinutes, null);
    assert.equal(row.horizon5Points, null);
  }

  const lastWeek = await getRepoBenchmarks(16);
  assert.ok(lastWeek.players.some(row => row.expectedPoints !== null));
  assert.ok(lastWeek.players.every(row => row.horizon5Points === null));

  const snapshot = JSON.parse(
    await readFile(path.resolve(process.cwd(), 'public/data/fpl-snapshot.json'), 'utf8'),
  ) as Snapshot;
  const future = structuredClone(snapshot);
  future.meta.nextEventId = 17;
  const futureEnriched = await enrichSnapshotWithRepoData(future);
  const haaland = futureEnriched.players.find(p => p.id === 411);
  assert.ok(haaland);
  assert.equal(haaland.repoBenchmarkXpts, null);
  assert.equal(haaland.repoExpectedMinutes, null);
  assert.equal(haaland.repoHorizon5Xpts, null);
  assert.equal(haaland.gwProjections?.[16], 7.91);
  assert.equal(haaland.gwProjections?.[17], undefined);

  const partial = structuredClone(snapshot);
  partial.meta.nextEventId = 15;
  const partialHaaland = (await enrichSnapshotWithRepoData(partial)).players.find(p => p.id === 411);
  assert.ok(partialHaaland);
  assert.ok((partialHaaland.repoBenchmarkXpts ?? 0) > 0);
  assert.equal(partialHaaland.repoHorizon5Xpts, null);
});

test('loads @FPLVORTEX channel briefings from site/ui/videos.json', async () => {
  const videos = await getRepoVideos();
  assert.equal(videos.channelId, 'UCDU7nEIN72xoiR3NtxCT6CQ');
  assert.ok(videos.videos.length >= 25);
  assert.match(videos.videos[0].url, /^https:\/\/www\.youtube\.com\/watch\?v=/);
});

test('keeps manager Team ID secret by default and serves offline demo entry & classic league 314 cleanly', async () => {
  const health = await getHealth();
  assert.equal(health.ok, true);
  assert.equal(health.players, 667);
  assert.equal(health.fixtures, 380);
  assert.equal(health.defaultEntryId, null);

  const snapshot = await getSnapshot();
  assert.equal(snapshot.players.length, 667);
  assert.equal(snapshot.meta.exampleEntryId, null);
  assert.ok(snapshot.meta.repoData);

  const demoEntry = await getEntry('999999');
  assert.equal(demoEntry.id, 999999);
  assert.equal(demoEntry.provenance?.kind, 'demo');
  assert.equal(demoEntry.provenance?.requestedIdVerified, false);
  assert.equal(demoEntry.teamName, 'Template XI');
  assert.equal(demoEntry.freeTransfers, 2);
  assert.equal(demoEntry.picks.length, 15);
  assert.equal(demoEntry.players.length, 15);
  assert.ok(demoEntry.picks.some((p) => p.element === 154 && p.isCaptain)); // Palmer [C]
  assert.ok(demoEntry.picks.some((p) => p.element === 411 && p.isViceCaptain)); // Haaland [V]

  const league = await getLeague('314');
  assert.equal(league.id, 314);
  assert.equal(league.name, 'Overall');
  assert.ok(league.standings.length >= 50);
});

test('invalid and unrelated team IDs never inherit the archived template squad', async () => {
  await assert.rejects(() => getEntry('0'), /valid positive numeric FPL Team ID/);
  await assert.rejects(() => getEntry('000999999'), /valid positive numeric FPL Team ID/);
  await assert.rejects(() => getEntry('234567'), /no matching verified archive exists/);
});

test('preserves brand-kit font, tokens, repo assets, and default dark theme configuration', async () => {
  const root = process.cwd();
  const fontStat = await stat(path.join(root, 'public/fonts/InterVariable.woff2'));
  const brandFontStat = await stat(path.join(root, 'brand-kit/fonts/InterVariable.woff2'));
  assert.equal(fontStat.size, brandFontStat.size);
  assert.ok(fontStat.size > 40_000);

  const lionStat = await stat(path.join(root, 'public/player-images/brand/fpl-vortex-lion.jpg'));
  assert.ok(lionStat.size > 10_000);

  const manifestRaw = JSON.parse(
    await readFile(path.join(root, 'public/player-images/player-image-manifest.json'), 'utf8'),
  );
  assert.equal(manifestRaw.playerCount, 667);
  assert.equal(manifestRaw.clubCount, 20);

  const tokensCss = await readFile(path.join(root, 'brand-kit/design-tokens.css'), 'utf8');
  assert.match(tokensCss, /--brand-mint:\s*#5bf5d6/i);
  assert.match(tokensCss, /--brand-violet:\s*#7772ff/i);
  assert.match(tokensCss, /--brand-pink:\s*#ff5bc8/i);
  assert.match(tokensCss, /--brand-amber:\s*#ffc66d/i);
  assert.match(tokensCss, /--brand-blue:\s*#65b8ff/i);
  assert.match(tokensCss, /--bg:\s*#070914/i);
  assert.match(tokensCss, /--bg:\s*#f4f6ff/i);
  assert.match(tokensCss, /--font:\s*'Inter Variable',\s*Inter,\s*sans-serif/);

  const appStylesCss = await readFile(path.join(root, 'src/styles.css'), 'utf8');
  assert.match(appStylesCss, /--brand-mint:\s*#5bf5d6/i);
  assert.match(appStylesCss, /--brand-violet:\s*#7772ff/i);
  assert.match(appStylesCss, /--brand-pink:\s*#ff5bc8/i);
  assert.match(appStylesCss, /--brand-amber:\s*#ffc66d/i);
  assert.match(appStylesCss, /--brand-blue:\s*#65b8ff/i);
  assert.match(appStylesCss, /--bg:\s*#070914/i);
  assert.match(appStylesCss, /:root\[data-theme="light"\][\s\S]*?--bg:\s*#f4f6ff/i);
  assert.match(appStylesCss, /--font:\s*'Inter Variable',\s*Inter,\s*sans-serif/);
  assert.match(appStylesCss, /body::after/);
  assert.match(appStylesCss, /\.vortex-theme-switch/);
  assert.match(appStylesCss, /\.vortex-route-pills/);

  const topbarTsx = await readFile(path.join(root, 'src/components/Topbar.tsx'), 'utf8');
  assert.match(topbarTsx, /vortex-theme-switch/);
  assert.match(topbarTsx, /<Moon\b/);
  assert.match(topbarTsx, /<Sun\b/);

  const indexHtml = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.match(indexHtml, /<html[^>]+data-theme="dark"/);
  assert.match(indexHtml, /\/fonts\/InterVariable\.woff2/);

  const mainTsx = await readFile(path.join(root, 'src/main.tsx'), 'utf8');
  const tokensIdx = mainTsx.indexOf('../brand-kit/design-tokens.css');
  const stylesIdx = mainTsx.indexOf('./styles.css');
  assert.ok(tokensIdx !== -1 && stylesIdx !== -1 && tokensIdx < stylesIdx);
});
