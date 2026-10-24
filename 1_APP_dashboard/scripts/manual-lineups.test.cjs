require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function loadTS(name) {
  const file = path.resolve(__dirname, '../src/lib', name + '.ts');
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
  return loaded.exports;
}
const { bestXI, lineupAt, validateLineup, validateSubstitution, applyChipToLineup } = loadTS('planEngine');
const { encodePlan, decodePlan } = loadTS('planShare');
const types = [1,1,2,2,2,2,2,3,3,3,3,3,4,4,4];
const points = [6,1,7,6,5,4,1,8,7,6,5,1,9,8,1];
const squad = types.map((_, i) => i + 1);
const ctx = { players: new Map(squad.map((id, i) => [id, { id, type: types[i], xp: [points[i], points[i]+1] }])), gws: [8,9], baseSquad: squad, bank0: 4, sell0: {}, freeNow: 2 };
const automatic = () => lineupAt(ctx, squad, 0);
const orderOf = (l) => [...l.starters, ...l.bench];
function swap(l, a, b) {
  assert.equal(validateSubstitution(ctx, l, a, b), null);
  const ids = orderOf(l); const ai = ids.indexOf(a); const bi = ids.indexOf(b);
  [ids[ai],ids[bi]] = [ids[bi],ids[ai]]; return ids;
}

test('automatic XI remains the default', () => {
  assert.deepEqual(automatic(), bestXI(squad, id => ctx.players.get(id).type, id => ctx.players.get(id).xp[0]));
  assert.equal(automatic().formation, '4-4-2');
});
test('bench defender can start and swap back without changing the squad', () => {
  const initial = automatic(); const saved = swap(initial, 3, 7);
  const manual = lineupAt(ctx, squad, 0, saved);
  assert(manual.starters.includes(7)); assert(manual.bench.includes(3));
  assert.deepEqual(new Set(orderOf(manual)), new Set(squad));
  assert.equal(manual.xi, initial.xi - 6);
  assert.deepEqual(orderOf(lineupAt(ctx, squad, 0, swap(manual, 7, 3))), orderOf(initial));
});
test('cross-position swaps can change formation legally', () => {
  const manual = lineupAt(ctx, squad, 0, swap(automatic(), 11, 7));
  assert.equal(manual.formation, '5-3-2');
});
test('goalkeeper swaps work; goalkeeper-outfield swaps and same-side pairs are rejected', () => {
  const l = automatic(); const manual = lineupAt(ctx, squad, 0, swap(l, 1, 2));
  assert(manual.starters.includes(2)); assert.equal(manual.bench[0], 1);
  assert.match(validateSubstitution(ctx, l, 1, 7), /Goalkeepers/);
  assert.match(validateSubstitution(ctx, l, 3, 4), /one starter/);
  assert.match(validateSubstitution(ctx, l, 7, 12), /one starter/);
});
test('a swap cannot leave fewer than three defenders or no forwards', () => {
  const order = [1,3,4,5,8,9,10,11,12,13,14,2,6,7,15];
  assert.equal(validateLineup(ctx,squad,order),null);
  assert.match(validateSubstitution(ctx,lineupAt(ctx,squad,0,order),3,15),/valid formation/);
  const oneForward = [1,3,4,5,6,7,8,9,10,11,13,2,12,14,15];
  assert.match(validateSubstitution(ctx,lineupAt(ctx,squad,0,oneForward),13,12),/valid formation/);
});
test('benching the automatic captain selects an eligible captain and recalculates chip totals', () => {
  const l = automatic(); const manual = lineupAt(ctx, squad, 0, swap(l, l.captain, 15));
  assert(manual.starters.includes(manual.captain)); assert(!manual.bench.includes(manual.captain));
  assert.equal(applyChipToLineup(manual,'tc',ctx,0).total, manual.xi + 2*manual.capXp);
  assert.equal(applyChipToLineup(manual,'bb',ctx,0).total, points.reduce((a,b)=>a+b,0)+manual.capXp);
});
test('a replacement inherits the manual bench slot; invalid saved data falls back safely', () => {
  const saved = swap(automatic(), 3, 7);
  ctx.players.set(16,{id:16,type:2,xp:[10,10]});
  const updated = squad.map(id => id===3 ? 16 : id);
  const manual = lineupAt(ctx,updated,0,saved);
  assert(manual.bench.includes(16)); assert(manual.starters.includes(7));
  for (const invalid of [null, {}, [1], Array(15).fill(1), [...saved.slice(0,14),9999]]) {
    assert.deepEqual(lineupAt(ctx,squad,0,invalid),automatic());
  }
});
test('shared links preserve manual lineups, support old links, and reject malformed lineups', () => {
  const plan = {team:1234567,transfers:{},chips:{8:'bb'},captains:{8:13},lineups:{8:swap(automatic(),3,7)}};
  assert.deepEqual(decodePlan(encodePlan(plan),1234567),plan);
  const {lineups,...old}=plan;
  assert.deepEqual(decodePlan(encodePlan(old),1234567),{...old,lineups:{}});
  assert.equal(decodePlan(encodePlan({...plan,lineups:{8:Array(15).fill(1)}}),1234567),null);
});
