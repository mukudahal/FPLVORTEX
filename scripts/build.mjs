import { cp, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(root, 'dist'), { recursive: true });
await copyFile(join(root, 'public', 'index.html'), join(root, 'dist', 'index.html'));
await cp(join(root, 'public', 'assets'), join(root, 'dist', 'assets'), { recursive: true });
console.log('Built FPLVORTEX into dist/');