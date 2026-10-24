'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseOptimizerJobRequest, optimizerJobKey, retryDelaySeconds } = require('../src/lib/jobPolicy.ts');
const uuid = '123e4567-e89b-42d3-a456-426614174000';

test('queue validates one real manager, bounded horizon and idempotent request UUID', () => {
  const request = parseOptimizerJobRequest({ entryId: 3001, horizon: 10, requestId: uuid.toUpperCase() });
  assert.deepEqual(request, { entryId: 3001, horizon: 10, requestId: uuid });
  assert.equal(optimizerJobKey(uuid, request), `optimizer:${uuid}:${uuid}`);
  for (const body of [{ entryId: 0, requestId: uuid }, { entryId: 1, horizon: 11, requestId: uuid },
    { entryId: 'abc', requestId: uuid }, { entryId: 10, requestId: '/etc/passwd' }, {}, null]) {
    assert.throws(() => parseOptimizerJobRequest(body), /Invalid optimizer|requires/);
  }
});

test('background job retries have exponential bounded delays', () => {
  assert.equal(retryDelaySeconds(1), 30);
  assert.equal(retryDelaySeconds(2), 60);
  assert.equal(retryDelaySeconds(3), 120);
  assert.equal(retryDelaySeconds(10), 900);
  assert.throws(() => retryDelaySeconds(0), /attempt/);
});

test('migration establishes idempotent owned queue with capped retries and claim index', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../migrations/0006_background_jobs.sql'), 'utf8');
  assert.match(sql, /job_key TEXT NOT NULL UNIQUE/);
  assert.match(sql, /user_id UUID REFERENCES app_users\(id\)/);
  assert.match(sql, /max_attempts INTEGER NOT NULL DEFAULT 3/);
  assert.match(sql, /CREATE INDEX background_jobs_claim_idx/);
});

test('claim is atomic and locked against competing workers', () => {
  const queue = fs.readFileSync(path.resolve(__dirname, '../src/server/jobs/queue.ts'), 'utf8');
  assert.match(queue, /FOR UPDATE SKIP LOCKED/);
  assert.match(queue, /worker_id=\$1/);
  assert.match(queue, /job_key=\$1 AND user_id=\$2/);
});

test('optimizer worker and interactive endpoint use exactly one implementation', () => {
  const root = path.resolve(__dirname, '..');
  const worker = fs.readFileSync(path.join(root, 'src/server/jobs/runner.ts'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'src/app/api/optimizer/[id]/route.ts'), 'utf8');
  assert.match(worker, /computeOptimizerForEntry\(entryId, horizon\)/);
  assert.match(route, /computeOptimizerForEntry\(entryId, horizon\)/);
  assert.doesNotMatch(route, /runCoreOptimizer/);
});
