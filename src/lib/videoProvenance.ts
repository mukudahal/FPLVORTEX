import type { VideosResponse } from './types';

/** Feed retrieval/capture are NOT video publication times. */
export function videoSourceNotice(payload: VideosResponse | null | undefined): string {
  if (!payload) return 'Video source not verified — preloaded archive or static seed may be shown.';
  const archiveDate = payload.archiveCapturedAt ?? payload.capturedAt;
  const publishedDates = payload.videos.map(v => Date.parse(v.published)).filter(Number.isFinite);
  const newest = publishedDates.length ? new Date(Math.max(...publishedDates)).toISOString() : 'unknown';
  if (payload.source === 'static-export') {
    return `Static-export videos — not a live RSS check. Archive captured: ${archiveDate || 'unknown'}. Latest listed video published: ${newest}.`;
  }
  if (payload.source === 'repository') {
    return `Repository video archive — RSS availability unverified. Archive captured: ${archiveDate || 'unknown'}. Latest listed video published: ${newest}.`;
  }
  const checked = payload.feedCheckedAt || 'unknown';
  const live = payload.liveFeedItems ?? 0;
  const archived = payload.archivedItems ?? 0;
  return `${payload.source === 'mixed' ? 'YouTube RSS + repository archive' : 'YouTube RSS'} — feed checked: ${checked}. RSS items: ${live}; archived items: ${archived}. Archive captured: ${archiveDate || 'unknown'}. Latest listed video published: ${newest}. Checking RSS does not republish old videos.`;
}
