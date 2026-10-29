import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOddsApiFetcher } from '../server/oddsApiKeys.ts';
import { solveImpliedMatchFromOdds, type RawMarketQuote } from '../src/lib/oddsMath.ts';

const quota = () => new Response(JSON.stringify({ error_code: 'OUT_OF_USAGE_CREDITS' }), { status: 401 });

test('uses backup only on exhausted credits, retries primary later and does not leak keys', async () => {
  let time = 0;
  const seen: string[] = [];
  let primaryExhausted = true;
  const fetcher = createOddsApiFetcher(async input => {
    const key = new URL(String(input)).searchParams.get('apiKey')!;
    seen.push(key);
    if (key === 'primary-secret' && primaryExhausted) return quota();
    return new Response('[]', { status: 200 });
  }, () => time, 100);
  assert.equal(await fetcher('primary-secret', 'backup-secret', 500), '[]');
  assert.deepEqual(seen, ['primary-secret', 'backup-secret']);
  seen.length = 0;
  assert.equal(await fetcher('primary-secret', 'backup-secret', 500), '[]');
  assert.deepEqual(seen, ['backup-secret']);
  time = 101; primaryExhausted = false; seen.length = 0;
  assert.equal(await fetcher('primary-secret', 'backup-secret', 500), '[]');
  assert.deepEqual(seen, ['primary-secret']);
});

test('rate limit and network errors do not spend a second key', async () => {
  for (const response of [new Response('{"error_code":"EXCEEDED_FREQ_LIMIT"}', { status: 429 }), new Response('', { status: 503 })]) {
    let calls = 0;
    const fetcher = createOddsApiFetcher(async () => { calls++; return response; });
    assert.equal(await fetcher('one', 'two', 500), null);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const fetcher = createOddsApiFetcher(async () => { calls++; throw new Error('secret must not be logged'); });
  assert.equal(await fetcher('one', 'two', 500), null);
  assert.equal(calls, 1);
});

test('zero-credit success returns current data and uses backup next time', async () => {
  const seen: string[] = [];
  const fetcher = createOddsApiFetcher(async input => {
    const key = new URL(String(input)).searchParams.get('apiKey')!; seen.push(key);
    return new Response(key === 'one' ? 'first' : 'second', { headers: { 'x-requests-remaining': key === 'one' ? '0' : '10' } });
  });
  assert.equal(await fetcher('one', 'two', 500), 'first');
  assert.equal(await fetcher('one', 'two', 500), 'second');
  assert.deepEqual(seen, ['one', 'two']);
});

test('only half-goal total lines are treated as ordinary over-under probabilities', () => {
  const quote: RawMarketQuote = { provider: 'football-data', bookmaker: 'example', homeTeam: 'Home', awayTeam: 'Away', kickoffTime: null, oddsHome: 2, oddsDraw: 3.5, oddsAway: 4, totalLine: 2.25, oddsOver: 1.9, oddsUnder: 1.9 };
  assert.equal(solveImpliedMatchFromOdds(quote)?.totalLine, null);
  assert.equal(solveImpliedMatchFromOdds({ ...quote, totalLine: 2.5 })?.totalLine, 2.5);
});
