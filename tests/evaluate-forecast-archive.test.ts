import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { archivePairIssue, evaluateForecastArchive, summarizeForecastErrors, fitConvexBlend } from '../scripts/evaluate-forecast-archive';

const version = 'typescript-mechanistic-061b8b630d45fe3e';
const root = 'data/forecast-archive';

test('replays archived settled forecasts once per target week and holds out chronological research predictions', async () => {
  const report = await evaluateForecastArchive(root, version);
  assert.ok(report.expectedPoints.paired.sampleSize >= 993);
  assert.equal(new Set(report.selected.map(w => w.season + ':' + w.gw)).size, report.selected.length);
  assert.ok(report.expectedPoints.experimentalBiasCorrection.gameweeks < report.expectedPoints.paired.gameweeks);
  assert.equal(report.expectedMinutes.vortex, null);
});

test('rejects after-deadline predictions, premature settlements and mismatched input hashes', async () => {
  const file = root + '/2026-27/gw10/2026-11-06-' + version;
  const load = async (path: string) => JSON.parse(gunzipSync(await readFile(path)).toString('utf8'));
  const f = await load(file + '.json.gz'), o = await load(file + '.outcome.json.gz');
  assert.equal(archivePairIssue(f, o, 60), null);
  assert.match(archivePairIssue({...f, computedAt:f.deadlineAt}, o, 60) ?? '', /timestamps/);
  assert.match(archivePairIssue(f, {...o, observedAt:f.retrievedAt}, 60) ?? '', /timestamps/);
  assert.match(archivePairIssue(f, {...o, inputId:'different'}, 60) ?? '', /hash/);
});

test('computes point error bands and ranks with tied forecasts', () => {
  const stats = summarizeForecastErrors([{prediction:1,actual:0},{prediction:1,actual:1},{prediction:2,actual:3}], 1);
  assert.equal(stats?.mae, 2/3);
  assert.equal(stats?.bias, 0);
  assert.ok(Math.abs((stats?.spearman ?? 0) - Math.sqrt(3)/2) < 1e-10);
  assert.deepEqual(stats?.calibration[0],{lower:1,upperExclusive:2,n:2,predicted:1,actual:0.5});
});


test('convex blend estimates only a constrained identifiable weight', () => {
  assert.equal(fitConvexBlend([]), null);
  assert.equal(fitConvexBlend([{model:2, reference:2, actual:3}]), null);
  assert.equal(fitConvexBlend([{model:4, reference:0, actual:1}]), 0.25);
  assert.equal(fitConvexBlend([{model:4, reference:0, actual:8}]), 1);
  assert.equal(fitConvexBlend([{model:4, reference:0, actual:-1}]), 0);
  assert.throws(() => fitConvexBlend([{model:NaN, reference:0, actual:1}]), /Non-finite/);
});

test('research hybrid holds out the first deadline and never promotes a small sample', async () => {
  const report = await evaluateForecastArchive(root, version);
  assert.equal(report.selected[0].researchBlend.vortexWeight, null);
  assert.equal(report.selected[0].researchBlend.trainingRows, 0);
  const result = report.expectedPoints.experimentalOfficialBlend;
  assert.ok(result.sampleSize >= 499);
  assert.ok(result.gameweeks < report.expectedPoints.paired.gameweeks);
  if (result.gameweeks < 8) assert.equal(result.verdict, 'insufficient_data');
});
