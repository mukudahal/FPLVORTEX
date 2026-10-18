import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateBacktest, validateHistoryBundle } from '../src/historical-validation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validModel = /^[a-zA-Z0-9][\w.-]{0,99}$/;
const validSeason = /^20\d{2}\/\d{2}$/;

export async function createDatabasePool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL must be configured for PostgreSQL research storage');
  const { Pool } = await import('pg');
  return new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 15000 });
}

/** Single transaction makes an entire history import visible or none of it. */
export async function storeHistory(client, rawHistory, options = {}) {
  const history = validateHistoryBundle(rawHistory, options.now ?? new Date());
  const canonical = JSON.stringify(history);
  const digest = createHash('sha256').update(canonical).digest('hex');
  await client.query('BEGIN');
  try {
    const imported = await client.query(`INSERT INTO research_history_imports
      (sha256,schema_version,season,model_id,captured_at,rights,observation_count)
      VALUES ($1,1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT (sha256) DO NOTHING RETURNING sha256`,
      [digest,history.season,history.modelId,history.capturedAt,JSON.stringify(history.rights),history.observations.length]);
    if (imported.rowCount === 0) {
      await client.query('COMMIT');
      return { digest, rows:history.observations.length, imported:false, duplicate:true };
    }
    // Batched parameterized inserts avoid arbitrary SQL and PostgreSQL parameter-count overflow.
    for (let start = 0; start < history.observations.length; start += 250) {
      const batch = history.observations.slice(start, start + 250);
      const values = [];
      const placeholders = batch.map((item,index) => {
        const offset = index * 11;
        values.push(digest,history.season,history.modelId,item.playerId,item.gameweek,item.predictedAt,item.kickoffAt,item.expectedPoints,item.predictedStartProbability,item.actualPoints,item.actualStarted);
        return `(${Array.from({length:11},(_,col)=>`$${offset+col+1}`).join(',')})`;
      });
      const sql = `INSERT INTO research_forecast_outcomes
        (import_sha256,season,model_id,player_id,gameweek,predicted_at,kickoff_at,expected_points,predicted_start_probability,actual_points,actual_started)
        VALUES ${placeholders.join(',')}`;
      await client.query(sql,values);
    }
    await client.query('COMMIT');
    return {digest,rows:history.observations.length,imported:true,duplicate:false};
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function readBacktest(pool, season, modelId) {
  if (typeof season !== 'string' || !validSeason.test(season) || ((Number(season.slice(2,4))+1)%100)!==Number(season.slice(5))) throw new RangeError('Invalid season');
  if (typeof modelId !== 'string' || !validModel.test(modelId)) throw new RangeError('Invalid modelId');
  const result = await pool.query(`SELECT player_id AS "playerId", gameweek, expected_points AS "expectedPoints",
    predicted_start_probability AS "predictedStartProbability", actual_points AS "actualPoints",actual_started AS "actualStarted"
    FROM research_forecast_outcomes WHERE season=$1 AND model_id=$2 ORDER BY gameweek,player_id LIMIT 50001`,[season,modelId]);
  if (result.rows.length > 50_000) throw new RangeError('Backtest too large for interactive API; narrow the dataset');
  const observations = result.rows.map(row=>({
    ...row, playerId:Number(row.playerId),gameweek:Number(row.gameweek),expectedPoints:Number(row.expectedPoints),
    predictedStartProbability:Number(row.predictedStartProbability),actualPoints:Number(row.actualPoints)
  }));
  return {season,modelId,verifiedForecastArchive:false,metrics:evaluateBacktest(observations)};
}

export async function applyMigrations(client) {
  const contents = await readFile(join(root,'migrations/0001_historical_backtests.sql'),'utf8');
  await client.query('BEGIN');
  try {
    // The checked-in migration is fixed trusted SQL, never user-supplied input.
    await client.query(contents);
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
}