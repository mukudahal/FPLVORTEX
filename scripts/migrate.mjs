import { createDatabasePool, applyMigrations } from './history-store.mjs';
async function main() {
  const pool = await createDatabasePool();
  try {
    const client = await pool.connect();
    try { await applyMigrations(client); }
    finally { client.release(); }
    console.log('Research database migration applied successfully');
  } finally { await pool.end(); }
}
main().catch(error=>{console.error(`Migration failed: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;});