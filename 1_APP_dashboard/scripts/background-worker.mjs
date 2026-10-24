import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
const { runBackgroundWorker } = await import('../src/server/jobs/runner.ts');
await runBackgroundWorker({ once: process.argv.includes('--once') });
