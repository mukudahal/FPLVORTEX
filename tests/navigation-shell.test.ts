import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolveHashRoute } from '../src/hooks/useHashRoute';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const palette = readFileSync(new URL('../src/components/CommandPalette.tsx', import.meta.url), 'utf8');
const topbar = readFileSync(new URL('../src/components/Topbar.tsx', import.meta.url), 'utf8');
const nav = app.match(/const ROUTE_PILLS:[\\s\\S]*?\\n\\];/)?.[0] ?? '';

test('Dashboard is first and Planner second in desktop and mobile navigation', () => {
  const dashboard = nav.indexOf("id: 'command', label: 'DASHBOARD'");
  const planner = nav.indexOf("id: 'optimizer', label: 'PLANNER'");
  const players = nav.indexOf("id: 'players'");
  assert.ok(dashboard >= 0 && dashboard < planner && planner < players);
  assert.match(app, /const MOBILE_NAV = ROUTE_PILLS/);
  assert.doesNotMatch(nav, /id: 'review'/);
  assert.doesNotMatch(nav, /10-GW PLANNER/);
});

test('search offers Dashboard and Planner, but not a Review tab', () => {
  assert.match(palette, /id: 'command', label: 'DASHBOARD'/);
  assert.match(palette, /id: 'optimizer', label: 'PLANNER'/);
  assert.doesNotMatch(palette, /id: 'review'/);
  assert.match(topbar, /onClick=\\{\\(\\) => onNavigate\\('command'\\)\\}/);
});

test('Dashboard is the default and old Review bookmarks keep working', () => {
  assert.equal(resolveHashRoute(''), 'command');
  assert.equal(resolveHashRoute('#/'), 'command');
  assert.equal(resolveHashRoute('#/not-found'), 'command');
  assert.equal(resolveHashRoute('#/optimizer'), 'optimizer');
  assert.equal(resolveHashRoute('#/review?gw=10'), 'review');
});
