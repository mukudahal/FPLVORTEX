'use strict';
const { config } = require('dotenv');
const path = require('node:path');
require('./register-typescript.cjs');
const { readDatabaseUrl, readCronSecret, readPublicSiteUrl, readAiConfiguration } = require(path.resolve(__dirname, '../src/lib/runtimeConfig.ts'));
config({ path: '.env.local' });
config();

const errors = [];
function verify(label, fn) {
  try { fn(); process.stdout.write(`PASS ${label}\n`); }
  catch (error) { errors.push(label); process.stderr.write(`FAIL ${label}: ${error.message}\n`); }
}
verify('DATABASE_URL', () => readDatabaseUrl());
verify('SITE_URL', () => readPublicSiteUrl());
verify('AI_CONFIG', () => readAiConfiguration());
if (!readCronSecret()) errors.push('CRON_SECRET');
process.stdout.write(readCronSecret() ? 'PASS CRON_SECRET\n' : 'FAIL CRON_SECRET: missing or shorter than 16 characters\n');
if (errors.length) process.exitCode = 1;
