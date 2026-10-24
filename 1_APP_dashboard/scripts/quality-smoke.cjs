'use strict';
/** Staging-only HTTP checks; never needs test user credentials or destructive writes. */
const assert = require('node:assert/strict');
const base = process.env.FPL_STAGING_BASE_URL;
if (!base || !/^https:\/\//.test(base)) {
  console.error('Set FPL_STAGING_BASE_URL to your HTTPS staging origin. No checks were run.');
  process.exitCode=2;
} else {
  (async () => {
    const routes = ['/', '/planner', '/review', '/leagues', '/predictions', '/threats', '/captaincy', '/market', '/injuries', '/reports', '/players', '/fixtures', '/status', '/api/model/health'];
    for (const path of routes) {
      const response=await fetch(`${base}${path}`,{signal:AbortSignal.timeout(12000)});
      assert.equal(response.status,200,`${path}: status ${response.status}`);
      const contentType=response.headers.get('content-type') || '';
      assert.ok(contentType.includes(path.startsWith('/api')?'json':'html'),`${path}: unexpected content-type`);
      console.log(`PASS ${path} (${response.status})`);
    }
    console.log(`Passed ${routes.length} GET checks; no POST endpoints touched.`);
  })().catch((error)=>{ console.error(error); process.exitCode=1; });
}
