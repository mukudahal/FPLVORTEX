import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { splitTables } from '../src/lib/tablePng.ts';
import { buildFixturePngTables } from '../src/lib/fixturePng.ts';
import type { Snapshot, FixtureMarketOdds } from '../src/lib/types.ts';

test('single-image sections retain every row and repeat headers for large tables', () => {
  const table = { title: 'Players', headers: ['Name'], widths: [120], rows: Array.from({ length: 123 }, (_, i) => [{ text: `Player ${i}` }]) };
  const blocks = splitTables([table]);
  assert.deepEqual(blocks.map(block => block.rows.length), [50, 50, 23]);
  assert.equal(blocks.flatMap(block => block.rows).length, 123);
  assert.equal(blocks[2].rows[22][0].text, 'Player 122');
  assert.throws(() => splitTables([{ ...table, widths: [] }]));
});

test('fixture export includes both sources, all metrics, all clubs and honest market gaps', async () => {
  const snapshot = JSON.parse(await readFile('public/data/fpl-snapshot.json', 'utf8')) as Snapshot;
  for (const fx of snapshot.fixtures) fx.marketOdds = null;
  const first = snapshot.meta.nextEventId;
  const fixture = snapshot.fixtures.find(fx => fx.event === first)!;
  fixture.marketOdds = { provider: 'the-odds-api', bookmaker: 'Test', updatedAt: '', homeXg: 2.4, awayXg: 0.8 } as FixtureMarketOdds;
  const [vortex, market] = buildFixturePngTables(snapshot, first, first + 4);
  assert.match(vortex.title, /VORTEX/); assert.match(market.title, /MARKET/);
  assert.equal(vortex.rows.length, snapshot.teams.length);
  assert.equal(market.rows.length, snapshot.teams.length);
  assert.equal(vortex.headers.length, 7); assert.equal(market.headers.length, 5);
  const home = snapshot.teams.find(team => team.id === fixture.teamH)!;
  const homeRow = market.rows.find(row => row[0].text === home.name)!;
  assert.match(homeRow[2].text, /G 2\.40/); assert.match(homeRow[2].text, /CS /); assert.match(homeRow[2].text, /W /);
  assert.ok(market.rows.some(row => row.some(cell => cell.text.includes('No market price'))));
  assert.ok(vortex.rows.every(row => row.length === vortex.headers.length));
});
