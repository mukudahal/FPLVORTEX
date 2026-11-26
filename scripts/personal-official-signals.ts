import { fetchFplJson } from '../server/http';
import type { Snapshot } from '../src/lib/types';

type OfficialPlayer = {
  id: number;
  status?: string;
  chance_of_playing_next_round?: number | null;
  news?: string;
  news_added?: string | null;
  transfers_in_event?: number;
  transfers_out_event?: number;
  price_change_projections?: { offset: number; projected_percent: string | number }[];
  price_change_calibrating?: boolean;
  price_change_locked_until?: string | null;
};
type Bootstrap = { events?: { id: number; is_next: boolean; deadline_time: string }[]; elements?: OfficialPlayer[] };
export type OfficialSignals = ReturnType<typeof readOfficialSignals>;

export function readOfficialSignals(snapshot: Snapshot, raw: Bootstrap | null, observedAt: Date) {
  const next = snapshot.gameweeks.find(g => g.id === snapshot.meta.nextEventId);
  const event = raw?.events?.find(g => g.is_next);
  if (!next || event?.id !== next.id || Date.parse(event.deadline_time) !== Date.parse(next.deadlineTime) ||
      !Array.isArray(raw?.elements) || !raw.elements.length) return null;

  const known = new Map(snapshot.players.map(p => [p.id, p]));
  const rows = [];
  const updates = new Map<number, Partial<Snapshot['players'][number]>>();
  for (const p of raw.elements) {
    const player = known.get(p.id);
    if (!player) continue;
    const locked = p.price_change_locked_until != null &&
      !(Date.parse(p.price_change_locked_until) <= observedAt.getTime());
    const value = p.price_change_projections?.find(x => x.offset === 0)?.projected_percent;
    const nextProgress = !locked && p.price_change_calibrating === false &&
      (typeof value === 'number' || (typeof value === 'string' && value.trim())) &&
      Number.isFinite(Number(value)) ? Number(value) : null;
    if (typeof p.transfers_in_event === 'number' && Number.isSafeInteger(p.transfers_in_event) && p.transfers_in_event >= 0) {
      rows.push({ id:p.id, name:player.name, transfersIn:p.transfers_in_event,
        priceTenths:player.cost, nextProgress });
    }
    const incoming = Date.parse(p.news_added ?? '');
    const previous = Date.parse(player.newsAdded ?? '');
    if (typeof p.status === 'string' && ['a','d','i','u','s','n'].includes(p.status) &&
        (p.chance_of_playing_next_round === null || [0,25,50,75,100].includes(p.chance_of_playing_next_round ?? -1)) &&
        (!Number.isFinite(previous) || incoming >= previous)) {
      updates.set(p.id, {status:p.status, chance:p.chance_of_playing_next_round ?? null,
        news:p.news ?? '', newsAdded:p.news_added ?? null});
    }
  }
  return {
    observedAt:observedAt.toISOString(), nextGw:next.id,
    source:(process.env.FPL_API_BASE ?? 'https://fantasy.premierleague.com/api').replace(/\/$/,'')+'/bootstrap-static/',
    players:snapshot.players.map(p => ({...p,...updates.get(p.id)})),
    mostTransferredIn:rows.filter(p => p.transfersIn > 0).sort((a,b)=>b.transfersIn-a.transfersIn || a.id-b.id).slice(0,5),
    predictedRisers:rows.filter(p => p.nextProgress !== null && p.nextProgress >= 100)
      .sort((a,b)=>b.nextProgress!-a.nextProgress! || a.id-b.id).slice(0,5),
  };
}

export async function loadOfficialSignals(snapshot: Snapshot) {
  try {
    const raw = await fetchFplJson<Bootstrap>('/bootstrap-static/', { timeoutMs:12000, retries:1 });
    return readOfficialSignals(snapshot, raw, new Date());
  } catch {
    return null;
  }
}
