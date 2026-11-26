import type { Player } from '../src/lib/types';

export const FPL_MARKET_SOURCE = 'https://fantasy.premierleague.com/api/bootstrap-static/';

type PriceProjection = { offset?: number; projected_percent?: string | number; likelihood?: number };
type MarketElement = {
  id?: number; code?: number; team?: number; now_cost?: number; can_transact?: boolean;
  price_change_calibrating?: boolean; price_change_locked_until?: string | null;
  price_change_projections?: PriceProjection[];
};
export type MarketFeed = {
  elements?: MarketElement[];
  game_config?: { settings?: { price_change_deadlines?: string[] }; status?: { price_change_last_updated?: string } };
};
type SignalPlayer = Pick<Player, 'id' | 'code' | 'teamId' | 'name' | 'cost' | 'transfersInEvent' | 'transfersOutEvent'>;

function priceClock(feed: MarketFeed | null, now: number) {
  const config = feed?.game_config;
  const deadlines = config?.settings?.price_change_deadlines;
  const timestamp = (v: unknown) => typeof v === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(v) ? Date.parse(v) : NaN;
  const updated = timestamp(config?.status?.price_change_last_updated);
  const next = Array.isArray(deadlines) ? deadlines.map(timestamp) : [];
  if (!Number.isFinite(updated) || now - updated < -120_000 || now - updated > 45 * 60_000 ||
      !next.length || next[0] <= now || next[0] - now > 26 * 60 * 60_000 ||
      next.some((at, i) => !Number.isFinite(at) || (i > 0 && at <= next[i - 1]))) return null;
  return { updatedAt: new Date(updated).toISOString(), nextUpdateAt: new Date(next[0]).toISOString() };
}

/** Market observations and the provider's next-update forecast are distinct signals. */
export function personalMarketWatch<T>(
  players: readonly SignalPlayer[], feed: MarketFeed | null, asOf: Date,
  advise: (player: SignalPlayer) => T,
) {
  const clock = priceClock(feed, asOf.getTime());
  const raw = new Map((Array.isArray(feed?.elements) ? feed.elements : []).map(p => [p.id, p]));
  const base = (p: SignalPlayer) => ({
    id: p.id, name: p.name, code: p.code, priceTenths: p.cost, transfersIn: p.transfersInEvent,
    netTransfers: p.transfersInEvent - p.transfersOutEvent, advice: advise(p),
  });
  const mostTransferredIn = players.filter(p => Number.isInteger(p.transfersInEvent) && p.transfersInEvent > 0)
    .sort((a,b) => b.transfersInEvent - a.transfersInEvent || a.id - b.id).slice(0,6).map(base);
  const predictedRises = clock ? players.flatMap(p => {
    const official = raw.get(p.id);
    if (!official || official.code !== p.code || official.team !== p.teamId || official.now_cost !== p.cost ||
        official.can_transact !== true || official.price_change_calibrating !== false) return [];
    if (official.price_change_locked_until) {
      const lock = Date.parse(official.price_change_locked_until);
      if (!Number.isFinite(lock) || lock > Date.parse(clock.nextUpdateAt)) return [];
    }
    const rows = Array.isArray(official.price_change_projections)
      ? official.price_change_projections.filter(row => row?.offset === 0) : [];
    if (rows.length !== 1) return [];
    const value = rows[0].projected_percent;
    const percent = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
    const band = rows[0].likelihood;
    if (!Number.isFinite(percent) || percent < 100 || typeof band !== 'number' || !Number.isInteger(band) || band < 1 || band > 5) return [];
    return [{ player: p, projectedThresholdPercent: percent, likelihoodBand: band }];
  }).sort((a,b) => b.projectedThresholdPercent - a.projectedThresholdPercent || a.player.id - b.player.id)
    .slice(0,6).map(({player,...signal}) => ({...base(player),...signal})) : [];
  return { source: FPL_MARKET_SOURCE, priceFeed: clock, mostTransferredIn, predictedRises };
}
