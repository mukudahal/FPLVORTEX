require('./register-typescript.cjs');
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const absolute = path.resolve(__dirname, "../src/lib", file);
  const moduleInstance = new Module(absolute, module);
  moduleInstance.require = (moduleName) =>
    Object.prototype.hasOwnProperty.call(dependencies, moduleName)
      ? dependencies[moduleName]
      : Module.createRequire(absolute)(moduleName);
  const transpiled = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  moduleInstance._compile(transpiled.outputText, absolute);
  return moduleInstance.exports;
}

const xpts = load("xpts.ts");
const { analyzeIntelligence } = load("intelligence.ts", { "@/lib/xpts": xpts });

function player(overrides = {}) {
  return {
    id: 1, code: 123, web_name: "Forward One", team: 1, element_type: 4,
    now_cost: 85, selected_by_percent: "10.0", status: "a", minutes: 630, starts: 7,
    goals_scored: 4, assists: 1, clean_sheets: 1, saves: 0, bonus: 5, bps: 100,
    defensive_contribution: 0, yellow_cards: 0, red_cards: 0,
    expected_goals: "3.2", expected_assists: "1.4", expected_goals_conceded: "5.0",
    ep_next: "4.0", chance_of_playing_next_round: 100,
    ...overrides,
  };
}

function bootstrap(elements) {
  return {
    nextEvent: 8, currentEvent: 7,
    events: [8, 9, 10].map((id) => ({ id, finished: false })),
    elements,
    teams: [1, 2].map((id) => ({ id, code: id, short_name: `CL${id}` })),
  };
}

function fixture(id, event) {
  return { id, event, team_h: 1, team_a: 2, finished: false, team_h_difficulty: 2, team_a_difficulty: 4 };
}

test("multi-GW intelligence counts doubles and zeroes blank gameweeks", () => {
  const result = analyzeIntelligence(bootstrap([player()]), [fixture(1, 8), fixture(2, 8), fixture(3, 10)], 3);
  assert.deepEqual(result.weeks, [8, 9, 10]);
  assert.equal(result.matchCount, 3);
  assert.equal(result.players.length, 1);
  assert.equal(result.players[0].weeklyXPts[1], 0);
  assert.ok(result.players[0].weeklyXPts[0] > result.players[0].weeklyXPts[2]);
  assert.equal(result.captainCandidates.length, 1);
});

test("injury flags are high-risk and disabled captaincy when unavailable", () => {
  const result = analyzeIntelligence(bootstrap([player({ status: "s", chance_of_playing_next_round: 0 })]), [fixture(1, 8)]);
  assert.equal(result.players[0].risk, "HIGH");
  assert.equal(result.players[0].minutesChance, 0);
  assert.equal(result.captainCandidates.length, 0);
});

test("horizon is bounded, invalid player types ignored and projections stay finite", () => {
  const result = analyzeIntelligence(bootstrap([player(), player({ id: 2, element_type: 5 })]), [fixture(1, 8)], 100);
  assert.equal(result.weeks.length, 3);
  assert.equal(result.players.length, 1);
  assert.ok(Number.isFinite(result.players[0].totalXPts));
  assert.ok(result.players[0].valuePerMillion >= 0);
});
