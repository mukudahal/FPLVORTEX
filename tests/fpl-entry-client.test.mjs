import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchLiveFplEntry, validateEntryId} from '../scripts/fpl-entry-client.mjs';

const json = value=>({ok:true,status:200,json:async()=>value});
function source({badHistory=false, missingPicks=false}={}) {
 const seen=[];
 const fetchImpl=async url=>{
  seen.push(url);
  if(url.endsWith('/entry/145784/'))return json({id:145784,name:'User test team',summary_overall_rank:10345,summary_overall_points:443,summary_event_points:53,current_event:7,last_deadline_bank:14,last_deadline_value:1008});
  if(url.endsWith('/entry/145784/history/'))return json({current:[{event:1,points:55,total_points:55,overall_rank:50000},{event:6,points:67,total_points:390,overall_rank:12000}],chips:badHistory?null:[{name:'wildcard',event:4}]});
  if(url.endsWith('/entry/145784/event/7/picks/'))return missingPicks?{ok:false,status:403}:json({picks:Array.from({length:15},(_,i)=>({element:i+1,position:i+1,is_captain:i===0,is_vice_captain:i===1,multiplier:i<11?1:0})),active_chip:null});
  if(url.endsWith('/fixtures/'))return json([]);
  if(url.endsWith('/bootstrap-static/'))return json({elements:Array.from({length:15},(_,i)=>({id:i+1,web_name:`Player ${i+1}`,team:1,element_type:i%4+1,now_cost:70,status:'a'})),teams:[{id:1,short_name:'ARS'}]});
  throw new Error('Unexpected URI '+url);
 };
 return {fetchImpl,seen};
}
test('id validation blocks SSRF, negative IDs, floating and paths',()=>{
 for(const value of ['http://evil.test','../','-5','0','1.1','',null,'145784/../../', '1234567890'])assert.throws(()=>validateEntryId(value),RangeError);
 assert.equal(validateEntryId('145784'),145784);
});
test('sync reads public manager rank, points, chip history and picks without demo substitutions',async()=>{
 const s=source();const result=await fetchLiveFplEntry(145784,{fetchImpl:s.fetchImpl,now:()=>Date.UTC(2026,9,17),bypassCache:true});
 assert.equal(result.entryId,145784);assert.equal(result.overallRank,10345);assert.equal(result.overallPoints,443);
 assert.equal(result.chipsPlayed[0].gameweek,4);assert.equal(result.picks.playerIds.length,15);
 assert.equal(result.picks.captainId,1);assert.equal(result.picks.players[0].name,'Player 1');assert.equal(result.picks.players[0].club,'ARS');assert.equal(result.picks.players[1].isViceCaptain,true);assert.equal(s.seen.length,5);
 assert.equal(result.bankInTenths,14);
 assert.match(result.caution,/not automatically mapped/);
});
test('blocked pick calls do not make an otherwise valid rank disappear',async()=>{
 const s=source({missingPicks:true});const result=await fetchLiveFplEntry(145784,{fetchImpl:s.fetchImpl,now:()=>Date.now(),bypassCache:true});
 assert.equal(result.overallRank,10345);assert.equal(result.picks,null);
});
test('malformed history rejected rather than manufacturing rank or chip data',async()=>{
 const s=source({badHistory:true});await assert.rejects(()=>fetchLiveFplEntry(145784,{fetchImpl:s.fetchImpl,bypassCache:true}),/history/);
});
test('mismatched entry response rejected',async()=>{
 const fetchImpl=async url=>json(url.endsWith('/history/')?{current:[],chips:[]}:{id:12});
 await assert.rejects(()=>fetchLiveFplEntry('145784',{fetchImpl,bypassCache:true}),/did not match/);
});