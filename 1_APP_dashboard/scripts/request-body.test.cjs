'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readJsonLimited, PayloadTooLargeError } = require(path.resolve(__dirname, '../src/server/requestBody.ts'));

test('bounded JSON body reader handles valid data without mangling unicode', async () => {
  const request = new Request('https://example.test/api', {
    method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ title: 'Müller, Ødegaard', gw: 8 }),
  });
  assert.deepEqual(await readJsonLimited(request, 128), { title: 'Müller, Ødegaard', gw: 8 });
});

test('bounded JSON reader rejects declared and chunked oversized bodies', async () => {
  const declared = new Request('https://example.test/api', {method:'POST',body:'hello',headers:{'content-length':'9000'}});
  await assert.rejects(() => readJsonLimited(declared, 100), PayloadTooLargeError);
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('x'.repeat(200)));
    controller.close();
  }});
  const chunked = new Request('https://example.test/api', {method:'POST',body:stream,duplex:'half'});
  await assert.rejects(() => readJsonLimited(chunked, 100), PayloadTooLargeError);
});

test('bounded reader rejects missing body and invalid JSON', async () => {
  const missing = new Request('https://example.test/api', {method:'POST'});
  await assert.rejects(() => readJsonLimited(missing), SyntaxError);
  const malformed = new Request('https://example.test/api', {method:'POST',body:'no-json'});
  await assert.rejects(() => readJsonLimited(malformed), SyntaxError);
});
