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
  const base = process.env.PLANNER_BASE_URL ?? 'http://127.0.0.1:3000';
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /1. Team Planner & Solver/ }).waitFor({ timeout: 90000 });
  assert.equal(await page.locator('.planner-team-link').count(), 1, 'Homepage must open in the 10-GW planner with a team loader');
  const managerInput = page.getByRole('textbox', { name: 'FPL Team ID' });
  const loadTeamButton = page.getByRole('button', { name: 'Load team' });
  assert.ok(await loadTeamButton.isDisabled(), 'Empty manager ID must not initiate a fetch');
  await managerInput.fill('123456');
  assert.ok(await loadTeamButton.isEnabled(), 'A syntactically valid manager ID enables team sync');
  await managerInput.fill('');
  await page.goto(base + '/#/optimizer', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /1. Team Planner & Solver/ }).waitFor({ timeout: 90000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const sourceBadges = page.locator('.vx-planner-data-flags b');
  assert.equal(await sourceBadges.count(), 2, 'Planner must distinguish official FPL retrieval and bookmaker odds confidence');
  assert.match(await sourceBadges.nth(0).innerText(), /FPL: (fresh|stale|unverified|unavailable)/i);
  assert.match(await sourceBadges.nth(1).innerText(), /ODDS: (fresh|stale|unverified|unavailable)/i);
  const health = await page.request.get((process.env.PLANNER_BASE_URL ?? 'http://127.0.0.1:3000') + '/api/vortex/data-status');
  assert.equal(health.status(), 200, 'Public source-health route must be available');
  const healthJson = await health.json();
  assert.ok(healthJson.officialFpl && healthJson.market && healthJson.model);
  assert.ok(['fresh', 'stale', 'unverified', 'unavailable'].includes(healthJson.officialFpl.state));
  assert.equal(healthJson.model.calibration, 'unverified', 'Provisional model must not claim calibrated forecasts');
  assert.ok(!JSON.stringify(healthJson).includes('ODDS_API_KEY'), 'Source-health API must not expose credentials');
  assert.equal(await page.locator('.vx-soccer-pitch').count(), 1, 'Team planner should show one pitch');
  assert.equal(await page.locator('.vx-planner-fixtures').count(), 1, 'FDR table should appear alongside the pitch');
  assert.equal(await page.locator('.vx-planner-fixtures tbody tr').count(), 20);
  assert.equal(await page.getByRole('button', { name: 'Suggest transfers' }).count(), 0);
  assert.equal(await page.locator('.vx-planner-gws button').count(), 10, 'Planner defaults to next 10 verified GWs');
  assert.match(await page.locator('.vx-planner-timeline-summary').innerText(), /10-GW PLANNING ROADMAP/);
  await page.getByRole('combobox', { name: 'Fixture gameweeks' }).selectOption('5');
  assert.equal(await page.locator('.vx-planner-gws button').count(), 5, 'Short horizon must work');
  await page.getByRole('combobox', { name: 'Fixture gameweeks' }).selectOption('10');
  assert.equal(await page.locator('.vx-planner-gws button').count(), 10);
  await page.getByRole('button', { name: 'Sort by average difficulty' }).click();
  const pitchClass = await page.locator('.vx-soccer-pitch').first().getAttribute('class');
  for (const width of [320, 375, 390, 414, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(pageWidth <= width, `Team planner overflows at ${width}px: ${pageWidth}px`);
  }
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    for (const selector of ['.vx-soccer-pitch', '.vx-planner-fixtures']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.y + box.height <= 800, `${selector} does not fit the 800px viewport at ${width}px`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/planner/team-plan-desktop.png', fullPage: true });

  // Verify Fix 1 -> Fix 2 -> Fix 3 in the Transfer Plans popup window
  await page.getByRole('button', { name: /1\. Team Planner & Solver/ }).click();
  await page.locator('[data-testid="vx-transfer-plans-modal"]').waitFor({ timeout: 15000 });
  await page.getByText('Transfer plans', { exact: true }).waitFor();
  await page.getByText('0 of 10 plan slots used', { exact: true }).waitFor();
  await page.getByText('Create your first plan', { exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/planner/fix1-transfer-plans.png' });

  // Fix 2: Click New + -> opens full VORTEX Transfer Plan editor with NEXT 5 fixtures
  await page.locator('[data-testid="vx-tp-new-plan"]').click();
  await page.locator('[data-testid="vx-tp-editor-view"]').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.vx-tp-pitch-card').count(), 15, 'Should render 15 squad cards (11 XI + 4 bench)');
  assert.ok(await page.locator('th.is-next5-col').isVisible(), 'Right player table must show NEXT 5 header');
  assert.match(await page.locator('th.is-next5-col').innerText(), /NEXT 5/);
  assert.equal(await page.locator('.vx-tp-player-row').first().locator('.vx-tp-next5-chip').count(), 5, 'Each player row shows Next 5 fixtures');
  await page.screenshot({ path: 'test-results/planner/fix2-workspace.png' });

  // Fix 3: Click the highest-priced starter on the pitch -> "+ / <Name> / Replace" slot & position filter
  const priciestIdx = await page.locator('.vx-tp-formation .vx-tp-pitch-card').evaluateAll((cards) => {
    let bestIdx = 0;
    let bestPrice = -1;
    cards.forEach((card, idx) => {
      const pill = card.querySelector('.vx-tp-price-pill')?.textContent ?? '';
      const val = Number.parseFloat(pill.replace(/[^0-9.]/g, '')) || 0;
      if (val > bestPrice) {
        bestPrice = val;
        bestIdx = idx;
      }
    });
    return bestIdx;
  });
  await page.locator('.vx-tp-formation .vx-tp-pitch-card').nth(priciestIdx).click();
  await page.locator('.vx-tp-replace-slot').first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator('.vx-tp-replace-slot').count(), 1, 'Clicked pitch player becomes + / Replace slot');
  await page.screenshot({ path: 'test-results/planner/fix3-replace-slot.png' });

  // Select first eligible unowned replacement from the right-hand VORTEX xPts table
  const candidateRow = page.locator('.vx-tp-player-row[data-tp-eligible="true"]').first();
  await candidateRow.waitFor({ timeout: 10000 });
  await candidateRow.click();
  assert.equal(await page.locator('.vx-tp-replace-slot').count(), 0, 'Replacement fills the pitch slot');
  assert.equal(await page.locator('.vx-tp-pitch-card').count(), 15, 'Squad returns to 15 active players');

  // Save & Exit -> returns to Transfer plans list showing 1 of 10 plan slots used, then close modal
  await page.getByRole('button', { name: /Save & Exit/ }).click();
  await page.getByText('1 of 10 plan slots used', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close transfer plans window' }).click();
  await page.locator('[data-testid="vx-transfer-plans-modal"]').waitFor({ state: 'detached' });

  // Fix 4: Verify VORTEX 4-band fill & White-on-Red / Black-on-other text contrast on Fixture Matrix
  await page.goto((process.env.PLANNER_BASE_URL ?? 'http://127.0.0.1:3000') + '/#/fixtures', { waitUntil: 'domcontentloaded' });
  await page.locator('.forecast-tile').first().waitFor({ timeout: 30000 });
  const contrastReport = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('.forecast-tile__opponent, .forecast-tile__value, .fm-overall-value, .fm-average-value'));
    let redChecked = 0;
    let otherChecked = 0;
    for (const el of cells) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const target = el.querySelector('strong') ?? el;
      const fg = getComputedStyle(target).color;
      if (bg === 'rgb(214, 40, 73)') {
        if (fg !== 'rgb(255, 255, 255)') return { ok: false, bg, fg };
        redChecked += 1;
      } else if (bg === 'rgb(64, 217, 156)' || bg === 'rgb(69, 200, 206)' || bg === 'rgb(245, 158, 66)') {
        if (fg !== 'rgb(0, 0, 0)') return { ok: false, bg, fg };
        otherChecked += 1;
      }
    }
    return { ok: true, redChecked, otherChecked };
  });
  assert.equal(contrastReport.ok, true, `Unexpected tile text colour: ${JSON.stringify(contrastReport)}`);
  assert.ok(contrastReport.otherChecked > 0, 'Expected non-red VORTEX fill bands on Fixture Matrix');
  await page.screenshot({ path: 'test-results/planner/fix4-fixture-matrix.png' });

  await page.goto((process.env.PLANNER_BASE_URL ?? 'http://127.0.0.1:3000') + '/#/optimizer', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /1\. Team Planner & Solver/ }).waitFor({ timeout: 30000 });
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
  await page.locator('[data-testid="vx-transfer-plans-modal"]').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Close transfer plans window' }).click();
  await page.locator('[data-testid="vx-transfer-plans-modal"]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.vx-soccer-pitch').first().getAttribute('class'), pitchClass);
  await page.getByRole('button', { name: /1. Team Planner & Solver/ }).focus();
  assert.ok(await page.getByRole('button', { name: /1. Team Planner & Solver/ }).evaluate(el => el === document.activeElement));
  await page.keyboard.press('Enter');
  await page.locator('[data-testid="vx-transfer-plans-modal"]').waitFor({ timeout: 10000 });
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="vx-transfer-plans-modal"]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.vx-soccer-pitch').count(), 1, 'The selected section stays open');
  assert.deepEqual(failures, [], 'No uncaught page or worker errors');
  // A fresh session with a blocked module-worker must recover into an explicit error state.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.context().route('**/assets/planner.worker-*.js', route => route.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /1. Team Planner & Solver/ }).waitFor({ timeout: 90000 });
  await page.getByRole('button', { name: /2. Chip Strategy/ }).click();
  await page.getByText('Simulation could not finish. Reload the page and try again.', { exact: true }).waitFor({ timeout: 30000 });
  console.log('Planner browser checks passed: production worker, tabs, zero FT, keyboard, mobile, worker failure recovery.');
} catch (error) {
  await page.screenshot({ path: 'test-results/planner/failure.png', fullPage: true });
  console.error((await page.locator('body').innerText()).slice(-16000));
  throw error;
} finally {
  await browser.close();
}

