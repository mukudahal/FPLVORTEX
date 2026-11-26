import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fetchFplJson } from '../server/http';
import { writeImmutableArchive } from '../server/forecastArchive';
import type { Snapshot } from '../src/lib/types';
import type { Report } from './export-my-team-plan';
import { settleWeek, type OfficialPoints, type PublicPicks, type Transfer } from './settle-my-team-plan';

type SettledReview = {
  season: string; entryId: number; gw: number; issuedAt: string; modelVersion: string;
  projected: number; net: number; gain: number; managerNet: number;
  predictedWin: number | null; follow: boolean;
};

const files = (path: string) => readdir(path).catch(()=>[] as string[]);
async function read<T>(path: string): Promise<T | null> {
  try { return JSON.parse(gunzipSync(await readFile(path),{maxOutputLength:8*1024*1024}).toString('utf8')) as T; }
  catch { return null; }
}

function latestForecast(reports: readonly (Report | null)[], gw: number, deadline: string, snapshot: Snapshot, entryId: number) {
  const end = Date.parse(deadline);
  return reports.filter((r): r is Report => !!r && r.season===snapshot.meta.season && r.entryId===entryId &&
    r.horizon?.[0]===gw && r.weeks?.[0]?.gw===gw && Date.parse(r.weeks[0].deadline??'')===end &&
    Date.parse(r.snapshotAt)<=Date.parse(r.computedAt) && Date.parse(r.computedAt)<end &&
    !!r.provenance?.snapshotId && !!r.provenance.modelVersion)
    .sort((a,b)=>Date.parse(b.computedAt)-Date.parse(a.computedAt))[0];
}

export function summariseSettledReviews(rows: readonly SettledReview[]) {
  // One realised result per calendar gameweek; reruns are never new samples.
  const unique = [...new Map([...rows].sort((a,b)=>Date.parse(a.issuedAt)-Date.parse(b.issuedAt))
    .map(row=>[row.season+':'+row.gw,row])).values()].sort((a,b)=>a.gw-b.gw);
  const sample = unique.filter(row=>row.predictedWin!==null && Number.isFinite(row.predictedWin) &&
    row.predictedWin>=0 && row.predictedWin<=1);
  const reduced = unique.reduce((acc,row)=>({
    abs:acc.abs+Math.abs(row.projected-row.net), sq:acc.sq+(row.projected-row.net)**2,
    bias:acc.bias+row.projected-row.net,
  }),{abs:0,sq:0,bias:0});
  return {
    gameweeks:unique.map(r=>r.gw), latest:unique.at(-1)??null,
    mae:unique.length ? reduced.abs/unique.length : null,
    rmse:unique.length ? Math.sqrt(reduced.sq/unique.length) : null,
    bias:unique.length ? reduced.bias/unique.length : null,
    pairedProbabilitySamples:sample.length,
    brier:sample.length ? sample.reduce((sum,row)=>sum+(row.predictedWin!-Number(row.gain>0))**2,0)/sample.length : null,
    calibrated:false,
  };
}

/** Review only a saved recommendation issued for the opening GW, after official settlement. */
export async function reviewLatestSettledPlan(
  root: string, snapshot: Snapshot, entryId: number, modelVersion: string, officialPoints: OfficialPoints | null,
) {
  const directory = join(root,snapshot.meta.season.replace('/','-'),'entry-'+entryId);
  const reviews = join(directory,'weekly-reviews');
  const current = snapshot.gameweeks.filter(g=>g.finished && g.dataChecked).sort((a,b)=>b.id-a.id)[0];
  let status = !current ? 'no settled gameweek' : 'no pre-deadline plan saved for the last settled gameweek';
  if (current) {
    const gw = current.id;
    const file = join(reviews,'gw'+gw+'.json.gz');
    const saved = await read<SettledReview>(file);
    if (saved) status = 'reviewed';
    else {
      const base = join(directory,'gw'+gw);
      const candidates = await Promise.all((await files(base)).filter(n=>n.endsWith('.json.gz')).map(n=>read<Report>(join(base,n))));
      const prior = latestForecast(candidates,gw,current.deadlineTime,snapshot,entryId);
      if (prior && !officialPoints) status = 'official points unavailable';
      if (prior && officialPoints) {
        try {
          const [picks,transfers] = await Promise.all([
            fetchFplJson<PublicPicks>('/entry/'+entryId+'/event/'+gw+'/picks/',{timeoutMs:8000,retries:0}),
            fetchFplJson<Transfer[]>('/entry/'+entryId+'/transfers/',{timeoutMs:8000,retries:0}),
          ]);
          const out = settleWeek(prior,gw,snapshot,officialPoints,picks,transfers,new Date().toISOString());
          const risk = prior.simulation?.paths.find(p=>p.id===prior.simulation.recommendedPathId)?.openingVsHold;
          const review: SettledReview = {
            season:prior.season, entryId, gw, issuedAt:prior.computedAt, modelVersion:prior.provenance!.simulationVersion ?? prior.provenance!.modelVersion,
            projected:out.expectedPoints, net:out.realisedAdviceNet, gain:out.realisedGain, managerNet:out.actualManagerNet,
            predictedWin:risk && risk.gw===gw && risk.probTie<1 ? risk.probWin : null, follow:out.followedAll,
          };
          await writeImmutableArchive(file,review);
          status = 'reviewed';
        } catch { status = 'official settlement could not be verified'; }
      }
    }
  }
  const settled = await Promise.all((await files(reviews)).filter(n=>/^gw\d+\.json\.gz$/.test(n)).map(n=>read<SettledReview>(join(reviews,n))));
  return {status, latestSettledGw:current?.id??null, modelVersion,
    ...summariseSettledReviews(settled.filter((r):r is SettledReview=>!!r && r.season===snapshot.meta.season &&
      r.entryId===entryId && r.modelVersion===modelVersion && Number.isInteger(r.gw) && Number.isFinite(r.projected) &&
      Number.isFinite(r.net) && Number.isFinite(r.gain)))};
}
