'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('legacy saved plans are quarantined by nullable owner migration, not deleted', () => {
  const sql = read('migrations/0004_saved_plan_ownership.sql');
  assert.match(sql, /ADD COLUMN owner_user_id UUID REFERENCES app_users\(id\) ON DELETE SET NULL/);
  assert.match(sql, /saved_plans_owner_entry_active_idx/);
  assert.doesNotMatch(sql, /\b(?:DELETE FROM|DROP TABLE|TRUNCATE TABLE)\b/i);
  assert.match(read('src/db/schema.ts'), /ownerUserId: uuid\("owner_user_id"\)/);
});

test('all saved plan operations authenticate and filter owner, entry and plan ID', () => {
  const route = read('src/app/api/plans/route.ts');
  assert.match(route, /export async function GET\([\s\S]*?currentUser\(req\)/);
  assert.match(route, /export async function POST\([\s\S]*?rejectUntrustedOrigin\(req\)/);
  assert.match(route, /export async function DELETE\([\s\S]*?rejectUntrustedOrigin\(req\)/);
  assert.ok((route.match(/eq\(savedPlans\.ownerUserId, user\.id\)/g) || []).length >= 4);
  assert.match(route, /pg_advisory_xact_lock/);
  assert.match(route, /MAX_PLAN_BYTES/);
  assert.match(route, /status: 404/);
});

test('guest planner keeps working and cloud plans offer sign-in', () => {
  const ui = read('src/components/planner/SavedPlansView.tsx');
  assert.match(ui, /response\.status === 401/);
  assert.match(ui, /Your local planner draft still works/);
  assert.match(ui, /href="\/login"/);
});

test('manager watchlist links use the authenticated user in every query', () => {
  const route = read('src/app/api/auth/manager/route.ts');
  assert.match(route, /WHERE user_id=\$1/);
  assert.match(route, /ON CONFLICT \(user_id,entry_id\)/);
});
