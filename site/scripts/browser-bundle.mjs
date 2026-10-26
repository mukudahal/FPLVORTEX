import { stripTypeScriptTypes } from 'node:module';
import { readFile } from 'node:fs/promises';

/**
 * Bundle the browser's absolute/relative ESM graph into nested data URLs.
 * Node can then import the real UI modules without a browser or a dependency install.
 * TypeScript model files are type-stripped in place; no transpiler is required.
 */
export function createBrowserBundler(siteRoot, uiRoot) {
  const cache = new Map();
  const importPattern = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])([^'"]+)\2/g;

  async function loadSource(url) {
    const candidates = [url];
    if (/\.(js|mjs|ts)$/.test(url.pathname)) {
      if (url.pathname.endsWith('.js')) candidates.push(new URL(url.pathname.replace(/\.js$/, '.ts'), url));
    } else {
      candidates.push(new URL(url.href + '.ts'), new URL(url.href + '.js'));
    }
    for (const candidate of candidates) {
      try {
        const source = await readFile(candidate, 'utf8');
        return {source: candidate.pathname.endsWith('.ts') ? stripTypeScriptTypes(source, {mode:'strip'}) : source, url: candidate};
      } catch {}
    }
    throw new Error('Cannot resolve browser module ' + url.href);
  }

  function resolveSpecifier(specifier, parent) {
    if (specifier.startsWith('/model/')) return new URL('./' + specifier.slice(1), siteRoot);
    if (specifier.startsWith('/')) return new URL('.' + specifier, uiRoot);
    if (specifier.startsWith('.')) return new URL(specifier, parent);
    return null;
  }

  async function bundle(specifier, parent = uiRoot) {
    const url = resolveSpecifier(specifier, parent);
    if (!url) return null;
    if (cache.has(url.href)) return cache.get(url.href);
    const {source} = await loadSource(url);
    const replacements = new Map();
    for (const match of source.matchAll(importPattern)) {
      const childUrl = resolveSpecifier(match[3], url);
      if (!childUrl) continue;
      const dataUrl = await bundle(match[3], url);
      replacements.set(match[0], match[1] + match[2] + dataUrl + match[2]);
    }
    let output = source;
    for (const [original, replacement] of replacements) output = output.replaceAll(original, replacement);
    const dataUrl = 'data:text/javascript;base64,' + Buffer.from(output).toString('base64');
    cache.set(url.href, dataUrl);
    return dataUrl;
  }

  return {bundle};
}
