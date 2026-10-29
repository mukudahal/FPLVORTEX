import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeFixtureForecasts, meanForecast, provisionalOpportunityIndices, overallDifficulty, difficultyColor } from '../src/lib/fixtureForecast.ts';
import type { Snapshot, FixtureMarketOdds } from '../src/lib/types.ts';

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
