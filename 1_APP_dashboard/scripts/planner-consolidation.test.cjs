const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

Module._extensions['.ts'] = (sourceModule, filename) => {
  const javascript = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  sourceModule._compile(javascript, filename);
};
const root = path.resolve(__dirname, '..');
const {decodeDraft, encodeDraft} = require(path.join(root, 'src/lib/plannerPersistence.ts'));
const {makeCtx, bestXI, replay} = require(path.join(root, 'src/lib/planEngine.ts'));

function fixture() {
  const positions = [1,1,2,2,2,2,2,3,3,3,3,3,4,4,4];
  const players = positions.map((type, index) => ({id: index + 1, name: `P${index+1}`, team: index%6+1, type, cost: 50, xp: [4+index/10,5,6], chance:100}));
  const data = {
    gws: [8,9,10],
    players,
    picks: players.map((p, index) => ({element: p.id, position: index+1, isCaptain: index===12, isVice: index===13})),
    bank: 5, sellingPrices: Object.fromEntries(players.map((p)=>[p.id,p.cost])), freeTransfers:2,
  };
  return {ctx: makeCtx(data), players};
}

test('version 3 saved plans round-trip with captain, chip, and validated manual lineup', () => {
  const {ctx} = fixture();
  const lineup = bestXI(ctx.baseSquad, id=>ctx.players.get(id).type, id=>ctx.players.get(id).xp[0]);
  const original = encodeDraft(ctx, {
    transfers: {}, chips: {8:'tc'}, captains: {8:13}, viceCaptains: {8:14},
    lineups: {8:[...lineup.starters, ...lineup.bench]},
  });
  assert.deepEqual(decodeDraft(original, ctx), original);
});

test('old standalone plan v2 restores its transfer map', () => {
  const {ctx} = fixture();
  ctx.players.set(99, {id:99, type:4, team:6, cost:50, xp:[5,5,5]});
  const transfer = {out:15, in:99};
  const restored = decodeDraft({kind:'plan-dashboard', v:2, startGw:8, transfers:{8:[transfer]}}, ctx);
  assert.deepEqual(restored.transfers, {8:[transfer]});
  assert.deepEqual(restored.chips, {});
});

test('old team planner saves restore 15-player manual lineup, captain and all chip names', () => {
  const {ctx} = fixture();
  const lineup = bestXI(ctx.baseSquad,id=>ctx.players.get(id).type,id=>ctx.players.get(id).xp[0]);
  const result = decodeDraft({startGw:8, gws:[
    {gw:8, transfers:[], chip:'wildcard', captainId:13, viceId:14, starters:lineup.starters, bench:lineup.bench},
    {gw:9, transfers:[], chip:'bboost'},
    {gw:10, transfers:[], chip:'3xc'},
  ]}, ctx);
  assert.equal(result.chips[8], 'wc');
  assert.equal(result.chips[9], 'bb');
  assert.equal(result.chips[10], 'tc');
  assert.equal(result.captains[8],13);
  assert.equal(result.viceCaptains[8],14);
  assert.deepEqual(result.lineups[8], [...lineup.starters,...lineup.bench]);
});

test('unsupported and malicious persisted plan types do not load', () => {
  const {ctx} = fixture();
  for (const input of [null, [], 'junk', {}, {kind:'vortex-planner',version:999}, {gws:new Array(40).fill({})}]) {
    assert.equal(decodeDraft(input,ctx),null);
  }
});

test('out of horizon, duplicate lineup, unknown captain and invalid transfers are removed', () => {
  const {ctx} = fixture();
  const decoded = decodeDraft({kind:'vortex-planner',version:3, transfers:{8:[{out: 999, in: 888}], 99:[{out:1,in:2}]},
    chips:{9:'tc',99:'wc'}, captains:{8:999,11:13}, lineups:{8:Array(15).fill(1)}}, ctx);
  assert.deepEqual(decoded.transfers, {});
  assert.deepEqual(decoded.chips, {9:'tc'});
  assert.deepEqual(decoded.captains, {});
  assert.deepEqual(decoded.lineups, {});
});

test('there is exactly one active planner component and the former routes converge', () => {
  const read = (file) => fs.readFileSync(path.join(root,file),'utf8');
  assert.equal(fs.existsSync(path.join(root,'src/components/team/PlannerView.tsx')),false);
  assert.equal(fs.existsSync(path.join(root,'src/components/plan/PlanDashboard.tsx')),false);
  assert.match(read('src/app/plan/[id]/page.tsx'), /redirect\(`\/planner\/\$\{id\}`\)/);
  assert.match(read('src/components/team/TeamDashboard.tsx'), /<TeamPlanner initialTeamId=\{teamId\} embedded\s*\/>/);
  assert.match(read('src/app/planner/[id]/page.tsx'), /<TeamPlanner initialTeamId=\{id\}/);
  const tabs=read('src/components/planner/TeamPlanner.tsx');
  assert.match(tabs, /id: "saved"/);
  assert.match(tabs, /id: "insights"/);
});


test('shared plan links always navigate to the canonical planner, even when created from a team dashboard', () => {
  const share = require(path.join(root, 'src/lib/planShare.ts'));
  const previousWindow = global.window;
  global.window = {location: {origin:'https://example.test',href:'https://example.test/team/123?tab=planner'}};
  try {
    const url = new URL(share.planLink({team:123,transfers:{},chips:{},captains:{}}));
    assert.equal(url.pathname, '/planner/123');
    assert.equal(url.searchParams.get('t'), '123');
    assert(url.searchParams.has('s'));
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
});


test('shared plan round-trips a manually chosen vice captain, while old links remain compatible', () => {
  const {encodePlan, decodePlan} = require(path.join(root,'src/lib/planShare.ts'));
  const result = {team:123, transfers:{}, chips:{8:'tc'}, captains:{8:13}, viceCaptains:{8:14}, lineups:{}};
  assert.deepEqual(decodePlan(encodePlan(result),123),result);
  const {viceCaptains, ...old} = result;
  assert.deepEqual(decodePlan(encodePlan(old),123),old);
});
