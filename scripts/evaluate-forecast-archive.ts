import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { compareFrozenForecasts } from '../src/lib/repoModel/forecastBenchmark';
import { toRepoElement } from '../src/lib/analytics';
import { estimateMinutesDistribution } from '../src/lib/repoModel/minutes';
import { productionModelVersion } from '../server/forecastArchive';
import type { Snapshot } from '../src/lib/types';

type MinutesLaw = { expectedMinutes: number; p60: number; pStart: number };
type Forecast = {
  schemaVersion: number;
  source: string;
  season: string;
  targetGw: number;
  modelVersion: string;
  inputId: string;
  deadlineAt: string;
  computedAt: string;
  retrievedAt: string;
  snapshot: Snapshot;
  predictions: { playerId: number; gameweeks: { gw: number; points: number | null; expectedMinutes: number | null; minutesEvidence?: { fixtureId:number; clubMatches:number; baseline:MinutesLaw; clubAdjusted:MinutesLaw } | null }[] }[];
};
type Outcome = {
  schemaVersion: number;
  source: string;
  season: string;
  targetGw: number;
  modelVersion: string;
  inputId: string;
  observedAt: string;
  outcomes: { playerId: number; points: number; minutes?: number | null; starts?: number | null }[];
};
type ScoredRow = { prediction: number; actual: number };
type BlendRow = { model: number; reference: number; actual: number };

/** Research only: constrained least-squares fit of w*VORTEX + (1-w)*reference.
 * An unidentified weight is null, not an invented estimate. */
export function fitConvexBlend(rows: readonly BlendRow[]): number | null {
  let numerator = 0, denominator = 0;
  for (const { model, reference, actual } of rows) {
    if (![model, reference, actual].every(Number.isFinite)) throw new RangeError('Non-finite blend training row');
    const delta = model - reference;
    numerator += delta * (actual - reference);
    denominator += delta ** 2;
  }
  return denominator > 0 ? Math.max(0, Math.min(1, numerator / denominator)) : null;
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const readCompressed = async <T>(path: string): Promise<T> => JSON.parse(gunzipSync(await readFile(path)).toString('utf8')) as T;
const mean = (xs: readonly number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;

function correlation(xs: number[], ys: number[]) {
  const ax = mean(xs), ay = mean(ys);
  const xx = xs.reduce((sum, x) => sum + (x - ax) ** 2, 0);
  const yy = ys.reduce((sum, y) => sum + (y - ay) ** 2, 0);
  return xx && yy ? xs.reduce((sum, x, i) => sum + (x - ax) * (ys[i] - ay), 0) / Math.sqrt(xx * yy) : null;
}

function ranks(xs: number[]) {
  const indices = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const result = Array<number>(xs.length);
  for (let i = 0; i < indices.length;) {
    let j = i + 1;
    while (j < indices.length && xs[indices[i]] === xs[indices[j]]) j++;
    for (let k = i; k < j; k++) result[indices[k]] = (i + j - 1) / 2;
    i = j;
  }
  return result;
}

export function summarizeForecastErrors(rows: readonly ScoredRow[], bandWidth: number) {
  if (rows.length === 0) return null;
  const predicted = rows.map(r => r.prediction), actual = rows.map(r => r.actual);
  const errors = rows.map(r => r.prediction - r.actual);
  const bands = new Map<number, ScoredRow[]>();
  for (const row of rows) {
    const lower = Math.floor(row.prediction / bandWidth) * bandWidth;
    const group = bands.get(lower) ?? [];
    group.push(row);
    bands.set(lower, group);
  }
  return {
    n: rows.length,
    mae: mean(errors.map(Math.abs)),
    rmse: Math.sqrt(mean(errors.map(e => e ** 2))),
    bias: mean(errors),
    pearson: correlation(predicted, actual),
    spearman: correlation(ranks(predicted), ranks(actual)),
    calibration: [...bands.entries()].sort(([a], [b]) => a - b).map(([lower, group]) => ({
      lower, upperExclusive: lower + bandWidth, n: group.length,
      predicted: mean(group.map(r => r.prediction)), actual: mean(group.map(r => r.actual)),
    })),
  };
}

export function probabilityScores(rows: readonly ScoredRow[]) {
  if (!rows.length) return null;
  if (rows.some(r => !Number.isFinite(r.prediction) || r.prediction < 0 || r.prediction > 1 || ![0,1].includes(r.actual))) {
    throw new RangeError('Invalid probability/outcome pair.');
  }
  const bins = Array.from({length:10}, (_,i) => {
    const band = rows.filter(r => Math.min(9, Math.floor(10*r.prediction)) === i);
    return band.length ? { lower:i/10, n:band.length, predicted:mean(band.map(r=>r.prediction)), observed:mean(band.map(r=>r.actual)) } : null;
  }).filter(b=>b !== null);
  const epsilon = 1e-12;
  return {n:rows.length, brier:mean(rows.map(r=>(r.prediction-r.actual)**2)),
    logLoss:mean(rows.map(r=>-Math.log(Math.max(epsilon, r.actual ? r.prediction : 1-r.prediction)))),
    logLossProbabilityFloor:epsilon, calibrationError:bins.reduce((sum,b)=>sum+b.n*Math.abs(b.predicted-b.observed),0)/rows.length, bins};
}

export function archivePairIssue(f: Forecast, o: Outcome, cutoffMinutes: number): string | null {
  const computed = Date.parse(f.computedAt), retrieved = Date.parse(f.retrievedAt);
  const deadline = Date.parse(f.deadlineAt), observed = Date.parse(o.observedAt);
  if (f.schemaVersion !== 1 || o.schemaVersion !== 1 || f.source !== 'prospective-only' || o.source !== 'official-fpl-event-live') return 'unsupported source or schema';
  if (![computed, retrieved, deadline, observed].every(Number.isFinite) ||
      retrieved > computed || computed >= deadline || computed > deadline - cutoffMinutes * 60_000 ||
      observed <= deadline || observed > Date.now()) return 'publication or outcome timestamps failed';
  const fixtureDeadline = f.snapshot.gameweeks.find(g => g.id === f.targetGw)?.deadlineTime ?? '';
  if (f.season !== o.season || f.targetGw !== o.targetGw || f.inputId !== o.inputId || f.modelVersion !== o.modelVersion ||
      f.season !== f.snapshot.meta.season || f.targetGw !== f.snapshot.meta.nextEventId ||
      retrieved !== Date.parse(f.snapshot.meta.generatedAt) || deadline !== Date.parse(fixtureDeadline) ||
      hash(JSON.stringify(f.snapshot)) !== f.inputId) return 'identity, deadline or input hash mismatch';
  const roster = new Set(f.snapshot.players.map(p=>p.id));
  if (roster.size!==f.snapshot.players.length || f.predictions.length!==roster.size || o.outcomes.length!==roster.size ||
      new Set(f.predictions.map(p=>p.playerId)).size!==roster.size || new Set(o.outcomes.map(p=>p.playerId)).size!==roster.size ||
      o.outcomes.some(p=>!roster.has(p.playerId)||!Number.isInteger(p.points)) ||
      f.predictions.some(p=>!roster.has(p.playerId)||p.gameweeks.filter(g=>g.gw===f.targetGw).length!==1 ||
        p.gameweeks.some(g=>g.points!==null&&!Number.isFinite(g.points)||g.expectedMinutes!==null&&(!Number.isFinite(g.expectedMinutes)||g.expectedMinutes<0)))) {
    return 'incomplete, duplicate or invalid archived cohort';
  }
  return null;
}

async function archiveFiles(root: string) {
  const files: string[] = [];
  for (const season of await readdir(root, { withFileTypes: true })) {
    if (!season.isDirectory() || !/^\d{4}-\d{2}$/.test(season.name)) continue;
    for (const week of await readdir(join(root, season.name), { withFileTypes: true })) {
      if (!week.isDirectory() || !/^gw\d+$/.test(week.name)) continue;
      const directory = join(root, season.name, week.name);
      for (const file of await readdir(directory)) {
        if (file.endsWith('.json.gz') && !file.endsWith('.outcome.json.gz')) files.push(join(directory, file));
      }
    }
  }
  return files.sort();
}

export async function evaluateForecastArchive(root: string, modelVersion: string, officialMinutesDir?: string) {
  const cutoffMinutes = 60;
  const files = await archiveFiles(root);
  const selected = new Map<string, { f: Forecast; o: Outcome; file: string }>();
  const counts = { forecasts: files.length, otherModel: 0, unsettled: 0, validPairs: 0 };
  const excluded: { file: string; reason: string }[] = [];
  for (const file of files) {
    const f = await readCompressed<Forecast>(file);
    if (f.modelVersion !== modelVersion) { counts.otherModel++; continue; }
    let o: Outcome;
    try { o = await readCompressed<Outcome>(file.replace(/\.json\.gz$/, '.outcome.json.gz')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      counts.unsettled++;
      continue;
    }
    const reason = archivePairIssue(f, o, cutoffMinutes);
    if (reason) { excluded.push({ file, reason }); continue; }
    counts.validPairs++;
    const key = f.season + ':' + f.targetGw;
    const prev = selected.get(key);
    if (!prev || Date.parse(f.computedAt) > Date.parse(prev.f.computedAt)) selected.set(key, { f, o, file });
  }

  const predictions: Parameters<typeof compareFrozenForecasts>[0][number][] = [];
  const official: typeof predictions = [];
  const candidate: typeof predictions = [];
  const equalBlend: typeof predictions = [];
  const replayStart: ScoredRow[]=[], replay60: ScoredRow[]=[];
  const frozenCodeMatches = modelVersion === await productionModelVersion();
  const minutesByStatus = new Map<string,ScoredRow[]>();
  const blended: typeof predictions = [];
  const outcomes: Parameters<typeof compareFrozenForecasts>[2][number][] = [];
  const minutes: ScoredRow[] = [], minutesReference: ScoredRow[] = [];
  const frozenMinutes: ScoredRow[] = [], clubMinutes: ScoredRow[] = [], frozen60: ScoredRow[] = [], club60: ScoredRow[] = [], frozenStart: ScoredRow[] = [], clubStart: ScoredRow[] = [];
  const minutesWeeks = new Set<string>();
  const minutesByPosition = new Map<string, ScoredRow[]>();
  const weeks = [];
  const priorSettlements: { observedAt: number; errors: number[]; season: string; blendRows: BlendRow[] }[] = [];
  for (const { f, o, file } of [...selected.values()].sort((a, b) => Date.parse(a.f.deadlineAt) - Date.parse(b.f.deadlineAt))) {
    const points = new Map(o.outcomes.map(r => [r.playerId, r.points]));
    const officialRows = new Map(o.outcomes.map(r => [r.playerId,r]));
    const forecasts = new Map(f.predictions.map(r => [r.playerId, r.gameweeks.find(g => g.gw === f.targetGw)]));
    const finished = new Map<number, { total_points: number; minutes: number; starts?: number }>();
    if (officialMinutesDir) {
      const payload = JSON.parse(await readFile(join(officialMinutesDir, f.season.replace('/', '-') + '-gw' + f.targetGw + '.json'), 'utf8')) as {
        elements: { id: number; stats: { total_points: number; minutes: number; starts?: number } }[];
      };
      for (const row of payload.elements) finished.set(row.id, row.stats);
    }
    const eligiblePrior = priorSettlements.filter(previous => previous.season === f.season && previous.observedAt < Date.parse(f.computedAt));
    const previousErrors = eligiblePrior.flatMap(previous => previous.errors);
    const trainingRows = eligiblePrior.flatMap(previous => previous.blendRows);
    const blendWeight = fitConvexBlend(trainingRows);
    const blendRows: BlendRow[] = [];
    const adjustment = previousErrors.length ? -mean(previousErrors) : null;
    const weekErrors: number[] = [];
    let minutesOutcomeMismatches = 0, minuteRows = 0, missingPointsRows = 0;
    for (const player of f.snapshot.players) {
      const actual = points.get(player.id);
      const forecast = forecasts.get(player.id);
      const evidence=forecast?.minutesEvidence;
      const observed=officialRows.get(player.id);
      const validLaw=(m:MinutesLaw)=>Number.isFinite(m.expectedMinutes)&&m.expectedMinutes>=0&&m.expectedMinutes<=90&&
        [m.p60,m.pStart].every(p=>Number.isFinite(p)&&p>=0&&p<=1);
      const fx=f.snapshot.fixtures.filter(fx=>fx.event===f.targetGw&&[fx.teamA,fx.teamH].includes(player.teamId));
      if(evidence&&observed&&fx.length===1&&fx[0].id===evidence.fixtureId&&
        validLaw(evidence.baseline)&&validLaw(evidence.clubAdjusted)&&typeof observed.minutes==='number'&&
        Number.isInteger(observed.minutes)&&observed.minutes>=0&&observed.minutes<=90){
        minutesWeeks.add(f.season+':'+f.targetGw);
        frozenMinutes.push({prediction:evidence.baseline.expectedMinutes,actual:observed.minutes});
        clubMinutes.push({prediction:evidence.clubAdjusted.expectedMinutes,actual:observed.minutes});
        frozen60.push({prediction:evidence.baseline.p60,actual:Number(observed.minutes>=60)});
        club60.push({prediction:evidence.clubAdjusted.p60,actual:Number(observed.minutes>=60)});
        if(observed.starts===0||observed.starts===1){
          frozenStart.push({prediction:evidence.baseline.pStart,actual:observed.starts});
          clubStart.push({prediction:evidence.clubAdjusted.pStart,actual:observed.starts});
        }
      }
      if (forecast?.points == null || actual === undefined || !Number.isFinite(player.epNext)) { missingPointsRows++; continue; }
      const identity = { season: f.season, gw: f.targetGw, playerId: player.id, issuedAt: f.computedAt, deadlineAt: f.deadlineAt };
      predictions.push({ ...identity, modelVersion, xPts: forecast.points });
      equalBlend.push({...identity, modelVersion:'research-equal-pool', xPts:(forecast.points+player.epNext)/2});
      official.push({ ...identity, modelVersion: 'archived-normalized-fpl-epNext', xPts: player.epNext });
      outcomes.push({ season: f.season, gw: f.targetGw, playerId: player.id, points: actual });
      if (adjustment !== null) candidate.push({ ...identity, modelVersion: 'research-prior-mean-error', xPts: forecast.points + adjustment });
      weekErrors.push(forecast.points - actual);
      blendRows.push({ model: forecast.points, reference: player.epNext, actual });
      if (blendWeight !== null) blended.push({ ...identity, modelVersion: 'research-convex-fpl-blend', xPts: blendWeight * forecast.points + (1 - blendWeight) * player.epNext });
      const settled = finished.get(player.id);
      if (settled && settled.total_points !== actual) { minutesOutcomeMismatches++; continue; }
      if (forecast.expectedMinutes == null || !settled || !Number.isFinite(settled.minutes)) continue;
      const playerFixtures = f.snapshot.fixtures.filter(fx => fx.event === f.targetGw && [fx.teamA, fx.teamH].includes(player.teamId)).length;
      const completedMatches = f.snapshot.fixtures.filter(fx => fx.finished && [fx.teamA, fx.teamH].includes(player.teamId)).length;
      if (!completedMatches) continue;
      const row = { prediction: forecast.expectedMinutes, actual: settled.minutes };
      minutes.push(row);
      const sameStatus=minutesByStatus.get(player.status)??[];
      sameStatus.push(row);
      minutesByStatus.set(player.status,sameStatus);
      if (!evidence && frozenCodeMatches && playerFixtures===1 && (settled.starts===0||settled.starts===1)) {
        const model=estimateMinutesDistribution(toRepoElement(player),Math.max(1,f.snapshot.gameweeks.filter(g=>g.finished).length));
        if (Math.abs(model.expectedMinutes-forecast.expectedMinutes)<=.051) {
          replayStart.push({prediction:model.pStart,actual:settled.starts});
          replay60.push({prediction:model.p60,actual:Number(settled.minutes>=60)});
        }
      }
      minutesReference.push({ prediction: player.minutes / completedMatches * playerFixtures, actual: settled.minutes });
      const positionRows = minutesByPosition.get(player.position) ?? [];
      positionRows.push(row);
      minutesByPosition.set(player.position, positionRows);
      minuteRows++;
    }
    weeks.push({ season: f.season, gw: f.targetGw, file, inputId: f.inputId, deadlineAt: f.deadlineAt, computedAt: f.computedAt, retrievedAt: f.retrievedAt, observedAt: o.observedAt, pointRows: weekErrors.length, missingPointsRows, minuteRows, minutesOutcomeMismatches, researchBlend: { vortexWeight: blendWeight, trainingRows: trainingRows.length, trainingGameweeks: eligiblePrior.length } });
    priorSettlements.push({ observedAt: Date.parse(o.observedAt), errors: weekErrors, season: f.season, blendRows });
  }
  const pairedRows = (forecasts: typeof predictions) => forecasts.map((row, i) => ({ prediction: row.xPts, actual: outcomes[i].points }));
  return {
    modelVersion, cutoffMinutes, counts, excluded, selected: weeks,
    expectedPoints: {
      paired: compareFrozenForecasts(predictions, official, outcomes, { cutoffMinutes }),
      vortex: summarizeForecastErrors(pairedRows(predictions), 1),
      officialEpNext: summarizeForecastErrors(pairedRows(official), 1),
      equalBlendVsVortex:compareFrozenForecasts(equalBlend,predictions,outcomes,{cutoffMinutes}),
      experimentalBiasCorrection: compareFrozenForecasts(candidate, predictions, outcomes, { cutoffMinutes }),
      experimentalOfficialBlend: compareFrozenForecasts(blended, predictions, outcomes, { cutoffMinutes }),
      experimentalOfficialBlendVsOfficial: compareFrozenForecasts(blended, official, outcomes, { cutoffMinutes }),
    },
    expectedMinutes: {
      vortex: summarizeForecastErrors(minutes, 15),
      seasonAverage: summarizeForecastErrors(minutesReference, 15),
      byAvailability:Object.fromEntries([...minutesByStatus].map(([status,rows])=>[status,summarizeForecastErrors(rows,15)])),
      legacyProbabilityReplay:{n:replayStart.length,start:probabilityScores(replayStart),sixtyMinutes:probabilityScores(replay60)},
      byPosition: Object.fromEntries([...minutesByPosition].map(([position, rows]) => [position, summarizeForecastErrors(rows, 15)])),
    },
    prospectiveMinutesResearch:{
      gameweeks:minutesWeeks.size, verdict:minutesWeeks.size<8?'insufficient_data':'research_only',
      baseline:summarizeForecastErrors(frozenMinutes,15),clubAdjusted:summarizeForecastErrors(clubMinutes,15),
      baselineP60Brier:frozen60.length?mean(frozen60.map(r=>(r.prediction-r.actual)**2)):null,
      clubP60Brier:club60.length?mean(club60.map(r=>(r.prediction-r.actual)**2)):null,
      baselineStartBrier:frozenStart.length?mean(frozenStart.map(r=>(r.prediction-r.actual)**2)):null,
      clubStartBrier:clubStart.length?mean(clubStart.map(r=>(r.prediction-r.actual)**2)):null,
      baselineStartReliability:probabilityScores(frozenStart),clubStartReliability:probabilityScores(clubStart),
      baseline60Reliability:probabilityScores(frozen60),club60Reliability:probabilityScores(club60),
      singleFixtureOnly:true,productionPromotion:false,
    },
    limitations: [
      'One latest eligible archive per model and target deadline. Horizons beyond the archived target are not evaluated.',
      'Official epNext is the frozen normalized FPL field; older raw availability and fallback to epThis cannot be reconstructed.',
      'Legacy archives store expected minutes and points only; new archives optionally freeze single-fixture minutes laws and settled counts. No simulated distribution or manager recommendation settlement is inferred.',
      'Minutes are optional late official observations matched to archived points before use. A matching points total does not rule out settlement revisions.',
      'Bias correction and convex blending are research-only, using only same-season archives whose official settlement was observed before issuance. The hybrid uses normalized FPL epNext and is not an independent VORTEX forecast.',
      'The existing minimum gameweek rule is a necessary evidence threshold. Forecast and decision improvements require further independent test periods.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root, version, minutesDir] = process.argv.slice(2);
  if (!root || !version) throw new Error('Usage: node --import tsx scripts/evaluate-forecast-archive.ts <archive-root> <model-version> [official-minutes-dir]');
  console.log(JSON.stringify(await evaluateForecastArchive(root, version, minutesDir), null, 2));
}
