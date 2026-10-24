import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function resolve(specifier, context, nextResolve) {
  let candidate = null;
  if (specifier.startsWith('@/')) candidate = path.join(root, 'src', specifier.slice(2));
  else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    candidate = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (candidate) {
    for (const filename of [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, 'index.ts')]) {
      if (existsSync(filename)) return { url: pathToFileURL(filename).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
