import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(import.meta.dirname, '..');
const modules = {};
for (const name of await readdir(resolve(root, 'model'))) {
  if (name.endsWith('.ts')) modules['/model/' + name.replace(/\.ts$/, '.js')] = await readFile(resolve(root, 'model', name), 'utf8');
}
for (const name of ['app.js', 'dashboard.js', 'analysis.js', 'gameweek-points.js', 'availability.js', 'icons.js', 'player-images.js', 'forecasts.js', 'forecast-data.js']) {
  modules['/' + name] = await readFile(resolve(root, 'ui', name), 'utf8');
}
const factories = Object.entries(modules).map(([name, source]) => {
  /* Model sources are TypeScript even though the browser serves them as .js. */
  const fileName = name.startsWith('/model/') ? name.replace(/\.js$/, '.ts') : name;
  const output = ts.transpileModule(source, {fileName, compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  return JSON.stringify(name) + ':function(module,exports,require){\n' + output + '\n}';
}).join(',\n');
const [videos, htmlSource, cssSource, appearance, brand, logo] = await Promise.all([
  readFile(resolve(root, 'ui/videos.json'), 'utf8'),
  readFile(resolve(root, 'ui/index.html'), 'utf8'),
  readFile(resolve(root, 'ui/style.css'), 'utf8'),
  readFile(resolve(root, 'ui/appearance.js'), 'utf8'),
  readFile(resolve(root, 'ui/brand/fpl-vortex-lion.jpg')),
  readFile(resolve(root, 'ui/logo.svg')),
]);
const brandData = 'data:image/jpeg;base64,' + brand.toString('base64');
const logoData = 'data:image/svg+xml;base64,' + Buffer.from(logo).toString('base64');
/* System fonts replace the hosted Manrope file; the large lion JPEG is inlined once, not three times. */
const css = cssSource
  .replace(/@font-face\{[^}]*\}/, '')
  .replace(" url('/brand/fpl-vortex-lion.jpg') center/contain no-repeat", '');
const script = `(()=>{const originalFetch=window.fetch.bind(window);window.fetch=(input,options)=>{const url=String(input);if(url==='/videos.json')return Promise.resolve(new Response(${JSON.stringify(videos)},{headers:{'content-type':'application/json'}}));if(url.startsWith('/api/'))return Promise.resolve(new Response('{}',{status:503}));return originalFetch(input,options);};const factories={${factories}};const cache={};function load(name,parent='/app.js'){if(name.startsWith('.'))name=new URL(name,'https://preview.local'+parent).pathname;if(!name.endsWith('.js'))name+='.js';if(cache[name])return cache[name].exports;if(!factories[name])throw new Error('Missing preview module '+name);const module={exports:{}};cache[name]=module;factories[name](module,module.exports,specifier=>load(specifier,name));return module.exports;}load('/app.js');})();`;
let html = htmlSource
  .replace('<script src="/appearance.js"></script>', '<script>' + appearance.replaceAll('</script', '<\\/script') + '</script>')
  .replace('<link rel="preload" href="/fonts/manrope.ttf" as="font" type="font/ttf" crossorigin>', '')
  .replace('href="/brand/fpl-vortex-lion.jpg"', `href="${logoData}"`)
  .replaceAll('src="/brand/fpl-vortex-lion.jpg"', `src="${brandData}"`)
  .replaceAll('src="/logo.svg"', `src="${logoData}"`)
  .replace('<link rel="stylesheet" href="/style.css">', '<style>' + css.replaceAll('</style', '<\\/style') + '</style>')
  .replace('href="/" aria-label="FPL VORTEX home"', 'href="#" aria-label="FPL VORTEX home" onclick="location.reload();return false;"')
  .replace('<script type="module" src="/app.js"></script>', '<script>' + script.replaceAll('</script', '<\\/script') + '</script>');
html = html.split('\n').map(line => line.replace(/[ \t]+$/, '')).join('\n');
const output = resolve(root, '../DASHBOARD_PREVIEW.html');
await writeFile(output, html);
console.log(output);
