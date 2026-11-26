/** Reproducible no-chip comparison on the exact same shortlist, five-week objective and frozen inputs. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { enrichPlayers, toRepoElement } from '../src/lib/analytics';
import { toRepoFixtures, toRepoTeams } from '../src/lib/fixtures';
import { runPlannerSimulation, type PlannerSimulationInput } from '../src/lib/repoModel/compassPlanner';
import { buildExactMilpRequest, type ExactMilpResponse } from '../src/lib/exactMilpBridge';
import { compareMilpPaths } from '../src/lib/milpPathComparison';
import { productionModelVersion } from '../server/forecastArchive';
import type { Snapshot } from '../src/lib/types';
import type { Report } from './export-my-team-plan';

const [planPath,snapshotPath]=process.argv.slice(2);
if (!planPath || !snapshotPath) throw new Error('Supply plan.json and its immutable snapshot.json.gz.');
const report:Report=JSON.parse(await readFile(planPath,'utf8'));
const bytes=gunzipSync(await readFile(snapshotPath));
if (createHash('sha256').update(bytes).digest('hex')!==report.provenance?.snapshotId ||
    await productionModelVersion()!==report.provenance.modelVersion) throw new Error('Snapshot or model version mismatch.');
const snapshot:Snapshot=JSON.parse(bytes.toString());
const squad=report.weeks[0].currentSquad.map(p=>p.id);
const players=enrichPlayers(snapshot,'balanced');
const decay=.85;
const input:PlannerSimulationInput={players,repoFixtures:toRepoFixtures(snapshot.fixtures),repoTeams:toRepoTeams(snapshot.teams),
  repoElements:snapshot.players.map(toRepoElement), currentSquadIds:squad, sellingPrices:report.openingState.sellingPrices,
  bankTenths:report.openingState.bankTenths,freeTransfersNow:report.openingState.freeTransfers, completedEvents:snapshot.gameweeks.filter(e=>e.finished).length,
  nextGw:report.horizon[0],horizon:report.horizon.length,horizonOnly:true,localForecastsOnly:true,
  chipHistoryKnown:false,draws:100,decay,forecastAsOf:report.computedAt};
const full=runPlannerSimulation(input);
const request=buildExactMilpRequest({snapshot,players,planner:full,squadIds:squad,bankTenths:input.bankTenths,freeTransfers:input.freeTransfersNow,
  sellingPrices:report.openingState.sellingPrices,lockedIds:[],decay});
request.settings.solutions_requested=1;
request.settings.mip_gap=0;
const pool=new Set(request.players.map(p=>p.player_id));
const beams=[6,12].map(beamWidth=>{
  const start=performance.now();
  const result=runPlannerSimulation({...input,players:players.filter(p=>pool.has(p.id)),beamWidth});
  const weeks=result.transferWeeks;
  if (weeks.some(w=>w.chip||w.moves.length>2||w.bankAfter<0) || weeks.length!==report.horizon.length) throw new Error('Non-comparable beam path');
  const hits=weeks.reduce((s,w)=>s+w.hitCost,0);
  return {beamWidth,runtimeSeconds:(performance.now()-start)/1000,feasible:hits<=request.settings.max_total_hits,
    hits,expectedPointsAfterHits:weeks.reduce((s,w)=>s+w.netXPts,0),
    discountedObjective:weeks.reduce((s,w,i)=>s+decay**i*w.netXPts,0)};
});
const command=spawnSync(process.env.VORTEX_SOLVER_PYTHON??'python',['-m','fpl_solver.cli'],{
  input:JSON.stringify(request),encoding:'utf8',timeout:30_000,maxBuffer:1_000_000});
let milp=null;
if (!command.error && command.status===0) {
  const response:ExactMilpResponse=JSON.parse(command.stdout);
  const compared=compareMilpPaths(request,response);
  milp={runtimeSeconds:response.runtime_seconds,attempts:response.solver_attempts,verifiedFeasiblePlans:compared.length,
    scores:response.plans.map(p=>({discountedObjective:p.discounted_points_after_hits,expectedPointsAfterHits:p.raw_expected_points_after_hits,
      relativeGap:p.solver.mip_gap,certified:p.solver.optimality_proven}))};
}
console.log(JSON.stringify({entryId:report.entryId,season:report.season,currentGameweek:report.currentGameweek,horizon:report.horizon,
  generatedAt:new Date().toISOString(),snapshotAt:report.snapshotAt,provenance:report.provenance,poolSize:pool.size,decay,beams,milp,
  limitations:['Exact solver is bounded by 10 seconds, this shortlist and a 24-point hit limit. A feasible incumbent is never a certificate.',
    'Full-squad chip recommendations are a different optimisation. Search comparisons exclude chips and terminal free-transfer value.',
    'Beam timings include a 100-draw diagnostic. A missing MILP result leaves the original plan intact.']},null,2));
