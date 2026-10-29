import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeFixtureForecasts, meanForecast, provisionalOpportunityIndices, overallDifficulty, difficultyColor } from '../src/lib/fixtureForecast.ts';
import type { Snapshot, FixtureMarketOdds } from '../src/lib/types.ts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerFixtureBlocks } from '../src/components/PlayerLab.tsx';
import type { FixtureCell } from '../src/lib/types.ts';

async function sample() {
  const snapshot = JSON.parse(await readFile('public/data/fpl-snapshot.json', 'utf8')) as Snapshot;
  const event = snapshot.meta.nextEventId;
  const fixture = snapshot.fixtures.find(f => f.event === event)!;
  fixture.marketOdds = { provider: 'the-odds-api', bookmaker: 'Test', updatedAt: '', homeXg: 2.4, awayXg: 0.8 } as FixtureMarketOdds;
  return { snapshot, event, fixture };
}

test('attack and defence indices are independent, bounded and easier for better opportunities', () => {
  const good = provisionalOpportunityIndices(2.4, .55), hard = provisionalOpportunityIndices(.5, .12);
  assert.ok(good.attackIndex < hard.attackIndex);
  assert.ok(good.defenceIndex < hard.defenceIndex);
  assert.equal(provisionalOpportunityIndices(10, 1).attackIndex, 1);
  assert.throws(() => provisionalOpportunityIndices(1, 2));
});

test('VORTEX projections ignore market prices; market data never falls back', async () => {
  const { snapshot, event, fixture } = await sample();
  const key = `${fixture.teamH}:${event}`;
  const vortex = makeFixtureForecasts(snapshot, 'vortex', [event]).get(key)![0];
  const market = makeFixtureForecasts(snapshot, 'market', [event]).get(key)![0];
  assert.ok(Math.abs(market.goals - 2.4) < 1e-6);
  assert.ok(Math.abs(market.cleanSheet - Math.exp(-.8)) < 1e-6);
  fixture.marketOdds = null;
  const noMarket = makeFixtureForecasts(snapshot, 'market', [event]).get(key) ?? [];
  assert.ok(!noMarket.some(x => x.fixture.id === fixture.id));
  const withoutOdds = makeFixtureForecasts(snapshot, 'vortex', [event]).get(key)![0];
  assert.equal(vortex.goals, withoutOdds.goals);
  assert.equal(vortex.cleanSheet, withoutOdds.cleanSheet);
});

test('averages count each forecast once and exclude blanks', async () => {
  const { snapshot, event, fixture } = await sample();
  const forecasts = makeFixtureForecasts(snapshot, 'vortex', [event]).get(`${fixture.teamH}:${event}`)!;
  assert.equal(meanForecast([], 'goals'), null);
  assert.equal(meanForecast([forecasts[0]], 'goals'), forecasts[0].goals);
  assert.ok(Math.abs(meanForecast([forecasts[0], { ...forecasts[0], goals: 3 }], 'goals')! - (forecasts[0].goals + 3) / 2) < 1e-10);
});

test('overall rating and shared colour agree across sources', () => {
  const a = { attackIndex: 2, defenceIndex: 4 };
  assert.equal(overallDifficulty(a), 3);
  assert.equal(difficultyColor(overallDifficulty(a)), difficultyColor(3));
  assert.notEqual(difficultyColor(1), difficultyColor(5));
});

test('fixture matrix has explicit light theme surfaces and compact desktop layout', async () => {
  const css = await readFile('src/styles.css', 'utf8');
  assert.match(css, /:root\[data-theme="light"\] \.fm-panel/);
  assert.match(css, /:root\[data-theme="light"\] \.fm-table/);
  assert.match(css, /:root\[data-theme="light"\] \.fm-dialog/);
  assert.match(css, /@media \(min-width: 701px\)[\s\S]*?\.fm-table th, \.fm-table td \{ padding: 2px 3px;/);
});

test('fixture matrix allows sideways scrolling in both forecast sources', async () => {
  const css = await readFile('src/styles.css', 'utf8');
  const component = await readFile('src/components/FixtureMatrix.tsx', 'utf8');
  assert.match(component, /fm-page--\$\{source\}/);
  assert.match(component, /320 \+ gws\.length \* 72/);
  assert.match(component, /aria-label="Fixture matrix, scroll sideways to see all gameweeks"/);
  assert.match(css, /\.player-table-scroll, \.fm-table-scroll \{[^}]*overflow-x: auto/);
  assert.match(css, /\.fm-table tbody tr, \.fm-page--market \.fm-table tbody tr \{ display: table-row/);
  assert.match(css, /\.fm-table thead \{ display: table-header-group/);
});


test('player fixture blocks show opponents and venues on separate lines, including doubles and blanks', async () => {
  const { snapshot, event, fixture } = await sample();
  const homeTeam = fixture.teamH;
  const other = snapshot.teams.find(team => team.id !== fixture.teamH && team.id !== fixture.teamA)!;
  const second = { ...fixture, id: fixture.id + 10000, teamH: other.id, teamA: homeTeam };
  const teamById = new Map(snapshot.teams.map(team => [team.id, team]));
  const forecasts = makeFixtureForecasts({ ...snapshot, fixtures: [...snapshot.fixtures, second] }, 'vortex', [event]);
  const cell: FixtureCell = { event, difficulty: 3, isBlank: false, isDouble: true, fixtures: [fixture, second], label: 'Double' };
  const html = renderToStaticMarkup(React.createElement(PlayerFixtureBlocks, { cell, teamId: homeTeam, teamById, forecasts }));
  assert.equal((html.match(/class="fdr-chip"/g) ?? []).length, 2);
  assert.match(html, /<small>\(H\)<\/small>/);
  assert.match(html, /<small>\(A\)<\/small>/);
  assert.equal((html.match(/background:/g) ?? []).length, 2);
  const blank = renderToStaticMarkup(React.createElement(PlayerFixtureBlocks, { cell: { ...cell, fixtures: [], isBlank: true }, teamId: homeTeam, teamById, forecasts }));
  assert.match(blank, /BLANK/);
});

test('phone fixture cards and player fixture chips reserve readable space', async () => {
  const css = await readFile('src/styles.css', 'utf8');
  const component = await readFile('src/components/FixtureMatrix.tsx', 'utf8');
  assert.match(component, /--fm-mobile-min-width/);
  assert.match(css, /\.fm-table \{ min-width: var\(--fm-mobile-min-width\) !important/);
  assert.match(css, /\.player-table \.fixture-inline \{ display: flex; align-items: center; gap: 5px/);
  assert.match(css, /\.player-table \.fixture-inline \.fdr-chip \{[^}]*min-height: 62px/);
  assert.match(css, /\.player-table \.fixture-inline \.fdr-chip small \{[^}]*font-size: 12px/);
});

test('fixture tiles use distinct columns and shared colours for VORTEX and market', async () => {
  const { ForecastTile } = await import('../src/components/ForecastTile.tsx');
  const { snapshot, event, fixture } = await sample();
  for (const source of ['vortex', 'market'] as const) {
    const item = makeFixtureForecasts(snapshot, source, [event]).get(`${fixture.teamH}:${event}`)![0];
    const difficulty = renderToStaticMarkup(React.createElement(ForecastTile, { item, mode: 'difficulty', showLabels: true }));
    assert.match(difficulty, new RegExp(item.attackIndex.toFixed(2)));
    assert.match(difficulty, new RegExp(item.defenceIndex.toFixed(2)));
    assert.match(difficulty, new RegExp(difficultyColor(item.attackIndex)));
    assert.match(difficulty, new RegExp(difficultyColor(item.defenceIndex)));
    const projections = renderToStaticMarkup(React.createElement(ForecastTile, { item, mode: 'projections', showLabels: true }));
    assert.match(projections, new RegExp(item.goals.toFixed(2)));
    assert.match(projections, new RegExp(`${Math.round(item.cleanSheet * 100)}%`));
    assert.equal((projections.match(/forecast-tile__value/g) ?? []).length, 2);
  }
  assert.equal(new Set([1, 2, 3, 4, 5].map(difficultyColor)).size, 5);
});
