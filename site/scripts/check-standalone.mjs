import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/** The checked-in standalone preview must contain a complete, syntactically valid module graph. */
const html = await readFile(new URL('../../DASHBOARD_PREVIEW.html', import.meta.url), 'utf8');
const match = html.match(/const factories=\{([\s\S]*?)\};const cache/);
assert.ok(match, 'Standalone preview is missing its module factories');
let factories;
try {
  factories = eval('({' + match[1] + '})');
} catch (error) {
  throw new Error('Standalone preview contains invalid JavaScript: ' + error.message);
}
const names = Object.keys(factories);
for (const required of ['/app.js', '/dashboard.js', '/analysis.js', '/gameweek-points.js', '/availability.js', '/icons.js', '/player-images.js', '/forecasts.js', '/forecast-data.js', '/model/xpts.js', '/model/dashboardMath.js']) {
  assert.ok(factories[required], 'Missing standalone module ' + required);
}
let references = 0;
for (const [name, factory] of Object.entries(factories)) {
  assert.equal(typeof factory, 'function', name + ' is not a module factory');
  for (const call of factory.toString().matchAll(/require\(["']([^"']+)["']\)/g)) {
    const specifier = call[1];
    const resolved = (specifier.startsWith('.') ? new URL(specifier, 'https://preview.local' + name).pathname : specifier) + (specifier.endsWith('.js') ? '' : '.js');
    assert.ok(factories[resolved], `${name} imports ${specifier}, which is missing from the standalone preview`);
    references++;
  }
}
assert.ok(references > 20, 'Expected the full browser module graph in the standalone preview');
for (const leftover of ['src="/app.js"', 'src="/appearance.js"', 'href="/style.css"', 'href="/fonts/manrope.ttf"', 'src="/brand/fpl-vortex-lion.jpg"', 'new Map < number']) {
  assert.ok(!html.includes(leftover), 'Standalone preview still references an un-inlined asset or TypeScript syntax: ' + leftover);
}
assert.ok(html.includes('analysis-grid'), 'Standalone preview must include the completed Gameweek Analysis view');
console.log(`Standalone preview: ${names.length} modules and ${references} resolved imports, all assets inlined.`);
