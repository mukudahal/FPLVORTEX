'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadMigrations, validateHistory } = require('./migrate-db.cjs');

test('versioned SQL migrations have consecutive IDs, deterministic checksums, and no empty scripts', () => {
  const migrations = loadMigrations();
  assert.ok(migrations.length >= 1);
  assert.deepEqual(migrations, loadMigrations());
  assert.ok(migrations.every((item) => /^[0-9a-f]{64}$/.test(item.checksum)));
  validateHistory(migrations, [{ filename: migrations[0].filename, checksum: migrations[0].checksum }]);
  assert.throws(() => validateHistory(migrations, [{ filename: migrations[0].filename, checksum: 'tampered' }]), /drift/);
  assert.throws(() => validateHistory(migrations, [{ filename: '9999_unexpected.sql', checksum: 'x' }]), /prefix/);
});

test('migration runner rejects missing sequence numbers and duplicate IDs', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fpl-migrations-'));
  try {
    fs.writeFileSync(path.join(temporary, '0002_skipped.sql'), 'SELECT 1;');
    assert.throws(() => loadMigrations(temporary), /consecutive/);
    fs.renameSync(path.join(temporary, '0002_skipped.sql'), path.join(temporary, '0001_first.sql'));
    fs.writeFileSync(path.join(temporary, '0001_duplicate.sql'), 'SELECT 2;');
    assert.throws(() => loadMigrations(temporary), /consecutive/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
