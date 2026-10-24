'use strict';
require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGameweekReport, reportCoverSvg } = require('../src/lib/reportPayload.ts');

test('public report uses observed values only, escapes malicious team names', () => {
  const data = createGameweekReport({
    gw: 8, generatedAt: '2026-10-23T17:00:00Z',
    bootstrap: { elements: [{ id: 5, web_name: 'Example', element_type: 3 }] },
    entry: { name: 'A&B<script>evil</script>', player_first_name: 'A', player_last_name:'B' },
    history: { current: [{ event: 8, points: 68, total_points: 568, overall_rank: 90000, event_transfers_cost: 4, points_on_bench: 9 }] },
    picks: { picks: [{ element:5,position:1,multiplier:2,is_captain:true,is_vice_captain:false }] },
    live: { elements: [{ id:5, stats:{ total_points: 8,minutes:90 } }] },
  });
  assert.equal(data.rows[0].effectivePoints, 16);
  assert.equal(data.modelEvidence, 'observed_official_data');
  const svg = reportCoverSvg(data);
  assert.ok(svg.includes('A&amp;B&lt;script&gt;evil&lt;/script&gt;'));
  assert.ok(!svg.includes('<script>'));
  assert.ok(!svg.includes('90000</text>')); // rank is formatted
});
