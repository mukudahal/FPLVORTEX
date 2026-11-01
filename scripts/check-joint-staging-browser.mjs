/** P0-A09 isolated staging-browser smoke (no deployment or live FPL writes).
 *
 * Runs against a CI server whose two joint-chip flags are deliberately ON,
 * verifying the UI is opt-in and the API rejects invalid requests, while
 * no automatic chip/transfer/saved-plan mutation takes place.
 *
 * This is NOT a genuine verified-manager end-to-end integration test.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.PLANNER_BASE_URL ?? 'http://127.0.0.1:3001';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 920 }, serviceWorkers: 'block' });
const failures = [];
page.on('pageerror', err => failures.push(err.message));
await mkdir('test-results/planner', { recursive: true });

try {
  const invalid = await page.request.post(base + '/api/vortex/solver/joint', {
    data: { entryId: 1, solver: { players: [] } },
    timeout: 20000,
  });
  assert.equal(invalid.status(), 422,
    'Staging flag enables the route, but invalid joint inputs must fail before any upstream request.');
  const error = await invalid.json();
  assert.match(error.error, /Invalid bounded joint-chip Solver research request/);

  const unavailable = await page.request.get(base + '/api/vortex/solver/current-team?entryId=12345', {
    timeout: 20000,
  });
  assert.equal(unavailable.status(), 409,
    'Without a trusted request-scoped FPL provider, private team GET must fail closed.');
  const noProvider = await unavailable.json();
  assert.equal(noProvider.code,'CURRENT_TEAM_AUTH_REQUIRED');
  await page.goto(base + '/#/optimizer', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /1. Team Planner & Solver/ }).waitFor({ timeout: 90000 });
  const before = await page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).filter(key => key.startsWith('vortex:transferPlans:'))
      .map(key => [key, localStorage.getItem(key)]),
  ));
  await page.getByRole('button', { name: /2. Chip Strategy/ }).click();
  const joint = page.getByRole('region', { name: 'Verified joint transfer and chip MILP' });
  await joint.waitFor({ timeout: 120000 });
  const compare = joint.getByRole('button', { name: 'Compare verified joint chip strategies' });
  assert.equal(await compare.count(), 1, 'Opt-in joint comparison control must be visible in staging');
  assert.equal(await joint.getByRole('button', {name:/Verify my current FPL team/}).count(), 1,
    'Read-only private current-team connection control must be explicit in staging.');
  assert.ok(await compare.isDisabled(), 'Without authenticated /my-team/ evidence the joint model must never be runnable');
  assert.match(await joint.innerText(), /authenticated editable team|pending transfers/i);
  assert.match(await joint.innerText(), /30|40|shortlist/i);

  // Unverified / demo entry cannot authorize a hidden automatic request.
  // No action is taken here; even a genuine manager must explicitly click.
  assert.equal(await joint.getByRole('button', { name: /Confirm: save as NEW joint-chip plan/ }).count(), 0);
  const after = await page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).filter(key => key.startsWith('vortex:transferPlans:'))
      .map(key => [key, localStorage.getItem(key)]),
  ));
  assert.deepEqual(after, before, 'Opening staging optimizer must not overwrite any saved plan');
  await page.screenshot({ path:'test-results/planner/p0-a09-staging-chip-panel.png', fullPage: true });
  assert.deepEqual(failures, [], 'Staging panel must not crash the page or model worker');
  console.log('Staging P0-A09 panel mounted; invalid read-only endpoint rejected; no saved-plan mutation.');
} catch (err) {
  await page.screenshot({ path:'test-results/planner/p0-a09-staging-failure.png', fullPage: true });
  console.error((await page.locator('body').innerText()).slice(-12000));
  throw err;
} finally {
  await browser.close();
}
