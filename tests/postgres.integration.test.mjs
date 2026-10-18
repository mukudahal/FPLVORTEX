import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMigrations, readBacktest, storeHistory } from '../scripts/history-store.mjs';
import { historyFixture } from './history-fixtures.mjs';

test('real PostgreSQL migration, atomic import, conflict rollback and analytical query', {skip: !process.env.TEST_DATABASE_URL}, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({connectionString:process.env.TEST_DATABASE_URL,connectionTimeoutMillis:5000});
  const client = await pool.connect();
  let digest;
  try {
    await applyMigrations(client);
    await applyMigrations(client);
    const first = await storeHistory(client,historyFixture());
    digest = first.digest;
    assert.equal(first.imported,true);
    assert.equal(first.rows,3);
    const repeat = await storeHistory(client,historyFixture());
    assert.equal(repeat.duplicate,true);
    const report = await readBacktest(client,'2025/26','vortex-prototype-0.2');
    assert.equal(report.metrics.samples,3);
    assert.equal(report.metrics.mae,1.6667);
    const conflict = historyFixture();
    conflict.observations[0].expectedPoints = 4.1;
    await assert.rejects(() => storeHistory(client, conflict), /duplicate key|unique constraint/i);
    const totals = await client.query('SELECT count(*)::integer AS total FROM research_history_imports WHERE season=$1',['2025/26']);
    assert.equal(totals.rows[0].total,1);
    const rows = await client.query('SELECT count(*)::integer AS total FROM research_forecast_outcomes WHERE import_sha256=$1',[digest]);
    assert.equal(rows.rows[0].total,3);
  } finally {
    if (digest) {
      await client.query('DELETE FROM research_forecast_outcomes WHERE import_sha256=$1',[digest]);
      await client.query('DELETE FROM research_history_imports WHERE sha256=$1',[digest]);
    }
    client.release();
    await pool.end();
  }
});