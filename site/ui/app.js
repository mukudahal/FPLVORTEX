import { createDashboard } from '/dashboard.js';
import { playerPortrait, installPlayerImageFallbacks } from '/player-images.js';
import { computePlayerXPts, computePositionPriors } from '/model/xpts.js';
import { forecastMinutes } from '/model/forecastScience.js';
import { solveLineupTS } from '/model/lineup.js';
import { validateSquad } from '/model/seasonRules.js';
import { samplePlayerGw } from '/model/monteCarlo.js';
import { compareFrozenForecasts } from '/model/forecastBenchmark.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const fixed = (value, digits=2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const positionName = {1:'GK',2:'DEF',3:'MID',4:'FWD'};
installPlayerImageFallbacks(document);
const state = {bootstrap:null,fixtures:[],rows:[],selected:null,horizon:1,sort:'points',direction:-1,squad:[],source:'sample',capturedAt:'',weeks:[]};
try {const saved=JSON.parse(localStorage.getItem('vortex-test-squad') ?? '[]');if(Array.isArray(saved))state.squad=saved.filter(id=>Number.isInteger(id)&&id>0).slice(0,15);} catch {}
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',6000);}
function persistSquad(){try{localStorage.setItem('vortex-test-squad',JSON.stringify(state.squad));}catch{toast('Browser storage is unavailable. Your current squad still works in this session.');}}
function download(name,content,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function sampleData(){
  const clubs=['Northbridge','Westhaven','Riverside','Eastfield','Southbank','Kingswood'];
  const teams=clubs.map((name,index)=>({id:index+1,short_name:name.slice(0,3).toUpperCase(),name}));
  const names=['Rivers','Vale','Stone','Reed','Lane','Brooks','Shaw','Wells','Gray','Park'];
  const positions=[1,1,2,2,2,3,3,3,4,4];
  const elements=Array.from({length:60},(_,index)=>{const seed=(index*17+13)%29;return{id:index+1,web_name:`${String.fromCharCode(65+index%20)}. ${names[index%10]}`,team:Math.floor(index/10)+1,element_type:positions[index%10],now_cost:42+seed,status:'a',starts:seed%6+1,minutes:(seed%6+1)*77,total_points:seed+9,expected_goals:String(seed/14),expected_assists:String(seed/23),expected_goals_conceded:'8.5',goals_scored:Math.floor(seed/8),assists:Math.floor(seed/10),clean_sheets:2,bonus:seed%5,bps:90+seed,defensive_contribution:30+seed*2,saves:positions[index%10]===1?17:0,yellow_cards:seed%3,red_cards:0,own_goals:0,penalties_saved:0,penalties_missed:0,selected_by_percent:String(seed/2),ep_next:'0',chance_of_playing_next_round:null};});
  const events=Array.from({length:17},(_,index)=>({id:index+1,finished:index<7,is_next:index===7,deadline_time:new Date(Date.now()+(index-6)*7*86400000).toISOString()}));
  const fixtures=events.flatMap(event=>[1,3,5].map(team=>({id:event.id*10+team,event:event.id,team_h:team,team_a:team+1,team_h_difficulty:2+event.id%3,team_a_difficulty:3,finished:event.finished,kickoff_time:event.deadline_time})));
  return{bootstrap:{events,teams,elements},fixtures};
}

function normalizedPlayer(raw){
  const numeric=['minutes','starts','goals_scored','assists','clean_sheets','saves','bonus','bps','defensive_contribution','yellow_cards','red_cards','own_goals','penalties_saved','penalties_missed','cost_change_start'];
  const player={...raw};for(const field of numeric)player[field]=Math.max(0,Number(raw[field])||0);
  for(const field of ['expected_goals','expected_assists','expected_goals_conceded'])player[field]=String(Math.max(0,Number(raw[field])||0));
  player.status=typeof raw.status==='string'?raw.status:'a';
  player.chance_of_playing_next_round=raw.chance_of_playing_next_round==null?null:Math.max(0,Math.min(100,Number(raw.chance_of_playing_next_round)||0));
  return player;
}

function loadData(data,source){
  if(!data?.bootstrap||!Array.isArray(data.bootstrap.elements)||!Array.isArray(data.bootstrap.teams)||!Array.isArray(data.bootstrap.events)||!Array.isArray(data.fixtures)||data.bootstrap.elements.length>2000||data.fixtures.length>1500)throw new Error('Expected JSON with bootstrap {elements, teams, events} and fixtures arrays.');
  const players=data.bootstrap.elements.filter(player=>Number.isInteger(player.id)&&Number.isInteger(player.team)&&[1,2,3,4].includes(player.element_type)&&Number.isFinite(player.now_cost)).map(normalizedPlayer);
  if(!players.length||new Set(players.map(player=>player.id)).size!==players.length)throw new Error('Player data is empty or has duplicate identifiers.');
  if(state.source!==source||source==='imported')state.selected=null;
  state.bootstrap={...data.bootstrap,elements:players};state.fixtures=data.fixtures;state.source=source;state.capturedAt=new Date().toISOString();
  recalculate();
  dashboard.onDataLoaded();
  const sample=source==='sample';$('#data-banner').classList.toggle('sample',sample);
  $('#data-message').textContent=sample?'Illustrative test data · fictional players, not live FPL forecasts':source==='imported'?'Imported snapshot · calculations run in your browser':'Official FPL data · independent, unvalidated VORTEX forecasts';
  $('#data-time').textContent='Retrieved '+new Date(state.capturedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

function recalculate(){
  const bootstrap=state.bootstrap;if(!bootstrap)return;
  const next=bootstrap.events.find(event=>event.is_next)??bootstrap.events.find(event=>!event.finished)??bootstrap.events.at(-1);
  if(!next)throw new Error('No gameweek schedule was provided.');
  state.weeks=bootstrap.events.filter(event=>event.id>=next.id).slice(0,state.horizon);
  const teams=new Map(bootstrap.teams.map(team=>[team.id,team]));const priors=computePositionPriors(bootstrap.elements);
  const matches=new Map();for(const fixture of state.fixtures){if(!fixture.finished)continue;for(const team of [fixture.team_h,fixture.team_a])matches.set(team,(matches.get(team)??0)+1);}
  state.rows=bootstrap.elements.map(player=>{
    const weekly=state.weeks.map((event,index)=>computePlayerXPts(player,event.id,state.fixtures,teams,matches.get(player.team)??0,index,priors));
    return{id:player.id,player,name:player.web_name??'Unnamed player',club:teams.get(player.team)?.short_name??'—',clubName:teams.get(player.team)?.name??'Unknown club',position:player.element_type,price:player.now_cost/10,points:weekly.reduce((sum,week)=>sum+week.xPts,0),minutes:forecastMinutes(player,matches.get(player.team)??0).expectedMinutes,ownership:parseFloat(player.selected_by_percent)||0,weekly};
  });
  if(!state.rows.some(row=>row.id===state.selected))state.selected=[...state.rows].sort((first,second)=>second.points-first.points)[0]?.id;
  $('#metric-gw').textContent='GW '+next.id;$('#metric-deadline').textContent='Deadline '+new Date(next.deadline_time).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const best=[...state.rows].sort((first,second)=>second.weekly[0].xPts-first.weekly[0].xPts)[0];
  $('#metric-xpts').textContent=fixed(best?.weekly[0].xPts);$('#metric-player').textContent=best?.name??'No players';$('#metric-pool').textContent=state.rows.length;
  const firstYear=new Date(bootstrap.events[0].deadline_time).getUTCFullYear();$('#season-label').textContent=state.source==='sample'?'ILLUSTRATIVE SANDBOX':`${firstYear}/${String(firstYear+1).slice(2)} SEASON`;
  renderTable();renderDetail();renderSquad();dashboard.render();
}

function renderTable(){
  const query=$('#search').value.trim().toLowerCase();const position=Number($('#position').value);
  const rows=state.rows.filter(row=>(!position||row.position===position)&&(!query||`${row.name} ${row.clubName}`.toLowerCase().includes(query))).sort((first,second)=>{
    const left=first[state.sort],right=second[state.sort];return(typeof left==='string'?left.localeCompare(right):left-right)*state.direction||first.id-second.id;
  });
  $('#players-body').innerHTML=rows.slice(0,150).map(row=>`<tr data-player="${row.id}" class="${state.selected===row.id?'selected':''}"><td><div class="player-cell">${playerPortrait(row.player,escape)}<span><strong>${escape(row.name)}</strong><small>${escape(row.club)} · ${escape(row.weekly[0]?.fixturesLabel)}</small></span></div></td><td>£${fixed(row.price,1)}</td><td>${fixed(row.minutes,0)}</td><td class="points">${fixed(row.points)}</td><td>${fixed(row.ownership,1)}%</td><td><button class="add-player ${state.squad.includes(row.id)?'added':''}" data-add="${row.id}" aria-label="${state.squad.includes(row.id)?'Remove':'Add'} ${escape(row.name)}">${state.squad.includes(row.id)?'✓':'+'}</button></td></tr>`).join('')||'<tr><td colspan="6">No players match your filters.</td></tr>';
  $('#table-footer').textContent=`Showing ${Math.min(rows.length,150)} of ${rows.length} players · ${state.weeks.length} gameweek horizon · estimates, not guaranteed returns`;
}

function renderDetail(){
  const row=state.rows.find(player=>player.id===state.selected);if(!row)return;const forecast=row.weekly[0];
  const components=[['Appearance',forecast.appearancePts],['Goals',forecast.goalPts],['Assists',forecast.assistPts],['Clean sheets / conceded',forecast.cleanSheetPts],['Bonus',forecast.bonusPts],['Defensive contribution',forecast.defensivePts],['Saves / penalty saves',forecast.savePts],['Cards & other losses',forecast.cardPts+(forecast.otherPts??0)]];
  $('#player-detail').innerHTML=`<div class="detail-name">${playerPortrait(row.player,escape,true)}<h3>${escape(row.name)}</h3><p>${escape(row.clubName)} · ${positionName[row.position]} · £${fixed(row.price,1)}m</p></div><div class="big-forecast"><strong>${fixed(forecast.xPts)}</strong><span>expected points</span></div><div class="breakdown">${components.map(([name,value])=>`<div class="breakdown-row"><span>${name}</span><strong>${fixed(value)}</strong></div>`).join('')}</div><p class="player-note">P(60+ min): ${fixed(forecast.p60*100,1)}%<br>P(short appearance): ${fixed(forecast.pSub*100,1)}%<br>Availability: ${escape(row.player.status)}<br>${escape(row.player.news||'No additional news supplied.')}</p><div class="mini-bars">${row.weekly.map(week=>`<div style="height:${Math.max(3,week.xPts/Math.max(1,...row.weekly.map(item=>item.xPts))*55)}px" title="GW${week.gw}: ${fixed(week.xPts)} xPts"></div>`).join('')}</div><div class="mini-label">Forecast by gameweek · uncertainty increases with horizon</div>`;
  $('#simulation-player').textContent=`${row.name} · ${forecast.fixturesLabel} · ${fixed(forecast.xPts)} xPts`;
}

function toggleSquad(id){
  if(state.squad.includes(id))state.squad=state.squad.filter(existing=>existing!==id);
  else {if(state.squad.length>=15){toast('Your test squad already has 15 players.');return;}state.squad.push(id);}
  persistSquad();renderSquad();renderTable();
}
function squadRows(){return state.squad.map(id=>state.rows.find(row=>row.id===id)).filter(Boolean);}
function renderSquad(){
  const rows=squadRows();$('#squad-count').textContent=rows.length;const cost=rows.reduce((sum,row)=>sum+row.price,0);$('#squad-budget').textContent=`£${fixed(cost,1)}m / £100.0m`;
  $('#squad-list').innerHTML=rows.map(row=>`<div><span>${positionName[row.position]} · ${escape(row.name)} <small>£${fixed(row.price,1)}m</small></span><button data-add="${row.id}" class="quiet" aria-label="Remove ${escape(row.name)}">Remove</button></div>`).join('');
  $('#pitch').innerHTML=rows.length?[1,2,3,4].map(position=>`<div class="pitch-row">${rows.filter(row=>row.position===position).map(row=>`<div class="pitch-player">${playerPortrait(row.player,escape,true)}${escape(row.name)}<small>${fixed(row.weekly[0].xPts)} xPts</small></div>`).join('')}</div>`).join(''):'<p>Select players using + in the forecasts table.</p>';
  $('#squad-status').textContent=`${rows.length}/15 players selected`;$('#squad-total').innerHTML='—<small>Projected XI + captain</small>';$('#solve-message').textContent='';
}
function solveSquad(){
  const rows=squadRows();const validation=validateSquad(rows.map(row=>({id:row.id,team:row.player.team,position:row.position,priceTenths:row.player.now_cost})),1000);
  if(!validation.legal){$('#solve-message').textContent=validation.errors.join(' ');return;}
  const result=solveLineupTS(rows.map(row=>row.id),new Map(rows.map(row=>[row.id,row.player])),Object.fromEntries(rows.map(row=>[row.id,row.weekly[0].xPts])));
  $('#squad-total').innerHTML=`${fixed(result.totalXPts)}<small>Projected XI + captain · ${result.formation}</small>`;
  const names=ids=>ids.map(id=>rows.find(row=>row.id===id)?.name??id).join(', ');
  $('#solve-message').textContent=`Captain: ${names([result.captainId])}. Vice: ${names([result.viceId])}. Bench order: ${names(result.bench)}.`;
  $('#pitch').innerHTML=[1,2,3,4].map(position=>`<div class="pitch-row">${result.starters.map(id=>rows.find(row=>row.id===id)).filter(row=>row.position===position).map(row=>`<div class="pitch-player">${playerPortrait(row.player,escape,true)}${escape(row.name)}${row.id===result.captainId?' (C)':''}<small>${fixed(row.weekly[0].xPts)} xPts</small></div>`).join('')}</div>`).join('');
}

async function refresh(){
  $('#refresh').disabled=true;$('#refresh').textContent='Refreshing…';
  try {
    const responses=await Promise.all(['/api/bootstrap','/api/fixtures'].map(url=>fetch(url,{signal:AbortSignal.timeout(16000)})));
    if(responses.some(response=>!response.ok))throw new Error('The official feed is currently unavailable. Import a snapshot or test with the clearly labelled illustrative data.');
    const [bootstrap,fixtures]=await Promise.all(responses.map(response=>response.json()));loadData({bootstrap,fixtures},'official');
  }catch(error){toast(error.message||'Could not refresh data.');}
  finally{$('#refresh').disabled=false;$('#refresh').textContent='↻ Refresh data';}
}

function simulate(){
  const row=state.rows.find(player=>player.id===state.selected);if(!row)return;const forecast=row.weekly[0];
  try{
    const sampled=samplePlayerGw({mean:forecast.xPts,p60:forecast.p60,pSub:forecast.pSub,fixtures:forecast.fixtureCount,csProb:forecast.csProb,cardLoss:-forecast.cardPts,team:row.player.team,position:row.position,fixtureModels:forecast.fixtureModels},null,10000,20261024);
    const points=Array.from(sampled.pts).sort((first,second)=>first-second);const counts=new Map();for(const value of points)counts.set(value,(counts.get(value)??0)+1);
    const minimum=Math.min(-2,points[0]),maximum=Math.max(12,Math.min(35,points.at(-1)));const maximumCount=Math.max(...counts.values(),1);
    $('#histogram').innerHTML=Array.from({length:maximum-minimum+1},(_,index)=>index+minimum).map(value=>`<div style="height:${Math.max(1,(counts.get(value)??0)/maximumCount*100)}%" title="${value} points: ${fixed((counts.get(value)??0)/100,1)}%"><span>${value%2===0?value:''}</span></div>`).join('');
    const mean=points.reduce((sum,value)=>sum+value,0)/points.length;
    $('#simulation-result').innerHTML=[['Analytic xPts',forecast.xPts],['Simulated mean',mean],['10th percentile',points[1000]],['90th percentile',points[9000]]].map(([label,value])=>`<div><strong>${fixed(value)}</strong><small>${label}</small></div>`).join('');
    toast('10,000 deterministic draws complete. Distribution parameters remain unvalidated.');
  }catch(error){toast(error.message);}
}

async function readJson(input){const file=input.files?.[0];if(!file)return null;if(file.size>12*1024*1024)throw new Error('Please use a JSON file smaller than 12 MB.');try{return JSON.parse(await file.text());}catch{throw new Error('The selected file is not valid JSON.');}}
$('#data-import').addEventListener('change',async event=>{try{const data=await readJson(event.target);if(data)loadData(data,'imported');}catch(error){toast(error.message);}event.target.value='';});
$('#benchmark-import').addEventListener('change',async event=>{try{const data=await readJson(event.target);if(!data)return;if(!Array.isArray(data.candidates)||!Array.isArray(data.references)||!Array.isArray(data.outcomes)||Math.max(data.candidates.length,data.references.length,data.outcomes.length)>100000)throw new Error('Provide candidates, references and outcomes arrays with at most 100,000 rows each.');const result=compareFrozenForecasts(data.candidates,data.references,data.outcomes);$('#benchmark-result').textContent=`Result: ${result.verdict.replaceAll('_',' ')}\nMatched: ${result.sampleSize} player-gameweeks across ${result.gameweeks} gameweeks\nVORTEX RMSE: ${fixed(result.candidate.rmse)} · Reference RMSE: ${fixed(result.reference.rmse)}\nVORTEX MAE: ${fixed(result.candidate.mae)} · Reference MAE: ${fixed(result.reference.mae)}\n95% interval for RMSE difference: ${result.rmseDifference95?result.rmseDifference95.map(value=>fixed(value,3)).join(' to '):'insufficient data'}\nRejected forecasts: ${result.rejectedCandidate+result.rejectedReference}\nThis evaluates your supplied sample; it does not establish future superiority.`;}catch(error){toast(error.message);}event.target.value='';});
$('#benchmark-template').addEventListener('click',()=>download('benchmark-input-format.json',JSON.stringify({instructions:'Use genuine frozen pre-deadline forecasts and observed outcomes. Both models must use the same target GW and information cutoff. Example schema only; empty arrays contain no benchmark evidence.',forecastSchema:{season:'YYYY/YY',gw:'integer 1–38',playerId:'integer',issuedAt:'ISO timestamp',deadlineAt:'ISO timestamp',modelVersion:'source/version',xPts:'number',p60:'optional probability'},outcomeSchema:{season:'YYYY/YY',gw:'integer',playerId:'integer',points:'observed number',played60:'optional boolean'},candidates:[],references:[],outcomes:[]},null,2)));
$('#export').addEventListener('click',()=>{const firstYear=new Date(state.bootstrap.events[0].deadline_time).getUTCFullYear();download('vortex-frozen-forecasts.json',JSON.stringify({source:state.source,generatedAt:new Date().toISOString(),modelStatus:'unvalidated',candidates:state.rows.flatMap(row=>row.weekly.map(week=>({season:`${firstYear}/${String(firstYear+1).slice(2)}`,gw:week.gw,playerId:row.id,issuedAt:new Date().toISOString(),deadlineAt:state.bootstrap.events.find(event=>event.id===week.gw).deadline_time,modelVersion:'vortex-xpts-2026.27.2-math',xPts:week.xPts,p60:week.p60}))),references:[],outcomes:[]},null,2));});
document.addEventListener('click',event=>{const add=event.target.closest('[data-add]');if(add){toggleSquad(Number(add.dataset.add));return;}const row=event.target.closest('[data-player]');if(row){state.selected=Number(row.dataset.player);renderTable();renderDetail();}const sort=event.target.closest('[data-sort]');if(sort){state.direction=state.sort===sort.dataset.sort?-state.direction:-1;state.sort=sort.dataset.sort;renderTable();}});
const pageCopy={dashboard:['Dashboard','Dashboard','Current-gameweek review, fixtures and player intelligence.'],forecasts:['Player forecasts','Find your next edge.','Explore the forecast. Inspect the assumptions. Make the decision.'],squad:['Squad lab','Build the right balance.','A legal squad, a clear captain, and every point accounted for.'],math:['Math & simulation','See the range of outcomes.','Expected points are an average. The distribution tells the rest.'],validation:['Validation','Let the evidence decide.','Measure prediction quality before making an accuracy claim.']};
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{const tab=button.dataset.tab;document.body.classList.toggle('dashboard-mode',tab==='dashboard');document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id===`view-${tab}`));document.querySelectorAll('[data-tab]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-current',item===button?'page':'false');});const copy=pageCopy[tab];$('#page-name').textContent=copy[0];$('#page-title').textContent=copy[1];$('#page-description').textContent=copy[2];}));
$('#search').addEventListener('input',renderTable);$('#position').addEventListener('change',renderTable);$('#horizon').addEventListener('change',event=>{state.horizon=Number(event.target.value);try{recalculate();}catch(error){toast(error.message);}});$('#refresh').addEventListener('click',refresh);$('#simulate').addEventListener('click',simulate);$('#solve').addEventListener('click',()=>{try{solveSquad();}catch(error){toast(error.message);}});$('#clear-squad').addEventListener('click',()=>{state.squad=[];persistSquad();renderSquad();renderTable();});
const dashboard=createDashboard(()=>state,escape,toast);
document.body.classList.add('dashboard-mode');
$('#page-name').textContent='Dashboard';$('#page-title').textContent='Dashboard';$('#page-description').textContent='Current-gameweek review, fixtures and player intelligence.';
loadData(sampleData(),'sample');refresh();setInterval(()=>{if(state.source!=='imported')refresh();},15*60*1000);
