import type { EntryHistory, Fixture, LiveElementStats, Pick, PicksResponse, SlimElement } from './types';

export type AnalysisTier = 'top100' | 'top1k' | 'top10k' | 'top100k' | 'near' | 'overall';
export interface CohortManager {
  rank: number;
  picks: PicksResponse;
  chipsUsed: EntryHistory['chips'] | null;
}
export interface AnalysisCohort {
  gw: number;
  tier: AnalysisTier;
  sampledAt: string;
  requested: number;
  managers: CohortManager[];
  fromRank: number | null;
  toRank: number | null;
  failed: number;
}
export interface ResolvedLiveTeam {
  before: Pick[];
  after: Pick[];
  beforePoints: number;
  afterPoints: number;
  substitutions: { out: number; in: number }[];
  provisional: boolean;
}

export function fixtureState(team: number, fixtures: Fixture[]) {
  const games = fixtures.filter(f => f.team_h === team || f.team_a === team);
  return {
    done: games.length === 0 || games.every(f => f.finished || f.finished_provisional),
    live: games.some(f => f.started && !f.finished && !f.finished_provisional),
    pending: games.some(f => !f.finished && !f.finished_provisional),
  };
}

/** Apply only confirmed no-shows; future fixtures (including doubles) keep a player eligible. */
export function resolveLiveTeam(
  picks: PicksResponse,
  elements: Map<number, SlimElement>,
  live: Map<number, LiveElementStats>,
  fixtures: Fixture[],
): ResolvedLiveTeam {
  const bb = picks.active_chip === 'bboost';
  const captainMult = picks.active_chip === '3xc' ? 3 : 2;
  const before = picks.picks.map(p => ({ ...p }));
  // Official auto-subs can change pick positions. Reverse those for the deadline-XI comparison.
  for (const s of picks.automatic_subs) {
    const incoming = before.find(p => p.element === s.element_in);
    const outgoing = before.find(p => p.element === s.element_out);
    if (incoming && outgoing && incoming.position <= 11 && outgoing.position > 11) {
      [incoming.position, outgoing.position] = [outgoing.position, incoming.position];
    }
  }
  for (const p of before) p.multiplier = p.position <= 11 || bb ? p.is_captain ? captainMult : 1 : 0;
  const after = before.map(p => ({ ...p }));
  const hasPlayed = (p: Pick) => (live.get(p.element)?.minutes ?? 0) > 0 || (live.get(p.element)?.red_cards ?? 0) > 0 || (live.get(p.element)?.yellow_cards ?? 0) > 0;
  const noShow = (p: Pick) => !hasPlayed(p) &&
    fixtureState(elements.get(p.element)?.team ?? -1, fixtures).done;
  const substitutions: { out: number; in: number }[] = [];
  if (!bb) {
    for (const b of [...after].filter(p => p.position > 11).sort((a,b) => a.position-b.position)) {
      if (!hasPlayed(b)) continue;
      const bType = elements.get(b.element)?.element_type;
      const outgoing = after.filter(p => p.position <= 11 && noShow(p)).sort((a,b) => a.position-b.position).find(p => {
        const pType = elements.get(p.element)?.element_type;
        if ((pType === 1) !== (bType === 1)) return false;
        const xi = after.filter(s => s.position <= 11).map(s => s.element === p.element ? b.element : s.element);
        const count = (t: number) => xi.filter(id => elements.get(id)?.element_type === t).length;
        return count(1) === 1 && count(2) >= 3 && count(2) <= 5 && count(3) >= 2 && count(3) <= 5 && count(4) >= 1 && count(4) <= 3;
      });
      if (outgoing) {
        [b.position, outgoing.position] = [outgoing.position, b.position];
        b.multiplier = 1; outgoing.multiplier = 0;
        substitutions.push({ out: outgoing.element, in: b.element });
      }
    }
  }
  const captain = after.find(p => p.is_captain);
  if (captain && noShow(captain)) {
    const vice = after.find(p => p.is_vice_captain && p.position <= 11);
    captain.multiplier = captain.position <= 11 || bb ? 1 : 0;
    if (vice && !noShow(vice)) vice.multiplier = captainMult;
  }
  // Once FPL has processed the gameweek, its multipliers and substitutions are authoritative.
  const official = picks.automatic_subs.length > 0;
  const resolved = official ? picks.picks.map(p => ({...p})) : after;
  const score = (list: Pick[]) => list.reduce((sum,p) => sum+(live.get(p.element)?.total_points ?? 0)*p.multiplier,0)-picks.entry_history.event_transfers_cost;
  return { before, after: resolved, beforePoints: score(before), afterPoints: score(resolved),
    substitutions: official ? picks.automatic_subs.map(s => ({out:s.element_out,in:s.element_in})) : substitutions,
    provisional: !official && fixtures.some(f => !f.finished),
  };
}

export function cohortStats(cohort: AnalysisCohort, elements: Map<number, SlimElement>, live: Map<number, LiveElementStats>, fixtures: Fixture[], post = true) {
  const eo = new Map<number, number>();
  const captains = new Map<number, number>();
  const triples = new Map<number, number>();
  const current: Record<string, number> = { wildcard:0, freehit:0, bboost:0, '3xc':0, none:0 };
  const overall: Record<string, number> = { wildcard:0, freehit:0, bboost:0, '3xc':0 };
  let historyCount = 0;
  let total = 0;
  const n = cohort.managers.length;
  for (const manager of cohort.managers) {
    const resolved = resolveLiveTeam(manager.picks,elements,live,fixtures);
    total += post ? resolved.afterPoints : resolved.beforePoints;
    for (const p of post ? resolved.after : resolved.before) {
      eo.set(p.element,(eo.get(p.element)??0)+p.multiplier);
      if (p.multiplier >= 2) captains.set(p.element,(captains.get(p.element)??0)+1);
      if (p.multiplier === 3) triples.set(p.element,(triples.get(p.element)??0)+1);
    }
    current[manager.picks.active_chip ?? 'none'] = (current[manager.picks.active_chip ?? 'none']??0)+1;
    if (manager.chipsUsed) {
      historyCount++;
      for (const chip of new Set(manager.chipsUsed.map(c=>c.name))) overall[chip]=(overall[chip]??0)+1;
    }
  }
  for (const [id,mult] of eo) eo.set(id,n ? mult/n : 0);
  return { eo,captains,triples,current,overall,historyCount,average:n ? total/n : null,n };
}

export interface AnalysisContribution {
  id: string;
  element: number;
  fixture: number;
  label: string;
  points: number;
  value: number;
}
const EVENT_LABELS: Record<string,string> = {
  goals_scored:'Goal', assists:'Assist', clean_sheets:'Clean sheet', bonus:'Bonus',
  yellow_cards:'Yellow card', red_cards:'Red card', own_goals:'Own goal',
  penalties_saved:'Penalty saved', penalties_missed:'Penalty missed', saves:'Save points',
  goals_conceded:'Goals conceded', defensive_contribution:'Defensive contribution',
};
export function liveContributions(live: import('./types').LiveResponse): AnalysisContribution[] {
  return live.elements.flatMap(e => (e.explain??[]).flatMap(f => f.stats
    .filter(s => s.points !== 0 && EVENT_LABELS[s.identifier])
    .map(s => ({id:`${e.id}:${f.fixture}:${s.identifier}`,element:e.id,fixture:f.fixture,label:EVENT_LABELS[s.identifier],points:s.points,value:s.value}))));
}
