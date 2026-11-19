import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

process.env.VORTEX_OFFLINE = '1';

import { getSnapshot } from '../server/fpl.ts';
import {
  matchQuotesToFixtures,
  parseEspnScoreboardOdds,
  parseFootballDataCsv,
  parseTheOddsApiEvents,
} from '../server/odds.ts';
import { CommandCenter } from '../src/components/CommandCenter.tsx';
import { buildInsights, enrichPlayers } from '../src/lib/analytics.ts';
import { buildFixtureMatrix } from '../src/lib/fixtures.ts';
import {
  americanToDecimal,
  canonicalClubKey,
  devigPower,
  poisson1x2Probs,
  poissonOverProb,
  solveImpliedMatchFromOdds,
} from '../src/lib/oddsMath.ts';

test('Power de-vigging and 1X2 + Over/Under 2.5 Poisson solver recover exact implied goals and CS%', () => {
  // Known true scoring intensities: Home = 2.10 goals, Away = 0.85 goals (Total = 2.95)
  const trueLambdaH = 2.10;
  const trueLambdaA = 0.85;
  const true1x2 = poisson1x2Probs(trueLambdaH, trueLambdaA);
  const trueOver25 = poissonOverProb(trueLambdaH + trueLambdaA, 2.5);
  const trueUnder25 = 1 - trueOver25;

  // Apply realistic 4.5% bookmaker margin via power shading (k = 1/1.065)
  const shade = 0.955;
  const oddsHome = 1 / Math.pow(true1x2.homeWin, shade);
  const oddsDraw = 1 / Math.pow(true1x2.draw, shade);
  const oddsAway = 1 / Math.pow(true1x2.awayWin, shade);
  const oddsOver = 1 / Math.pow(trueOver25, shade);
  const oddsUnder = 1 / Math.pow(trueUnder25, shade);

  const fair = devigPower([oddsHome, oddsDraw, oddsAway]);
  assert.ok(Math.abs(fair[0] + fair[1] + fair[2] - 1) < 1e-9);
  assert.ok(Math.abs(fair[0] - true1x2.homeWin) < 1e-4);

  const solved = solveImpliedMatchFromOdds({
    provider: 'the-odds-api',
    bookmaker: 'Pinnacle',
    homeTeam: 'Arsenal',
    awayTeam: 'Everton',
    oddsHome,
    oddsDraw,
    oddsAway,
    totalLine: 2.5,
    oddsOver,
    oddsUnder,
  });

  assert.ok(solved);
  assert.ok(Math.abs(solved.homeXg - trueLambdaH) < 0.015, `expected ~${trueLambdaH}, got ${solved.homeXg}`);
  assert.ok(Math.abs(solved.awayXg - trueLambdaA) < 0.015, `expected ~${trueLambdaA}, got ${solved.awayXg}`);
  assert.ok(Math.abs(solved.homeCs - Math.exp(-trueLambdaA)) < 0.008);
  assert.ok(Math.abs(solved.awayCs - Math.exp(-trueLambdaH)) < 0.008);
  assert.ok(solved.overround1x2 > 1.03);
});

test('2D 1X2-only Poisson solver and American moneyline conversion work cleanly without totals', () => {
  assert.ok(Math.abs((americanToDecimal(-200) ?? 0) - 1.5) < 1e-6);
  assert.ok(Math.abs((americanToDecimal(250) ?? 0) - 3.5) < 1e-6);

  const solved1x2Only = solveImpliedMatchFromOdds({
    provider: 'football-data',
    bookmaker: 'Market Avg',
    homeTeam: 'Manchester City',
    awayTeam: 'Tottenham Hotspur',
    oddsHome: 1.55,
    oddsDraw: 4.50,
    oddsAway: 5.40,
  });

  assert.ok(solved1x2Only);
  assert.ok(solved1x2Only.homeXg > solved1x2Only.awayXg);
  assert.ok(solved1x2Only.homeCs > solved1x2Only.awayCs);
  assert.equal(solved1x2Only.totalLine, null);
});

test('parses Football-Data CSV, The Odds API v4, and ESPN EPL odds and renders Live Betting Odds in UI', async () => {
  const snapshot = await getSnapshot();
  const nextGw = snapshot.meta.nextEventId;
  const gwFixtures = snapshot.fixtures.filter((f) => f.event === nextGw);
  assert.ok(gwFixtures.length >= 5);

  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));
  const fx0 = gwFixtures[0];
  const fx1 = gwFixtures[1];
  const fx2 = gwFixtures[2];

  const fdCsv = [
    'Div,Date,Time,HomeTeam,AwayTeam,PSH,PSD,PSA,P>2.5,P<2.5,AvgH,AvgD,AvgA',
    `E0,24/10/2026,15:00,${teamById.get(fx0.teamH)!.name},${teamById.get(fx0.teamA)!.name},1.72,3.95,4.85,1.76,2.14,1.70,3.90,4.80`,
  ].join('\n');
  const fdQuotes = parseFootballDataCsv(fdCsv);
  assert.equal(fdQuotes.length, 1);
  assert.equal(fdQuotes[0].bookmaker, 'Pinnacle');

  const oddsApiPayload = [
    {
      home_team: teamById.get(fx1.teamH)!.name,
      away_team: teamById.get(fx1.teamA)!.name,
      commence_time: fx1.kickoffTime,
      bookmakers: [
        {
          key: 'pinnacle',
          title: 'Pinnacle',
          markets: [
            {
              key: 'h2h',
              outcomes: [
                { name: teamById.get(fx1.teamH)!.name, price: 2.05 },
                { name: 'Draw', price: 3.60 },
                { name: teamById.get(fx1.teamA)!.name, price: 3.70 },
              ],
            },
            {
              key: 'totals',
              outcomes: [
                { name: 'Over', point: 2.5, price: 1.84 },
                { name: 'Under', point: 2.5, price: 2.02 },
              ],
            },
          ],
        },
      ],
    },
  ];
  const apiQuotes = parseTheOddsApiEvents(oddsApiPayload);
  assert.equal(apiQuotes.length, 1);
  assert.equal(apiQuotes[0].bookmaker, 'Pinnacle');

  const espnPayload = {
    events: [
      {
        date: fx2.kickoffTime,
        competitions: [
          {
            competitors: [
              { homeAway: 'home', team: { displayName: teamById.get(fx2.teamH)!.name } },
              { homeAway: 'away', team: { displayName: teamById.get(fx2.teamA)!.name } },
            ],
            odds: [
              {
                provider: { name: 'DraftKings' },
                overUnder: 2.5,
                overOdds: -120,
                underOdds: -105,
                homeTeamOdds: { moneyLine: -115 },
                awayTeamOdds: { moneyLine: 295 },
                drawOdds: { moneyLine: 265 },
              },
            ],
          },
        ],
      },
    ],
  };
  const espnQuotes = parseEspnScoreboardOdds(espnPayload);
  assert.equal(espnQuotes.length, 1);
  assert.equal(espnQuotes[0].bookmaker, 'DraftKings');

  // Verify EPL club alias normalization across bookmakers vs FPL names
  assert.equal(canonicalClubKey('Man City'), canonicalClubKey('Manchester City FC'));
  assert.equal(canonicalClubKey('Spurs'), canonicalClubKey('Tottenham Hotspur'));
  assert.equal(canonicalClubKey("Nott'm Forest"), canonicalClubKey('Nottingham Forest'));
  assert.equal(canonicalClubKey('Man Utd'), canonicalClubKey('Manchester United'));
  assert.equal(canonicalClubKey('Brighton'), canonicalClubKey('Brighton & Hove Albion'));

  // Attach quotes onto snapshot fixtures and verify UI renders Live Betting Odds
  const quotes = [
    { ...fdQuotes[0], kickoffTime: fx0.kickoffTime },
    ...apiQuotes,
    ...espnQuotes,
  ];
  const matched = matchQuotesToFixtures(snapshot.teams, snapshot.fixtures, quotes);
  assert.equal(matched.size, 3);

  const enrichedSnapshot = {
    ...snapshot,
    fixtures: snapshot.fixtures.map((f) => (matched.has(f.id) ? { ...f, marketOdds: matched.get(f.id)! } : f)),
  };
  const players = enrichPlayers(enrichedSnapshot, 'balanced');
  const insights = buildInsights(players);
  const fixtureRows = buildFixtureMatrix(enrichedSnapshot.teams, enrichedSnapshot.fixtures, nextGw, 5);
  const noop = () => {};

  const html = renderToStaticMarkup(
    React.createElement(CommandCenter, {
      snapshot: enrichedSnapshot,
      entry: null,
      players,
      insights,
      fixtureRows,
      profile: 'balanced',
      teamId: '',
      onTeamIdChange: noop,
      onSelectPlayer: noop,
      onNavigate: noop,
    }),
  );

  assert.doesNotMatch(html, /Market quotes:|Match dates \/ kickoff:/);
  assert.match(html, new RegExp(`aria-pressed="false">GW ${enrichedSnapshot.meta.currentEventId} Results</button>`));
  assert.match(html, new RegExp(`aria-pressed="true">GW ${nextGw} Projection</button>`));
  assert.match(html, /Implied Goals · Pinnacle/);
  assert.match(html, /VORTEX projected xG/);
  const goalsCard = html.match(/<article class="panel vx-card vx-card--goals"[\s\S]*?<\/article>/)?.[0];
  assert.ok(goalsCard);
  assert.doesNotMatch(goalsCard, /<footer|Market quotes \(|>Market Odds<|>Model</);
  assert.match(goalsCard, /aria-label="Forecast source"/);
  assert.match(goalsCard, /<option value="auto" selected="">Bookmaker when available<\/option>/);
  assert.match(goalsCard, /<option value="model">VORTEX estimates<\/option>/);
  const oddsSection = html.match(/<section class="vx-next-market"[\s\S]*?<\/section>/)?.[0];
  assert.ok(oddsSection);
  assert.match(oddsSection, /Model Market Odds/);
  assert.match(oddsSection, new RegExp(`>GW ${nextGw}<`));
  assert.match(oddsSection, /Model xG/);
  assert.match(oddsSection, /Market 1X2/);
  const expectedQuote = matched.get(fx0.id)!;
  const marketPrices = [expectedQuote.oddsHome, expectedQuote.oddsDraw, expectedQuote.oddsAway]
    .map(odd => odd.toFixed(2)).join(' / ');
  assert.ok(oddsSection.includes(marketPrices));
  assert.match(oddsSection, /Quote time unknown/);
  assert.match(oddsSection, /Unavailable/);
  assert.equal((oddsSection.match(/scope="row"/g) ?? []).length, gwFixtures.length);
  assert.match(html, /Bookmaker quote timestamp unknown/);

});

test('coverage reports upcoming fixtures separately from past market prices', async () => {
  const { oddsCoverage } = await import('../server/odds.ts');
  const { makeFixture } = await import('./helpers.ts');
  const past = makeFixture(1, 8, 1, 2);
  const next1 = makeFixture(2, 9, 1, 2);
  const next2 = makeFixture(3, 9, 1, 2);
  const quote = solveImpliedMatchFromOdds({ provider: 'football-data', bookmaker: 'example', homeTeam: 'A', awayTeam: 'B', oddsHome: 2, oddsDraw: 3.5, oddsAway: 4 })!;
  past.marketOdds = quote;
  assert.deepEqual(oddsCoverage([past, next1, next2], 9), { matched: 0, upcoming: 2, status: 'fallback' });
  next1.marketOdds = quote;
  assert.equal(oddsCoverage([past, next1, next2], 9).status, 'partial');
  next2.marketOdds = quote;
  assert.equal(oddsCoverage([past, next1, next2], 9).status, 'partial'); // 1X2 without totals or verified bookmaker timestamp is not "live"
  assert.equal(oddsCoverage([past], 9).status, 'fallback');
});

test('complete bookmaker odds are not labelled live without verified redisplay rights', async () => {
  const { oddsCoverage } = await import('../server/odds.ts');
  const { makeFixture } = await import('./helpers.ts');
  const fixture = makeFixture(9301, 9, 1, 2);
  const quotedAt = new Date().toISOString();
  fixture.marketOdds = {
    provider: 'the-odds-api',
    bookmaker: 'licensed-example',
    updatedAt: quotedAt,
    quoteTimeSource: 'bookmaker',
    retrievedAt: quotedAt,
    oddsHome: 2.1, oddsDraw: 3.2, oddsAway: 3.6,
    totalLine: 2.5, oddsOver: 1.88, oddsUnder: 1.98,
    homeWin: 0.47, draw: 0.28, awayWin: 0.25,
    homeXg: 1.4, awayXg: 1.2, homeCs: 0.3, awayCs: 0.2,
    overround1x2: 1.05,
  };
  assert.equal(oddsCoverage([fixture], 9).status, 'partial', 'Default rights unknown must not claim live');
  assert.equal(oddsCoverage([fixture], 9, false).status, 'partial');
  assert.equal(oddsCoverage([fixture], 9, true).status, 'live', 'Explicit rights and fresh complete quote permit live label');
  fixture.marketOdds = { ...fixture.marketOdds, quoteTimeSource: 'unknown' };
  assert.equal(oddsCoverage([fixture], 9, true).status, 'partial', 'Unknown quote age blocks live status');
});

test('football-data fallback totals use a complete pair from one source', () => {
  const csv = [
    'Div,Date,Time,HomeTeam,AwayTeam,PSH,PSD,PSA,P>2.5,P<2.5,Avg>2.5,Avg<2.5',
    'E0,31/10/2026,15:00,Arsenal,Chelsea,2.1,3.4,3.7,1.6,,1.85,2.00',
  ].join('\n');
  const result = parseFootballDataCsv(csv);
  assert.equal(result[0].oddsOver, 1.85);
  assert.equal(result[0].oddsUnder, 2);
});
