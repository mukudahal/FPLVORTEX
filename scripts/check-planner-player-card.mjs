import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--single-process', '--no-zygote'] } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
try {
  await page.goto((process.env.PLANNER_BASE_URL ?? 'http://127.0.0.1:3000') + '/#/optimizer', { waitUntil: 'domcontentloaded' });
  await page.locator('.vx-soccer-pitch .vx-pitch-player').first().waitFor({ timeout: 90000 });
  for (const width of [320, 375, 390, 414, 768, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator('.vx-soccer-pitch .vx-pitch-player').first().click();
    const close = page.getByRole('button', { name: 'Close player card' });
    await close.waitFor({ state: 'visible' });
    await page.locator('.vx-pcard').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
    const box = await close.boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 800, `Close button out of view at ${width}: ${JSON.stringify(box)}`);
    assert.ok(box.width >= 44 && box.height >= 44, `Close target too small at ${width}`);
    await close.click();
    assert.equal(await page.getByRole('button', { name: 'Close player card' }).count(), 0);
  }
  console.log('Player card close button fits and works at all tested widths.');
} finally {
  await browser.close();
}
