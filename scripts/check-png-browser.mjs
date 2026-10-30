import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = process.env.PNG_FIXTURE_BASE_URL ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const failures = [];
page.on('pageerror', error => failures.push(error.message));
await mkdir('test-results/planner/png-export', { recursive: true });

async function expectPngDownload(filename) {
  const preview = page.locator('.png-save-dialog img');
  await preview.waitFor({ timeout: 30000 });
  const info = await preview.evaluate(async image => {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No test 2D canvas');
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let green = 0, yellow = 0, dark = 0, bright = 0;
    for (let index = 0; index < data.length; index += 4 * 29) {
      const r = data[index], g = data[index + 1], b = data[index + 2];
      if (g > 72 && g > r * 1.5 && g > b * 1.3) green++;
      if (r > 200 && g > 160 && b < 60) yellow++;
      if (r < 50 && g < 60 && b < 85) dark++;
      if (r > 80 && g > 80 && b > 80) bright++;
    }
    return { width: image.naturalWidth, height: image.naturalHeight, green, yellow, dark, bright };
  });
  assert.deepEqual([info.width, info.height], [3840, 2160], 'Export must be true UHD 16:9');
  assert.ok(info.dark > 2000, 'Dark VORTEX brand frame must exist');
  await page.screenshot({ path: 'test-results/planner/png-export/' + filename + '.preview.png' });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 25000 }),
    page.getByRole('link', { name: 'Download PNG' }).click(),
  ]);
  assert.equal(download.suggestedFilename(), filename);
  const path = await download.path();
  assert.ok(path, 'A real PNG file must be saved');
  const bytes = await readFile(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), 3840);
  assert.equal(bytes.readUInt32BE(20), 2160);
  await page.locator('.png-save-dialog').waitFor({ state: 'detached', timeout: 15000 });
  return info;
}
try {
  await page.goto(origin + '/tests/browser/pitch-export.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Create pitch PNG' }).click();
  const pitch = await expectPngDownload('fpl-vortex-pitch-gw9.png');
  assert.ok(pitch.green > 1200, 'Pitch must retain green turf rather than appear blank');
  assert.ok(pitch.yellow > 30, 'Bench must remain visible in the pitch export');

  await page.getByRole('button', { name: 'Create table PNG' }).click();
  const table = await expectPngDownload('fpl-vortex-test-fixtures.png');
  assert.ok(table.bright > 200, 'Table must retain legible text / coloured cells');

  await page.getByRole('button', { name: 'Create player PNG' }).click();
  const player = await expectPngDownload('fpl-vortex-test-player.png');
  assert.ok(player.bright > 200, 'Player export must include readable stats / identity');
  assert.deepEqual(failures, []);
  console.log('PNG browser export passed: pitch, bench, fixture table, player card, 4K ratio and real downloaded files.');
} catch (error) {
  await page.screenshot({ path: 'test-results/planner/png-export/failure.png', fullPage: true });
  console.error((await page.locator('body').innerText()).slice(-5000));
  throw error;
} finally {
  await browser.close();
}
