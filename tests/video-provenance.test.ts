import test from 'node:test';
import assert from 'node:assert/strict';
import { videoSourceNotice } from '../src/lib/videoProvenance.ts';
import type { VideosResponse } from '../src/lib/types.ts';

const payload: VideosResponse = {
  source: 'repository', channelId: 'foo', channelTitle: 'FPL VORTEX',
  capturedAt: '2026-10-24T12:00:00Z', archiveCapturedAt: '2026-10-24T12:00:00Z',
  videos: [{ id: 'dQw4w9WgXcQ', title: 'Example', published: '2026-10-23T10:00:00Z', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thumbnail: '' }],
};

test('offline video archive reports original captured time rather than live', () => {
  const label = videoSourceNotice(payload);
  assert.match(label, /Repository video archive/);
  assert.match(label, /2026-10-24/);
  assert.doesNotMatch(label, /YouTube RSS \+ repository/);
});

test('mixed RSS reports feed time and archived item count separately', () => {
  const label = videoSourceNotice({ ...payload, source: 'mixed', feedCheckedAt: '2026-10-29T20:00:00Z', liveFeedItems: 1, archivedItems: 20 });
  assert.match(label, /RSS items: 1; archived items: 20/);
  assert.match(label, /2026-10-29/);
  assert.match(label, /2026-10-24/);
});

test('static export is never labelled as live RSS', () => {
  assert.match(videoSourceNotice({ ...payload, source: 'static-export', feedCheckedAt: null }), /not a live RSS check/);
  assert.match(videoSourceNotice(null), /source not verified/);
  assert.match(videoSourceNotice({ ...payload, capturedAt: '', archiveCapturedAt: '' }), /captured: unknown/);
});
