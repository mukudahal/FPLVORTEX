import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--single-process', '--no-zygote'] } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
const failures = [];
async function waitForSimulation() {
  await page.locator('.mc-paths-list .mc-range-row').first().waitFor({ timeout: 120000 });
}
page.on('pageerror', error => failures.push(error.message));
await mkdir('test-results/planner', { recursive: true });
try {
  const base = process.env.PLANNER_BASE_URL ?? 'http://127.0.0.1:3000';
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('.vortex-route-pills .vortex-route-pill__label').first().waitFor({ timeout: 90000 });
  const navLabels = await page.locator('.vortex-route-pills .vortex-route-pill__label').allTextContents();
  assert.deepEqual(navLabels.slice(0, 2), ['DASHBOARD', 'PLANNER'], 'Dashboard first, Planner second');
  assert.ok(!navLabels.includes('REVIEW'), 'Review must not appear as a navigation tab');
  await page.locator('.page--command .vx-hub-upper').waitFor();
  await page.goto(base + '/#/review', { waitUntil: 'domcontentloaded' });
  await page.locator('.page--review .vx-hub-upper').waitFor({ timeout: 30000 });

  // Use a public, read-only team ID for UI coverage. The same ID may resolve
  // to live official data OR to an archived demo, depending on upstream access.
  // Check provenance instead of assuming either source; never save a Transfer Lab plan.
  await page.goto(base + '/#/command', { waitUntil: 'domcontentloaded' });
  await page.locator('#fpl-review-team-id').fill('999999');
  await page.getByRole('button', { name: 'ENTER', exact: true }).click();
  await page.locator('.page--command:not(.page--review) .vx-soccer-pitch').waitFor({ timeout: 30000 });
  const dashboard = page.locator('.page--command:not(.page--review)');
  assert.equal(await dashboard.locator('.vx-pitch-formation .vx-pitch-player--dashboard').count(), 11, 'Dashboard must render 11 actual starting slots');
  assert.equal(await dashboard.locator('.vx-pitch-bench .vx-pitch-player--dashboard').count(), 4, 'Dashboard must render four substitute slots');
  assert.equal(await dashboard.locator('.vx-pitch-portrait img').count(), 15, 'Each squad card needs a portrait or existing fallback');
  assert.equal(await dashboard.locator('.vx-pitch-score').count(), 15, 'Every player needs an explicit points or unavailable value');
  assert.equal(await dashboard.locator('.vx-pitch-armband.is-cap').count(), 1);
  assert.equal(await dashboard.locator('.vx-pitch-armband.is-vice').count(), 1);
  assert.match(await dashboard.locator('.vx-dashboard-pitch-context').innerText(), /Recorded points|Model xPts|Historical player scores unavailable/);
  const entryResponse = await page.request.get(base + '/api/vortex/entry/999999');
  assert.equal(entryResponse.status(), 200);
  const entryJson = await entryResponse.json();
  assert.equal((await dashboard.locator('.vx-squad-scorebox__team strong').textContent())?.trim(), entryJson.teamName);
  const provenance = entryJson.provenance?.kind;
  const badgeLocator = dashboard.locator('.vx-squad-scorebox__team small');
  const badge = await badgeLocator.count() ? await badgeLocator.textContent() : null;
  if (provenance === 'demo') assert.match(badge ?? '', /DEMO DATA · NOT LIVE/);
  else if (provenance === 'archived') assert.match(badge ?? '', /ARCHIVED DATA · NOT LIVE/);
  else if (provenance !== 'official') assert.match(badge ?? '', /SOURCE UNVERIFIED · NOT LIVE/);
  else assert.equal(badge, null, 'Verified public team must not be mislabeled as demo');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    const rect = await dashboard.locator('.vx-soccer-pitch').boundingBox();
    assert.ok(rect && rect.x >= -2 && rect.x + rect.width <= width + 2, `Dashboard pitch escapes the viewport at ${width}px`);
    if (width === 1440) {
      const pitchCard = await dashboard.locator('.vx-card--pitch').boundingBox();
      const fixturesCard = await dashboard.locator('.vx-fixture-rail').boundingBox();
      const goalsCard = await dashboard.locator('.vx-card--goals').boundingBox();
      assert.ok(pitchCard && fixturesCard && goalsCard, 'Dashboard must include pitch, GW fixtures, and projected goals');
      assert.ok(pitchCard.x + pitchCard.width <= fixturesCard.x + 2,
        'Desktop Dashboard pitch must stay LEFT of the fixtures panel');
      assert.ok(fixturesCard.x + fixturesCard.width <= goalsCard.x + 2,
        'GW fixtures must stay LEFT of projected goals, both RIGHT of pitch');
      assert.ok(Math.abs(pitchCard.y - fixturesCard.y) < 8 && Math.abs(fixturesCard.y - goalsCard.y) < 8,
        'Desktop pitch and both data panels must remain side by side in the SAME ROW');
    }
    if (width === 390) {
      const pitchCard = await dashboard.locator('.vx-card--pitch').boundingBox();
      const fixturesCard = await dashboard.locator('.vx-fixture-rail').boundingBox();
      const goalsCard = await dashboard.locator('.vx-card--goals').boundingBox();
      assert.ok(pitchCard && fixturesCard && goalsCard);
      assert.ok(fixturesCard.y >= pitchCard.y + pitchCard.height - 2 &&
        goalsCard.y >= fixturesCard.y + fixturesCard.height - 2,
        'On mobile, dashboard panels must stack without overlapping');
    }
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: `test-results/planner/dashboard-pitch-${width}.png`, fullPage: true });
    }
  }
  // Exercise the real rendered Dashboard export as well as isolated PNG fixtures.
  await page.setViewportSize({width:1440,height:1000});
  await dashboard.locator('.vx-card--pitch').getByRole('button',{name:'Save as a PNG image',exact:true}).click();
  await page.locator('.png-save-dialog img').waitFor({timeout:60000});
  const [pitchDownload]=await Promise.all([
    page.waitForEvent('download',{timeout:30000}),
    page.getByRole('link',{name:'Download PNG',exact:true}).click(),
  ]);
  const pitchBytes=await readFile(await pitchDownload.path());
  assert.deepEqual([...pitchBytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.deepEqual([pitchBytes.readUInt32BE(16),pitchBytes.readUInt32BE(20)],[3840,2160]);
  await page.locator('.png-save-dialog').waitFor({state:'detached',timeout:15000});
  // Restore a clean manager-free Planner session for existing browser assertions.
  // Navigation alone retains React state, so remount after clearing storage.
  await page.evaluate(() => localStorage.removeItem('vortex:linkedManagerId'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/#/optimizer', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /1. Team Planner & Solver/ }).waitFor({ timeout: 90000 });
  assert.equal(await page.locator('.planner-team-link').count(), 1, 'Planner must retain the team loader');
  const managerInput = page.getByRole('textbox', { name: 'FPL Team ID' });
  const loadTeamButton = page.getByRole('button', { name: 'Load team' });
  assert.ok(await loadTeamButton.isDisabled(), 'Empty manager ID must not initiate a fetch');
  await managerInput.fill('123456');
  assert.ok(await loadTeamButton.isEnabled(), 'A syntactically valid manager ID enables team sync');
  await managerInput.fill('');
  await page.goto(base + '/#/players', { waitUntil: 'domcontentloaded' });
  const predictions = page.getByRole('region', { name: 'Player Predictions' });
  await predictions.waitFor({ timeout: 30000 });
  const gwSelect = page.getByRole('combobox', { name: 'Prediction Gameweek' });
  const firstGw = Number(await gwSelect.inputValue());
  const laterGw = String(firstGw + 1);
  await gwSelect.selectOption(laterGw);
  assert.match(await predictions.locator('thead').innerText(), new RegExp(`GW${laterGw} xPts`, 'i'));
  assert.match(await predictions.locator('thead').innerText(), /Selected%/i);
  assert.match(await predictions.locator('thead').innerText(), /Next 8 Fixtures/i);
  assert.doesNotMatch(await predictions.locator('thead').innerText(), /Legacy xP/i);
  const row = predictions.locator('tbody tr').first();
  assert.ok(await row.locator('.fixture-inline .fdr-chip').count()>=8,'All eight GW fixture cells must be present (doubles have extra tiles)');
  assert.ok(await row.locator('.vx-players-identity-price').count()===1,'Price belongs underneath player name');
  await page.screenshot({path:'test-results/planner/players-eight-fixtures-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:900});
  const scrollRect=await page.locator('.player-table-scroll').boundingBox();
  assert.ok(scrollRect && scrollRect.x>=-2 && scrollRect.x+scrollRect.width<=392,'Mobile player results must scroll inside viewport');
  await page.screenshot({path:'test-results/planner/players-eight-fixtures-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('checkbox', { name: /Only players with GW/ }).check();
  await page.getByRole('checkbox', { name: /Only players with GW/ }).uncheck();
  const [csvDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 25000 }),
    page.getByRole('button', { name: new RegExp(`Export GW${laterGw} CSV`) }).click(),
  ]);
  assert.ok(csvDownload.suggestedFilename().endsWith(`-gw${laterGw}.csv`));
  const csvText = await readFile(await csvDownload.path(), 'utf8');
  assert.match(csvText, new RegExp('GW'+laterGw+'_'));
  assert.ok(csvText.split('\n').length > 2, 'Downloaded CSV must contain actual rows');
  // H2H opens a new browser page; original Players selections and route must remain intact.
  // Explicitly synthetic browser response: exercise selected-GW aggregation,
  // not a claim that fixture scores were retrieved from a real manager.
  await page.context().route('**/api/vortex/player-history/*', async route => {
    const id = Number(route.request().url().split('/').at(-1));
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ playerId: id, source:'official-fpl-element-summary', capturedAt:new Date().toISOString(),
        matches:Array.from({length:38},(_,i)=>({fixtureId:id*100+i+1,gw:i+1,
          starts:1,minutes:90,totalPoints:7,goals:1,assists:0,cleanSheets:0,xG:.4,xA:.1})) }) });
  });
  const oldPlayerUrl = page.url();
  const [h2h] = await Promise.all([
    page.context().waitForEvent('page', { timeout:30000 }),
    page.getByRole('button', { name:/Open H2H Player Comparison/ }).click(),
  ]);
  await h2h.locator('.vx-h2h-workspace').waitFor({ timeout:30000 });
  assert.equal(page.url(),oldPlayerUrl,'Opening H2H must preserve the original Players page');
  for(let i=0;i<5;i++) {
    await h2h.locator('.vx-h2h-search-results button:not([disabled])').first().click();
  }
  const cards=h2h.locator('.vx-h2h-player-card');
  assert.equal(await cards.count(),5,'Five selected players must all render');
  const fiveNames=await cards.locator('h3').allTextContents();
  const pointsCell=cards.first().locator('.vx-h2h-metrics > div').filter({hasText:'FPL points'}).locator('strong');
  await h2h.waitForFunction(()=>Array.from(document.querySelectorAll('.vx-h2h-metrics strong')).some(el=>/\d/.test(el.textContent??'')),null,{timeout:30000});
  const selectedStart=Number(await h2h.locator('.vx-h2h-range select').first().inputValue());
  const selectedEnd=Number(await h2h.locator('.vx-h2h-range select').nth(1).inputValue());
  assert.equal(await pointsCell.innerText(),String(7*(selectedEnd-selectedStart+1)),'H2H must sum recorded points over selected settled GW range');
  assert.equal(new Set(fiveNames).size,5,'Duplicate comparison players not permitted');
  const compareUrl=h2h.url();
  assert.match(compareUrl,/#\/compare\?ids=/);
  const posSelect=h2h.locator('.vx-h2h-selector select').first();
  await posSelect.selectOption('DEF');
  assert.equal(await cards.count(),5,'Search filters must not remove pinned players');
  await h2h.locator('.vx-h2h-selection-list li').nth(4).locator('button').first().click();
  const afterMove=await cards.locator('h3').allTextContents();
  assert.equal(afterMove[3],fiveNames[4],'Move-up should reorder the fifth selected player');
  await h2h.locator('.vx-h2h-selection-list li').first().locator('button').last().click();
  assert.equal(await cards.count(),4,'Remove must remove only selected player');
  await h2h.goto(compareUrl,{waitUntil:'domcontentloaded'});
  await h2h.reload({waitUntil:'domcontentloaded'});
  await cards.first().waitFor({timeout:30000});
  assert.equal(await cards.count(),5,'Direct new-tab comparison route must restore all five IDs');
  const minutesCheckbox=h2h.getByRole('checkbox',{name:'Minutes'});
  await minutesCheckbox.uncheck();
  assert.ok(!(await cards.first().innerText()).includes('Minutes'));
  await minutesCheckbox.check();
  const startRange=h2h.locator('.vx-h2h-range select').first();
  if ((await startRange.locator('option').count())>1) {
    await startRange.selectOption('1');
    assert.match(await h2h.locator('.vx-h2h-header').innerText(),/GW1/);
  }
  await h2h.setViewportSize({width:390,height:850});
  const compRect=await h2h.locator('.vx-h2h-cards').boundingBox();
  assert.ok(compRect && compRect.x>=-2 && compRect.x+compRect.width<=392,'Mobile comparison must scroll inside viewport');
  await h2h.screenshot({path:'test-results/planner/h2h-five-mobile.png',fullPage:true});
  await h2h.setViewportSize({width:1440,height:900});
  await h2h.screenshot({path:'test-results/planner/h2h-five-desktop.png',fullPage:true});
  await h2h.close();
  await page.context().unroute('**/api/vortex/player-history/*');
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

