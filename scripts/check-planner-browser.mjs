import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--single-process', '--no-zygote'] } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const failures = [];
async function waitForSimulation() {
  await page.locator('.mc-paths-list .mc-range-row').first().waitFor({ timeout: 120000 });
}
page.on('pageerror', error => failures.push(error.message));
await mkdir('test-results/planner', { recursive: true });
try {
  await page.goto((process.env.PLANNER_BASE_URL ?? 'http://127.0.0.1:3000') + '/#/optimizer', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /1. Team Planner & Solver/ }).waitFor({ timeout: 90000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  assert.equal(await page.locator('.vx-soccer-pitch').count(), 1, 'Team planner should show one pitch');
  assert.equal(await page.locator('.vx-planner-fixtures').count(), 0, 'No repeated FDR table');
  await page.locator('.vx-planner-overview').waitFor();
  const strategy = page.getByRole('combobox', { name: 'Strategy' });
  assert.deepEqual(await strategy.locator('option').allTextContents(), ['Steady', 'Top 10K', 'Template']);
  await strategy.selectOption('top10k');
  assert.ok(await page.getByText(/Strategy names are labels only/).isVisible());
  await page.getByRole('combobox', { name: 'Planning horizon' }).selectOption('3');
  assert.equal(await page.locator('.vx-planner-gws button').count(), 3);
  await page.getByRole('combobox', { name: 'Planning horizon' }).selectOption('5');
  const pitchClass = await page.locator('.vx-soccer-pitch').first().getAttribute('class');
  await page.getByRole('button', { name: 'Suggest transfers' }).waitFor();
  await page.getByText('RUNNING SIMULATION', { exact: true }).waitFor({ state: 'hidden', timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('.planner-suggest')?.disabled, null, { timeout: 120000 });
  await page.getByRole('button', { name: 'Suggest transfers' }).click();
  await page.getByText('VORTEX suggested transfer path').waitFor();
  const pathBefore = await page.locator('.planner-week-list').innerText();
  await strategy.selectOption('template');
  assert.equal(await page.locator('.planner-week-list').innerText(), pathBefore, 'Label-only strategy does not change recommendations');
  for (const width of [320, 375, 390, 414, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(pageWidth <= width, `Team planner overflows at ${width}px: ${pageWidth}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/planner/team-plan-desktop.png', fullPage: true });
  assert.equal(await page.locator('.vx-soccer-pitch').count(), 1);
  assert.ok(await page.locator('.planner-week').count() > 0);
  const firstMove = page.locator('.planner-move').first();
  if (await firstMove.count()) {
    const incoming = await firstMove.getAttribute('data-in-id');
    await firstMove.locator('xpath=ancestor::button').click();
    assert.equal(await page.locator(`.vx-soccer-pitch [data-player-id="${incoming}"]`).count(), 1, 'Suggested incoming player appears on the selected gameweek pitch');
  }
  await page.getByRole('button', { name: /3. Monte Carlo/ }).click();
  await waitForSimulation();
  assert.ok(await page.locator('.mc-range-row').count() >= 3, 'Expected hold, transfers and chip strategies');
  assert.equal(await page.getByText('Recommended plan', { exact: true }).count(), 1);
  assert.ok(await page.getByText(/Versus best transfer plan \(chips saved\):/).count() >= 2);
  assert.ok(await page.getByText(/Win share sampling interval \(95%\):/).count() >= 2);
  assert.ok(await page.getByText(/not a probability of a green arrow/).isVisible());
  assert.equal(await page.locator('.vx-soccer-pitch').count(), 0, 'Only the selected section should be visible');
  await page.screenshot({ path: 'test-results/planner/simulation-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /2. Chip Strategy/ }).click();
  await page.getByRole('region', { name: 'Joint chip schedule' }).waitFor();
  assert.ok(await page.locator('.chip-matrix-table tbody tr').count() > 0);
  await page.screenshot({ path: 'test-results/planner/chips-desktop.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Free transfers available' }).selectOption('0');
  await page.getByRole('button', { name: /3. Monte Carlo/ }).click();
  await waitForSimulation();
  await page.getByRole('combobox', { name: 'Simulation draws' }).selectOption('10000');
  await page.getByText(/10,000 PAIRED DRAWS/).waitFor({ timeout: 120000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/planner/simulation-mobile.png', fullPage: true });
  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(bodyWidth <= 406, 'Planner should keep page-level overflow within the narrow viewport');
  await page.getByRole('button', { name: /1. Team Planner/ }).click();
  assert.equal(await page.locator('.vx-soccer-pitch').first().getAttribute('class'), pitchClass);
  await page.getByRole('button', { name: /1. Team Planner & Solver/ }).focus();
  assert.ok(await page.getByRole('button', { name: /1. Team Planner & Solver/ }).evaluate(el => el === document.activeElement));
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.vx-soccer-pitch').count(), 1, 'The selected section stays open');
  assert.deepEqual(failures, [], 'No uncaught page or worker errors');
  // A fresh session with a blocked module-worker must recover into an explicit error state.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.context().route('**/assets/planner.worker-*.js', route => route.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /1. Team Planner & Solver/ }).waitFor({ timeout: 90000 });
  await page.getByText('Simulation could not finish. Reload the page and try again.', { exact: true }).waitFor({ timeout: 30000 });
  console.log('Planner browser checks passed: production worker, tabs, zero FT, keyboard, mobile, worker failure recovery.');
} catch (error) {
  await page.screenshot({ path: 'test-results/planner/failure.png', fullPage: true });
  console.error((await page.locator('body').innerText()).slice(-16000));
  throw error;
} finally {
  await browser.close();
}

