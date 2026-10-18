/** Synthetic test data only; never a user-facing real-player snapshot. */
export const testNow=Date.UTC(2026,9,17,20);
export function officialFixture(){
 const teams=Array.from({length:8},(_,i)=>({id:i+1,short_name:`T${i+1}`}));
 const elements=Array.from({length:24},(_,i)=>({id:1001+i,web_name:`Synthetic ${i+1}`,team:Math.floor(i/3)+1,element_type:i<2?1:i<7?2:i<12?3:i<15?4:(i%4)+1,now_cost:50+i,status:'a',news:'',minutes:540,starts:6,total_points:24,goals_scored:1,assists:2,expected_goals:'1.3',expected_assists:'0.9',chance_of_playing_next_round:null}));
 const picks=elements.slice(0,15).map((e,i)=>({id:e.id,position:i+1,isCaptain:i===12,isViceCaptain:i===7,multiplier:i<11?1:0}));
 const events=Array.from({length:19},(_,i)=>({id:i+1,deadline_time:new Date(Date.UTC(2026,8,5+i*7,10)).toISOString(),finished:i<6,is_next:i===7,is_current:i===6}));
 events[0].deadline_time='2026-08-15T10:00:00Z';
 const fixtures=[];for(let gw=1;gw<=19;gw++)for(let t=1;t<=8;t+=2)fixtures.push({id:gw*10+t,event:gw,team_h:t,team_a:t+1,finished:gw<=6,team_h_difficulty:2,team_a_difficulty:4,kickoff_time:new Date(Date.UTC(2026,8,5+(gw-1)*7,15)).toISOString()});
 return {bootstrap:{elements,teams,events},fixtures,picks,now:testNow,fetchedAt:new Date(testNow).toISOString()};
}
