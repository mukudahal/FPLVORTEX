'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculateRefreshSchedule, eligibleLiveGameweek } = require('../src/lib/refreshSchedule.ts');

const kickoff = '2026-10-23T18:00:00Z';
const fixture = { id: 1, event: 8, team_h: 1, team_a: 2, kickoff_time: kickoff, finished: false };

test('refresh scheduling derives deterministic UTC hourly and 10-minute slot keys', () => {
  const scheduled = calculateRefreshSchedule([fixture], new Date('2026-10-23T18:36:21Z'));
  assert.equal(scheduled.hourSlot, '2026-10-23T18:00:00.000Z');
  assert.equal(scheduled.tenMinuteSlot, '2026-10-23T18:30:00.000Z');
  assert.equal(scheduled.liveGameweek, 8);
});

test('live updates run only in kickoff window; finished and blanks do not trigger them', () => {
  assert.equal(eligibleLiveGameweek([fixture], new Date('2026-10-23T17:00:00Z')), null);
  assert.equal(eligibleLiveGameweek([fixture], new Date('2026-10-23T17:50:00Z')), 8);
  assert.equal(eligibleLiveGameweek([{ ...fixture, finished: true }], new Date('2026-10-23T18:30:00Z')), null);
  assert.equal(eligibleLiveGameweek([{ ...fixture, event: null }], new Date('2026-10-23T18:30:00Z')), null);
  assert.equal(eligibleLiveGameweek([fixture], new Date('2026-10-24T06:00:00Z')), null);
});

test('new cron enqueues jobs but never performs expensive optimizer or source refresh inline', () => {
  const root=path.resolve(__dirname, '..');
  const body=fs.readFileSync(path.join(root,'src/app/api/cron/schedule/route.ts'),'utf8');
  assert.match(body,/enqueueScheduledJob\("refresh"/);
  assert.match(body,/enqueueScheduledJob\("live"/);
  assert.doesNotMatch(body,/runCoreOptimizer|captureOfficialFplSnapshots/);
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  // This candidate app is NOT deployed as the live website. A schedule must only
  // be activated after a worker, CRON_SECRET, and a supported hosting plan exist.
  // Empty/omitted crons are therefore a valid, deliberately inactive state.
  const crons = vercel.crons ?? [];
  assert.ok(Array.isArray(crons), 'Vercel crons must be an array when configured');
  assert.ok(crons.length <= 1, 'Only one enqueue-only scheduler is permitted');
  for (const cron of crons) {
    assert.equal(cron.path, '/api/cron/schedule');
    assert.equal(cron.schedule, '*/10 * * * *');
  }
});

test('live automation migration extends the queue kind constraint additively', () => {
  const body=fs.readFileSync(path.resolve(__dirname,'../migrations/0007_live_automation.sql'),'utf8');
  assert.match(body,/CHECK \(kind IN \('optimizer','refresh','live'\)\)/);
});
