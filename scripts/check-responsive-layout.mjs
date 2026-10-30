/** Phase 1 UI acceptance only. Demo/stress fixtures are never production recommendations. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const base = process.env.PLANNER_BASE_URL ?? 'http://127.0.0.1:3000';
const directory = 'test-results/planner/responsive';
const widths = [320, 375, 390, 414, 768, 1280, 1920];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
const page = await context.newPage();
const pageErrors = [];
const observations = [];
page.on('pageerror', error => pageErrors.push(error.message));
await mkdir(directory, { recursive: true });

// Obtain the existing archived demo through the actual normaliser in an offline
// subprocess. Never assume a numeric test ID is an unregistered public manager.
const { stdout } = await promisify(execFile)(process.execPath, [
  '--import', 'tsx', '--input-type=module', '-e',
  "import {getEntry,getSnapshot} from './server/fpl.ts'; const snapshot=await getSnapshot(); const entry=await getEntry('999999'); process.stdout.write('LAYOUT_FIXTURE='+JSON.stringify({snapshot,entry}));",
], { env: { ...process.env, VORTEX_OFFLINE: '1' }, maxBuffer: 5_000_000 });
const fixture = JSON.parse(stdout.slice(stdout.lastIndexOf('LAYOUT_FIXTURE=') + 'LAYOUT_FIXTURE='.length));
assert.equal(fixture.entry.provenance.kind, 'demo');
assert.equal(fixture.entry.teamName, 'Template XI');
await context.route('**/api/vortex/snapshot*', route => route.fulfill({ json: fixture.snapshot }));
await context.route('**/api/vortex/entry/999999*', route => route.fulfill({ json: fixture.entry }));

await context.addInitScript(() => {
  localStorage.setItem('vortex:linkedManagerId', JSON.stringify('999999'));
  localStorage.setItem('vortex:theme', JSON.stringify('dark'));
});

async function capture(name, locator) {
  if (locator) await locator.screenshot({ path: `${directory}/${name}.png`, animations: 'disabled' });
  else await page.screenshot({ path: `${directory}/${name}.png`, animations: 'disabled' });
}

async function inspect(name, { metrics = false, controls = false } = {}) {
  const result = await page.evaluate(({ metrics, controls }) => {
    const issues = [];
    const width = window.innerWidth;
    const bounds = element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    const checkText = (element, container, label) => {
      if (!visible(element)) return;
      const range = document.createRange();
      range.selectNodeContents(element);
      const a = range.getBoundingClientRect(), b = container.getBoundingClientRect();
      // Font ink can exceed a tight desktop line box without being clipped.
      // Header ink must fit the header itself; its horizontal allocation and
      // neighbouring control rectangles are still checked independently.
      const vertical = container.closest('.topbar')?.getBoundingClientRect() ?? b;
      if (a.left < b.left - 2 || a.right > b.right + 2 || a.top < vertical.top - 2 || a.bottom > vertical.bottom + 2) issues.push(`${label}: text extends outside its container`);
    };
    if (document.documentElement.scrollWidth > width + 1) issues.push(`Page overflows: ${document.documentElement.scrollWidth} > ${width}`);
    const headerSelectors = ['.topbar__brand-lion', '.topbar__identity', '.topbar__deadline', '.topbar__local-widget', '.topbar__global-search', '.topbar__sync', '.topbar__utilities .vortex-theme-switch'];
    const header = headerSelectors.flatMap(selector => {
      const element = document.querySelector(selector);
      return element && visible(element) ? [{ selector, ...bounds(element) }] : [];
    });
    for (const a of header) {
      if (a.left < -1 || a.right > width + 1) issues.push(`${a.selector}: outside header viewport`);
      for (const b of header) {
        if (a.selector >= b.selector) continue;
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) issues.push(`Header overlap: ${a.selector} / ${b.selector}`);
      }
    }
    for (const selector of ['.topbar__channel', '.topbar__deadline strong', '.topbar__deadline small', '.topbar__deadline > b', '.topbar__local-clock time']) {
      const element = document.querySelector(selector);
      if (element) checkText(element, element.parentElement, selector);
    }
    if (metrics) {
      for (const element of document.querySelectorAll('.vx-score-metric')) {
        const label = element.querySelector('span'), value = element.querySelector('strong');
        if (label) checkText(label, element, label.textContent);
        if (value) checkText(value, element, value.textContent);
        if (label && value && label.getBoundingClientRect().bottom > value.getBoundingClientRect().top + 1) issues.push(`Metric overlap: ${label.textContent}`);
      }
      const team = document.querySelector('.vx-squad-scorebox__team strong');
      if (team) checkText(team, team.parentElement, 'Team name');
      const heading = document.querySelector('.vx-gw-bar__left'), stepper = document.querySelector('.vx-gw-stepper');
      if (heading && stepper) {
        const a = bounds(heading), b = bounds(stepper);
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) issues.push('Review heading overlaps gameweek controls');
      }
    }
    if (controls) {
      for (const element of document.querySelectorAll('.profile-option, .subtab-btn')) {
        for (const text of element.querySelectorAll('span, small')) checkText(text, element, 'Planner control');
      }
      for (const element of document.querySelectorAll('.mc-range-row__badges')) {
        const r = bounds(element), parent = bounds(element.closest('.mc-range-row'));
        if (r.right > parent.right + 1) issues.push('Simulation badges extend outside card');
      }
    }
    const topbar = document.querySelector('.topbar');
    return { width, issues, header, headerHeight: topbar?.getBoundingClientRect().height, metricColumns: metrics ? getComputedStyle(document.querySelector('.vx-squad-scorebox__metrics')).gridTemplateColumns : null };
  }, { metrics, controls });
  observations.push({ name, ...result });
}

try {
  await page.goto(`${base}/#/review`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'FPL Team ID', exact: true }).first().waitFor({ timeout: 90000 });
  await page.locator('.vx-squad-scorebox__team strong').filter({ hasText: 'Template XI' }).waitFor({ timeout: 60000 });
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 900 : 1080 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await inspect(`review-${width}`, { metrics: true });
    await capture(`review-${width}`);
    await capture(`review-summary-${width}`, page.locator('.vx-squad-scorebox'));
    if (width >= 1280) {
      const columns = await page.locator('.vx-squad-scorebox__metrics').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      assert.equal(columns, 7, 'Desktop retains the seven-metric row');
    }
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    const clearance = await page.evaluate(() => {
      const nav = document.querySelector('.mobile-nav'), footer = document.querySelector('.app-footer');
      return !nav || !nav.getClientRects().length || !footer ? true : footer.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top;
    });
    assert.ok(clearance, `Bottom navigation covers final content at ${width}px`);
  }

  // The same native disclosure must open/close from the keyboard without changing the data.
  const artwork = page.getByText('CAPTAIN ARTWORK · SQUAD HIGHLIGHTS', { exact: true });
  await artwork.press('Enter');
  assert.equal(await page.locator('.vx-review-artwork').evaluate(el => el.open), true);
  const clear = page.getByRole('button', { name: 'Clear typed FPL Team ID', exact: true });
  await clear.press('Enter');
  const savedInput = page.getByRole('combobox', { name: 'FPL Team ID', exact: true });
  assert.equal(await savedInput.inputValue(), '');
  const savedToggle = page.getByRole('button', { name: 'Show saved FPL Team IDs', exact: true });
  if (await savedToggle.getAttribute('aria-expanded') === 'true') await savedToggle.press('Space');
  await savedToggle.press('Space');
  assert.equal(await savedToggle.getAttribute('aria-expanded'), 'true');
  await artwork.press('Enter');
  assert.equal(await page.locator('.vx-review-artwork').evaluate(el => el.open), false);

  // Stress values are test-only and explicitly retain demo provenance.
  const stressEntry = structuredClone(fixture.entry);
  stressEntry.teamName = 'Layout test — a long manager team name that must wrap safely';
  stressEntry.history.overallRank = 9999999;
  stressEntry.previousOverallRank = 12345678;
  stressEntry.history.totalPoints = 12345678;
  stressEntry.overallRank = 9999999;
  await page.route('**/api/vortex/entry/999999*', route => route.fulfill({ json: stressEntry }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText(stressEntry.teamName, { exact: true }).first().waitFor({ timeout: 90000 });
  for (const width of [320, 375, 390, 414]) {
    await page.setViewportSize({ width, height: 900 });
    await inspect(`review-long-values-${width}`, { metrics: true });
    await capture(`review-long-values-${width}`, page.locator('.vx-squad-scorebox'));
  }
  await page.unroute('**/api/vortex/entry/999999*');

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'PLANNER', exact: true }).click();
  await page.locator('.vx-planner-overview').waitFor({ timeout: 60000 });
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 900 : 1080 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await inspect(`planner-${width}`);
    await capture(`planner-${width}`);
  }
  const advanced = page.getByText('Advanced tools · transfers & chips', { exact: true });
  await advanced.press('Enter');
  assert.equal(await page.locator('.vx-planner-legacy').evaluate(el => el.open), true);
  await page.getByRole('button', { name: /Auto-Build £/ }).click();
  await page.getByRole('tab', { name: /3. Monte Carlo/ }).click();
  await page.locator('.mc-range-row').first().waitFor({ timeout: 120000 });
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 900 : 1080 });
    await inspect(`planner-expanded-${width}`, { controls: true });
    await capture(`planner-controls-${width}`, page.locator('.optimizer-header-panel'));
    await capture(`planner-results-${width}`, page.getByRole('region', { name: 'Monte Carlo strategy distribution' }));
  }
  await page.getByRole('combobox', { name: 'Simulation draws' }).selectOption('10000');
  await page.getByText(/10,000 PAIRED DRAWS/).waitFor({ timeout: 120000 });
  for (const width of [320, 414]) {
    await page.setViewportSize({ width, height: 900 });
    await inspect(`planner-10000-${width}`, { controls: true });
  }

  // Existing theme toggle: retain readable mobile geometry in the light theme.
  await page.getByRole('switch', { name: 'Switch to light theme' }).click();
  for (const width of [375, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await inspect(`planner-light-${width}`, { controls: true });
    await capture(`planner-light-${width}`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await advanced.press('Enter');
  assert.equal(await page.locator('.vx-planner-legacy').evaluate(el => el.open), false);

  const unavailableContext = await browser.newContext({ viewport: { width: 320, height: 740 }, serviceWorkers: 'block' });
  const unavailablePage = await unavailableContext.newPage();
  let releaseSnapshot;
  const snapshotGate = new Promise(resolve => { releaseSnapshot = resolve; });
  await unavailablePage.route('**/api/vortex/snapshot', async route => {
    await snapshotGate;
    await route.abort();
  });
  await unavailablePage.route('**/data/*snapshot.json', route => route.abort());
  await unavailablePage.goto(`${base}/#/review`, { waitUntil: 'domcontentloaded' });
  await unavailablePage.getByRole('status').first().waitFor();
  await unavailablePage.screenshot({ path: `${directory}/loading-320.png`, animations: 'disabled' });
  releaseSnapshot();
  await unavailablePage.getByRole('heading', { name: 'Data engine unavailable' }).waitFor({ timeout: 30000 });
  await unavailablePage.getByRole('button', { name: 'Try again' }).focus();
  assert.equal(await unavailablePage.getByRole('button', { name: 'Try again' }).evaluate(el => el === document.activeElement), true);
  assert.ok(await unavailablePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Error state overflows narrow viewport');
  await unavailablePage.screenshot({ path: `${directory}/unavailable-320.png`, animations: 'disabled' });
  await unavailableContext.close();
  const layoutIssues = observations.flatMap(row => row.issues.map(issue => `${row.name}: ${issue}`));
  assert.deepEqual(layoutIssues, [], layoutIssues.join('; '));
  assert.deepEqual(pageErrors, [], 'No uncaught browser errors');
  console.log('Responsive checks passed: seven widths, header overlap, metric text bounds, long names/values, real planner worker, keyboard, bottom navigation, light theme and reduced motion.');
} catch (error) {
  await capture('failure').catch(() => {});
  throw error;
} finally {
  await writeFile(`${directory}/layout-assertions.json`, JSON.stringify({ scope: 'Phase 1 responsive UI; archived demo/test-only stress data', pageErrors, observations }, null, 2));
  await browser.close();
}
