const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const file=path.resolve(__dirname,'../src/lib/liveAnalysis.ts');const loaded=new Module(file,module);
loaded._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {resolveLiveTeam,cohortStats,liveContributions}=loaded.exports;
function fixture(){
 const types=[1,2,2,2,2,3,3,3,3,4,4,1,2,3,4];
 const elements=new Map(types.map((t,i)=>[i+1,{id:i+1,team:i+1,element_type:t}]));
 const picks={active_chip:null,automatic_subs:[],entry_history:{event_transfers_cost:4},picks:types.map((_,i)=>({element:i+1,position:i+1,multiplier:i>=11?0:i===9?2:1,is_captain:i===9,is_vice_captain:i===5}))};
 const live=new Map(types.map((_,i)=>[i+1,{minutes:90,total_points:i+1,red_cards:0,yellow_cards:0}]));
 const fixtures=types.map((_,i)=>({id:i+1,team_h:i+1,team_a:99,finished:true,started:true}));
 return {elements,picks,live,fixtures};
}
test('confirmed DNP brings first eligible bench player on without losing transfer costs',()=>{
 const f=fixture();f.live.get(2).minutes=0;f.live.get(2).total_points=0;
 const r=resolveLiveTeam(f.picks,f.elements,f.live,f.fixtures);
 assert.deepEqual(r.substitutions,[{out:2,in:13}]);assert.equal(r.after.find(p=>p.element===13).multiplier,1);
 assert.equal(r.afterPoints-r.beforePoints,13);assert.equal(r.afterPoints,r.after.reduce((s,p)=>s+f.live.get(p.element).total_points*p.multiplier,0)-4);
});
test('pending fixture in a double prevents premature automatic substitutions',()=>{
 const f=fixture();f.live.get(2).minutes=0;f.fixtures.push({id:100,team_h:2,team_a:99,finished:false,started:false});
 assert.equal(resolveLiveTeam(f.picks,f.elements,f.live,f.fixtures).substitutions.length,0);
});
test('goalkeeper replacement and legal formation are respected',()=>{
 const f=fixture();f.live.get(1).minutes=0;const r=resolveLiveTeam(f.picks,f.elements,f.live,f.fixtures);
 assert.deepEqual(r.substitutions,[{out:1,in:12}]);
 const g=fixture();g.live.get(2).minutes=0;g.live.get(3).minutes=0;g.live.get(13).minutes=0;
 const s=resolveLiveTeam(g.picks,g.elements,g.live,g.fixtures);assert.equal(s.substitutions.length,1);assert.equal(s.substitutions[0].in,14);
});
test('captain passes to vice only after no-show is confirmed; TC and BB remain correct',()=>{
 const f=fixture();f.picks.active_chip='3xc';f.live.get(10).minutes=0;f.live.get(10).total_points=0;
 const r=resolveLiveTeam(f.picks,f.elements,f.live,f.fixtures);assert.equal(r.after.find(p=>p.element===6).multiplier,3);
 f.fixtures.find(g=>g.team_h===10).finished=false;
 const pending=resolveLiveTeam(f.picks,f.elements,f.live,f.fixtures);assert.equal(pending.after.find(p=>p.element===6).multiplier,1);
 f.picks.active_chip='bboost';const bb=resolveLiveTeam(f.picks,f.elements,f.live,f.fixtures);assert.equal(bb.substitutions.length,0);assert.equal(bb.after.find(p=>p.element===15).multiplier,1);
});
test('zero-minute disciplinary appearance is not treated as a no-show',()=>{
 const f=fixture();f.live.get(2).minutes=0;f.live.get(2).red_cards=1;
 assert.equal(resolveLiveTeam(f.picks,f.elements,f.live,f.fixtures).substitutions.length,0);
});
test('processed official auto-subs are authoritative and are reversed only for deadline comparison',()=>{
 const f=fixture();f.picks.automatic_subs=[{element_out:2,element_in:13}];
 const out=f.picks.picks.find(p=>p.element===2);const inc=f.picks.picks.find(p=>p.element===13);
 [out.position,inc.position]=[inc.position,out.position];out.multiplier=0;inc.multiplier=1;
 const r=resolveLiveTeam(f.picks,f.elements,f.live,f.fixtures);assert.equal(r.after.find(p=>p.element===13).position,2);assert.equal(r.before.find(p=>p.element===2).position,2);
 assert.equal(r.before.find(p=>p.element===2).multiplier,1);
});
test('sample EO includes captain and chip multipliers and reports its real denominator',()=>{
 const f=fixture();const a=structuredClone(f.picks);const b=structuredClone(f.picks);a.active_chip='3xc';b.active_chip='bboost';
 const cohort={managers:[{picks:a,chipsUsed:[{name:'3xc',event:7}]},{picks:b,chipsUsed:null}]};
 const s=cohortStats(cohort,f.elements,f.live,f.fixtures);assert.equal(s.n,2);assert.equal(s.eo.get(10),2.5);assert.equal(s.eo.get(15),.5);assert.equal(s.historyCount,1);assert.equal(s.overall['3xc'],1);assert.equal(s.triples.get(10),1);
});
test('scoring feed uses official fixture contributions, including corrections, without fabricated times',()=>{
 const rows=liveContributions({elements:[{id:1,stats:{},explain:[{fixture:99,stats:[{identifier:'goals_scored',points:6,value:1},{identifier:'minutes',points:2,value:90},{identifier:'yellow_cards',points:-1,value:1}]}]}]});
 assert.equal(rows.length,2);assert.equal(rows[0].label,'Goal');assert.equal(rows[1].points,-1);assert(!('observedAt'in rows[0]));
});
test('deadline-XI comparisons and after-substitution comparisons use matching multipliers',()=>{
 const f=fixture();f.live.get(10).minutes=0;f.live.get(10).total_points=0;
 const cohort={managers:[{picks:f.picks,chipsUsed:[]}]};
 const pre=cohortStats(cohort,f.elements,f.live,f.fixtures,false);
 const post=cohortStats(cohort,f.elements,f.live,f.fixtures,true);
 assert.equal(pre.eo.get(10),2);assert.equal(post.eo.get(10),0);
 assert.equal(post.eo.get(6),2);assert.notEqual(pre.average,post.average);
});
