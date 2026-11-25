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
import { mapOfficialChipToPlanningChip } from '../src/lib/freeTransfers';
import { getSnapshotFreshness } from '../src/lib/snapshotFreshness';
import { RULES_2026_27 } from '../src/lib/repoModel/seasonRules';
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

function chipsCommittedAhead(chips: EntryData['chipsUsed'], next: number) {
  return chips?.some(chip => chip.event >= next) ?? false;
}

export function buildFiveWeekPlan(snapshot: Snapshot, entry: EntryData, asOf = new Date(), confirmedState?: { squad: number[]; bankTenths: number; freeTransfers: number; sellingPrices: Record<number, number>; chipsUsed?: EntryData['chipsUsed'] }) {
  const now = asOf.getTime();
  assertPlanningSnapshot(snapshot, asOf);
  if (entry.provenance?.kind !== 'official' || !entry.provenance.requestedIdVerified || !['live','cache'].includes(entry.source)) throw new Error('Verified official entry required; no archived or demo team.');
  const next = [...snapshot.gameweeks].filter(g => Date.parse(g.deadlineTime) > now && !g.finished).sort((a,b) => Date.parse(a.deadlineTime) - Date.parse(b.deadlineTime))[0]?.id;
  if (!next || next !== snapshot.meta.nextEventId) throw new Error('No consistent unpassed deadline. Refresh official data.');
  const rawEntryTime = Date.parse(entry.generatedAt);
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
  if (chipsCommittedAhead(confirmedState ? confirmedState.chipsUsed : entry.chipsUsed, next)) {
    throw new Error('Chip history contains a future commitment; confirm the chip state before planning.');
  }
  const teams = new Map(snapshot.teams.map(t => [t.id,t]));
  const fixtures = toRepoFixtures(snapshot.fixtures);
  const elements = snapshot.players.map(toRepoElement);
  const elem = new Map(elements.map(p => [p.id,p]));
  const nodes = new Map(players.map(p => [p.id,{id:p.id,type:positionToType(p.position),team:p.teamId,cost:p.cost,name:p.name}]));
  const chipsUsed = confirmedState ? confirmedState.chipsUsed : entry.chipsUsed;
  const result = runPlannerSimulation({
    players, currentSquadIds:ids, bankTenths:bank, freeTransfersNow:ft, sellingPrices,
    nextGw:next, horizon:5, draws:1000, chipsUsed, chipHistoryKnown:chipsUsed !== undefined,
    repoFixtures:fixtures, repoTeams:toRepoTeams(snapshot.teams), repoElements:elements,
    completedEvents:snapshot.gameweeks.filter(g => g.finished).length,
    importedProjectionFileDate:snapshot.meta.repoData?.projectionFileDate ?? null,
    forecastAsOf:asOf.toISOString(), startedEvent:entry.startedEvent,
  });
  const weeks = result.strategy.weeks.filter(w => result.gws.includes(w.gw));
  if (weeks.length !== Math.min(5,RULES_2026_27.gameweeks+1-next) || weeks.some((w,i) => w.gw !== next+i)) throw new Error('Planner did not produce the complete rolling horizon.');
  const name = (id: number) => byId.get(id)!.name;
  const describe = (id: number, gw: number) => {
    const p = byId.get(id)!;
    const matches = snapshot.fixtures.filter(f => f.event === gw && (f.teamH === p.teamId || f.teamA === p.teamId));
    const m = estimateMinutesDistribution(elem.get(id)!, teams.get(p.teamId)?.played ?? 0, gw-next);
    return { id, name:p.name, code:p.code, teamCode:teams.get(p.teamId)?.code ?? null, club:teams.get(p.teamId)?.shortName, position:p.position,
      priceTenths:p.cost, xG:elem.get(id)!.expected_goals, xA:elem.get(id)!.expected_assists, xPts:result.forecastByGw[gw][id],
      localExpectedMinutes:round(m.expectedMinutes * matches.length), form:p.form, ownership:p.ownership,
      status:p.status, chance:p.chance, news:p.news, netTransfers:p.transfersInEvent-p.transfersOutEvent,
      observedPriceChangeTenths:p.costChangeEvent ?? null, xGI:p.xGI,
      fixtures:matches.map(f => ({opponent:teams.get(f.teamH===p.teamId?f.teamA:f.teamH)?.shortName,home:f.teamH===p.teamId,fdr:f.teamH===p.teamId?f.teamHDifficulty:f.teamADifficulty})),
    };
  };
  let permanent = [...ids], permanentBank = bank;
  const rows = weeks.map(w => {
    const before = [...permanent], beforeBank = permanentBank;
    const hold = solveLineupTS(before,nodes,result.forecastByGw[w.gw]);
    const noChip = solveLineupTS(w.squad,nodes,result.forecastByGw[w.gw]);
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
      xPts:w.netXPts, holdThisWeekXPts:hold.totalXPts, deltaVsHoldThisWeek:round(w.netXPts-hold.totalXPts)};
  });
  const holdTotal=round(result.gws.reduce((sum,gw)=>sum+solveLineupTS(ids,nodes,result.forecastByGw[gw]).totalXPts,0));
  const total=round(rows.reduce((sum,w)=>sum+w.xPts,0));
  return {entryId:entry.id, teamName:entry.teamName, season:snapshot.meta.season, currentGameweek:snapshot.meta.currentEventId, computedAt:asOf.toISOString(), snapshotAt:snapshot.meta.generatedAt,
    horizon:result.gws, currentRank:entry.overallRank, currentPoints:entry.overallPoints,
    stateBasis:confirmedState?'manager-confirmed state':'last public deadline state; unpublished transfers/chips and some inferred selling prices may not be reflected',
    chipHistoryKnown:chipsUsed!==undefined, totalXPts:total, noTransferNoChipXPts:holdTotal, gainVsHold:round(total-holdTotal),
    latestGameweek:{...entry.history, previousOverallRank:entry.previousOverallRank},
    openingState:{bankTenths:bank,freeTransfers:ft,sellingPrices,chipsUsed:chipsUsed??null},
    simulation:result.monteCarlo,
    openingAlternatives:result.options,
    chipTiming:result.strategy.chipTiming && {
      chip:result.strategy.chipTiming.chip,
      preferred:result.strategy.chipTiming.preferred,
      playNowXPts:result.strategy.chipTiming.playNow.expectedPoints,
      deferXPts:result.strategy.chipTiming.defer.expectedPoints,
      gainInDiscountedObjective:result.strategy.chipTiming.gainPlayNow,
    },
    strategySearch:result.strategy.search,
    noChipTransferAlternative:result.transferWeeks.map(w=>({gw:w.gw, transfers:w.moves.map(m=>({sell:name(m.outId),buy:name(m.inId)})),xPts:w.netXPts,hitCost:w.hitCost})),
    warnings:result.warnings, assumptions:[...result.monteCarlo.assumptions,'Fixed prices; transfer activity is observed, not a price-rise prediction. Check effective sale values, live squad and club press conferences before every deadline. Future blanks/doubles can change; preserve flexibility and reassess chips. Rank is historical, not forecast.'],
    chipOptions:result.chipSimulations.map(c=>({chip:c.chip,available:c.available,bestGw:c.bestGw,bestGain:c.bestGain,expiresGw:c.expiresGw,verdict:c.verdictLine})), chipSchedule:result.strategy.schedule,
    weeks:rows};
}
const personalLeagues = [903366, 134517, 618583];
async function readMiniLeagues(base: string, entry: EntryData) {
  if (entry.id !== 145784) return [];
  return Promise.all(personalLeagues.map(async id => {
    const sourceUrl = base + '/api/vortex/league/' + id;
    try {
      const league = await get<LeagueData>(sourceUrl, 15_000);
      const age = Date.now() - Date.parse(league.generatedAt);
      if (league.id !== id || league.provenance?.kind !== 'official' || !league.provenance.requestedIdVerified ||
          !Number.isFinite(age) || age < 0 || age > 30 * 60_000) throw new Error('Official league standings unavailable');
      const own = league.standings.find(row => row.entry === entry.id);
      const lead = league.standings.find(row => row.rank === 1);
      const rival = own?.rank === 1 ? league.standings.find(row => row.rank === 2) : lead;
      let rivalSquad = null;
      if (rival) {
        const rivalEntry = await get<EntryData>(base + '/api/vortex/entry/' + rival.entry, 10_000).catch(() => null);
        if (rivalEntry?.id === rival.entry && rivalEntry.provenance?.kind === 'official' &&
            rivalEntry.provenance.requestedIdVerified && rivalEntry.currentEvent === entry.currentEvent && rivalEntry.picks.length === 15) {
          const players = new Set(entry.picks.map(p => p.element));
          const names = new Map(rivalEntry.players.map(p => [p.id, p.name]));
          rivalSquad = {
            entryAt: rivalEntry.generatedAt,
            gameweek: rivalEntry.currentEvent,
            sourceUrl: base + '/api/vortex/entry/' + rival.entry,
            sharedCount: rivalEntry.picks.filter(p => players.has(p.element)).length,
            distinctPlayers: rivalEntry.picks.filter(p => !players.has(p.element)).map(p => ({id:p.element,name:names.get(p.element)??null})),
            captain: rivalEntry.picks.find(p => p.isCaptain)?.element ?? null,
            chipsPlayed: rivalEntry.chipsUsed ?? null,
          };
        }
      }
      return {id, sourceUrl, name:league.name, observedAt:league.generatedAt, leaderPoints:lead?.total??null,
        rank:own?.rank??null, previousRank:own?.lastRank??null, points:own?.total??null,
        rival:rival?{id:rival.entry,name:rival.entryName,points:rival.total,rank:rival.rank,
          pointsAhead:own?rival.total-own.total:null,squad:rivalSquad}:null};
    } catch {
      return {id, sourceUrl, name:null, observedAt:null, leaderPoints:null, rank:null, previousRank:null, points:null, rival:null};
    }
  }));
}

type Report = ReturnType<typeof buildFiveWeekPlan> & {
  miniLeagues?: Awaited<ReturnType<typeof readMiniLeagues>>;
  provenance?: {
    revision: string | null;
    modelVersion: string;
    snapshotId: string;
    snapshotSource: string;
    entryAt: string;
    entrySourceUrl: string;
  };
};
export function renderText(r: Report): string {
  const fixture = (p: Report['weeks'][number]['captain']) => p.fixtures.length ? p.fixtures.map(f=>f.opponent+' '+(f.home?'H':'A')+' FDR '+f.fdr).join(' / ') : 'BLANK';
  const detail = (p: Report['weeks'][number]['captain']) => p.name+' ('+p.club+'): '+p.xPts.toFixed(2)+' xPts; '+fixture(p)+'; local xMin '+p.localExpectedMinutes+'; form '+p.form+'; xGI '+p.xGI+'; status '+p.status+'; availability flag '+(p.chance??'unknown')+'; net transfers '+p.netTransfers+'; price £'+money(p.priceTenths)+'m; observed GW price change '+(p.observedPriceChangeTenths??'unknown')+' tenths'+(p.news?'; news: '+p.news:'');
  const lines = ['# FPL VORTEX — Five-gameweek plan', 'Team: '+r.teamName+' (#'+r.entryId+') | GW'+r.horizon.join(', GW'), 'Computed: '+r.computedAt+' | Snapshot: '+r.snapshotAt, 'State: '+r.stateBasis, 'Actual current rank: '+(r.currentRank??'unknown')+' | Points: '+(r.currentPoints??'unknown'), 'Forecast total: '+r.totalXPts+' | Fixed-squad no-chip baseline: '+r.noTransferNoChipXPts+' | Gain: '+r.gainVsHold, ''];
  if(r.provenance) lines.push('Model '+r.provenance.modelVersion+' | Git revision '+(r.provenance.revision??'unavailable')+' | Snapshot SHA-256 '+r.provenance.snapshotId, 'Snapshot source '+r.provenance.snapshotSource+' | Entry timestamp '+r.provenance.entryAt, '');
  lines.push('Season '+r.season+' | Current GW'+r.currentGameweek, '## Latest official performance', 'GW'+r.latestGameweek.event+': '+r.latestGameweek.points+' points, '+r.latestGameweek.eventTransfersCost+' points in transfer hits, '+r.latestGameweek.pointsOnBench+' bench points.', 'Previous overall rank: '+(r.latestGameweek.previousOverallRank??'unavailable')+' | Current overall rank: '+(r.currentRank??'unavailable'), 'Historical advice and hold results require a settled recommendation record.', '');
  lines.push('## No-chip transfer alternative', ...r.noChipTransferAlternative.map(w=>'GW'+w.gw+' · '+(w.transfers.map(t=>t.sell+' → '+t.buy).join(', ')||'Hold / roll')+' · '+w.xPts+' net xPts · '+w.hitCost+' hit points'), '');
  const simulated = r.simulation.paths.find(path=>path.id===r.simulation.recommendedPathId);
  lines.push('## Captaincy and simulation risk', 'Paired Monte Carlo: '+r.simulation.draws+' draws, seed '+r.simulation.seed+'. Forecast distributions are uncalibrated.');
  if(simulated) lines.push('Selected path p10 / p50 / p90: '+simulated.p10+' / '+simulated.median+' / '+simulated.p90+' points. Simulated probability of beating hold: '+(simulated.probBeatsHold??'unavailable')+'.');
  for(const c of r.simulation.captains) {
    const player = r.weeks[0]?.starters.find(p=>p.id===c.id);
    if(player) lines.push('- '+player.name+' · p10 / p90 '+c.p10+' / '+c.p90+' · P(≤2 points) '+c.pBlank+' · P(≥9 points) '+c.pHaul);
  }
  lines.push('', '## Mini-league standings and rivals');
  for(const league of r.miniLeagues??[]) {
    lines.push('- '+(league.name??'League #'+league.id)+' · rank '+(league.rank??'unavailable in verified page')+' · points '+(league.points??'unavailable')+' · leader '+(league.leaderPoints??'unavailable')+' · '+(league.observedAt??'no current official response'));
    if(league.rival) lines.push('  Rival '+league.rival.name+' · rank '+league.rival.rank+' · points gap (rival minus your team) '+(league.rival.pointsAhead??'unavailable')+' · shared players '+(league.rival.squad?.sharedCount??'unavailable')+' · rival-only picks '+(league.rival.squad?.distinctPlayers.map(p=>p.name??'#'+p.id).join(', ')||'unavailable'));
    lines.push('  '+league.sourceUrl);
  }
  lines.push('League comparisons use published squads. Rival future moves and winning probabilities are unverified.', '');
  for(const w of r.weeks) {
    lines.push('## GW'+w.gw+' — deadline '+w.deadline, 'Current XV: '+w.currentSquad.map(p=>p.name).join(', '), 'Bank before £'+money(w.bankBefore)+'m | FT '+w.ftBefore);
    if(!w.transfers.length) lines.push('ROLL / HOLD: no move selected by the joint horizon objective; retain transfer flexibility.');
    for(const t of w.transfers) lines.push('- SELL '+detail(t.out), '  BUY '+detail(t.incoming), '  Sale £'+money(t.sellTenths)+'m; buy £'+money(t.buyTenths)+'m; remaining-horizon individual xPts difference '+t.remainingHorizonPlayerGain+' (not incremental XI points; funding moves may be negative).');
    lines.push('Final XV: '+w.finalSquad.map(p=>p.name).join(', '), 'XI ('+w.formation+'): '+w.starters.map(p=>p.name+' '+p.xPts.toFixed(2)).join(', '), 'Captain: '+detail(w.captain), 'Vice: '+detail(w.vice), 'Bench (reserve GK then outfield order): '+w.bench.map(p=>p.name+' '+p.xPts.toFixed(2)).join(', '), 'Chip: '+w.chipLabel+(w.chipGainVsSameSquad===null?'':' | same-squad incremental chip xPts '+w.chipGainVsSameSquad), 'Hit: '+w.hitCost+' | Net xPts: '+w.xPts+' | No-move no-chip weekly reference: '+w.holdThisWeekXPts+' | Difference: '+w.deltaVsHoldThisWeek, 'Bank after £'+money(w.bankAfter)+'m | FT next GW '+w.ftAfter);
    if(w.chip==='fh') lines.push('Free Hit is temporary; restored XV: '+w.permanentSquadAfter.join(', ')+' | restored bank £'+money(w.permanentBankAfter)+'m');
    lines.push('Player evidence:',...w.finalSquad.map(p=>'- '+detail(p)),'');
  }
  lines.push('## Chip timing and long-term strategy',...r.chipOptions.map(c=>'- '+c.chip+': '+(r.chipHistoryKnown?(c.available?'available; candidate GW '+(c.bestGw??'none')+' (estimated gain '+c.bestGain+'); expiry GW '+c.expiresGw:'not available'):'inventory unknown; no recommendation')+'; '+c.verdict), 'Planned chip schedule: '+(r.chipSchedule.map(c=>chipNames[c.chip]+' GW'+c.gw).join(', ')||'hold'), 'Re-run every deadline: confirm price/bank, current squad and chip inventory; avoid hits for small uncertain gains; monitor published rescheduling, blanks and doubles; use net transfers as a market signal only.', '## Assumptions and warnings', ...[...new Set([...r.warnings,...r.assumptions])].map(s=>'- '+s));
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
  const report: Report = {
    ...buildFiveWeekPlan(snapshot,entry,new Date(),state),
    provenance: {
      revision,
      modelVersion: await productionModelVersion(),
      snapshotId: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
      snapshotSource: sourceUrl,
      entryAt: entry.generatedAt,
      entrySourceUrl,
    },
  };
  report.miniLeagues = await readMiniLeagues(base, entry);
  const deadline = Date.parse(report.weeks[0].deadline ?? '');
  if (!Number.isFinite(deadline) || Date.now() >= deadline) throw new Error('The opening deadline passed during planning. Refresh and rerun.');
  const archiveRoot = process.env.VORTEX_RECOMMENDATION_ARCHIVE;
  if (archiveRoot) {
    const filename = report.computedAt.replaceAll(':','-')+'-'+report.provenance!.snapshotId.slice(0,12)+'.json.gz';
    const saved = await writeImmutableArchive(join(archiveRoot,report.season.replace('/','-'),'entry-'+id,'gw'+report.horizon[0],filename), report);
    if (!saved) throw new Error('Immutable recommendation already exists at the generated archive path.');
  }
  await mkdir(output,{recursive:true});
  await writeFile(join(output,'plan.json'),JSON.stringify(report,null,2)+'\n');
  const markdown=renderText(report);
  await writeFile(join(output,'plan.md'),markdown);
  process.stdout.write(markdown);
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(err=>{if (err instanceof AggregateError) console.error(err.message, ...err.errors.map((e: unknown) => e instanceof Error ? e.message : String(e))); else console.error(err instanceof Error ? err.message : String(err));process.exitCode=1;});
