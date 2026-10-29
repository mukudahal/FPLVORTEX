import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choosePngDestination, savePngBlob } from '../src/lib/savePng.ts';
import { pitchPhotoSources } from '../src/lib/pitchPng.ts';

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

test('pitch capture tries the actual photo before the same-origin proxy', () => {
  assert.deepEqual(pitchPhotoSources('https://images.example/photo.png', '123', '4'), ['https://images.example/photo.png', '/api/img/player/123?teamCode=4']);
  assert.deepEqual(pitchPhotoSources('data:image/svg+xml,test'), ['data:image/svg+xml,test']);
  assert.deepEqual(pitchPhotoSources('https://images.example/photo.png', '../bad'), ['https://images.example/photo.png']);
});

test('fallback saves the PNG using the browser download', async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  let clicked = false, filename = '';
  Object.assign(globalThis, { window: { setTimeout: () => 0 }, document: { body: { appendChild() {} }, createElement() { return { set href(_v: string) {}, set download(v: string) { filename = v; }, click() { clicked = true; }, remove() {} }; } } });
  URL.createObjectURL = () => 'blob:test'; URL.revokeObjectURL = () => {};
  try {
    await savePngBlob(new Blob(['png'], { type: 'image/png' }), 'pitch.png', null);
    assert.ok(clicked); assert.equal(filename, 'pitch.png');
  } finally { Object.assign(globalThis, { window: oldWindow, document: oldDocument }); URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
});
