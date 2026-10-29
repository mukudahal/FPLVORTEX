import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choosePngDestination, savePngBlob, validatePng } from '../src/lib/savePng.ts';
import { pitchPhotoSources } from '../src/lib/pitchPng.ts';

const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(25).fill(0)])], { type: 'image/png' });

test('rejects empty and invalid files before creating any download', async () => {
  await assert.rejects(validatePng(new Blob([])), /No file was saved/);
  await assert.rejects(validatePng(new Blob(['not a png'])), /No file was saved/);
  await validatePng(png());
});

test('native location picker remains available when called by a tap', async () => {
  const oldWindow = globalThis.window; let name = '';
  Object.assign(globalThis, { window: { showSaveFilePicker: async (options: { suggestedName: string }) => { name = options.suggestedName; return {}; } } });
  try { assert.ok(await choosePngDestination('fixture.png')); assert.equal(name, 'fixture.png'); }
  finally { Object.assign(globalThis, { window: oldWindow }); }
});

test('pitch capture tries the displayed photo before the same-origin proxy', () => {
  assert.deepEqual(pitchPhotoSources('https://images.example/photo.png', '123', '4'), ['https://images.example/photo.png', '/api/img/player/123?teamCode=4']);
  assert.deepEqual(pitchPhotoSources('data:image/svg+xml,test'), ['data:image/svg+xml,test']);
});

test('prepared image offers a real download link instead of triggering a delayed click', async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  const elements: any[] = [];
  const element = (tag: string) => { const el: any = { tag, children: [], listeners: {}, appendChild(child: any) { this.children.push(child); }, append(...children: any[]) { this.children.push(...children); }, setAttribute() {}, addEventListener(name: string, callback: () => void) { this.listeners[name] = callback; }, focus() {}, remove() { this.removed = true; } }; elements.push(el); return el; };
  Object.assign(globalThis, { window: { setTimeout: () => 0 }, document: { body: element('body'), createElement: element, addEventListener() {}, removeEventListener() {} } });
  URL.createObjectURL = () => 'blob:test'; URL.revokeObjectURL = () => {};
  try {
    await savePngBlob(png(), 'pitch.png');
    const link = elements.find(el => el.tag === 'a');
    assert.equal(link.href, 'blob:test'); assert.equal(link.download, 'pitch.png');
    assert.equal(link.textContent, 'Download image'); assert.ok(link.listeners.click);
    assert.equal(elements.find(el => el.className === 'png-save-overlay')?.removed, undefined);
  } finally { Object.assign(globalThis, { window: oldWindow, document: oldDocument }); URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
});
