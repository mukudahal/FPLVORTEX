import { fetchFplJson } from '../server/http';

type RankRow = { rank: number; total: number };
type Standings = { league?: { id: number; name: string }; standings?: { page: number; results: RankRow[] } };

export interface RankGoalObservation {
  targetRank: number;
  gameweek: number;
  cutoffPoints: number;
  observedAt: string;
  source: string;
}

// A current cutline is an observation, not a forecast of a future cutline.
export async function readRankGoal(entryId: number, settledGw: number, targetRank: number,
  read = fetchFplJson): Promise<RankGoalObservation | null> {
  if (!Number.isInteger(targetRank) || targetRank < 1 || targetRank > 1000000 || settledGw < 1) return null;
  try {
    const entry = await read<{ id: number; current_event: number; leagues?: { classic?: { id: number; name: string }[] } }>('/entry/'+entryId+'/', { retries: 0 });
    if (entry.id !== entryId || entry.current_event !== settledGw) return null;
    const overall = entry.leagues?.classic?.filter(l => l.name.trim().toLowerCase() === 'overall') ?? [];
    if (overall.length !== 1 || !Number.isInteger(overall[0].id)) return null;
    const path = '/leagues-classic/'+overall[0].id+'/standings/?page_standings=';
    const first = await read<Standings>(path+'1', { retries: 0 });
    const size = first.standings?.results.length ?? 0;
    if (!size || first.league?.id !== overall[0].id || first.standings?.page !== 1) return null;
    const page = Math.ceil(targetRank/size);
    const result = page === 1 ? first : await read<Standings>(path+page, { retries: 0 });
    const row = result.standings?.results[(targetRank-1)%size];
    if (result.league?.id !== overall[0].id || result.standings?.page !== page || !row ||
      !Number.isInteger(row.rank) || row.rank < 1 || row.rank > targetRank ||
      !Number.isInteger(row.total) || row.total < 0) return null;
    return {targetRank, gameweek:settledGw, cutoffPoints:row.total, observedAt:new Date().toISOString(),
      source:(process.env.FPL_API_BASE ?? 'https://fantasy.premierleague.com/api').replace(/\/$/,'')+path+page};
  } catch { return null; }
}
