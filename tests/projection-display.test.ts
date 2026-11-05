import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerProjectionCard } from '../src/components/PlayerProjectionCard.tsx';
import { SimulationChart } from '../src/components/SimulationChart.tsx';
import { getPlayerPhotoCandidates } from '../src/lib/playerImages.ts';
import { makeFixture, makePlayer, makeTeam } from './helpers.ts';
import type { Snapshot } from '../src/lib/types.ts';
import type { MonteCarloSummary } from '../src/lib/repoModel/types.ts';

const snapshot = { fixtures:[makeFixture(1,10,1,2), makeFixture(2,10,3,1)], teams:[makeTeam(1),makeTeam(2),makeTeam(3)] } as Snapshot;
const player = makePlayer(154,{name:'Palmer',fullName:'Cole Palmer',teamId:1,team:makeTeam(1),code:490001,position:'MID'});
const card = (points: number | null | undefined, overrides = {}) => renderToStaticMarkup(React.createElement(PlayerProjectionCard,{player,snapshot,gw:10,points,...overrides}));

test('real headshot cache is tried before any shirt fallback', () => {
  const urls=getPlayerPhotoCandidates(490001,3);
  const shirt=urls.findIndex(url=>url.includes('/shirts/'));
  assert.ok(shirt>urls.findIndex(url=>url.startsWith('/api/img/player/490001')));
  assert.ok(shirt>urls.findIndex(url=>url.includes('player-images/players/490001.png')));
  assert.ok(getPlayerPhotoCandidates(null,3).every(url=>!url.includes('/api/img/player/')));
});

test('card preserves solver zero, two-decimal precision, missing and nonfinite values', () => {
  assert.match(card(6.278),/>6\.28</);
  assert.match(card(0),/>0\.00</);
  for(const value of [undefined,null,NaN,Infinity]) {
    assert.match(card(value),/projection unavailable/);
    assert.doesNotMatch(card(value),/>0\.00</);
  }
});

test('doubles show both opponents and base xPts are not multiplied again', () => {
  const html=card(6.28,{captainMultiplier:3});
  assert.match(html, /\(H\).*\(A\)/);
  assert.match(html, /C ×3/);
  assert.match(html, />6\.28</);
  assert.doesNotMatch(html, /18\.84/);
});

test('blank is distinct and availability never disappears behind a portrait', () => {
  assert.match(card(0,{gw:11}),/>Blank</);
  assert.match(card(2,{player:{...player,status:'d',chance:75,news:'Back injury'}}),/>Doubtful</);
  assert.match(card(2,{player:{...player,status:'i',chance:0}}),/>Injured</);
});

test('duplicate surnames retain independent official IDs and portrait codes', () => {
  const second={...player,id:301,code:490002,fullName:'Alex Palmer',teamId:3,team:makeTeam(3)};
  assert.match(card(6.28),/data-player-id="154"/);
  assert.match(card(3.14,{player:second}),/data-player-id="301"/);
  assert.match(card(3.14,{player:second}),/490002\.png/);
  assert.doesNotMatch(card(3.14,{player:second}),/490001\.png/);
});

test('weekly graph uses supplied per-GW quantiles with an accessible exact table', () => {
  const simulation={draws:10000,seed:27,recommendedPathId:'hold',gws:[10,11],paths:[{id:'hold',label:'Hold',perGw:[{gw:10,mean:52.24,p10:30,p90:80},{gw:11,mean:49.32,p10:28,p90:77}]}]} as MonteCarloSummary;
  const html=renderToStaticMarkup(React.createElement(SimulationChart,{simulation}));
  assert.match(html,/10,000 draws · Seed 27/);
  assert.match(html,/Gameweek/);assert.match(html,/>Points</);
  assert.match(html,/>52\.24</);assert.match(html,/>49\.32</);
  assert.match(html,/Exact weekly points/);
  assert.doesNotMatch(html,/NaN|Infinity/);
});

test('single-week and unavailable chart states remain usable', () => {
  const base={draws:3000,seed:1,recommendedPathId:'hold',gws:[38],paths:[{id:'hold',label:'Hold',perGw:[{gw:38,mean:0,p10:0,p90:0}]}]} as MonteCarloSummary;
  const html=renderToStaticMarkup(React.createElement(SimulationChart,{simulation:base}));
  assert.doesNotMatch(html,/NaN|Infinity/);assert.match(html,/>0\.00</);
  assert.match(renderToStaticMarkup(React.createElement(SimulationChart,{simulation:{...base,paths:[]}})),/chart unavailable/);
});
