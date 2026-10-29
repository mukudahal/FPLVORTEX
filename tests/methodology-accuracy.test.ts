import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Methodology } from '../src/components/Methodology.tsx';
import { enrichPlayers } from '../src/lib/analytics.ts';
import type { EnrichedPlayer, Snapshot } from '../src/lib/types.ts';

const snapshot = JSON.parse(await readFile('public/data/fpl-snapshot.json', 'utf8')) as Snapshot;
const render = (players: EnrichedPlayer[]) => renderToStaticMarkup(React.createElement(Methodology, {
  snapshot, players, lastSuccessAt: null, refreshing: false, onRefresh: () => {},
}));

test('reports unavailable historical errors until verified outcome history exists', () => {
  const html = render(enrichPlayers(snapshot));
  assert.match(html, /Historical MAE/);
  assert.match(html, /Historical RMSE/);
  assert.match(html, /Verified Samples<\/span><strong>Not yet verified<\/strong><small>0 connected verified pairs<\/small>/);
  assert.equal((html.match(/Not yet verified/g) ?? []).length, 4);
  assert.match(html, /Calibration<\/span><strong>Not yet verified<\/strong>/);
  assert.doesNotMatch(html, /Cross-Model MAE|Cross-Model RMSE|Ridge shrink|Ridge Calibration/);
  assert.doesNotMatch(html, />0\.00 pts</);
  const tiles = [...html.matchAll(/class="status-tile">(.*?)<\/div>/g)].map(match => match[1]);
  assert.equal(tiles.length, 4);
  for (const tile of tiles.slice(1)) assert.doesNotMatch(tile, /\d/);
});

test('projection source, risk profile and an empty player pool cannot create verified accuracy', () => {
  const balanced = enrichPlayers(snapshot, 'balanced');
  const withoutImports = structuredClone(snapshot);
  for (const player of withoutImports.players) {
    delete player.gwProjections;
    delete player.gwExpectedMinutes;
    delete player.repoBenchmarkXpts;
    delete player.repoExpectedMinutes;
  }
  const html = render(balanced);
  assert.equal(render(enrichPlayers(snapshot, 'differential')), html);
  assert.equal(render(enrichPlayers(withoutImports)), html);
  assert.equal(render([]), html);
});

test('keeps the existing reporting containers and explains the required real outcomes', () => {
  const html = render([]);
  assert.equal((html.match(/class="status-tile"/g) ?? []).length, 4);
  assert.match(html, /class="system-status-grid"/);
  assert.match(html, /saved before their official deadline/);
  assert.match(html, /finalized official points and minutes/);
  assert.match(html, /DEFCON/);
  assert.match(html, /class="method-orb"/);
});
