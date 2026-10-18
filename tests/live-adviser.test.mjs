import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveResearch } from '../dist/js/live-adviser.js';

const base={id:0,web_name:'',team:1,element_type:3,now_cost:60,minutes:480,starts:6,expected_goals:'1.2',expected_assists:'0.9',status:'a',news:'',chance_of_playing_next_round:null,selected_by_percent:'10.5'};
function source({injured=false, omitMinutes=false, omitFixtures=false}={}){
 const elements=Array.from({length:40},(_,i)=>({...base,id:i+1,web_name:`Player ${i+1}`,team:1+Math.floor(i/10),element_type:i%15<2?1:i%15<7?2:i%15<12?3:4,now_cost:45+i,minutes:omitMinutes?0:480,starts:i<15?6:5,status:injured&&i===0?'i':'a',expected_goals:i===15?'9.0':'1.2'}));
 const picks=elements.slice(0,15).map((e,i)=>({id:e.id,position:i+1,multiplier:i<11?1:0,isCaptain:i===0,isViceCaptain:i===1}));
 const teams=Array.from({length:4},(_,i)=>({id:i+1,short_name:['ARS','CHE','MCI','TOT'][i]}));
 const fixtures=[];
 for(let gw=1;gw<=17;gw++)for(let team=1;team<=4;team++)if(!omitFixtures||gw<=7){
    fixtures.push({event:gw,finished:gw<8,team_h:team,team_a:(team%4)+1,team_h_difficulty:2+(team%3),team_a_difficulty:2});
 }
 const events=Array.from({length:19},(_,i)=>({id:i+1,finished:i<6,is_next:i===7,deadline_time:new Date(Date.now()+2*24*3600_000).toISOString()}));
 return {bootstrap:{elements,teams,events},fixtures,picks,latestGW:7};
}
test('real-source captain/roadmap use upcoming GW only, up to ten weeks toward GW19',()=>{
 const result=buildLiveResearch(source());
 assert.equal(result.mode,'live-inputs-uncalibrated');assert.equal(result.nextGameweek,8);assert.equal(result.throughGameweek,17);
 assert.equal(result.roadmap.length,10);assert.equal(result.ownPlayers.length,15);assert.ok(result.captain);
 assert.equal(result.ownPlayers[0].starts,6);assert.equal(result.ownPlayers[0].teamMatches,14);
 assert.ok(result.ownPlayers[0].ninetyEquivalents>0);
 assert.ok(result.ownPlayers[0].future.every(f=>f.gw>=8));
 assert.ok(result.caution.some(x=>/uncalibrated|globally optimal/.test(x)));
});
test('future official expected points or proprietary model keys are not copied to our forecasts',()=>{
 const data=source();const first=buildLiveResearch(data);
 for(const p of data.bootstrap.elements){p.ep_next='1000.0';p.ep_this='2000.0';}
 const second=buildLiveResearch(data);
 assert.deepEqual(second.ownPlayers.map(p=>p.expectedThree),first.ownPlayers.map(p=>p.expectedThree));
});
test('player injuries zero playing points and real starts stay distinct from estimates',()=>{
 const d=source({injured:true});const model=buildLiveResearch(d);
 assert.equal(model.ownPlayers[0].starts,6);
 assert.equal(model.ownPlayers[0].expectedNext,0);
 assert.equal(model.ownPlayers[0].status,'i');
});
test('missing future fixture data cannot produce a fictitious captain projection',()=>{
 const model=buildLiveResearch(source({omitFixtures:true}));
 assert.equal(model.ownPlayers[0].expectedNext,null);
 assert.equal(model.captain,null);
 assert.equal(model.roadmap[0].captain,null);
});
test('squad identifier validation blocks unknown and duplicate IDs',()=>{
 const data=source();data.picks[14].id=data.picks[0].id;
 assert.throws(()=>buildLiveResearch(data),/15 unique/);
});