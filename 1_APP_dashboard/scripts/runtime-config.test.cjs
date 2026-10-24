'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readDatabaseUrl, readCronSecret, readPublicSiteUrl, readAiConfiguration } = require(path.resolve(__dirname, '../src/lib/runtimeConfig.ts'));

test('config rejects invalid database URL without exposing credentials', () => {
  assert.throws(() => readDatabaseUrl({}), /DATABASE_URL/);
  assert.throws(() => readDatabaseUrl({ DATABASE_URL: 'https://example.com/foo' }), /postgresql/);
  assert.throws(() => readDatabaseUrl({ DATABASE_URL: 'postgresql://user:pass@localhost' }), /postgresql/);
  assert.equal(readDatabaseUrl({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/vortex' }), 'postgresql://user:pass@localhost:5432/vortex');
});

test('public URLs reject credentials, HTTP production origins and malformed URL', () => {
  assert.equal(readPublicSiteUrl({}), 'http://localhost:3000');
  assert.equal(readPublicSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://example.com/path' }), 'https://example.com');
  assert.throws(() => readPublicSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://user:password@example.com' }), /origin/);
  assert.throws(() => readPublicSiteUrl({ NEXT_PUBLIC_SITE_URL: 'http://example.com', NODE_ENV: 'production' }), /origin/);
});

test('cron and AI are opt-in; no implicit paid model is selected', () => {
  assert.equal(readCronSecret({}), null);
  assert.equal(readCronSecret({ CRON_SECRET: 'short' }), null);
  assert.equal(readCronSecret({ CRON_SECRET: 'very-long-unique-secret' }), 'very-long-unique-secret');
  assert.equal(readAiConfiguration({ FPL_AI_ENABLED: 'false' }), null);
  assert.throws(() => readAiConfiguration({ FPL_AI_ENABLED: 'true' }), /requires/);
  assert.deepEqual(readAiConfiguration({ FPL_AI_ENABLED: 'true', OPENAI_API_KEY: 'test', FPL_COPILOT_MODEL: 'provider-model-id' }), { apiKey: 'test', model: 'provider-model-id' });
});
