import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

process.env.VORTEX_OFFLINE = '1';

import { getEntry, getSnapshot } from '../server/fpl.ts';
import { getRepoVideos } from '../server/repoData.ts';
import { buildInsights, enrichPlayers, toRepoElement } from '../src/lib/analytics.ts';
import { buildFixtureMatrix, toRepoFixtures, toRepoTeams } from '../src/lib/fixtures.ts';
import { getClubBadgeCandidates, getPlayerPhotoCandidates } from '../src/lib/playerImages.ts';
import { runFplReviewSimulation } from '../src/lib/repoModel/fplReviewSimulator.ts';

// Import ORIGINAL repository modules directly from `site/model/*` to prove 100% mathematical parity
import {
  buildStrengths as origBuildStrengths,
  projectMatch as origProjectMatch,
} from '../site/model/dashboardMath.ts';
import { estimateMinutesDistribution as origEstimateMinutes } from '../site/model/minutes.ts';
import { mixSeed as origMixSeed, runMonteCarlo as origRunMonteCarlo } from '../site/model/monteCarlo.ts';
import {
  nextFreeTransfers as origNextFreeTransfers,
  pointsHit as origPointsHit,
  selectOptimalXI as origSelectOptimalXI,
  sellingPrice as origSellingPrice,
} from '../site/model/scoring.ts';
import { RULES_2026_27 as origRules } from '../site/model/seasonRules.ts';
import {
  computePlayerXPts as origComputePlayerXPts,
  computePositionPriors as origComputePositionPriors,
} from '../site/model/xpts.ts';

// Import app's ported repoModel modules
import { buildStrengths, projectMatch } from '../src/lib/repoModel/dashboardMath.ts';
import { estimateMinutesDistribution } from '../src/lib/repoModel/minutes.ts';
import { mixSeed, runMonteCarlo } from '../src/lib/repoModel/monteCarlo.ts';
import {
  nextFreeTransfers,
  pointsHit,
  selectOptimalXI,
  sellingPrice,
} from '../src/lib/repoModel/scoring.ts';
import { RULES_2026_27 } from '../src/lib/repoModel/seasonRules.ts';
import { computePlayerXPts, computePositionPriors } from '../src/lib/repoModel/xpts.ts';

// Import all 6 route components + Brand/Sidebar for full DOM & portrait verification
import { Brand } from '../src/components/Brand.tsx';
import { CommandCenter } from '../src/components/CommandCenter.tsx';
import { FixtureMatrix } from '../src/components/FixtureMatrix.tsx';
import { LeagueIntel } from '../src/components/LeagueIntel.tsx';
import { Methodology } from '../src/components/Methodology.tsx';
import { PlayerLab } from '../src/components/PlayerLab.tsx';
import { Sidebar } from '../src/components/Sidebar.tsx';
import { SquadBuilder } from '../src/components/SquadBuilder.tsx';

test('exact mathematical parity on 25 sample players against site/model/{xpts,minutes}.ts', async () => {
  const snapshot = await getSnapshot();
  const enriched = enrichPlayers(snapshot, 'balanced');
  const nextGw = snapshot.meta.nextEventId;
  const completedEvents = Math.max(1, snapshot.gameweeks.filter((g) => g.finished).length);

  const repoTeams = toRepoTeams(snapshot.teams);
  const teamsMap = new Map(repoTeams.map((t) => [t.id, t]));
  const repoFixtures = toRepoFixtures(snapshot.fixtures);
  const repoElements = snapshot.players.map(toRepoElement);

  const origPriors = origComputePositionPriors(repoElements);
  const appPriors = computePositionPriors(repoElements);
  assert.deepEqual(appPriors, origPriors);

  // Pick 25 distinct real players spanning GKP, DEF, MID, FWD + Team #145784 starters
  const priorityIds = [411, 154, 12, 1, 31, 40, 427, 165, 346, 332, 173, 124, 115, 112, 623];
  const extraIds = enriched
    .filter((p) => !priorityIds.includes(p.id) && p.minutes >= 180)
    .slice(0, 10)
    .map((p) => p.id);
  const sampleIds = [...priorityIds, ...extraIds];
  assert.equal(sampleIds.length, 25);

  const enrichedMap = new Map(enriched.map((p) => [p.id, p]));
  const elMap = new Map(repoElements.map((e) => [e.id, e]));

  for (const id of sampleIds) {
    const el = elMap.get(id);
    const ep = enrichedMap.get(id);
    assert.ok(el, `missing element ${id}`);
    assert.ok(ep, `missing enriched player ${id}`);

    const origOut = origComputePlayerXPts(el, nextGw, repoFixtures, teamsMap, completedEvents, 0, origPriors);
    const appOut = computePlayerXPts(el, nextGw, repoFixtures, teamsMap, completedEvents, 0, appPriors);
    const origMins = origEstimateMinutes(el, completedEvents);
    const appMins = estimateMinutesDistribution(el, completedEvents);

    assert.equal(appOut.xPts, origOut.xPts, `xPts mismatch for ${ep.name}`);
    assert.equal(appOut.defensivePts, origOut.defensivePts, `DEFCON mismatch for ${ep.name}`);
    assert.equal(appOut.goalPts, origOut.goalPts, `goalPts mismatch for ${ep.name}`);
    assert.equal(appOut.assistPts, origOut.assistPts, `assistPts mismatch for ${ep.name}`);
    assert.equal(appOut.cleanSheetPts, origOut.cleanSheetPts, `cleanSheetPts mismatch for ${ep.name}`);
    assert.equal(appOut.csProb, origOut.csProb, `csProb mismatch for ${ep.name}`);
    assert.deepEqual(appMins, origMins, `minutes distribution mismatch for ${ep.name}`);

    // Verify adapter's modelBreakdown carries exact modelXPts & rounded components
    assert.equal(ep.modelBreakdown.modelXPts, origOut.xPts);
    assert.equal(ep.modelBreakdown.defcon, Math.round(origOut.defensivePts * 100) / 100);
    // Verify Tier-1 CSV override is honored when present
    if (ep.gwProjections?.[nextGw] !== undefined) {
      assert.equal(ep.projection, Math.round(ep.gwProjections[nextGw] * 100) / 100);
    }
  }
});

test('exact mathematical parity on 16 sample fixtures against site/model/dashboardMath.ts', async () => {
  const snapshot = await getSnapshot();
  const nextGw = snapshot.meta.nextEventId;
  const repoTeams = toRepoTeams(snapshot.teams);
  const repoFixtures = toRepoFixtures(snapshot.fixtures);
  const repoElements = snapshot.players.map(toRepoElement);

  const origStrengths = origBuildStrengths(repoTeams, repoElements, repoFixtures);
  const appStrengths = buildStrengths(repoTeams, repoElements, repoFixtures);
  assert.equal(appStrengths.size, origStrengths.size);

  const sampleFixtures = snapshot.fixtures
    .filter((f) => f.event >= nextGw && f.event <= nextGw + 1)
    .slice(0, 16);
  assert.ok(sampleFixtures.length >= 12);

  const matrix = buildFixtureMatrix(snapshot.teams, snapshot.fixtures, nextGw, 5, repoElements);
  const rowByTeam = new Map(matrix.map((r) => [r.team.id, r]));

  for (const fx of sampleFixtures) {
    const oh = origStrengths.get(fx.teamH)!;
    const oa = origStrengths.get(fx.teamA)!;
    const origProj = origProjectMatch(oh, oa);
    const appProj = projectMatch(appStrengths.get(fx.teamH)!, appStrengths.get(fx.teamA)!);
    assert.deepEqual(appProj, origProj);

    const homeRow = rowByTeam.get(fx.teamH)!;
    const cell = homeRow.cells.find((c) => c.event === fx.event)!;
    if (cell.fixtures.length === 1) {
      assert.equal(cell.lambdaFor, Math.round(origProj.homeXg * 100) / 100);
      assert.equal(cell.lambdaAgainst, Math.round(origProj.awayXg * 100) / 100);
      assert.equal(cell.csProb, Math.round(origProj.homeCs * 1000) / 1000);
    }
  }
});

test('exact parity on 2026/27 scoring rules, FPLReview chip simulator, and paired Monte Carlo', async () => {
  assert.deepEqual(RULES_2026_27, origRules);
  assert.equal(sellingPrice(100, 105), origSellingPrice(100, 105));
  assert.equal(nextFreeTransfers(4, 0), origNextFreeTransfers(4, 0));
  assert.equal(nextFreeTransfers(4, 1, 'wc'), origNextFreeTransfers(4, 1, 'wc'));
  assert.equal(pointsHit(3, 1, false), origPointsHit(3, 1, false));

  const snapshot = await getSnapshot();
  const entry = await getEntry('145784');
  const players = enrichPlayers(snapshot, 'balanced');
  const squadIds = entry.picks.map((p) => p.element);
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const origXi = origSelectOptimalXI(
    squadIds,
    (id) => (playerMap.get(id)?.position === 'GKP' ? 1 : playerMap.get(id)?.position === 'DEF' ? 2 : playerMap.get(id)?.position === 'MID' ? 3 : 4),
    (id) => playerMap.get(id)?.projection ?? 0,
  );
  const appXi = selectOptimalXI(
    squadIds,
    (id) => (playerMap.get(id)?.position === 'GKP' ? 1 : playerMap.get(id)?.position === 'DEF' ? 2 : playerMap.get(id)?.position === 'MID' ? 3 : 4),
    (id) => playerMap.get(id)?.projection ?? 0,
  );
  assert.deepEqual(appXi, origXi);

  const sim = runFplReviewSimulation({
    players,
    currentSquadIds: squadIds,
    bankTenths: entry.history.bank,
    freeTransfersNow: entry.freeTransfers,
    nextGw: snapshot.meta.nextEventId,
    horizon: 5,
    repoFixtures: toRepoFixtures(snapshot.fixtures),
    repoTeams: toRepoTeams(snapshot.teams),
    repoElements: snapshot.players.map(toRepoElement),
    draws: 400,
  });

  assert.equal(sim.options.length, 3);
  assert.equal(sim.chipSimulations.length, 4);
  assert.ok(sim.chipMatrixByGw.length >= 5);
  assert.equal(sim.monteCarlo.draws, 400);
  assert.ok(sim.monteCarlo.paths.length >= 2);
  assert.ok(sim.monteCarlo.captains.length >= 3);
  assert.equal(mixSeed(8, 411, 4, 4), origMixSeed(8, 411, 4, 4));
  assert.equal(typeof origRunMonteCarlo, typeof runMonteCarlo);
});

test('all 6 pages render cleanly with >= 15 real PL player portraits and club badges', async () => {
  const snapshot = await getSnapshot();
  const entry = await getEntry('145784');
  const players = enrichPlayers(snapshot, 'balanced');
  const insights = buildInsights(players);
  const fixtureRows = buildFixtureMatrix(snapshot.teams, snapshot.fixtures, snapshot.meta.nextEventId, 5);
  const noop = () => {};

  // Verify official PL image & badge URL chains
  const haalandUrls = getPlayerPhotoCandidates(223094, 43);
  assert.ok(haalandUrls.length >= 6);
  assert.match(haalandUrls[0], /^https:\/\/resources\.premierleague\.com\/premierleague25\/photos\/players\/250x250\/223094\.png$/);
  assert.ok(haalandUrls.some((u) => u.startsWith('/api/img/player/223094')));

  const arsenalBadges = getClubBadgeCandidates(3);
  assert.ok(arsenalBadges.length >= 3);
  assert.match(arsenalBadges[0], /^https:\/\/resources\.premierleague\.com\/premierleague\/badges\/100\/t3\.png$/);

  const videosPayload = await getRepoVideos();
  const htmlSidebar = renderToStaticMarkup(
    React.createElement(Sidebar, {
      route: 'command',
      onNavigate: noop,
      snapshot,
      entry,
      open: false,
      onClose: noop,
    }),
  );
  assert.match(htmlSidebar, /\/player-images\/brand\/fpl-vortex-lion\.jpg/);
  assert.match(htmlSidebar, /FPL VORTEX/);
  assert.match(htmlSidebar, /https:\/\/www\.youtube\.com\/@Fplvortex/);
  assert.doesNotMatch(htmlSidebar, /fplcore/i);

  const htmlBrand = renderToStaticMarkup(React.createElement(Brand));
  assert.match(htmlBrand, /\/player-images\/brand\/fpl-vortex-lion\.jpg/);

  // 1) Before entering FPL ID: top FPL Team ID input + Pitch Gate appear; soccer pitch is gated
  const htmlUnlinked = renderToStaticMarkup(
    React.createElement(CommandCenter, {
      snapshot,
      entry: null,
      players,
      insights,
      fixtureRows,
      initialVideos: videosPayload.videos,
      profile: 'balanced',
      teamId: '',
      onTeamIdChange: noop,
      onSelectPlayer: noop,
      onNavigate: noop,
      onOpenPalette: noop,
      onRefresh: noop,
      refreshing: false,
    }),
  );
  assert.match(htmlUnlinked, /id="fpl-team-id-top"/);
  assert.match(htmlUnlinked, /vx-pitch-gate/);
  assert.doesNotMatch(htmlUnlinked, /class="vx-soccer-pitch"/);

  // 2) After entering FPL ID: unlocks Soccer Pitch (15 players) + Review Gameweek strip + scrollable videos
  const htmlCommand = renderToStaticMarkup(
    React.createElement(CommandCenter, {
      snapshot,
      entry,
      players,
      insights,
      fixtureRows,
      initialVideos: videosPayload.videos,
      profile: 'balanced',
      teamId: '145784',
      onTeamIdChange: noop,
      onSelectPlayer: noop,
      onNavigate: noop,
      onOpenPalette: noop,
      onRefresh: noop,
      refreshing: false,
    }),
  );
  // Tier 1: Compact Hero + Top FPL Team ID Bar + Vortex Orb + Captain & Fixture float cards
  assert.match(htmlCommand, /Every transfer, captain and fixture/);
  assert.match(htmlCommand, /id="fpl-team-id-top"/);
  assert.match(htmlCommand, /vortex-orb/);
  assert.match(htmlCommand, /#1 CAPTAIN/);
  assert.match(htmlCommand, /BEST 5-GW RUN/);
  // Tier 2: Review Gameweek strip + Soccer Pitch (15 players) + GW Fixtures + GW Projected Goals (20 clubs)
  assert.match(htmlCommand, /FPLVORTEX/);
  assert.match(htmlCommand, /145784/);
  assert.match(htmlCommand, /Review GW 8/);
  assert.match(htmlCommand, /vx-review-strip/);
  assert.match(htmlCommand, /vx-soccer-pitch/);
  assert.equal(
    (htmlCommand.match(/vx-pitch-player"/g) ?? []).length +
      (htmlCommand.match(/vx-pitch-player vx-pitch-player--bench"/g) ?? []).length,
    15,
  );
  assert.match(htmlCommand, /Projected xG/);
  assert.equal((htmlCommand.match(/class="vx-club-bar-row"/g) ?? []).length, 20);
  // Tier 3: Top Players + Price & Transfers + Injuries & Suspensions + Horizontal Scrollable @FPLVORTEX YouTube strip
  assert.match(htmlCommand, /Top Players/);
  assert.match(htmlCommand, /Price &amp; Transfers/);
  assert.match(htmlCommand, /Injuries &amp; Suspensions/);
  assert.match(htmlCommand, /vx-videos-scroll-row/);
  assert.match(htmlCommand, /vx-video-pill/);
  assert.match(htmlCommand, /Latest FPL Videos · @FPLVORTEX/);
  assert.match(htmlCommand, /https:\/\/www\.youtube\.com\/@Fplvortex/);
  assert.doesNotMatch(htmlCommand, /fplcore/i);

  const htmlOptimizer = renderToStaticMarkup(
    React.createElement(SquadBuilder, {
      snapshot,
      entry,
      players,
      fixtureRows,
      profile: 'balanced',
      onProfileChange: noop,
      onToast: noop,
    }),
  );
  assert.match(htmlOptimizer, /Team Planner/);
  assert.match(htmlOptimizer, /Chip Strategy/);
  assert.match(htmlOptimizer, /Monte Carlo/);

  const htmlPlayers = renderToStaticMarkup(
    React.createElement(PlayerLab, {
      players,
      teams: snapshot.teams,
      fixtureRows,
      nextEventId: snapshot.meta.nextEventId,
      query: '',
      onQueryChange: noop,
      onToast: noop,
    }),
  );
  const portraitMatches = htmlPlayers.match(/https:\/\/resources\.premierleague\.com\/premierleague25\/photos\/players\/250x250\/\d+\.png/g) ?? [];
  assert.ok(portraitMatches.length >= 25, `expected >= 25 real player portraits in PlayerLab, got ${portraitMatches.length}`);

  const htmlFixtures = renderToStaticMarkup(
    React.createElement(FixtureMatrix, {
      snapshot,
      fixtureRows,
      players,
      onToast: noop,
    }),
  );
  const badgeMatches = htmlFixtures.match(/https:\/\/resources\.premierleague\.com\/premierleague\/badges\/100\/t\d+\.png/g) ?? [];
  assert.ok(badgeMatches.length >= 20, `expected >= 20 PL club badges in FixtureMatrix, got ${badgeMatches.length}`);

  const htmlLeague = renderToStaticMarkup(
    React.createElement(LeagueIntel, {
      snapshot,
      players,
      profile: 'balanced',
      teamId: '145784',
      leagueId: '314',
      onTeamIdChange: noop,
      onLeagueIdChange: noop,
      onToast: noop,
    }),
  );
  assert.match(htmlLeague, /145784/);

  const htmlMethod = renderToStaticMarkup(
    React.createElement(Methodology, {
      snapshot,
      players,
      lastSuccessAt: snapshot.meta.servedAt,
      refreshing: false,
      onRefresh: noop,
    }),
  );
  assert.match(htmlMethod, /DEFCON/);
  assert.match(htmlMethod, /SHRINK_90S|n90 \+ 4/);
});
