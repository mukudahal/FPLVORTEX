import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
async function waitForSimulation() {
  await page.locator('.mc-paths-list .mc-range-row').first().or(page.getByText('SIMULATION UNAVAILABLE', { exact: true })).first().waitFor({ timeout: 120000 });
  assert.ok(await page.locator('.mc-range-row').count() > 0, await page.locator('[role="alert"]').allTextContents());
}
page.on('pageerror', error => failures.push(error.message));
await mkdir('test-results/planner', { recursive: true });
try {
  await page.goto((process.env.PLANNER_BASE_URL ?? 'http://127.0.0.1:3000') + '/#/optimizer', { waitUntil: 'domcontentloaded' });
  await page.locator('.vx-planner-overview').waitFor({ timeout: 90000 });
  const pitchClass = await page.locator('.vx-soccer-pitch').first().getAttribute('class');
  await page.getByText('Advanced tools · transfers & chips', { exact: true }).click();
  await page.getByRole('button', { name: /Auto-Build £/ }).click();
  await page.getByRole('tab', { name: /3. Monte Carlo/ }).click();
  await waitForSimulation();
  assert.ok(await page.locator('.mc-range-row').count() >= 3, 'Expected hold, transfers and chip strategies');
  assert.ok(await page.getByText(/not a probability of a green arrow/).isVisible());
  assert.equal(await page.locator('.vx-soccer-pitch').first().getAttribute('class'), pitchClass);
  await page.screenshot({ path: 'test-results/planner/simulation-desktop.png', fullPage: true });
  await page.getByRole('tab', { name: /2. Chip Strategy/ }).click();
  await page.getByRole('region', { name: 'Joint chip schedule' }).waitFor();
  assert.ok(await page.locator('.chip-matrix-table tbody tr').count() > 0);
  await page.screenshot({ path: 'test-results/planner/chips-desktop.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Free transfers available' }).selectOption('0');
  await page.getByRole('tab', { name: /3. Monte Carlo/ }).click();
  await waitForSimulation();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/planner/simulation-mobile.png', fullPage: true });
  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(bodyWidth <= 406, 'Planner should keep page-level overflow within the narrow viewport');
  await page.getByRole('tab', { name: /1. Team Planner/ }).click();
  await page.getByRole('combobox', { name: 'Simulation draws' }).focus();
  assert.ok(await page.getByRole('combobox', { name: 'Simulation draws' }).evaluate(el => el === document.activeElement));
  assert.deepEqual(failures, [], 'No uncaught page or worker errors');
  // A fresh session with a blocked module-worker must recover into an explicit error state.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/assets/planner.worker-*.js', route => route.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.vx-planner-overview').waitFor({ timeout: 90000 });
  await page.getByText('Advanced tools · transfers & chips', { exact: true }).click();
  await page.getByRole('button', { name: /Auto-Build £/ }).click();
  await page.getByText('Simulation could not finish. Reload the page and try again.', { exact: true }).waitFor({ timeout: 30000 });
  console.log('Planner browser checks passed: production worker, tabs, zero FT, keyboard, mobile, worker failure recovery.');
} catch (error) {
  await page.screenshot({ path: 'test-results/planner/failure.png', fullPage: true });
  console.error((await page.locator('body').innerText()).slice(-16000));
  throw error;
} finally {
  await browser.close();
}
