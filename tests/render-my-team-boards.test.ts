import test from 'node:test';
import assert from 'node:assert/strict';
import { officialPortraitUrls, officialBadgeUrls } from '../scripts/render-my-team-boards';
test('official image resolver uses only numeric identity matched portrait endpoints, never shirts',()=>{
  const urls=officialPortraitUrls(12345);
  assert.ok(urls.length>=4);
  assert.ok(urls.every(u=>u.includes('12345')&&!u.includes('shirt')&&u.startsWith('https://')));
  assert.deepEqual(officialPortraitUrls('12345'),[]);
  assert.deepEqual(officialPortraitUrls(-1),[]);
  assert.ok(officialBadgeUrls(3).every(u=>u.endsWith('t3.png')));
});
