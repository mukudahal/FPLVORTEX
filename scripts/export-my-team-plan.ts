import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { enrichPlayers, toRepoElement } from '../src/lib/analytics';
import { toRepoFixtures, toRepoTeams } from '../src/lib/fixtures';
import { runPlannerSimulation } from '../src/lib/repoModel/compassPlanner';
import { estimateMinutesDistribution } from '../src/lib/repoModel/minutes';
import { positionToType, solveLineupTS } from '../src/lib/repoModel/fplReviewSimulator';
import { makeFixtureForecasts } from '../src/lib/fixtureForecast';
import { mapOfficialChipToPlanningChip } from '../src/lib/freeTransfers';
import { getSnapshotFreshness } from '../src/lib/snapshotFreshness';
import { RULES_2026_27, validateSeasonChipPlan } from '../src/lib/repoModel/seasonRules';
import { verifyPublicEntry } from './verify-personal-state';
import { auditPlanSources } from './plan-source-audit';
import { fetchOfficialSnapshot } from '../server/officialSnapshot';
import { productionModelVersion, writeImmutableArchive } from '../server/forecastArchive';
import type { EntryData, LeagueData, Snapshot } from '../src/lib/types';

const money = (n: number) => (n / 10).toFixed(1);
const round = (n: number) => Math.round(n * 100) / 100;
const chipNames = { wc: 'Wildcard', fh: 'Free Hit', bb: 'Bench Boost', tc: 'Triple Captain' } as const;

async function get<T>(url: string, timeoutMs = 120_000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error('Data retrieval failed: HTTP ' + res.status + ' at ' + new URL(url).pathname);
  return await res.json() as T;
}

function assertPlanningSnapshot(snapshot: Snapshot, asOf: Date) {
  if (getSnapshotFreshness(snapshot.meta, asOf).status !== 'recent' ||
      !snapshot.meta.upstreamOk || !['live', 'cache'].includes(snapshot.meta.source)) {
    throw new Error('Fresh official-backed snapshot required; refusing stale or offline projections.');
  }
  if (snapshot.meta.season !== RULES_2026_27.season) {
    throw new Error('No verified scoring and chip rules for snapshot season ' + snapshot.meta.season);
  }
}

export async function loadPlanningSnapshot(base: string, official = fetchOfficialSnapshot): Promise<{ snapshot: Snapshot; sourceUrl: string }> {
  const sourceUrl = base + '/api/vortex/snapshot?refresh=1';
  try {
    const snapshot = await get<Snapshot>(sourceUrl);
    assertPlanningSnapshot(snapshot, new Date());
    return { snapshot, sourceUrl };
  } catch (error) {
    console.error('VORTEX snapshot unavailable or unusable. Attempting direct official FPL retrieval.');
    try {
      const snapshot = await official();
      assertPlanningSnapshot(snapshot, new Date());
      return { snapshot, sourceUrl: (process.env.FPL_API_BASE ?? 'https://fantasy.premierleague.com/api') };
    } catch (officialError) {
      throw new AggregateError([error, officialError], 'Neither snapshot source supplied fresh verified FPL inputs.', { cause: officialError });
    }
  }
}

function validateChipHistory(history: unknown, next: number) {
  if (history === undefined) return;
  if (!Array.isArray(history)) throw new Error('Invalid chip inventory.');
  const uses = history.map(row => {
    const chip = mapOfficialChipToPlanningChip(row?.name);
    if (!chip || !Number.isInteger(row.event)) throw new Error('Unrecognised chip history.');
    if (row.event >= next) throw new Error('Chip history contains a future commitment.');
    return { gw: row.event as number, chip };
  });
  const errors = validateSeasonChipPlan(uses);
  if (errors.length) throw new Error('Invalid chip history. ' + errors.join(' '));
}

export function buildFiveWeekPlan(snapshot: Snapshot, entry: EntryData, asOf = new Date(), confirmedState?: { squad: number[]; bankTenths: number; freeTransfers: number; sellingPrices: Record<number, number>; chipsUsed?: EntryData['chipsUsed'] }) {
  const now = asOf.getTime();
  assertPlanningSnapshot(snapshot, asOf);
  if (entry.provenance?.kind !== 'official' || !entry.provenance.requestedIdVerified || !['live','cache'].includes(entry.source)) throw new Error('Verified official entry required; no archived or demo team.');
  const next = [...snapshot.gameweeks].filter(g => Date.parse(g.deadlineTime) > now && !g.finished).sort((a,b) => Date.parse(a.deadlineTime) - Date.parse(b.deadlineTime))[0]?.id;
  if (!next || next !== snapshot.meta.nextEventId) throw new Error('No consistent unpassed deadline. Refresh official data.');
  if (entry.currentEvent !== snapshot.meta.currentEventId || entry.history.event !== entry.currentEvent) {
    throw new Error('Official picks and snapshot refer to different gameweeks.');
  }
  const rawEntryTime = Date.parse(entry.provenance.sourceCapturedAt ?? entry.generatedAt);
  if (!Number.isFinite(rawEntryTime) || rawEntryTime > now || now - rawEntryTime > 30 * 60_000) {
    throw new Error('Verified entry is stale or has an invalid generation time.');
  }
  if (!confirmedState && mapOfficialChipToPlanningChip(entry.activeChip) === 'fh') {
    throw new Error('Last public picks are a temporary Free Hit squad. Supply the restored manager-confirmed state.');
  }
  const ids = confirmedState?.squad ?? entry.picks.map(p => p.element);
  const bank = confirmedState?.bankTenths ?? entry.history.bank;
  const ft = confirmedState?.freeTransfers ?? entry.freeTransfers;
  const sellingPrices = confirmedState?.sellingPrices ?? Object.fromEntries(entry.picks.map(p => [p.element, p.sellingPrice == null ? NaN : Math.round(p.sellingPrice * 10)]));
  if (ids.length !== 15 || new Set(ids).size !== 15 || ids.some(id => !Number.isInteger(sellingPrices[id]) || sellingPrices[id] <= 0)) throw new Error('15 unique players and effective selling prices required.');
  if (!confirmedState && (entry.recentTransfers ?? []).some(t => t.event >= next)) throw new Error('Published upcoming transfers detected; provide confirmed current state to avoid stale bank or double counting.');
  const players = enrichPlayers(snapshot, 'balanced');
  const byId = new Map(players.map(p => [p.id,p]));
  if (ids.some(id => !byId.has(id))) throw new Error('Squad player missing from snapshot.');
  if (ids.some(id => sellingPrices[id] > byId.get(id)!.cost)) throw new Error('Effective selling price exceeds current market price.');
  validateChipHistory(confirmedState ? confirmedState.chipsUsed : entry.chipsUsed, next);
  const teams = new Map(snapshot.teams.map(t => [t.id,t]));
  const fixtures = toRepoFixtures(snapshot.fixtures);
  const elements = snapshot.players.map(toRepoElement);
  const elem = new Map(elements.map(p => [p.id,p]));
  const nodes = new Map(players.map(p => [p.id,{id:p.id,type:positionToType(p.position),team:p.teamId,cost:p.cost,name:p.name}]));
  const chipsUsed = confirmedState ? confirmedState.chipsUsed : entry.chipsUsed;
  const completedEvents = snapshot.gameweeks.filter(g => g.finished).length;
  const halfStart = next <= RULES_2026_27.chipHalfBoundary ? 1 : RULES_2026_27.chipHalfBoundary+1;
  const spentThisHalf = new Set(chipsUsed?.filter(c=>c.event>=halfStart && c.event<next).map(c=>mapOfficialChipToPlanningChip(c.name)));
  const horizonOnly = chipsUsed===undefined || RULES_2026_27.chips.every(c=>spentThisHalf.has(c));
  const result = runPlannerSimulation({
    players, localForecastsOnly:true, maxNormalMoves:3, horizonOnly, currentSquadIds:ids, bankTenths:bank, freeTransfersNow:ft, sellingPrices,
    nextGw:next, horizon:5, draws:1000, chipsUsed: chipsUsed?.map(use => ({ name: mapOfficialChipToPlanningChip(use.name)!, event: use.event })), chipHistoryKnown:chipsUsed !== undefined,
    repoFixtures:fixtures, repoTeams:toRepoTeams(snapshot.teams), repoElements:elements,
    completedEvents,
    importedProjectionFileDate:snapshot.meta.repoData?.projectionFileDate ?? null,
    forecastAsOf:asOf.toISOString(), startedEvent:entry.startedEvent,
  });
  const weeks = result.strategy.weeks.filter(w => result.gws.includes(w.gw));
  if (weeks.length !== Math.min(5,RULES_2026_27.gameweeks+1-next) || weeks.some((w,i) => w.gw !== next+i)) throw new Error('Planner did not produce the complete rolling horizon.');
  let lastDeadline = now;
  for (const gw of result.gws) {
    const events = snapshot.gameweeks.filter(g => g.id === gw);
    const deadline = Date.parse(events[0]?.deadlineTime ?? '');
    if (events.length !== 1 || events[0].finished || !Number.isFinite(deadline) || deadline <= lastDeadline) {
      throw new Error('Incomplete or inconsistent forecast deadline in GW' + gw);
    }
    lastDeadline = deadline;
  }
  const teamForecasts = makeFixtureForecasts(snapshot, 'vortex', result.gws);
  const name = (id: number) => byId.get(id)!.name;
  const describe = (id: number, gw: number) => {
    const p = byId.get(id)!;
    const matches = snapshot.fixtures.filter(f => f.event === gw && (f.teamH === p.teamId || f.teamA === p.teamId));
    const m = estimateMinutesDistribution(elem.get(id)!, Math.max(1, completedEvents), gw-next);
    return { id, name:p.name, code:p.code, teamCode:teams.get(p.teamId)?.code ?? null, club:teams.get(p.teamId)?.shortName, position:p.position,
      priceTenths:p.cost, xG:p.xG, xA:p.xA, ownership:p.ownership, threat:p.threat, defensiveContributions:p.defensiveContribution,
      penaltyOrder:p.penaltiesOrder, newsAdded:p.newsAdded ?? null, perFixtureStartProbability: m.pStart, perFixture60Probability: m.p60,
      teamCleanSheetByFixture:(teamForecasts.get(p.teamId+':'+gw) ?? []).map(f => ({fixtureId:f.fixture.id,probability:f.cleanSheet})), xPts:result.forecastByGw[gw][id],
      localExpectedMinutes:round(m.expectedMinutes * matches.length), form:p.form,
      status:p.status, chance:p.chance, news:p.news, netTransfers:p.transfersInEvent-p.transfersOutEvent,
      observedPriceChangeTenths:p.costChangeEvent ?? null, xGI:p.xGI,
      fixtures:matches.map(f => ({opponent:teams.get(f.teamH===p.teamId?f.teamA:f.teamH)?.shortName,home:f.teamH===p.teamId,fdr:f.teamH===p.teamId?f.teamHDifficulty:f.teamADifficulty})),
    };
  };
  let permanent = [...ids], permanentBank = bank;
  const rows = weeks.map(w => {
    const before = [...permanent], beforeBank = permanentBank;
    const hold = solveLineupTS(before,nodes,result.forecastByGw[w.gw]);
    const fixed = solveLineupTS(ids,nodes,result.forecastByGw[w.gw]);
    const fixedHoldLineup = { starters:fixed.starters, bench:fixed.bench, captainId:fixed.captainId, viceId:fixed.viceId };
    const noChip = solveLineupTS(w.squad,nodes,result.forecastByGw[w.gw]);
    const candidates = (result.monteCarlo.captainsByGw?.[w.gw] ?? []).map(r => ({
      ...r, name:name(r.id), ownership:byId.get(r.id)!.ownership, xPts:result.forecastByGw[w.gw][r.id],
    }));
    const safest = [...candidates].sort((a,b)=>a.pBlank-b.pBlank || b.p10-a.p10 || b.xPts-a.xPts)[0];
    // Among players less owned than the preferred captain, rank by paired haul frequency.
    const differential = candidates.filter(c=>c.ownership < byId.get(w.lineup.captainId)!.ownership)
      .sort((a,b)=>b.pHaul-a.pHaul || b.xPts-a.xPts || a.id-b.id)[0];
    const captaincy = {highestXPts:w.lineup.captainId, balanced:w.lineup.captainId, conservative:safest?.id ?? null,
      differential:differential?.id ?? null, vice:w.lineup.viceId, candidates};
    const bench = [...w.lineup.bench].sort((a,b) => Number(byId.get(b)!.position==='GKP')-Number(byId.get(a)!.position==='GKP') || result.forecastByGw[w.gw][b]-result.forecastByGw[w.gw][a]);
    const transfers = w.moves.map(move => {
      const out = describe(move.outId,w.gw), incoming = describe(move.inId,w.gw);
      const remaining = result.gws.filter(g => g>=w.gw);
      return {out,incoming,sellTenths:w.sellingPricesBefore[move.outId],buyTenths:incoming.priceTenths,
        remainingHorizonPlayerGain:round(remaining.reduce((s,g)=>s+result.forecastByGw[g][move.inId]-result.forecastByGw[g][move.outId],0))};
    });
    if (w.chip !== 'fh') { permanent = [...w.squad]; permanentBank = w.bankAfter; }
    return {gw:w.gw, deadline:snapshot.gameweeks.find(g=>g.id===w.gw)?.deadlineTime,
      currentSquad:before.map(id=>describe(id,w.gw)), bankBefore:beforeBank, transfers,
      finalSquad:w.squad.map(id=>describe(id,w.gw)), permanentSquadAfter:permanent.map(name), permanentBankAfter:permanentBank,
      starters:w.lineup.starters.map(id=>describe(id,w.gw)), bench:bench.map(id=>describe(id,w.gw)),
      formation:w.lineup.formation, captain:describe(w.lineup.captainId,w.gw), vice:describe(w.lineup.viceId,w.gw),
      chip:w.chip ?? null, chipLabel:w.chip?chipNames[w.chip]:'Hold',
      chipGainVsSameSquad:w.chip==='bb'||w.chip==='tc'?round(w.lineup.totalXPts-noChip.totalXPts):null,
      ftBefore:w.ftBefore, ftAfter:w.ftAfter, bankAfter:w.bankAfter, hitCost:w.hitCost,
      fixedHoldLineup, fixedHoldXPts:fixed.totalXPts, gainVsFixedHold:round(w.netXPts-fixed.totalXPts),
      captaincy, xPts:w.netXPts, holdThisWeekXPts:hold.totalXPts, deltaVsHoldThisWeek:round(w.netXPts-hold.totalXPts)};
  });
  const holdTotal=round(rows.reduce((sum,w)=>sum+w.fixedHoldXPts,0));
  const total=round(rows.reduce((sum,w)=>sum+w.xPts,0));
  return {entryId:entry.id, teamName:entry.teamName, season:snapshot.meta.season, currentGameweek:snapshot.meta.currentEventId, computedAt:asOf.toISOString(), snapshotAt:snapshot.meta.generatedAt,
    horizon:result.gws, currentRank:entry.overallRank, currentPoints:entry.overallPoints,
    stateBasis:confirmedState?'manager-confirmed state':'last public deadline state; unpublished transfers/chips and some inferred selling prices may not be reflected',
    chipHistoryKnown:chipsUsed!==undefined, totalXPts:total, noTransferNoChipXPts:holdTotal, gainVsHold:round(total-holdTotal),
    latestGameweek:{...entry.history, previousOverallRank:entry.previousOverallRank},
    openingState:{squad:ids,bankTenths:bank,freeTransfers:ft,sellingPrices,chipsUsed:chipsUsed??null},
    simulation:result.monteCarlo,
    openingAlternatives:result.options,
    chipTiming:result.strategy.chipTiming && {
      chip:result.strategy.chipTiming.chip,
      preferred:result.strategy.chipTiming.preferred,
      playNowXPts:result.strategy.chipTiming.playNow.expectedPoints,
      deferXPts:result.strategy.chipTiming.defer.expectedPoints,
      gainInDiscountedObjective:result.strategy.chipTiming.gainPlayNow,
    },
    strategySearch:result.strategy.search, searchGameweeks:result.strategy.horizon,
    noChipTransferAlternative:result.transferWeeks.map(w=>({gw:w.gw, transfers:w.moves.map(m=>({sell:name(m.outId),buy:name(m.inId)})),xPts:w.netXPts,hitCost:w.hitCost})),
    warnings:result.warnings, assumptions:[...result.monteCarlo.assumptions,'Fixed prices; transfer activity is observed, not a price-rise prediction. Check effective sale values, live squad and club press conferences before every deadline. Future blanks/doubles can change; preserve flexibility and reassess chips. Rank is historical, not forecast.'],
    chipOptions:result.chipSimulations.map(c=>({chip:c.chip,available:c.available,bestGw:c.bestGw,bestGain:c.bestGain,expiresGw:c.expiresGw,verdict:c.verdictLine})), chipSchedule:result.strategy.schedule,
    weeks:rows};
}
const personalLeagues = [903366, 134517, 618583];
async function readMiniLeagues(base: string, entry: EntryData, openingSquad: readonly number[]) {
  if (entry.id !== 145784) return [];
  return Promise.all(personalLeagues.map(async id => {
    const sourceUrl = base + '/api/vortex/league/' + id;
    try {
      const league = await get<LeagueData>(sourceUrl, 15_000);
      const age = Date.now() - Date.parse(league.provenance?.sourceCapturedAt ?? league.generatedAt);
      if (league.id !== id || league.provenance?.kind !== 'official' || !league.provenance.requestedIdVerified ||
          !Number.isFinite(age) || age < 0 || age > 30 * 60_000) throw new Error('Official league standings unavailable');
      const own = league.standings.find(row => row.entry === entry.id);
      const lead = league.standings.find(row => row.rank === 1);
      const rival = own?.rank === 1 ? league.standings.find(row => row.rank === 2) : lead;
      let rivalSquad = null;
      if (rival) {
        const rivalEntry = await get<EntryData>(base + '/api/vortex/entry/' + rival.entry, 10_000).catch(() => null);
        if (rivalEntry?.id === rival.entry && rivalEntry.provenance?.kind === 'official' &&
            rivalEntry.provenance.requestedIdVerified && ['live','cache'].includes(rivalEntry.source) &&
            Date.now() - Date.parse(rivalEntry.provenance.sourceCapturedAt ?? rivalEntry.generatedAt) >= 0 &&
            Date.now() - Date.parse(rivalEntry.provenance.sourceCapturedAt ?? rivalEntry.generatedAt) <= 30 * 60_000 && rivalEntry.currentEvent === entry.currentEvent && rivalEntry.picks.length === 15) {
          const players = new Set(openingSquad);
          const names = new Map(rivalEntry.players.map(p => [p.id, p.name]));
          rivalSquad = {
            entryAt: rivalEntry.provenance.sourceCapturedAt ?? rivalEntry.generatedAt,
            squad:rivalEntry.picks.map(p => ({id:p.element,name:names.get(p.element)??null,position:p.position})),
            gameweek: rivalEntry.currentEvent,
            sourceUrl: base + '/api/vortex/entry/' + rival.entry,
            sharedCount: rivalEntry.picks.filter(p => players.has(p.element)).length,
            distinctPlayers: rivalEntry.picks.filter(p => !players.has(p.element)).map(p => ({id:p.element,name:names.get(p.element)??null})),
            captain: rivalEntry.picks.find(p => p.isCaptain)?.element ?? null,
            chipsPlayed: rivalEntry.chipsUsed ?? null,
          };
        }
      }
      return {id, sourceUrl, name:league.name, observedAt:league.provenance.sourceCapturedAt ?? league.generatedAt, leaderPoints:lead?.total??null,
        rank:own?.rank??null, previousRank:own?.lastRank??null, points:own?.total??null,
        rival:rival?{id:rival.entry,name:rival.entryName,points:rival.total,rank:rival.rank,
          pointsAhead:own?rival.total-own.total:null,squad:rivalSquad}:null};
    } catch {
      return {id, sourceUrl, name:null, observedAt:null, leaderPoints:null, rank:null, previousRank:null, points:null, rival:null};
    }
  }));
}

export type Report = ReturnType<typeof buildFiveWeekPlan> & {
  history?: {gw:number;points:number;hitCost:number;overallRank:number|null}[];
  publicStateEvidence?: Awaited<ReturnType<typeof verifyPublicEntry>>['publicStateEvidence'];
  miniLeagues?: Awaited<ReturnType<typeof readMiniLeagues>>;
  provenance?: {
    revision: string | null;
    modelVersion: string;
    snapshotId: string;
    snapshotSource: string;
    entryAt: string;
    entrySourceUrl: string;
    forecastInputs: { localModel: string; importedFileDate: string | null; importedPlayerWeeks: number; localPlayerWeeks: number; independentExternalModelsVerified: number };
  };
};
export function renderText(r: Report): string {
  type PlayerRow = Report['weeks'][number]['captain'];
  const num = (value: number | null | undefined, digits=2) => value == null ? 'unavailable' : value.toFixed(digits);
  const percent = (value: number | null | undefined) => value == null ? 'unavailable' : (100*value).toFixed(1)+'%';
  const fixture = (p: PlayerRow) => p.fixtures.map(f => f.opponent+' '+(f.home?'H':'A')+' (FDR '+f.fdr+')').join(' / ') || 'Blank';
  const lines = ['# FPL VORTEX five-gameweek plan', '', r.teamName+' · entry '+r.entryId+' · '+r.season+' · GW'+r.horizon.join(', GW'),
    '', 'Generated '+r.computedAt+' UTC. Snapshot '+r.snapshotAt+'.', '', 'Squad basis — '+r.stateBasis+'.',
    '', '**'+num(r.totalXPts)+' expected points after hits** across the displayed weeks. Keeping the opening squad and saving every chip projects '+num(r.noTransferNoChipXPts)+'. The difference is '+num(r.gainVsHold)+' points.', '',
    '## 1. Performance audit', '', 'Latest published total '+r.currentPoints+' points, overall rank '+r.currentRank+'.'];
  if (r.history?.length) {
    lines.push('', '| GW | Points before hits | Hits | Overall rank | Rank movement |', '|---:|---:|---:|---:|---|');
    r.history.forEach((w,i) => {
      const previous=r.history?.[i-1]?.overallRank;
      const change=previous==null||w.overallRank==null?null:previous-w.overallRank;
      lines.push('| '+[w.gw,w.points,w.hitCost,w.overallRank??'unknown',change==null?'unavailable':change>0?'Green '+change:change<0?'Red '+Math.abs(change):'Level'].join(' | ')+' |');
    });
  } else lines.push('', 'GW'+r.latestGameweek.event+' returned '+r.latestGameweek.points+' points with '+r.latestGameweek.eventTransfersCost+' in hits and '+r.latestGameweek.pointsOnBench+' on the bench.');
  lines.push('', 'Historical advice, realised gain versus hold and forecast error require a settled pre-deadline recommendation. Official manager results alone cannot establish these.',
    '', '## 2. Transfer analysis', '', '| GW | Selected action | Hit | Net xPts | Gain vs opening XV | Gain vs rolling from that week |',
    '|---:|---|---:|---:|---:|---:|');
  for (const w of r.weeks) lines.push('| '+[w.gw,w.transfers.map(t=>t.out.name+' → '+t.incoming.name).join(', ')||'Roll',w.hitCost,num(w.xPts),num(w.gainVsFixedHold),num(w.deltaVsHoldThisWeek)].join(' | ')+' |');
  lines.push('', 'Search horizon GW'+r.searchGameweeks.join(', GW')+'.', '', 'The opening-XV gains add up to the five-week comparison. Rolling from a later week retains earlier decisions. Free-transfer option value is part of search ranking only.',
    '', '### Opening alternatives', '');
  for (const option of r.openingAlternatives) lines.push('- '+option.label+' · '+(option.feasible===false?'unavailable':num(option.horizonXPts))+' projected horizon points · '+option.hitCost+' opening hit points. '+option.why);
  lines.push('', '### Chip timing and long-term strategy', '');
  for (const c of r.chipOptions) lines.push('- '+c.chip+' · '+(r.chipHistoryKnown?(c.available?'available':'unavailable'):'inventory unknown')+' · '+c.verdict);
  if (r.chipTiming) lines.push('', 'Joint continuation with the chip now '+num(r.chipTiming.playNowXPts)+' xPts, deferred '+num(r.chipTiming.deferXPts)+' xPts, over the search horizon. Preferred timing '+r.chipTiming.preferred+'.');
  lines.push('', 'No-chip transfer path — '+r.noChipTransferAlternative.map(w=>'GW'+w.gw+' '+(w.transfers.map(t=>t.sell+' → '+t.buy).join(', ')||'roll')+' ('+num(w.xPts)+' xPts)').join(' · '),
    '', '## 3. Team news and risk', '', 'Official player flags were retrieved with the snapshot at '+r.snapshotAt+'. Per-fixture starts and 60-minute estimates use the same minutes inputs as the planner. Press-conference coverage and price-change probabilities are unavailable in this run.', '');
  const owned=r.weeks[0].currentSquad;
  const flags=owned.filter(p=>p.status!=='a' || (p.chance!=null && p.chance<100) || p.news);
  if (!flags.length) lines.push('The official feed lists no injury or suspension news for the opening squad.');
  for (const p of flags) lines.push('- '+p.name+' · '+p.status+' · '+(p.chance==null?'no percentage supplied':p.chance+'% availability')+' · '+(p.news||'no published detail')+' · '+(p.newsAdded??'news date unavailable'));
  lines.push('', 'Reassess the plan if a deadline, fixture assignment, availability flag, price or effective selling price changes.', '',
    '## 4. Statistical deep dive', '', 'Opening squad season totals and first-week forecasts. Clean-sheet estimates refer to the team for each fixture. Individual FPL awards also depend on minutes.', '',
    '| Player | xG | xA | xGI | Threat | Def. contributions | Form | xMin | P(start) per fixture | Team CS | Fixture |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|');
  for (const p of owned) lines.push('| '+[p.name,num(p.xG),num(p.xA),num(p.xGI),p.threat,p.defensiveContributions,p.form,p.localExpectedMinutes,percent(p.perFixtureStartProbability),p.teamCleanSheetByFixture.map(f=>percent(f.probability)).join(' / ')||'—',fixture(p)].join(' | ')+' |');
  lines.push('', '## 5. Captaincy recommendation', '', 'Balanced and highest-xPts choices use the projected XI. The conservative choice has the lowest simulated blank risk. The differential has the highest simulated haul chance among starters with lower ownership than the selected captain. Ownership is global. Future rival captains are unknown.', '',
    '| GW | Recommended | Vice | Conservative | Differential | xPts | P10–P90 | P(≤2) | P(≥9) |', '|---:|---|---|---|---|---:|---|---:|---:|');
  for (const w of r.weeks) {
    const find=(id:number|null)=>w.captaincy.candidates.find(c=>c.id===id);
    const c=find(w.captain.id);
    lines.push('| '+[w.gw,w.captain.name,w.vice.name,find(w.captaincy.conservative)?.name??'unavailable',find(w.captaincy.differential)?.name??'none',num(w.captain.xPts),c?c.p10+'–'+c.p90:'unavailable',percent(c?.pBlank),percent(c?.pHaul)].join(' | ')+' |');
  }
  lines.push('', '## 6. Mini-league intelligence', '');
  for (const l of r.miniLeagues??[]) {
    lines.push('### '+(l.name??'League '+l.id), '', 'Rank '+(l.rank??'unavailable')+' · points '+(l.points??'unavailable')+' · leader '+(l.leaderPoints??'unavailable')+' · observation '+(l.observedAt??'unavailable')+'.');
    if (l.rival) {
      const q=l.rival.squad;
      lines.push('', 'Rival '+l.rival.name+' · points ahead of you '+(l.rival.pointsAhead??'unknown')+' · shared players '+(q?.sharedCount??'unavailable')+'.');
      if (q) {
        const cn=q.squad.find(p=>p.id===q.captain)?.name??'unavailable';
        lines.push('', 'Published rival-only players — '+(q.distinctPlayers.map(p=>p.name??'#'+p.id).join(', ')||'none')+'. Recorded captain '+cn+'.');
        const rivalIds=new Set(q.squad.map(p=>p.id));
        for (const t of r.weeks[0].transfers) lines.push('- Buying '+t.incoming.name+(rivalIds.has(t.incoming.id)?' covers a published rival holding.':' adds a player absent from this rival’s last published squad.'));
      }
    }
    lines.push('', l.sourceUrl, '');
  }
  lines.push('Future rival moves, effective ownership and league win probabilities are unverified. The default selection maximises the planner’s football objective.', '',
    '## 7. Rolling five-gameweek final team selection', '');
  for (const w of r.weeks) {
    lines.push('## GW'+w.gw+' — deadline '+w.deadline,'', 'Opening XV — '+w.currentSquad.map(p=>p.name).join(', ')+'.',
      '', 'Bank £'+money(w.bankBefore)+'m → £'+money(w.bankAfter)+'m · free transfers '+w.ftBefore+' → '+w.ftAfter+' next week · '+w.hitCost+' hit points.');
    if (!w.transfers.length) lines.push('', 'Roll. The selected continuation keeps the available squad and transfer flexibility.');
    for (const t of w.transfers) lines.push('', 'Sell '+t.out.name+' (£'+money(t.sellTenths)+'m), buy '+t.incoming.name+' (£'+money(t.buyTenths)+'m). '+t.out.name+' projects '+num(t.out.xPts)+' against '+fixture(t.out)+'. '+t.incoming.name+' projects '+num(t.incoming.xPts)+' against '+fixture(t.incoming)+', with '+t.incoming.localExpectedMinutes+' expected minutes. Their remaining-horizon player difference is '+num(t.remainingHorizonPlayerGain)+' xPts. The weekly XI comparison includes funding moves, bench and hits.');
    lines.push('', 'Final XV — '+w.finalSquad.map(p=>p.name).join(', ')+'.','', '**XI ('+w.formation+')** — '+w.starters.map(p=>p.name+' '+num(p.xPts)).join(', ')+'.',
      '', 'Captain '+w.captain.name+' · vice '+w.vice.name+' · chip '+w.chipLabel+'.',
      '', 'Bench (reserve GK first, then outfield priority) — '+w.bench.map(p=>p.name+' '+num(p.xPts)).join(', ')+'.',
      '', 'Net '+num(w.xPts)+' xPts. Fixed opening squad '+num(w.fixedHoldXPts)+' xPts. Recheck minutes, effective prices, bank and team news before this deadline.');
    if (w.chip==='fh') lines.push('', 'Restored permanent squad — '+w.permanentSquadAfter.join(', ')+'. Restored bank £'+money(w.permanentBankAfter)+'m.');
    lines.push('');
  }
  lines.push('## 8. Accountability log','', 'Generated '+r.computedAt+' · team '+r.entryId+' · '+r.season+' · forecast GW'+r.horizon.join(', GW')+'.');
  if (r.provenance) lines.push('', 'Forecast model '+r.provenance.modelVersion+' · Git '+(r.provenance.revision??'unknown')+' · snapshot SHA-256 '+r.provenance.snapshotId+'.',
    '', 'Source '+r.provenance.snapshotSource+' · entry '+r.provenance.entrySourceUrl+' retrieved '+r.provenance.entryAt+'.',
    '', 'Locally projected player-weeks '+r.provenance.forecastInputs.localPlayerWeeks+' · imported means used '+r.provenance.forecastInputs.importedPlayerWeeks+'.');
  const path=r.simulation.paths.find(p=>p.id===r.simulation.recommendedPathId);
  if (path) lines.push('', 'Paired simulation, '+r.simulation.draws+' draws, seed '+r.simulation.seed+'. Mean '+num(path.mean)+', median '+num(path.median)+', SD '+num(path.sd)+', P10 / P25 / P75 / P90 '+[path.p10,path.p25,path.p75,path.p90].join(' / ')+'.',
    '', 'Against hold, simulated win '+percent(path.probBeatsHoldRaw)+', tie '+percent(path.probDrawsHold)+', loss '+percent(path.probLosesHold)+'. Mean positive gain '+num(path.expectedUpsideVsHold)+' and mean downside '+num(path.expectedDownsideVsHold)+' points across all draws.');
  lines.push('', 'Confidence remains uncalibrated. Settle the dated recommendation after official finalisation to compare advice, hold and actual decisions. Future outcomes are pending.',
    '', r.strategySearch, '', ...[...new Set([...r.warnings,...r.assumptions])].map(w=>'- '+w));
  return lines.join('\n')+'\n';
}

async function main() {
  const [id='145784', output='reports/my-team', stateFile] = process.argv.slice(2);
  if(!/^[1-9]\d{0,11}$/.test(id)) throw new Error('Invalid entry ID.');
  const base=(process.env.VORTEX_UPSTREAM_BASE ?? 'https://fplvortex.onrender.com').replace(/\/$/,'');
  const entrySourceUrl = base+'/api/vortex/entry/'+id+'?refresh=1';
  const [{snapshot,sourceUrl},entry] = await Promise.all([loadPlanningSnapshot(base),get<EntryData>(entrySourceUrl)]);
  if(entry.id!==Number(id)) throw new Error('Entry identity mismatch.');
  const state=stateFile ? JSON.parse(await readFile(stateFile,'utf8')) : undefined;
  let revision = process.env.GITHUB_SHA ?? null;
  if (!revision) {
    try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); }
    catch { /* Source exports may not contain Git metadata. */ }
  }
  const verified=state ? null : await verifyPublicEntry(snapshot,entry);
  const report: Report = {
    ...buildFiveWeekPlan(snapshot,verified?.entry??entry,new Date(),state),
    publicStateEvidence:verified?.publicStateEvidence,
    provenance: {
      revision,
      modelVersion: await productionModelVersion(),
      snapshotId: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
      snapshotSource: sourceUrl,
      forecastInputs: {localModel:'VORTEX mechanistic', importedFileDate:snapshot.meta.repoData?.projectionFileDate ?? null,
        importedPlayerWeeks:0,localPlayerWeeks:snapshot.players.length*Math.min(5,39-snapshot.meta.nextEventId),independentExternalModelsVerified:0},
      entryAt: entry.provenance?.sourceCapturedAt ?? entry.generatedAt,
      entrySourceUrl,
    },
  };
  const fplBase = (process.env.FPL_API_BASE ?? 'https://fantasy.premierleague.com/api').replace(/\/$/,'');
  const [leagues,history] = await Promise.all([
    readMiniLeagues(base, entry, report.openingState.squad),
    verified?.history ?? get<{current:{event:number;points:number;event_transfers_cost:number;overall_rank:number|null}[]}>(fplBase+'/entry/'+id+'/history/',15_000).catch(()=>null),
  ]);
  report.miniLeagues = leagues;
  if (Array.isArray(history?.current)) report.history=history.current.filter(h=>h.event<=entry.currentEvent).map(h=>({
    gw:h.event,points:h.points,hitCost:h.event_transfers_cost,overallRank:h.overall_rank,
  }));
  const deadline = Date.parse(report.weeks[0].deadline ?? '');
  if (!Number.isFinite(deadline) || Date.now() >= deadline) throw new Error('The opening deadline passed during planning. Refresh and rerun.');
  const archiveRoot = process.env.VORTEX_RECOMMENDATION_ARCHIVE ?? join(output,'accountability');
  {
    await writeImmutableArchive(join(archiveRoot,'inputs',report.provenance!.snapshotId+'.json.gz'),snapshot);
    const filename = report.computedAt.replaceAll(':','-')+'-'+report.provenance!.snapshotId.slice(0,12)+'.json.gz';
    const saved = await writeImmutableArchive(join(archiveRoot,report.season.replace('/','-'),'entry-'+id,'gw'+report.horizon[0],filename), report);
    if (!saved) throw new Error('Immutable recommendation already exists at the generated archive path.');
  }
  await mkdir(output,{recursive:true});
  await writeFile(join(output,'plan.json'),JSON.stringify(report,null,2)+'\n');
  const markdown=renderText(report);
  await writeFile(join(output,'plan.md'),markdown);
  const meta = {entryId:report.entryId,season:report.season,currentGameweek:report.currentGameweek,horizon:report.horizon,
    computedAt:report.computedAt,snapshotAt:report.snapshotAt,provenance:report.provenance,assumptions:report.assumptions,warnings:report.warnings};
  const detailFiles = {
    'data-source-audit':await auditPlanSources(snapshot,report),
    'transfer-alternatives':{opening:report.openingAlternatives.filter(o=>o.feasible!==false),noChip:report.noChipTransferAlternative,holdXPts:report.noTransferNoChipXPts},
    'captaincy-alternatives':report.weeks.map(w=>({gw:w.gw,...w.captaincy})),
    'chip-strategy':{inventory:report.openingState.chipsUsed,options:report.chipOptions,timing:report.chipTiming,schedule:report.chipSchedule},
    'mini-league-analysis':report.miniLeagues,
    'accountability-log':{openingState:report.openingState,hold:report.weeks.map(w=>({gw:w.gw,lineup:w.fixedHoldLineup,xPts:w.fixedHoldXPts})),
      recommendation:report.weeks.map(w=>({gw:w.gw,captain:w.captain.id,vice:w.vice.id,netXPts:w.xPts})),settlement:'pending'},
  };
  for (const [name,data] of Object.entries(detailFiles)) await writeFile(join(output,name+'.json'),JSON.stringify({...meta,data},null,2)+'\n');
  process.stdout.write(markdown);
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(err=>{if (err instanceof AggregateError) console.error(err.message, ...err.errors.map((e: unknown) => e instanceof Error ? e.message : String(e))); else console.error(err instanceof Error ? err.message : String(err));process.exitCode=1;});
