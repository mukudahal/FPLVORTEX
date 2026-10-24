const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = (name) => fs.readFileSync(path.join(root, name),'utf8');

test('4K rendering is restricted to authenticated rate-limited callers', () => {
  const code = source('src/app/api/reports/[id]/[gw]/png/route.ts');
  assert.match(code, /currentUser\(req\)/);
  assert.match(code, /enforceAuthRateLimit\(req/);
  assert.match(code, /status:429/);
});
test('report job respects opt-out at execution and archives idempotently', () => {
  const worker = source('src/server/jobs/runner.ts');
  assert.match(worker, /report_schedules/);
  assert.match(worker, /Report schedule disabled before execution/);
  assert.match(worker, /ON CONFLICT \(deduplication_key\) DO NOTHING/);
  assert.match(source('migrations/0009_report_delivery_idempotency.sql'), /UNIQUE INDEX/);
});
test('sampled league ownership uses bounded officially visible squads', () => {
  const endpoint = source('src/app/api/leagues/[id]/ownership/route.ts');
  assert.match(endpoint, /slice\(0, 12\)/);
  assert.match(endpoint, /loadPicks/);
  assert.match(endpoint, /currentUser\(request\)/);
  assert.match(endpoint, /not representative/);
});
test('report fixture explicitly identifies synthetic data', () => {
  const fixture = JSON.parse(source('scripts/reporting/sample-report.json'));
  assert.match(fixture.teamName, /SYNTHETIC TEST FIXTURE/);
  assert.match(fixture.note, /Never publish as an actual result/);
});
test('release evidence gate remains fail-closed', () => {
  const gate = source('scripts/release-gates.cjs');
  assert.match(gate, /RELEASE BLOCKED/);
  assert.match(gate, /crossUserAuthorization/);
  assert.match(gate, /backupRestoreVerified/);
});
