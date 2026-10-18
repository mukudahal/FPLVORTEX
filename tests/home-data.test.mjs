import test from 'node:test';
import assert from 'node:assert/strict';
import { poissonWin, normalizeCatalog, normalizeFixtures, configuredVideos, getHomeOverview, getLeagueView } from '../scripts/home-data.mjs';
import { orderPredictions, orderLeaders, renderHome } from '../dist/js/home.js';

const bootstrap={elements:[
 {id:41,web_name:'Haaland',first_name:'Erling',second_name:'Haaland',team:2,element_type:4,total_points:58,event_points:9,now_cost:159,selected_by_percent:'75.2',transfers_in_event:13421,transfers_out_event:1023,cost_change_event:1,status:'a',news:'',chance_of_playing_next_round:null},
 {id:42,web_name:'Saka',first_name:'Bukayo',second_name:'Saka',team:1,element_type:3,total_points:49,event_points:3,now_cost:99,selected_by_percent:'41.5',transfers_in_event:1001,transfers_out_event:312,cost_change_event:0,status:'d',news:'Knock',chance_of_playing_next_round:75}
 ],teams:[{id:1,short_name:'ARS'},{id:2,short_name:'MCI'}],events:[{id:7,is_current:true,is_next:false},{id:8,is_current:false,is_next:true}]};
const match=[{id:220,event:7,team_h:1,team_a:2,team_h_score:1,team_a_score:2,started:true,finished:false,kickoff_time:'2026-10-18T11:00:00Z'},{id:221,event:8,team_h:2,team_a:1,team_h_score:null,team_a_score:null,started:false,finished:false,kickoff_time:'2026-10-25T11:00:00Z'}];
const entry={id:145784,name:'My club',summary_overall_rank:393758,summary_overall_points:465,summary_event_points:37,current_event:7,last_deadline_bank:4,last_deadline_value:1013};
const history={current:[{event:7,points:37,total_points:465,overall_rank:393758}],chips:[]};
const picks={picks:Array.from({length:15},(_,i)=>({element:41+i,position:i+1,multiplier:i<11?1:0,is_captain:i===0,is_vice_captain:i===1})),active_chip:null};
const respond=json=>({ok:true,json:async()=>json});
const stubFetch=async u=>{
 if(u.endsWith('/bootstrap-static/'))return respond(bootstrap);
 if(u.endsWith('/fixtures/'))return respond(match);
 if(u.endsWith('/entry/145784/'))return respond(entry);
 if(u.endsWith('/entry/145784/history/'))return respond(history);
 if(u.endsWith('/entry/145784/event/7/picks/'))return respond(picks);
 throw new Error('Unexpected URL '+u);
};
test('own normalized FPL player data retains source values including transfers, injury, prices',()=>{
 const c=normalizeCatalog(bootstrap);
 assert.equal(c.players.length,2);assert.equal(c.players[0].priceTenths,159);
 assert.equal(c.players[1].chance,75);assert.equal(c.players[1].news,'Knock');assert.equal(c.players[0].photo,null);
 assert.equal(c.currentGameweek,7);
});
test('fixture scores do not silently turn null into zero',()=>{
 const f=normalizeFixtures(match,bootstrap.teams,8);
 assert.equal(f[0].homeScore,null);assert.equal(f[0].awayScore,null);assert.equal(f[0].started,false);
 const other=normalizeFixtures(match,bootstrap.teams,7);assert.equal(other[0].homeScore,1);
});
test('Poisson three-way chances stay in [0,1] and sum to one',()=>{
 for(const pair of [[1.3,1.0],[2.1,.3],[0,0]]){
  const p=poissonWin(...pair);assert.ok(Object.values(p).every(x=>x>=0&&x<=1));
  assert.ok(Math.abs(p.home+p.draw+p.away-1)<1e-9);
 }
});
test('model does not invent forecasts or fixtures without a CC0 league snapshot',()=>{
 assert.deepEqual(getLeagueView(null,7,8).predictions,[]);
 assert.deepEqual(getLeagueView(null,7,8).fixtures,[]);
});
test('Home overview uses genuine source data without making up a model',async()=>{
 const data=await getHomeOverview(145784,{fetchImpl:stubFetch,readLeague:async()=>null,now:()=>1792314000000,bypassCache:true,env:{}});
 assert.equal(data.entry.overallRank,393758);assert.equal(data.players.length,2);
 assert.equal(data.fixtures.length,1);assert.equal(data.fixtures[0].home,'ARS');
 assert.equal(data.predictions.length,0);assert.equal(data.entry.picks.players.length,15);
 assert.deepEqual(data.live,{entry:true,players:true,fixtures:true,model:false});
});
test('sorting goals, clean sheets and win odds produces different order',()=>{
 const list=[{club:'ARS',xg:2,cs:.23,win:.5},{club:'LIV',xg:1,cs:.75,win:.8},{club:'MCI',xg:1.5,cs:.1,win:.9}];
 assert.deepEqual(orderPredictions(list,'xg').map(x=>x.club),['ARS','MCI','LIV']);
 assert.deepEqual(orderPredictions(list,'cs').map(x=>x.club),['LIV','ARS','MCI']);
 assert.deepEqual(orderPredictions(list,'win').map(x=>x.club),['MCI','LIV','ARS']);
});
test('player points, ownership and points-per-price are independently sortable',()=>{
 const source=[{id:1,points:50,priceTenths:150,selected:80},{id:2,points:45,priceTenths:45,selected:20},{id:3,points:30,priceTenths:60,selected:90}];
 assert.deepEqual(orderLeaders(source,'points').map(x=>x.id),[1,2,3]);
 assert.deepEqual(orderLeaders(source,'owned').map(x=>x.id),[3,1,2]);
 assert.deepEqual(orderLeaders(source,'value').map(x=>x.id),[2,3,1]);
});
test('unconfigured YouTube videos are absent and unsafe links filtered',()=>{
 assert.deepEqual(configuredVideos({}),{ids:[],channelUrl:null});
 assert.deepEqual(configuredVideos({FPLVORTEX_YOUTUBE_VIDEO_IDS:'12345678901,bad,AbC123_4567',FPLVORTEX_YOUTUBE_CHANNEL_URL:'https://evil.com/@bad'}),{ids:['12345678901','AbC123_4567'],channelUrl:null});
});
test('Home emits no invented squad if source is unavailable',()=>{
 const html=renderHome(null,{goalSort:'xg',leaderSort:'points',leaderPage:0,fixturePage:0,marketPage:0,injuryFilter:'all',preview:false,waiting:false,error:''});
 assert.match(html,/Your live squad goes here/);assert.match(html,/Goals/);assert.match(html,/CS %/);assert.match(html,/Win %/);
 assert.match(html,/Latest FPLVORTEX videos/);assert.match(html,/data-home-reload/);
});