import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choosePngDestination, savePngBlob } from '../src/lib/savePng.ts';
import { downloadPitchPng } from '../src/lib/pitchPng.ts';

test('native save picker writes the PNG to the chosen location', async () => {
  const oldWindow = globalThis.window;
  const written: Blob[] = []; let closed = false; let name = '';
  Object.assign(globalThis, { window: { showSaveFilePicker: async (options: { suggestedName: string }) => { name = options.suggestedName; return { createWritable: async () => ({ write: async (blob: Blob) => { written.push(blob); }, close: async () => { closed = true; } }) }; } } });
  try {
    const dest = await choosePngDestination('fixture.png');
    const image = new Blob(['data'], { type: 'image/png' });
    await savePngBlob(image, 'fixture.png', dest);
    assert.equal(name, 'fixture.png'); assert.deepEqual(written, [image]); assert.ok(closed);
  } finally { Object.assign(globalThis, { window: oldWindow }); }
});

test('fallback downloads and pitch export includes starters and bench in one image', async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  let clicked = false, filename = ''; const text: string[] = [];
  const context = new Proxy({}, { get(_target, prop) { if (prop === 'fillText') return (value: string) => text.push(value); return () => {}; }, set() { return true; } });
  Object.assign(globalThis, { window: { setTimeout: () => 0 }, document: { body: { appendChild() {} }, createElement(tag: string) { if (tag === 'canvas') return { width: 0, height: 0, getContext: () => context, toBlob: (cb: (blob: Blob) => void) => cb(new Blob(['png'], { type: 'image/png' })) }; return { set href(_v: string) {}, set download(v: string) { filename = v; }, click() { clicked = true; }, remove() {} }; } } });
  URL.createObjectURL = () => 'blob:test'; URL.revokeObjectURL = () => {};
  try {
    await downloadPitchPng([[{ name: 'Starter', position: 'MID', team: 'ARS', score: '8.2 xP', fixture: 'CHE (H)', captain: true }]], [{ name: 'Substitute', position: 'DEF', team: 'CHE', score: '3.0 xP', fixture: 'ARS (A)' }], 10, 'pitch.png');
    assert.ok(clicked); assert.equal(filename, 'pitch.png'); assert.ok(text.includes('Starter')); assert.ok(text.includes('Substitute')); assert.ok(text.includes('C')); assert.ok(text.includes('BENCH · SUBSTITUTES'));
  } finally { Object.assign(globalThis, { window: oldWindow, document: oldDocument }); URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
});
