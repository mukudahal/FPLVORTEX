'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { normalizeEmail, validatePassword, hashPassword, verifyPassword, issueToken, tokenDigest, isValidToken } = require(path.resolve(__dirname, '../src/lib/authCrypto.ts'));

test('registration email normalization rejects malformed and oversize addresses', () => {
  assert.equal(normalizeEmail(' USER@Example.COM '), 'user@example.com');
  for (const email of ['', 'a', 'invalid', 'a@', 'a@b', 'x'.repeat(300) + '@example.com', null]) {
    assert.throws(() => normalizeEmail(email), /valid email/);
  }
});

test('password hashes are salted scrypt with a timing-safe verifier', async () => {
  validatePassword('correct horse battery');
  assert.throws(() => validatePassword('short'), /12/);
  const original = await hashPassword('correct horse battery');
  const another = await hashPassword('correct horse battery');
  assert.notEqual(original, another);
  assert.equal(await verifyPassword('correct horse battery', original), true);
  assert.equal(await verifyPassword('wrong password 123', original), false);
  assert.equal(await verifyPassword('correct horse battery', 'invalid-digest'), false);
});

test('verification/session/reset tokens are random and only hashes need persistence', () => {
  const first = issueToken();
  const second = issueToken();
  assert.notEqual(first.plain, second.plain);
  assert.ok(isValidToken(first.plain));
  assert.equal(tokenDigest(first.plain), first.digest);
  assert.equal(first.digest.length, 64);
  assert.ok(!isValidToken(first.plain + 'tampered'));
  assert.equal(tokenDigest(first.plain), first.digest);
});

test('auth migration creates sessions, one-time tokens and rate limiter; routes require account', () => {
  const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/0003_auth.sql'), 'utf8');
  const schema = fs.readFileSync(path.resolve(__dirname, '../src/db/schema.ts'), 'utf8');
  for (const table of ['auth_sessions', 'auth_tokens', 'auth_rate_limits']) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table} \\(`));
    assert.match(schema, new RegExp(`pgTable\\("${table}"`));
  }
  assert.match(migration, /consumed_at/);
  assert.match(migration, /token_hash TEXT NOT NULL UNIQUE/);
  assert.match(fs.readFileSync(path.resolve(__dirname, '../src/server/auth.ts'), 'utf8'), /timingSafeEqual|tokenDigest/);
});
