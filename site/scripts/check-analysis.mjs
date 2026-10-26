import assert from 'node:assert/strict';
import { analyzeGameweek, compareTeams, sortAnalysisRows, pickRows } from '../ui/analysis.js';

const teams = [
  {id:1, short_name:'NOR', name:'Northbridge', code:1},
  {id:2, short_name:'WES', name:'Westhaven', code:2},
  {id:3, short_name:'RIV', name:'Riverside', code:3},
];
const players = [
  {id:1, web_name:'Keeper', team:1, element_type:1, status:'a', now_cost:50},
  {id:2, web_name:'Defender', team:1, element_type:2, status:'a', now_cost:55},
  {id:3, web_name:'Midfield', team:2, element_type:3, status:'a', now_cost:80},
  {id:4, web_name:'Forward', team:2, element_type:4, status:'i', chance_of_playing_next_round:25, news:'Knock - being assessed', now_cost:90},
  {id:5, web_name:'Bench Mid', team:1, element_type:3, status:'a', now_cost:45},
  {id:6, web_name:'Rival Mid', team:3, element_type:3, status:'a', now_cost:70},
  {id:7, web_name:'Rival Bench', team:3, element_type:2, status:'a', now_cost:45},
];
const picks = [
  {element:1, position:1, multiplier:1, is_captain:false, is_vice_captain:false},
  {element:2, position:2, multiplier:1, is_captain:false, is_vice_captain:true},
  {element:3, position:3, multiplier:2, is_captain:true, is_vice_captain:false},
  {element:4, position:4, multiplier:1, is_captain:false, is_vice_captain:false},
  {element:5, position:12, multiplier:0, is_captain:false, is_vice_captain:false},
];
const live = [
  {id:1, stats:{total_points:2, minutes:90}},
  {id:2, stats:{total_points:6, minutes:90}},
  {id:3, stats:{total_points:5, minutes:90}},
  {id:4, stats:{total_points:1, minutes:20}},
  {id:5, stats:{total_points:8, minutes:90}},
  {id:6, stats:{total_points:7, minutes:90}},
  {id:7, stats:{total_points:3, minutes:90}},
];
const fixtures = [
  {id:81, event:8, team_h:1, team_a:3, team_h_difficulty:2, team_a_difficulty:4, finished:true},
  {id:82, event:8, team_h:2, team_a:3, team_h_difficulty:3, team_a_difficulty:3, finished:true},
  {id:91, event:9, team_h:1, team_a:2, team_h_difficulty:3, team_a_difficulty:3, finished:false},
];
const event = {id:8, finished:false, data_checked:false, average_entry_score:12};
const history = [
  {event:6, points:50, total_points:500, overall_rank:1200, rank:900000},
  {event:7, points:60, total_points:560, overall_rank:1100, rank:800000},
  {event:8, points:15, total_points:575, overall_rank:1000, rank:700000},
];
const forecasts = new Map([
  [1, {xPts:3.0, fixturesLabel:'WES (H)', csProb:0.3, gw:9}],
  [2, {xPts:5.1, fixturesLabel:'WES (H)', csProb:0.35, gw:9}],
  [3, {xPts:7.2, fixturesLabel:'RIV (A)', csProb:0.2, gw:9}],
  [4, {xPts:2.0, fixturesLabel:'RIV (A)', csProb:0.2, gw:9}],
  [5, {xPts:1.0, fixturesLabel:'WES (H)', csProb:0.3, gw:9}],
]);
const base = {picks, live, players, teams, fixtures, gameweek:8, forecasts, forecastGameweek:9, history, event, transferCost:4};

const analysis = analyzeGameweek(base);
assert.equal(analysis.total, 15, 'Captain doubling and transfer hit are both applied');
assert.equal(analysis.vsAverage, 3, 'Comparison with the official GW average');
assert.equal(analysis.captainExtra, 5, 'Armband contribution is isolated');
assert.equal(analysis.benchUnused, 8, 'Bench points left behind exclude Bench Boost picks');
assert.equal(analysis.formation, '1-1-1');
assert.equal(analysis.positionsComplete, true);
assert.equal(analysis.positionTotal, 19);
assert.equal(analysis.used, 4);
assert.equal(analysis.blanks, 0);
assert.equal(analysis.rank, 1000);
assert.equal(analysis.rankChange, 100, 'A lower rank number is a positive move');
assert.equal(analysis.form.length, 3);
assert.equal(analysis.complete, true);
assert.equal(analysis.captainRadar[0].id, 3, 'Captain radar is led by next-GW model xPts');
assert.equal(analysis.risks[0].id, 4, 'Injured players lead the availability watch');
assert.equal(analysis.risks[0].availability.severity, 'unavailable');
assert.equal(analysis.rows[0].fixture.label, 'RIV (H)', 'Fixture labels follow the player’s venue');
assert.equal(analysis.rows[2].contribution, 10, 'Captain multiplier applies to XI points');

const partial = analyzeGameweek({...base, live: live.slice(0, 3)});
assert.equal(partial.total, null, 'Partial live feeds never become a fake zero');
assert.equal(partial.positionsComplete, false);
assert.equal(partial.benchUnused, null);
assert.equal(partial.complete, false);

const rows = pickRows({picks, live, players, teams, fixtures, gameweek:8, forecasts});
assert.equal(rows.length, 5);
assert.equal(rows[3].availability.flagged, true);
assert.equal(sortAnalysisRows(rows, 'forecast', 1)[0].id, 5);
assert.equal(sortAnalysisRows(rows, 'contribution')[0].id, 3);
const withMissing = rows.map((row, index) => index === 4 ? {...row, forecast: null} : row);
assert.equal(sortAnalysisRows(withMissing, 'forecast', 1).at(-1).id, 5, 'Unknown values sort last in both directions');
assert.throws(() => sortAnalysisRows(rows, 'unsupported'), RangeError);

const awayPicks = [
  {element:1, position:1, multiplier:1, is_captain:false, is_vice_captain:false},
  {element:2, position:2, multiplier:1, is_captain:false, is_vice_captain:true},
  {element:6, position:3, multiplier:2, is_captain:true, is_vice_captain:false},
  {element:4, position:4, multiplier:1, is_captain:false, is_vice_captain:false},
  {element:7, position:12, multiplier:0, is_captain:false, is_vice_captain:false},
];
const comparison = compareTeams({homePicks:picks, awayPicks, live, players, teams, fixtures, gameweek:8, event, homeTransferCost:4, awayTransferCost:4, homeRank:1000, awayRank:900});
assert.equal(comparison.homeScore, 15);
assert.equal(comparison.awayScore, 19);
assert.equal(comparison.margin, -4);
assert.equal(comparison.shared.length, 3);
assert.deepEqual(comparison.homeOnly.map(row => row.id), [3, 5]);
assert.deepEqual(comparison.awayOnly.map(row => row.id), [6, 7]);
assert.equal(comparison.captainsSame, false);
assert.equal(comparison.differentialPoints, -4, 'Differential impact uses both teams’ pick multipliers');
assert.equal(comparison.rankGap, -100, 'The lower rank number leads');
const sameCaptain = compareTeams({homePicks:picks, awayPicks:picks, live, players, teams, fixtures, gameweek:8, event, homeTransferCost:4, awayTransferCost:4});
assert.equal(sameCaptain.captainsSame, true);
assert.equal(sameCaptain.margin, 0);
const missingComparison = compareTeams({homePicks:picks, awayPicks, live: live.slice(0, 3), players, teams, fixtures, gameweek:8, event});
assert.equal(missingComparison.margin, null);
assert.equal(missingComparison.differentialPoints, null);
console.log('Gameweek analysis, missing-data, sorting and head-to-head comparison regressions passed.');

/* Bundle the browser modules into data URLs so the dashboard can be rendered against a tiny DOM stub. */
const {createBrowserBundler} = await import('./browser-bundle.mjs');
const {bundle} = createBrowserBundler(new URL('../', import.meta.url), new URL('../ui/', import.meta.url));

function fakeDocument() {
  const listeners = new Map();
  const root = {innerHTML:'', addEventListener(name, fn){listeners.set(name, fn);}, querySelector(){return null;}};
  const dialog = {innerHTML:'', open:false, setAttribute(){}, addEventListener(){}, showModal(){this.open = true;}, close(){}, focus(){}};
  const document = {
    querySelector(selector){return selector === '#dashboard-mount' ? root : null;},
    querySelectorAll(){return [];},
    createElement(){return dialog;},
    addEventListener(){},
    body:{append(){}},
    documentElement:{dataset:{}},
  };
  return {document, root, listeners};
}

const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;
const dom = fakeDocument();
globalThis.document = dom.document;
globalThis.fetch = async url => {
  if (String(url) === '/videos.json') return Response.json({videos:[]});
  if (String(url) === '/api/videos') return Response.json([]);
  throw new Error('Unexpected request ' + url);
};
try {
  const dashboardUrl = await bundle('/dashboard.js');
  const {createDashboard} = await import(dashboardUrl);
  const positions = [1,1,2,2,2,3,3,3,4,4];
  const elements = Array.from({length:60}, (_, index) => ({id:index+1, web_name:`Player ${index+1}`, team:index%3+1, element_type:positions[index%10], status:'a', now_cost:50+index%9}));
  const events = Array.from({length:10}, (_, index) => ({id:index+1, finished:index<7, is_current:index===7, is_next:index===8, deadline_time:new Date(Date.now()+(index-6)*7*86400000).toISOString(), average_entry_score:48}));
  const state = {
    bootstrap:{elements, teams, events},
    fixtures:[
      ...Array.from({length:3}, (_, index) => ({id:80+index, event:8, team_h:index+1, team_a:(index+1)%3+1, team_h_difficulty:3, team_a_difficulty:3, finished:true})),
      ...Array.from({length:3}, (_, index) => ({id:90+index, event:9, team_h:index+1, team_a:(index+2)%3+1, team_h_difficulty:2, team_a_difficulty:4, finished:false})),
    ],
    rows:elements.map(player => ({id:player.id, weekly:[{xPts:(player.id%9)+2, fixturesLabel:'RIV (H)', csProb:0.3, gw:9}]})),
    weeks:[{id:9}], source:'sample', capturedAt:new Date().toISOString(),
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const dashboard = createDashboard(() => state, escape, () => {});
  dashboard.onDataLoaded();
  const click = dom.listeners.get('click');
  assert.equal(typeof click, 'function');
  click({target:{closest:selector => selector === '[data-subtab]' ? {dataset:{subtab:'analysis'}} : null}});
  const html = dom.root.innerHTML;
  assert.ok(html.includes('analysis-grid'), 'The analysis tab renders the full workspace');
  assert.ok(html.includes('GW 8 score breakdown'));
  assert.ok(html.includes('Squad contributions'));
  assert.ok(html.includes('Head-to-head'));
  assert.ok(html.includes('analysis-scoreboard'), 'The illustrative rival produces a head-to-head comparison');
  assert.ok(html.includes('CAPTAIN RADAR'));
  assert.ok(html.includes('Illustrative sandbox'), 'Fictional data stays clearly labelled');
  assert.ok(!html.includes('analysis-pending'), 'The placeholder is gone');
  assert.ok(!html.includes('undefined'), 'No unescaped undefined values leak into the markup');
  console.log('Gameweek Analysis tab renders score breakdown, squad table, focus and rival comparison without a browser.');
} finally {
  globalThis.document = originalDocument;
  globalThis.fetch = originalFetch;
}
