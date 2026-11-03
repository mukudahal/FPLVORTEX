/** Shared source-age policy; cache TTL and response serving time are separate. */
export const DATA_FRESHNESS_POLICY = {
  fplStandardMs: 30 * 60_000,
  fplLiveMs: 10 * 60_000,
  bookmakerQuoteMs: 20 * 60_000,
} as const;
