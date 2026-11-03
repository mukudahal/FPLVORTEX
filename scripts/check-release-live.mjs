import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=process.env.PLANNER_BASE_URL??'https://fplvortex.onrender.com';
async function json(path,options={}) {
 const r=await fetch(base+path,{...options,signal:AbortSignal.timeout(60000),cache:'no-store'});
 assert.ok(r.ok,`${path} returned HTTP ${r.status}`);return r.json();
}
const snapshot=await json('/api/vortex/snapshot?refresh=1');
assert.equal(snapshot.meta.upstreamOk,true);assert.equal(snapshot.meta.stale,false);
const age=Date.now()-Date.parse(snapshot.meta.generatedAt);
assert.ok(age>=0&&age<15*60000,'An actual recent official retrieval is required');
assert.ok(snapshot.players.length>=400);assert.equal(snapshot.teams.length,20);
const health=await json('/api/health');
assert.equal(health.ok,true);assert.equal(health.refresh.persistence,'saved');
assert.ok(Date.parse(health.refresh.persistedAt)>=Date.parse(snapshot.meta.generatedAt));
const status=await json('/api/vortex/data-status');
assert.equal(status.officialFpl.state,'fresh');
if(!status.market.rightsVerified)assert.notEqual(status.market.state,'fresh');
const player=snapshot.players.find(p=>p.minutes>500)??snapshot.players[0];
const history=await json('/api/vortex/player-history/'+player.id);
assert.equal(history.playerId,player.id);assert.equal(history.source,'official-fpl-element-summary');
const team=snapshot.teams.find(t=>t.id===player.teamId);
for(const endpoint of ['/api/img/player/'+player.code+'?teamCode='+team.code,'/api/img/badge/'+team.code]){
 const image=await fetch(base+endpoint,{signal:AbortSignal.timeout(25000)});
 assert.ok(image.ok,`Production image proxy failed: ${endpoint} HTTP ${image.status}`);
 assert.ok(image.headers.get('content-type')?.startsWith('image/'));
 assert.ok((await image.arrayBuffer()).byteLength>300);
}
const input=JSON.parse(await readFile('fpl_solver/examples/sample_input.json','utf8'));
Object.assign(input.settings,{end_gw:1,time_limit_seconds:5,solutions_requested:1,mip_gap:.02,free_transfer_value:0,bank_value_per_million:0});
const solver=await json('/api/vortex/solver/exact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
assert.ok(solver.plans?.length,'The production solver must return a feasible synthetic smoke plan');
console.log(JSON.stringify({liveVerification:'passed',retrievedAt:snapshot.meta.generatedAt,players:snapshot.players.length,fixtures:snapshot.fixtures.length,recovery:health.refresh.persistence,market:status.market.state,marketRightsVerified:status.market.rightsVerified,historyRows:history.matches.length,solver:'synthetic no-chip HTTP smoke; not a real manager forecast'}));
