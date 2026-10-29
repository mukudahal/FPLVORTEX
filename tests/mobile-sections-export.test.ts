import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Topbar } from '../src/components/Topbar.tsx';
import { fit4kFrame } from '../src/lib/pngFrame.ts';
import { buildFixturePngTables } from '../src/lib/fixturePng.ts';
import { downloadTablePng } from '../src/lib/tablePng.ts';
import type { Snapshot } from '../src/lib/types.ts';

const sample = async () => JSON.parse(await readFile('public/data/fpl-snapshot.json', 'utf8')) as Snapshot;

test('header keeps the brand without promotional text or the removed diagnostics panel', async () => {
  const html = renderToStaticMarkup(React.createElement(Topbar, {
    route: 'command', snapshot: null, refreshing: false, lastSuccessAt: null,
    theme: 'dark', onToggleTheme() {}, onOpenPalette() {}, onRefresh() {}, onNavigate() {},
  }));
  assert.match(html, /FPL VORTEX home/);
  assert.doesNotMatch(html, /Better transfers|Smarter captain|Fixture ratings|Follow @/);
  const app = await readFile('src/App.tsx', 'utf8');
  assert.doesNotMatch(app, /DataStatus|playerDataQualityNotice|importedProjectionsNotice/);
  const lab = await readFile('src/components/PlayerLab.tsx', 'utf8');
  assert.match(lab, /Projection information/);
  assert.match(lab, /importedProjectionsNotice/);
});

test('4K framing preserves the whole content at any phone or desktop aspect ratio', () => {
  for (const [w, h] of [[320, 700], [1000, 500], [2800, 1300], [400, 1400]]) {
    const frame = fit4kFrame(w, h);
    assert.equal(frame.width, 3840); assert.equal(frame.height, 2160);
    assert.ok(frame.x >= 63.99 && frame.y >= 99.99);
    assert.ok(frame.x + w * frame.scale <= 3840 - 63.99);
    assert.ok(frame.y + h * frame.scale <= 2160 - 99.99);
  }
  assert.throws(() => fit4kFrame(0, 100));
  assert.throws(() => fit4kFrame(Number.NaN, 200));
});

test('FDR export follows the selected source, metric and team order without unrelated leaders', async () => {
  const snapshot = await sample();
  const order = [...snapshot.teams].reverse().map(team => team.id);
  const start = snapshot.meta.nextEventId;
  const tables = buildFixturePngTables(snapshot, start, start + 4, { source: 'vortex', metric: 'difficulty', teamOrder: order });
  assert.equal(tables.length, 1);
  assert.match(tables[0].title, /VORTEX.*FIXTURE DIFFICULTY/);
  assert.doesNotMatch(tables[0].title, /MARKET LEADERS|CLEAN SHEETS/);
  assert.equal(tables[0].rows[0][0].text, snapshot.teams.find(team => team.id === order[0])!.name);
  assert.equal(tables[0].rows.length, 20);
  for (const fixture of snapshot.fixtures) fixture.marketOdds = null;
  const market = buildFixturePngTables(snapshot, start, start + 4, { source: 'market', metric: 'win' });
  assert.equal(market.length, 1);
  assert.match(market[0].title, /MARKET.*WIN PROBABILITY/);
  assert.ok(market[0].rows.some(row => row.some(cell => cell.text.includes('No market price'))));
});

test('4K multi-page export renders one page at a time and preserves every row', async () => {
  const old = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch,
    create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const elements: any[] = [], canvases: any[] = [], text: string[] = [];
  const element = (tag: string) => {
    const node: any = { tag, children: [], listeners: {}, appendChild(child: any) { this.children.push(child); },
      append(...children: any[]) { this.children.push(...children); }, setAttribute() {},
      addEventListener(name: string, fn: any) { this.listeners[name] = fn; }, focus() {}, remove() { this.removed = true; } };
    if (tag === 'canvas') {
      const ctx = { measureText: (s: string) => ({ width: s.length * 7 }), fillRect() {}, strokeRect() {},
        fillText: (s: string) => text.push(s), save() {}, restore() {}, translate() {}, scale() {} };
      node.getContext = () => ctx;
      node.toBlob = (done: (b: Blob) => void) => done(new Blob([new Uint8Array([137,80,78,71,13,10,26,10,...Array(30).fill(0)])], { type: 'image/png' }));
      canvases.push(node);
    }
    elements.push(node); return node;
  };
  Object.assign(globalThis, { window: { setTimeout: () => 0 },
    document: { body: element('body'), createElement: element, addEventListener() {}, removeEventListener() {} },
    fetch: async () => new Response('{}', { status: 503 }) });
  URL.createObjectURL = () => 'blob:test'; URL.revokeObjectURL = () => {};
  try {
    await downloadTablePng([{ title: 'Only this section', headers: ['PLAYER'], widths: [300],
      rows: Array.from({ length: 55 }, (_, i) => [{ text: `Player-${i}` }]) }], 'players.png');
    const lastNext = () => [...elements].reverse().find(el => el.textContent === 'Next page');
    assert.equal(canvases.length, 2); // one measurement canvas, one rendered page
    assert.equal(canvases[1].width, 3840); assert.equal(canvases[1].height, 2160);
    await lastNext().listeners.click();
    assert.equal(canvases.length, 3);
    await lastNext().listeners.click();
    assert.equal(canvases.length, 4);
    assert.equal(lastNext().disabled, true);
    assert.deepEqual(text.filter(t => /^Player-\d+$/.test(t)), Array.from({ length: 55 }, (_, i) => `Player-${i}`));
  } finally {
    Object.assign(globalThis, { window: old.window, document: old.document, fetch: old.fetch });
    URL.createObjectURL = old.create; URL.revokeObjectURL = old.revoke;
  }
});
