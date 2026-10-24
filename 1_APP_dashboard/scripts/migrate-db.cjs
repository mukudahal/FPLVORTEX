'use strict';
/** Postgres transactional migration runner. Running with no args is always dry-run. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const legacyColumns = require('./db-schema-contract.cjs');

const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');
const LOCK_ID = 602741338;

function loadMigrations(dir = MIGRATIONS_DIR) {
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  if (!files.length) throw new Error('No SQL migration files were found.');
  const seen = new Set();
  return files.map((filename, index) => {
    const match = /^(\d{4})_([a-z0-9_]+)\.sql$/.exec(filename);
    if (!match) throw new Error(`Invalid migration name: ${filename}`);
    const sequence = Number(match[1]);
    if (sequence !== index + 1 || seen.has(sequence)) throw new Error(`Migration numbers must be unique and consecutive: ${filename}`);
    seen.add(sequence);
    const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
    if (!sql.trim()) throw new Error(`Empty migration: ${filename}`);
    return { filename, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
  });
}

function validateHistory(migrations, applied) {
  if (applied.length > migrations.length ||
      applied.some((row, index) => row.filename !== migrations[index]?.filename)) {
    throw new Error("Database migration history is not a valid version prefix.");
  }
  for (const row of applied) {
    const known = migrations.find((item) => item.filename === row.filename);
    if (!known || known.checksum !== row.checksum) {
      throw new Error(`Migration checksum drift or unexpected database history: ${row.filename}`);
    }
  }
}

async function checkLegacySchema(client) {
  const query = await client.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
  `, [Object.keys(legacyColumns)]);
  const existing = new Map();
  for (const row of query.rows) {
    const columns = existing.get(row.table_name) ?? new Set();
    columns.add(row.column_name);
    existing.set(row.table_name, columns);
  }
  const absent = Object.entries(legacyColumns).flatMap(([table, fields]) =>
    fields.filter((field) => !existing.get(table)?.has(field)).map((field) => `${table}.${field}`));
  if (absent.length) throw new Error(`Cannot adopt legacy baseline; absent columns: ${absent.join(', ')}`);
}

async function run() {
  const flags = new Set(process.argv.slice(2));
  if ([...flags].some((flag) => !['--apply', '--dry-run', '--adopt-baseline', '--verify'].includes(flag))) {
    throw new Error('Usage: migrate-db.cjs [--dry-run | --apply | --verify | --adopt-baseline]');
  }
  if (flags.size > 1) throw new Error("Choose exactly one migration operation.");
  const migrations = loadMigrations();
  if (flags.size === 0 || flags.has('--dry-run')) {
    migrations.forEach(({ filename, checksum }) => process.stdout.write(`${filename} sha256:${checksum}\n`));
    process.stdout.write('DRY RUN: no connection and no database writes.\n');
    return;
  }
  const { config } = require('dotenv');
  config({ path: '.env.local' });
  config();
  require('./register-typescript.cjs');
  const { readDatabaseUrl } = require('../src/lib/runtimeConfig.ts');
  const { Client } = require('pg');
  const client = new Client({ connectionString: readDatabaseUrl(), connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    const registryExists = await client.query("SELECT to_regclass('public.schema_migrations') AS table_name");
    if (flags.has("--verify") && !registryExists.rows[0].table_name) {
      throw new Error("No migration ledger exists; verification does not create tables.");
    }
    const first = await client.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, [Object.keys(legacyColumns)]);
    if (!registryExists.rows[0].table_name && first.rows.length && !flags.has('--adopt-baseline')) {
      throw new Error('Legacy FPL tables are present without a migration ledger. Back up the database, then run --adopt-baseline first.');
    }
    if (flags.has('--adopt-baseline')) {
      if (registryExists.rows[0].table_name) throw new Error('Migration registry already exists; refusing baseline adoption.');
      await checkLegacySchema(client);
    }
    await client.query('BEGIN');
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      if (flags.has('--adopt-baseline')) {
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [migrations[0].filename, migrations[0].checksum]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    const current = await client.query('SELECT filename, checksum FROM schema_migrations ORDER BY filename');
    validateHistory(migrations, current.rows);
    if (flags.has('--verify') && current.rows.length !== migrations.length) {
      throw new Error(`Pending database migrations: ${migrations.length - current.rows.length}. Run --apply after a backup.`);
    }
    if (flags.has('--verify') || flags.has('--adopt-baseline')) {
      process.stdout.write(`Verified ${current.rows.length} migration records. Database unchanged except initial ledger adoption, if requested.\n`);
      return;
    }
    const already = new Set(current.rows.map((row) => row.filename));
    for (const migration of migrations) {
      if (already.has(migration.filename)) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [migration.filename, migration.checksum]);
        await client.query('COMMIT');
        process.stdout.write(`APPLIED ${migration.filename}\n`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${migration.filename} rolled back: ${error.message}`);
      }
    }
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]); } finally { await client.end(); }
  }
}

if (require.main === module) run().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
module.exports = { loadMigrations, validateHistory };
