import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSnapshot } from '../server/fpl.ts';
import { getRepoVideos } from '../server/repoData.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDataDir = path.join(root, 'dist', 'data');

async function main(): Promise<void> {
  process.env.VORTEX_OFFLINE = process.env.VORTEX_OFFLINE ?? '1';
  await mkdir(outDataDir, { recursive: true });

  const [snapshot, videos] = await Promise.all([getSnapshot(false), getRepoVideos()]);

  await Promise.all([
    writeFile(path.join(outDataDir, 'vortex-snapshot.json'), JSON.stringify(snapshot)),
    writeFile(path.join(outDataDir, 'vortex-videos.json'), JSON.stringify(videos)),
  ]);

  console.log(
    `[static-export] Wrote dist/data/vortex-snapshot.json (${snapshot.players.length} players) and dist/data/vortex-videos.json (${videos.videos.length} videos)`,
  );
}

main().catch((err) => {
  console.error('[static-export] Failed:', err);
  process.exit(1);
});
