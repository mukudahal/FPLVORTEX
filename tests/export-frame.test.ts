import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containRect, EXPORT_FRAME, drawFittedText } from '../src/lib/exportFrame.ts';

test('FPL VORTEX PNG frame is exactly UHD 16:9', () => {
  assert.equal(EXPORT_FRAME.width, 3840);
  assert.equal(EXPORT_FRAME.height, 2160);
  assert.equal(EXPORT_FRAME.width / EXPORT_FRAME.height, 16 / 9);
});

test('portrait source is contained without crop, stretch or overflow', () => {
  const box = { x: 112, y: 232, width: 1710, height: 1782 };
  const rect = containRect(320, 480, box);
  assert.ok(rect.x >= box.x && rect.y >= box.y);
  assert.ok(rect.x + rect.width <= box.x + box.width + 1e-8);
  assert.ok(rect.y + rect.height <= box.y + box.height + 1e-8);
  assert.ok(Math.abs(rect.width / rect.height - 2 / 3) < 1e-12);
});

test('landscape source is contained rather than distorted to fill target', () => {
  const rect = containRect(1600, 900, { x: 0, y: 0, width: 300, height: 300 });
  assert.equal(rect.width, 300);
  assert.equal(rect.height, 168.75);
  assert.equal(rect.y, 65.625);
});

test('invalid source dimensions are rejected before canvas allocation', () => {
  assert.throws(() => containRect(0, 120, { x: 0, y: 0, width: 100, height: 100 }), RangeError);
  assert.throws(() => containRect(100, Number.NaN, { x: 0, y: 0, width: 100, height: 100 }), RangeError);
  assert.throws(() => containRect(100, 200, { x: 0, y: 0, width: -20, height: 100 }), RangeError);
});

test('label painter measures text without changing source proportions', () => {
  const calls: string[] = [];
  const ctx = {
    font: '',
    measureText: (value: string) => ({ width: value.length * Number.parseInt(ctx.font.match(/(\\d+)px/)?.[1] ?? '40', 10) * 0.6 }),
    fillText: (value: string, x: number, y: number, width: number) => { calls.push(value + x + y + width); },
  };
  drawFittedText(ctx as unknown as CanvasRenderingContext2D, 'FPL VORTEX', 2, 4, 420, 80);
  assert.equal(calls.length, 1);
});