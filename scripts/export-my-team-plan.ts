import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { enrichPlayers, toRepoElement } from '../src/lib/analytics';
import { toRepoFixtures, toRepoTeams } from '../src/lib/fixtures';
import { runPlannerSimulation } from '../src/lib/repoModel/compassPlanner';
import { estimateMinutesDistribution } from '../src/lib/repoModel/minutes';
import { positionToType, solveLineupTS } from '../src/lib/repoModel/fplReviewSimulator';
import type { EntryData, Snapshot } from '../src/lib/types';

const money = (n: number) => (n / 10).toFixed(1);
const round = (n: number) => Math.round(n * 100) / 100;
const chipNames = { wc: 'Wildcard', fh: 'Free Hit', bb: 'Bench Boost', tc: 'Triple Captain' } as const;

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error('Data retrieval failed: HTTP ' + res.status + ' at ' + new URL(url).pathname);
  return await res.json() as T;
}

export function buildFiveWeekPlan(snapshot: Snapshot, entry: EntryData, asOf = new Date(), confirmedState?: { squad: number[]; bankTenths: number; freeTransfers: number; sellingPrices: Record<number, number>; chipsUsed?: EntryData['chipsUsed'] }) {
  const now = asOf.getTime();
  const age = now - Date.parse(snapshot.meta.generatedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 3 * 3600_000 || snapshot.meta.stale || !snapshot.meta.upstreamOk || !['live','cache'].includes(snapshot.meta.source)) throw new Error('Fresh official-backed snapshot required; refusing stale or offline projections.');
  if (entry.provenance?.kind !== 'official' || !entry.provenance.requestedIdVerified || !['live','cache'].includes(entry.source)) throw new Error('Verified official entry required; no archived or demo team.');
  const next = [...snapshot.gameweeks].filter(g => Date.parse(g.deadlineTime) > now && !g.finished).sort((a,b) => Date.parse(a.deadlineTime) - Date.parse(b.deadlineTime))[0]?.id;
  if (!next || next !== snapshot.meta.nextEventId) throw new Error('No consistent unpassed deadline. Refresh official data.');
  const ids = confirmedState?.squad ?? entry.picks.map(p => p.element);
  const bank = confirmedState?.bankTenths ?? entry.history.bank;
  const ft = confirmedState?.freeTransfers ?? entry.freeTransfers;
  const sellingPrices = confirmedState?.sellingPrices ?? Object.fromEntries(entry.picks.map(p => [p.element, p.sellingPrice == null ? NaN : Math.round(p.sellingPrice * 10)]));
  if (ids.length !== 15 || new Set(ids).size !== 15 || ids.some(id => !Number.isInteger(sellingPrices[id]) || sellingPrices[id] <= 0)) throw new Error('15 unique players and effective selling prices required.');
  if (!confirmedState && (entry.recentTransfers ?? []).some(t => t.event >= next)) throw new Error('Published upcoming transfers detected; provide confirmed current state to avoid stale bank or double counting.');
  const players = enrichPlayers(snapshot, 'balanced');
  const byId = new Map(players.map(p => [p.id,p]));
  if (ids.some(id => !byId.has(id))) throw new Error('Squad player missing from snapshot.');
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
  if (weeks.length !== Math.min(5,39-next) || weeks.some((w,i) => w.gw !== next+i)) throw new Error('Planner did not produce the complete rolling horizon.');
  const name = (id: number) => byId.get(id)!.name;
  const describe = (id: number, gw: number) => {
    const p = byId.get(id)!;
    const matches = snapshot.fixtures.filter(f => f.event === gw && (f.teamH === p.teamId || f.teamA === p.teamId));
    const m = estimateMinutesDistribution(elem.get(id)!, teams.get(p.teamId)?.played ?? 0, gw-next);
    return { id, name:p.name, club:teams.get(p.teamId)?.shortName, position:p.position,
      priceTenths:p.cost, xPts:result.forecastByGw[gw][id],
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
  return {entryId:entry.id, teamName:entry.teamName, computedAt:asOf.toISOString(), snapshotAt:snapshot.meta.generatedAt,
    horizon:result.gws, currentRank:entry.overallRank, currentPoints:entry.overallPoints,
    stateBasis:confirmedState?'manager-confirmed state':'last public deadline state; unpublished transfers/chips and some inferred selling prices may not be reflected',
    chipHistoryKnown:chipsUsed!==undefined, totalXPts:total, noTransferNoChipXPts:holdTotal, gainVsHold:round(total-holdTotal),
    warnings:result.warnings, assumptions:[...result.monteCarlo.assumptions,'Fixed prices; transfer activity is observed, not a price-rise prediction. Check effective sale values, live squad and club press conferences before every deadline. Future blanks/doubles can change; preserve flexibility and reassess chips. Rank is historical, not forecast.'],
    chipOptions:result.chipSimulations.map(c=>({chip:c.chip,available:c.available,bestGw:c.bestGw,bestGain:c.bestGain,expiresGw:c.expiresGw,verdict:c.verdictLine})), chipSchedule:result.strategy.schedule,
    weeks:rows};
}
type Report = ReturnType<typeof buildFiveWeekPlan>;
export function renderText(r: Report): string {
  const fixture = (p: Report['weeks'][number]['captain']) => p.fixtures.length ? p.fixtures.map(f=>f.opponent+' '+(f.home?'H':'A')+' FDR '+f.fdr).join(' / ') : 'BLANK';
  const detail = (p: Report['weeks'][number]['captain']) => p.name+' ('+p.club+'): '+p.xPts.toFixed(2)+' xPts; '+fixture(p)+'; local xMin '+p.localExpectedMinutes+'; form '+p.form+'; xGI '+p.xGI+'; status '+p.status+'; availability flag '+(p.chance??'unknown')+'; net transfers '+p.netTransfers+'; price £'+money(p.priceTenths)+'m; observed GW price change '+(p.observedPriceChangeTenths??'unknown')+' tenths'+(p.news?'; news: '+p.news:'');
  const lines = ['# FPL VORTEX — Five-gameweek plan', 'Team: '+r.teamName+' (#'+r.entryId+') | GW'+r.horizon.join(', GW'), 'Computed: '+r.computedAt+' | Snapshot: '+r.snapshotAt, 'State: '+r.stateBasis, 'Actual current rank: '+(r.currentRank??'unknown')+' | Points: '+(r.currentPoints??'unknown'), 'Forecast total: '+r.totalXPts+' | Fixed-squad no-chip baseline: '+r.noTransferNoChipXPts+' | Gain: '+r.gainVsHold, ''];
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
  const [snapshot,entry] = await Promise.all([get<Snapshot>(base+'/api/vortex/snapshot'),get<EntryData>(base+'/api/vortex/entry/'+id+'?refresh=1')]);
  if(entry.id!==Number(id)) throw new Error('Entry identity mismatch.');
  const state=stateFile ? JSON.parse(await readFile(stateFile,'utf8')) : undefined;
  const report=buildFiveWeekPlan(snapshot,entry,new Date(),state);
  await mkdir(output,{recursive:true});
  await writeFile(join(output,'plan.json'),JSON.stringify(report,null,2)+'\n');
  const markdown=renderText(report);
  await writeFile(join(output,'plan.md'),markdown);
  process.stdout.write(markdown);
}
if(process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) main().catch(err=>{console.error(err instanceof Error?err.message:String(err));process.exitCode=1;});
