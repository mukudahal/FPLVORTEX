import { gameweekPoints } from '/gameweek-points.js';
import { buildStrengths, projectMatch } from '/model/dashboardMath.js';
import { playerPortrait } from '/player-images.js';
import { icon } from '/icons.js';
import { playerAvailability, availabilityFlag as renderAvailabilityFlag } from '/availability.js';
import { analyzeGameweek, compareTeams, sortAnalysisRows } from '/analysis.js';

export function createDashboard(getState, escape, toast) {
  const root = document.querySelector('#dashboard-mount');
  let gameweek = null, review = null, loading = false, requestVersion = 0, reviewError = '';
  let liveSnapshot = null, managerError = '';
  const requestCache = new Map();
  let analysis = false, projectionMetric = 'goals', projectionDirection = -1;
  let topDirection = -1, transferSort = 'net', transferDirection = -1, transferPage = 0, injuryPage = 0, videos = [];
  let manager = '', reviewView = 'pitch';
  let analysisSort = 'contribution', analysisDirection = -1, analysisScope = 'xi';
  let rivalManager = '', rival = null, rivalLoading = false, rivalError = '', rivalVersion = 0;
  try {
    manager = localStorage.getItem('vortex-linked-manager') || manager;
    rivalManager = localStorage.getItem('vortex-rival-manager') || rivalManager;
    reviewView = localStorage.getItem('vortex-review-view') === 'table' ? 'table' : 'pitch';
  } catch {}
  const positions = {1:'GK',2:'DEF',3:'MID',4:'FWD'};
  const number = (value,digits=0) => Number.isFinite(value) ? value.toLocaleString(undefined,{maximumFractionDigits:digits}) : '—';
  const decimal = (value,digits=2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  const compact = value => Number.isFinite(value) ? new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(value).toLowerCase() : '—';
  const signed = value => Number.isFinite(value) ? (value>0?'+':'')+compact(value) : '—';
  const polarity = value => value>0?'positive':value<0?'negative':'';
  const heat = value => value>0?'heat-high':value<0?'heat-low':'';
  const money = value => '£'+(value/10).toFixed(1)+'m';
  const currentGw = state => state.bootstrap?.events.find(event=>event.is_current)?.id ?? state.bootstrap?.currentEvent ?? state.bootstrap?.events.find(event=>event.is_next)?.id ?? 1;
  const teamMap = state => new Map(state.bootstrap.teams.map(team=>[team.id,team]));
  const portrait = (player,large=false) => playerPortrait(player,escape,large);
  const badge = team => team?.code ? `<img class="club-badge" loading="lazy" src="https://resources.premierleague.com/premierleague/badges/t${Number(team.code)}.png" alt="${escape(team.short_name)}">` : `<span class="club-placeholder">${escape(team?.short_name??'?')}</span>`;
  const panel = (heading,content,extra='',className='') => `<section class="dash-card ${className}"><header><h2>${heading}</h2>${extra}</header>${content}</section>`;
  const playerLine = (player,teams) => `<button class="dash-player-line player-open" data-open-player="${player.id}" title="Inspect ${escape(player.web_name)}">${portrait(player)}<span><strong>${escape(player.web_name)}</strong><small>${badge(teams.get(player.team))}${positions[player.element_type]} · ${money(player.now_cost)}</small></span></button>`;
  const metricButton = (name,label) => `<button class="${projectionMetric===name?'selected':''}" data-projection="${name}" aria-pressed="${projectionMetric===name}">${label}</button>`;
  const sortArrow = direction => `<span class="sort-indicator" aria-hidden="true">${direction===-1?'↓':'↑'}</span>`;
  const availabilityFlag = player => renderAvailabilityFlag(player,escape);
  /** Clearly labelled fictional selections keep the sandbox usable when official feeds are unavailable. */
  function demoPicks(state,reversed=false) {
    const pool=reversed?[...state.bootstrap.elements].reverse():state.bootstrap.elements;
    const counts={1:0,2:0,3:0,4:0},required={1:2,2:5,3:5,4:3},sample=[];
    for(const player of pool)if(counts[player.element_type]<required[player.element_type]){counts[player.element_type]++;sample.push(player);}
    const starters=[...sample.filter(player=>player.element_type===1).slice(0,1),...sample.filter(player=>player.element_type===2).slice(0,3),...sample.filter(player=>player.element_type===3).slice(0,4),...sample.filter(player=>player.element_type===4).slice(0,3)];
    return [...starters,...sample.filter(player=>!starters.includes(player))].map((player,index)=>({element:player.id,position:index+1,is_captain:index===8,is_vice_captain:index===10,multiplier:index<11?index===8?2:1:0}));
  }
  const demoLive = state => state.bootstrap.elements.map(player=>({id:player.id,stats:{total_points:(player.id*7)%14,minutes:player.id%11===0?0:90}}));
  function demoRival(state) {
    return {entry:{name:'Rival XI (illustrative)'},picks:{picks:demoPicks(state,true),entry_history:{points:null,event_transfers_cost:0,overall_rank:null},active_chip:null},history:{current:[]},illustrative:true};
  }
  function forecastForState(state) {
    const byId=new Map();
    for(const row of state.rows??[]) {
      const week=row.weekly?.[0];
      if(week)byId.set(row.id,{xPts:week.xPts,fixturesLabel:week.fixturesLabel,csProb:week.csProb,gw:week.gw});
    }
    return {byId,gw:state.weeks?.[0]?.id??null};
  }
  const availabilityDialog=document.createElement('dialog');
  availabilityDialog.id='availability-dialog';
  availabilityDialog.className='availability-dialog';
  availabilityDialog.setAttribute('aria-labelledby','availability-title');
  availabilityDialog.setAttribute('aria-describedby','availability-news');
  document.body.append(availabilityDialog);
  let availabilityPlayerId=null, availabilityTrigger=null;
  const formatNewsDate = date => date ? date.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'})+' ET' : 'Not provided by FPL';
  function renderAvailabilityDetails() {
    const state=getState();
    const player=state.bootstrap?.elements.find(player=>player.id===availabilityPlayerId);
    if(!player)return;
    const availability=playerAvailability(player);
    const team=state.bootstrap.teams.find(team=>team.id===player.team);
    const chance = value => value===null?'Not provided by FPL':`${value}% chance of playing`;
    const capturedAt=state.capturedAt?new Date(state.capturedAt):null;
    availabilityDialog.innerHTML=`<header class="availability-dialog-header"><div class="availability-player">${portrait(player,true)}<div><span class="availability-eyebrow">Player availability</span><h2 id="availability-title">${escape(player.web_name)}</h2><p>${escape(team?.name??'')} · ${positions[player.element_type]??'Player'}</p></div></div><button type="button" class="availability-close" aria-label="Close availability details" autofocus>×</button></header><div class="availability-dialog-body"><span class="availability-status ${availability.severity}">${availability.flagged?icon('warning'):'<span aria-hidden="true">✓</span>'}${escape(availability.label)}</span><dl class="availability-facts"><div><dt>Issue / reason</dt><dd>${escape(availability.reason)}</dd></div><div><dt>Return / suspension end</dt><dd>${escape(availability.returnText)}</dd></div><div><dt>This gameweek</dt><dd>${chance(availability.thisChance)}</dd></div><div><dt>Next gameweek</dt><dd>${chance(availability.nextChance)}</dd></div></dl><section class="availability-news"><h3>Latest FPL update</h3><p id="availability-news">${escape(availability.news)}</p><small>News updated ${escape(formatNewsDate(availability.updatedAt))}</small></section><p class="availability-source">${state.source==='sample'?'Illustrative test data':state.source==='official'?'Official FPL feed':'Imported FPL snapshot'}${capturedAt&&Number.isFinite(capturedAt.getTime())?' · Retrieved '+escape(formatNewsDate(capturedAt)):''}. Return dates are estimates when supplied; playing chances do not confirm a return date.</p></div>`;
  }
  function openAvailability(playerId,trigger) {
    if(!getState().bootstrap?.elements.some(player=>player.id===playerId))return;
    availabilityPlayerId=playerId;availabilityTrigger=trigger;
    renderAvailabilityDetails();
    if(!availabilityDialog.open)availabilityDialog.showModal();
  }
  document.addEventListener('vortex:availability',event=>{
    if(Number.isInteger(event.detail?.playerId))openAvailability(event.detail.playerId,event.detail.trigger);
  });
  availabilityDialog.addEventListener('click',event=>{
    if(event.target.closest('.availability-close')||event.target===availabilityDialog)availabilityDialog.close();
  });
  availabilityDialog.addEventListener('close',()=>{
    const trigger=availabilityTrigger?.isConnected?availabilityTrigger:root.querySelector(`[data-availability-player="${availabilityPlayerId}"]`);
    trigger?.focus();availabilityPlayerId=null;availabilityTrigger=null;
  });

  async function fetchJson(url) {
    const cached=requestCache.get(url);
    if(cached && Date.now()-cached.time<60_000)return cached.promise;
    const promise=fetch(url,{signal:AbortSignal.timeout(16000)}).then(async response=>{
      if(!response.ok)throw new Error(response.status===404?'That FPL Team ID was not found. Check the ID and try again.':'The official feed is unavailable. Please try again.');
      return response.json();
    }).catch(error=>{requestCache.delete(url);throw error;});
    requestCache.set(url,{time:Date.now(),promise});
    return promise;
  }
  async function loadReview() {
    const state=getState();
    if(state.source==='sample'){review=null;liveSnapshot=null;render();return;}
    const version=++requestVersion;
    loading=true;reviewError='';render();
    const liveRequest=fetchJson(`/api/live/${gameweek}`).then(live=>{
      if(!Array.isArray(live.elements))throw new Error('The gameweek response is incomplete.');
      if(version===requestVersion)liveSnapshot=live;
      return live;
    });
    try {
      if(manager){
        const [entry,picks,live,history]=await Promise.all([fetchJson(`/api/entry/${manager}`),fetchJson(`/api/picks/${manager}/${gameweek}`),liveRequest,fetchJson(`/api/history/${manager}`)]);
        if(version!==requestVersion)return;
        if(!Array.isArray(picks.picks))throw new Error('No team selection is available for this gameweek.');
        review={entry,picks,live,history};
        try{localStorage.setItem('vortex-linked-manager',manager);}catch{}
      } else {await liveRequest;review=null;}
    } catch(error) {
      if(version===requestVersion){review=null;reviewError=error.message;}
    } finally {if(version===requestVersion){loading=false;render();}}
  }
  async function loadRival() {
    const state=getState();
    if(state.source==='sample'||!rivalManager){rival=null;rivalError='';render();return;}
    const version=++rivalVersion;
    rival=null;rivalLoading=true;rivalError='';render();
    try {
      const [entry,picks,history]=await Promise.all([fetchJson(`/api/entry/${rivalManager}`),fetchJson(`/api/picks/${rivalManager}/${gameweek}`),fetchJson(`/api/history/${rivalManager}`)]);
      if(version!==rivalVersion)return;
      if(!Array.isArray(picks.picks))throw new Error('No team selection is available for this rival in this gameweek.');
      rival={entry,picks,history,illustrative:false};
      try{localStorage.setItem('vortex-rival-manager',rivalManager);}catch{}
    } catch(error) {
      if(version===rivalVersion){rival=null;rivalError=error.message;}
    } finally {if(version===rivalVersion){rivalLoading=false;render();}}
  }
  function projections(state) {
    const teams=teamMap(state);
    const strengths=buildStrengths(state.bootstrap.teams,state.bootstrap.elements,state.fixtures);
    return state.fixtures.filter(fixture=>fixture.event===gameweek).flatMap(fixture=>{
      const home=teams.get(fixture.team_h),away=teams.get(fixture.team_a);
      if(!home||!away)return[];
      const projected=projectMatch(strengths.get(home.id),strengths.get(away.id));
      return [{fixture,team:home,opponent:away,venue:'H',goals:projected.homeXg,cs:projected.homeCs,win:projected.homeWin},{fixture,team:away,opponent:home,venue:'A',goals:projected.awayXg,cs:projected.awayCs,win:projected.awayWin}];
    });
  }
  function renderReview(state,teams) {
    const players=new Map(state.bootstrap.elements.map(player=>[player.id,player]));
    const live=new Map((liveSnapshot?.elements??[]).map(element=>[element.id,element.stats]));
    let picks=review?.picks.picks??[];
    if(state.source==='sample')picks=demoPicks(state);
    const current=review?.history.current?.find(event=>event.event===gameweek);
    const previous=review?.history.current?.find(event=>event.event===gameweek-1);
    const rank=current?.overall_rank??review?.picks.entry_history?.overall_rank;
    const change=rank&&previous?.overall_rank?previous.overall_rank-rank:null;
    const starters=picks.filter(pick=>pick.position<=11),bench=picks.filter(pick=>pick.position>11);
    const event=state.bootstrap.events.find(item=>item.id===gameweek);
    const points=review?gameweekPoints({picks,live:liveSnapshot?.elements,players:state.bootstrap.elements,fixtures:state.fixtures,gameweek,event,officialPoints:review.picks.entry_history?.points,transferCost:review.picks.entry_history?.event_transfers_cost}):null;
    const stats=[['GW Points',points,false],['Avg Points',event?.average_entry_score,false],['Overall Rank',rank,true],['OR Change',change,true],['GW Rank',current?.rank??review?.picks.entry_history?.rank,true]];
    const fixtureInfo=player=>{
      const matches=state.fixtures.filter(fixture=>fixture.event===gameweek&&[fixture.team_h,fixture.team_a].includes(player.team));
      const label=matches.map(fixture=>`${teams.get(fixture.team_h===player.team?fixture.team_a:fixture.team_h)?.short_name??'?'} (${fixture.team_h===player.team?'H':'A'})`).join(', ')||'BLANK';
      const difficulty=Math.max(0,...matches.map(fixture=>fixture.team_h===player.team?fixture.team_h_difficulty:fixture.team_a_difficulty));
      return {matches,label,difficulty};
    };
    const card=pick=>{
      const player=players.get(pick.element);if(!player)return'';
      const {matches,label,difficulty}=fixtureInfo(player),playing=live.get(player.id);
      const displayed=playing&&(playing.minutes>0||matches.length&&matches.every(fixture=>fixture.finished))?number(playing.total_points*(pick.position<=11?Math.max(pick.multiplier,1):1)):label;
      return `<div class="review-player" title="${escape(player.web_name+' · '+label)}">${pick.is_captain?'<b class="captain-badge">C</b>':pick.is_vice_captain?'<b class="captain-badge">V</b>':''}${pick.position>11?`<small class="bench-order">${pick.position===12?'GK':'B'+(pick.position-12)}</small>`:''}${availabilityFlag(player)}${portrait(player,true)}<strong>${escape(player.web_name)}</strong><span class="player-result" data-difficulty="${difficulty}" title="${escape(label)}${difficulty?' · FPL difficulty '+difficulty+'/5':''}">${escape(displayed)}</span></div>`;
    };
    const pitch=`<div class="review-pitch"><div class="pitch-sponsor"><span>FPL VORTEX</span><small>GAMEWEEK ${gameweek}</small></div><div class="pitch-lines"><i></i></div>${[1,2,3,4].map(position=>`<div class="review-row">${starters.filter(pick=>players.get(pick.element)?.element_type===position).map(card).join('')}</div>`).join('')}<div class="review-bench">${bench.map(card).join('')}</div></div>`;
    const table=`<div class="review-table-wrap"><table class="review-table"><thead><tr><th>Player</th><th>Fixture</th><th>Points</th></tr></thead><tbody>${picks.map(pick=>{const player=players.get(pick.element);if(!player)return'';const {label,difficulty}=fixtureInfo(player);return `<tr class="${pick.position>11?'bench-row':''}"><td><div class="review-table-player">${playerLine(player,teams)}${availabilityFlag(player)}</div>${pick.is_captain?'<span class="dash-muted">Captain</span>':pick.is_vice_captain?'<span class="dash-muted">Vice-captain</span>':''}</td><td class="player-result" data-difficulty="${difficulty}">${escape(label)}</td><td>${state.source==='sample'?'—':number(live.get(player.id)?.total_points)}</td></tr>`;}).join('')}</tbody></table></div>`;
    const status=state.source==='sample'?'Illustrative lineup · not your actual squad':loading?'Updating official selections…':review?'Official selections · in-play scores are provisional':reviewError?'Review data unavailable':manager?'Loading official selections':'Enter your FPL Team ID above to load your squad';
    const content=picks.length?(reviewView==='pitch'?pitch:table):`<div class="review-loading">${escape(loading?'Loading your current-gameweek review…':reviewError||'Your gameweek starts here. Enter your FPL Team ID above to see your squad, captain and live points.')}</div>`;
    const tools=`<div class="review-actions"><button class="dash-link" data-action="change-team">${manager?'Change team':'Link team'}</button><div class="view-switch" role="group" aria-label="Squad review display"><button data-review-view="pitch" class="${reviewView==='pitch'?'selected':''}" aria-label="Pitch view" aria-pressed="${reviewView==='pitch'}">${icon('pitch')}</button><button data-review-view="table" class="${reviewView==='table'?'selected':''}" aria-label="Table view" aria-pressed="${reviewView==='table'}">${icon('table')}</button></div></div>`;
    return panel(escape(review?.entry.name??'FPL VORTEX'),`<div class="review-stats">${stats.map(([label,value,short])=>`<div><strong class="${label==='OR Change'?polarity(value):''}" title="${number(value)}">${label==='OR Change'?signed(value):short?compact(value):number(value)}</strong><small>${label}</small></div>`).join('')}</div><p class="review-status"><span class="status-dot"></span>${status}</p>${content}`,tools,'review-card');
  }
  function renderFixtures(state,rows,teams) {
    const fixtures=state.fixtures.filter(fixture=>fixture.event===gameweek).sort((first,second)=>(first.kickoff_time??'9').localeCompare(second.kickoff_time??'9'));
    let previousDay='';
    const content=fixtures.map(fixture=>{
      const home=teams.get(fixture.team_h),away=teams.get(fixture.team_a);
      const day=fixture.kickoff_time?new Date(fixture.kickoff_time).toLocaleDateString([],{weekday:'short',day:'numeric',month:'long'}):'Date to be confirmed';
      const group=day!==previousDay?`<div class="fixture-date">${escape(day)}</div>`:'';previousDay=day;
      const homeForecast=rows.find(row=>row.fixture.id===fixture.id&&row.venue==='H'),awayForecast=rows.find(row=>row.fixture.id===fixture.id&&row.venue==='A');
      const score=fixture.started?`${fixture.team_h_score??'—'} – ${fixture.team_a_score??'—'}`:fixture.kickoff_time?new Date(fixture.kickoff_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false}):'TBC';
      return `${group}<div class="fixture-match"><div class="fixture-summary"><span>${escape(home?.short_name??'?')}${badge(home)}</span><b class="${fixture.started&&!fixture.finished&&!fixture.finished_provisional?'is-live':''}">${score}</b><span>${badge(away)}${escape(away?.short_name??'?')}</span></div><div class="fixture-state">${fixture.finished||fixture.finished_provisional?'Full time':fixture.started?'Live'+(Number.isFinite(fixture.minutes)&&fixture.minutes>0?' · '+fixture.minutes+'′':''):'Kickoff'}</div><div class="fixture-bar"><span style="flex:${homeForecast?.goals??1}"></span><span style="flex:${awayForecast?.goals??1}"></span></div><div class="fixture-xg"><b>${decimal(homeForecast?.goals)}</b><span>Projected xG</span><b>${decimal(awayForecast?.goals)}</b></div><details class="fixture-model-detail"><summary>Match probabilities</summary><p>Home win ${decimal((homeForecast?.win??0)*100,1)}% · Away win ${decimal((awayForecast?.win??0)*100,1)}%. Current-snapshot model estimates. These are projected goals, not live match xG or archived pre-match forecasts.</p></details></div>`;
    }).join('');
    const completed=fixtures.filter(fixture=>fixture.finished||fixture.finished_provisional).length;
    const inPlay=fixtures.filter(fixture=>fixture.started&&!fixture.finished&&!fixture.finished_provisional).length;
    return panel(`GW ${gameweek} Fixtures`,`<div class="fixture-played">${completed} of ${fixtures.length} played${inPlay?' · '+inPlay+' live':''}</div><div class="dash-scroll">${content||'<p class="dash-empty">No fixtures assigned.</p>'}</div>`,'','fixtures-card');
  }
  function renderProjections(rows) {
    const titles={goals:'Projected Goals',cs:'Clean Sheets',win:'Win Probability'};
    const sorted=[...rows].sort((first,second)=>projectionDirection*(first[projectionMetric]-second[projectionMetric]));
    const maximum=Math.max(...rows.map(row=>row[projectionMetric]),0.001);
    const content=sorted.map((row,index)=>`<div class="projection-row"><span class="row-rank">${index+1}.</span>${badge(row.team)}<b>${escape(row.team.short_name)}</b><small>${escape(row.opponent.short_name)} (${row.venue})</small><div class="dash-bar-track" aria-hidden="true"><i style="width:${Math.max(0,row[projectionMetric])/maximum*100}%"></i></div><strong title="${escape(row.team.name)}">${projectionMetric==='goals'?decimal(row.goals):decimal(row[projectionMetric]*100,1)+'%'}</strong></div>`).join('');
    return panel(`<button data-action="sort-projections" title="Reverse projection ranking">GW ${gameweek} ${titles[projectionMetric]} ${sortArrow(projectionDirection)}</button>`,`<div class="dash-scroll">${content||'<p class="dash-empty">No projections available.</p>'}</div><div class="projection-caption">Current model estimates · not frozen pre-match forecasts</div>`,`<div class="dash-segment" role="group" aria-label="Projection metric">${metricButton('goals','Goals')}${metricButton('cs','CS%')}${metricButton('win','Win%')}</div>`,'projections-card');
  }
  function renderLower(state,teams) {
    const live=new Map((liveSnapshot?.elements??[]).map(element=>[element.id,element.stats]));
    const points=player=>live.get(player.id)?.total_points??(gameweek===currentGw(state)?player.event_points:0)??0;
    const top=[...state.bootstrap.elements].sort((first,second)=>topDirection*(points(first)-points(second))||first.id-second.id).slice(0,10);
    const maximum=Math.max(...top.map(points),1);
    const topPanel=panel(`${icon('trophy')}<button data-action="sort-top">Top Players ${sortArrow(topDirection)}</button>`,`<div class="dash-scroll">${top.map((player,index)=>`<div class="top-row"><span class="row-rank">${index+1}.</span>${playerLine(player,teams)}<div class="dash-bar-track" aria-hidden="true"><i style="width:${Math.max(0,points(player))/maximum*100}%"></i></div><b>${state.source==='sample'?'—':points(player)}</b></div>`).join('')}</div><div class="panel-bottom"><button class="dash-link" data-action="all-players">All player stats ${icon('arrow')}</button><span>${state.bootstrap.elements.length} players</span></div>`,`<span class="dash-muted">GW ${gameweek} points</span>`,'lower-card');
    const transferValue=player=>transferSort==='name'?player.web_name:transferSort==='change'?(Number.isFinite(player.cost_change_event)?player.cost_change_event:null):transferSort==='in'?player.transfers_in_event??0:transferSort==='out'?player.transfers_out_event??0:(player.transfers_in_event??0)-(player.transfers_out_event??0);
    const transfers=[...state.bootstrap.elements].sort((first,second)=>{
      const left=transferValue(first),right=transferValue(second);
      if(left===null||right===null)return left===right?first.id-second.id:left===null?1:-1;
      return transferDirection*(typeof left==='string'?left.localeCompare(right):left-right)||first.id-second.id;
    });
    const transferPages=Math.max(1,Math.ceil(transfers.length/10));transferPage=Math.max(0,Math.min(transferPage,transferPages-1));
    const headers=[['name','Player'],['change','Price Δ'],['in','In'],['out','Out'],['net','Net']];
    const transferRows=transfers.slice(transferPage*10,transferPage*10+10).map(player=>{
      const net=(player.transfers_in_event??0)-(player.transfers_out_event??0);
      return `<tr><td>${playerLine(player,teams)}</td><td class="${heat(player.cost_change_event)}" title="Actual FPL price change this gameweek, in £m">${Number.isFinite(player.cost_change_event)?(player.cost_change_event>0?'+':'')+'£'+decimal(player.cost_change_event/10,1)+'m':'—'}</td><td title="${number(player.transfers_in_event)}">${compact(player.transfers_in_event)}</td><td title="${number(player.transfers_out_event)}">${compact(player.transfers_out_event)}</td><td class="${heat(net)}" title="${net>0?'+':''}${number(net)}">${signed(net)}</td></tr>`;
    }).join('');
    const transferPanel=panel(`${icon('transfer')}Price & Transfers`,`<div class="dash-scroll"><table class="dash-transfer-table"><thead><tr>${headers.map(([key,label])=>`<th class="${transferSort===key?'active-sort':''}" aria-sort="${transferSort===key?(transferDirection===-1?'descending':'ascending'):'none'}"><button data-transfer-sort="${key}">${label}${transferSort===key?sortArrow(transferDirection):''}</button></th>`).join('')}</tr></thead><tbody>${transferRows}</tbody></table></div><p class="dash-footnote">Price Δ: actual GW change (£m). In / Out / Net: this GW’s transfer counts.</p><div class="panel-bottom"><span>${transfers.length} players · ${transferPage+1} / ${transferPages}</span><div class="pager-buttons"><button data-transfer-page="-1" aria-label="Previous transfers page" ${transferPage===0?'disabled':''}>‹</button><button data-transfer-page="1" aria-label="Next transfers page" ${transferPage===transferPages-1?'disabled':''}>›</button></div></div>`,'','lower-card');
    const priority=player=>['d','i','s'].includes(player.status)?0:1;
    const injuries=state.bootstrap.elements.filter(player=>player.status!=='a').sort((first,second)=>priority(first)-priority(second)||(second.chance_of_playing_next_round??-1)-(first.chance_of_playing_next_round??-1)||first.id-second.id);
    const injuryPages=Math.max(1,Math.ceil(injuries.length/10));injuryPage=Math.max(0,Math.min(injuryPage,injuryPages-1));
    const injuryRows=injuries.slice(injuryPage*10,injuryPage*10+10).map(player=>{
      const availability=playerAvailability(player);
      return `<div class="injury-row" title="${escape(availability.news)}">${portrait(player)}<div><button class="player-open" data-open-player="${player.id}"><strong>${escape(player.web_name)}</strong></button><small>${escape(availability.reason)} · ${availability.nextChance===null?'Playing chance unknown':availability.nextChance+'% chance'}</small></div>${availabilityFlag(player)}</div>`;
    }).join('');
    const injuryPanel=panel(`${icon('medical')}Injuries & Suspensions`,`<div class="dash-scroll">${injuryRows||'<p class="dash-empty">No flagged players in this snapshot.</p>'}</div><div class="dash-pager"><button data-injury-page="-1" ${injuryPage===0?'disabled':''}>‹ Prev</button><span>${injuryPage+1} / ${injuryPages}</span><button data-injury-page="1" ${injuryPage===injuryPages-1?'disabled':''}>Next ›</button></div>`,`<span class="dash-muted">${injuries.length} players</span>`,'lower-card');
    return topPanel+transferPanel+injuryPanel;
  }
  function renderAnalysis(state,teams) {
    const sample=state.source==='sample';
    const picks=sample?demoPicks(state):review?.picks.picks??[];
    const live=sample?demoLive(state):liveSnapshot?.elements??[];
    const event=state.bootstrap.events.find(item=>item.id===gameweek);
    const forecasts=forecastForState(state);
    const sourceNote=sample?'Illustrative sandbox · fictional squads, scores and rivals. No official request was made.':state.source==='official'?'Official FPL selections and live scores. Next-GW xPts are current-snapshot estimates, not frozen pre-deadline forecasts.':'Imported FPL snapshot. Live scores may not match the imported player data.';
    const intro=`<p class="analysis-source"><span class="status-dot"></span>${escape(sourceNote)}</p>`;
    if(!picks.length)return intro+panel(`GW ${gameweek} Analysis`,`<div class="analysis-empty"><h3>Link your team to unlock the analysis.</h3><p>Enter your public FPL Team ID above. Your 15 picks, captain, live scoring, published rank and a rival comparison appear here. Nothing is written to your FPL account.</p></div>`);
    const summary=analyzeGameweek({picks,live,players:state.bootstrap.elements,teams:state.bootstrap.teams,fixtures:state.fixtures,gameweek,forecasts:forecasts.byId,forecastGameweek:forecasts.gw,history:review?.history?.current??[],event,officialPoints:review?.picks.entry_history?.points,transferCost:review?.picks.entry_history?.event_transfers_cost,rank:review?.picks.entry_history?.overall_rank});
    const metric=(label,value,caption,tone='')=>`<div><strong class="${tone}">${value}</strong><small>${label}</small><span>${caption}</span></div>`;
    const metrics=`<div class="analysis-metrics">${metric('GW points',number(summary.total),summary.vsAverage===null?'GW average unavailable':`${signed(summary.vsAverage)} vs GW average`,polarity(summary.vsAverage))}${metric('Captain',number(summary.captain?.points),summary.captain?`${escape(summary.captain.name)} · +${number(summary.captainExtra)} armband`:'No captain in this selection')}${metric('XI shape',escape(summary.formation),`${summary.used}/11 starters have played`)}${metric('Bench left',number(summary.benchUnused),summary.benchBoost?'Bench Boost is active':`${summary.benchCount} bench players`)}${metric('Transfer hit',summary.hit?`−${number(summary.hit)}`:'0','Points deducted by FPL')}${metric('Rank change',summary.rankChange===null?'—':signed(summary.rankChange),summary.rank?`Overall rank ${compact(summary.rank)}`:'No published rank',polarity(summary.rankChange))}</div>`;
    const positionColors={1:'var(--analysis-gk)',2:'var(--analysis-def)',3:'var(--analysis-mid)',4:'var(--analysis-fwd)'};
    const stack=summary.positionsComplete&&summary.positionTotal>0?summary.positions.map(group=>`<span style="width:${Math.max(0,group.points)/summary.positionTotal*100}%;background:${positionColors[group.position]}" title="${group.label}: ${number(group.points)} XI points"></span>`).join(''):'';
    const positions=`<div class="analysis-positions"><div class="analysis-stack" role="img" aria-label="${summary.positionsComplete?`Starter points by position: ${summary.positions.map(group=>`${group.label} ${number(group.points)}`).join(', ')}`:'Live scoring is incomplete'}">${stack}</div><ul class="analysis-legend">${summary.positions.map(group=>`<li><i style="background:${positionColors[group.position]}"></i>${group.label} ${number(group.points)}<small>${group.count} players</small></li>`).join('')}</ul><p class="analysis-caption">${summary.positionsComplete?'Captain and chip multipliers stay with the player’s position. Bench points are excluded.':'Some live scores are missing, so the stacked bar is hidden rather than showing a false zero.'}</p></div>`;
    const summaryCard=panel(`${icon('pitch')}GW ${gameweek} score breakdown`,metrics+positions,`<span class="dash-muted">${summary.blanks?`${summary.blanks} confirmed blank${summary.blanks===1?'':'s'}`:'Official picks'}</span>`,'analysis-summary-card');
    const formMaximum=Math.max(1,...summary.form.map(item=>item.points??0));
    const formBars=summary.form.length?summary.form.map(item=>`<div class="analysis-form-col" title="GW${item.event}: ${number(item.points)} points${item.rank?' · rank '+number(item.rank):''}"><strong>${number(item.points)}</strong><span class="analysis-form-bar" style="height:${Math.max(4,(item.points??0)/formMaximum*100)}%"></span><small>GW${item.event}</small></div>`).join(''):'<p class="dash-empty">No published gameweek history for this manager.</p>';
    const formCard=panel(`Recent form`,`<div class="analysis-form">${formBars}</div><p class="analysis-caption">Official published history. The live gameweek appears here only after FPL publishes it. Rank: ${summary.rank?compact(summary.rank):'—'}${summary.rankChange===null?'':` · ${signed(summary.rankChange)} places this week`}.</p>`,`<span class="dash-muted">Last ${summary.form.length} GWs</span>`,'analysis-form-card');
    const scoped=summary.rows.filter(row=>analysisScope==='all'||(analysisScope==='xi'?row.starter:!row.starter));
    const sorted=sortAnalysisRows(scoped,analysisSort,analysisDirection);
    const header=(key,label)=>`<th class="${analysisSort===key?'active-sort':''}" aria-sort="${analysisSort===key?(analysisDirection===-1?'descending':'ascending'):'none'}"><button data-analysis-sort="${key}">${label}${analysisSort===key?sortArrow(analysisDirection):''}</button></th>`;
    const role=row=>row.captain?'C':row.vice?'V':row.starter?'XI':row.slot===12?'GK':'B'+(row.slot-12);
    const rows=sorted.map(row=>`<tr><td><div class="analysis-name-cell">${availabilityFlag(row.player)}${playerLine(row.player,teams)}</div></td><td><span class="analysis-role ${row.captain?'captain':row.starter?'':'bench'}">${role(row)}</span> <small>${row.positionName}</small></td><td>${number(row.minutes)}</td><td>${number(row.points)}</td><td>${number(row.contribution)}</td><td>${Number.isFinite(row.forecast?.xPts)?decimal(row.forecast.xPts):'—'}</td><td class="player-result" data-difficulty="${row.fixture.difficulty??''}">${escape(row.fixture.label)}</td></tr>`).join('');
    const scopeButtons=[['all','All 15'],['xi','Starting XI'],['bench','Bench']].map(([key,label])=>`<button data-analysis-scope="${key}" aria-pressed="${analysisScope===key}" class="${analysisScope===key?'selected':''}">${label}</button>`).join('');
    const tableCard=panel(`${icon('table')}Squad contributions`,`<div class="analysis-controls" role="group" aria-label="Squad scope">${scopeButtons}</div><div class="dash-scroll analysis-scroll"><table class="analysis-table"><thead><tr><th>${header('name','Player')}</th><th>Role</th>${header('minutes','Min')}${header('points','Live pts')}${header('contribution','XI pts')}${header('forecast','Next xPts')}<th>GW ${gameweek} fixture</th></tr></thead><tbody>${rows||'<tr><td colspan="7"><p class="dash-empty">No players in this scope.</p></td></tr>'}</tbody></table></div><p class="analysis-caption">Live pts are the player’s official score. XI pts apply the pick multiplier (captain ×2, Triple Captain ×3, bench 0). Next xPts is a different gameweek's model estimate — not a prediction error.</p>`,`<span class="dash-muted">${sorted.length} players</span>`,'analysis-wide analysis-table-card');
    const nextGw=forecasts.gw;
    const playersById=new Map(state.bootstrap.elements.map(player=>[player.id,player]));
    const nextCounts=picks.map(pick=>{const team=playersById.get(pick.element)?.team;return team===undefined?0:state.fixtures.filter(fixture=>fixture.event===nextGw&&(fixture.team_h===team||fixture.team_a===team)).length;});
    const blanks=nextCounts.filter(count=>count===0).length,doubles=nextCounts.filter(count=>count>1).length;
    const radar=summary.captainRadar.map((row,index)=>`<div class="analysis-radar-row"><span class="row-rank">${index+1}.</span>${playerLine(row.player,teams)}<strong>${decimal(row.forecast.xPts)}</strong><small>${escape(row.forecast.fixturesLabel??row.fixture.label)}</small></div>`).join('')||'<p class="dash-empty">No upcoming forecast is available.</p>';
    const riskRows=summary.risks.map(row=>`<div class="analysis-risk-row"><span class="analysis-risk-dot ${row.availability.severity}"></span><button class="player-open" data-open-player="${row.id}">${escape(row.name)}</button><small>${escape(row.availability.label)} · ${row.availability.nextChance===null?'chance unknown':row.availability.nextChance+'% chance'}</small></div>`).join('')||'<p class="dash-empty">No availability flags in this squad.</p>';
    const focusCard=panel(`GW ${nextGw??'—'} focus`,`<div class="analysis-section-label">CAPTAIN RADAR · MODEL xPts</div>${radar}<div class="analysis-section-label">AVAILABILITY WATCH</div>${riskRows}<p class="analysis-caption">${blanks} blank${blanks===1?'':'s'} · ${doubles} double${doubles===1?'':'s'} in GW ${nextGw??'—'}. Forecasts use current data; they are unvalidated and are not frozen pre-deadline predictions.</p>`,'','analysis-focus-card');
    const rivalData=sample?demoRival(state):rival;
    const rivalValue=sample?'':rivalManager;
    const rivalStatus=sample?'Illustrative rival · fictional squad':rivalError||(rivalLoading?'Loading rival selections…':rival?'Rival saved in this browser':'Enter a rival’s public FPL Team ID. Only public picks and scores are read.');
    const rivalForm=sample?'<p class="analysis-demo-note">Illustrative rival · fictional squad. Refresh with official data to compare a real FPL Team ID.</p>':`<form class="rival-form" novalidate><label for="rival-team-id">Rival FPL Team ID</label><input id="rival-team-id" name="rival" inputmode="numeric" autocomplete="off" pattern="[1-9][0-9]{0,9}" placeholder="Enter rival team ID" value="${escape(rivalValue)}" aria-describedby="rival-status"><button class="primary" type="submit" ${rivalLoading?'disabled':''}>${rivalLoading?'Loading…':'Compare'}</button>${rivalManager?'<button class="quiet" type="button" data-rival-clear>Clear</button>':''}<span id="rival-status" role="status" class="${rivalError?'team-link-error':''}">${escape(rivalStatus)}</span></form>`;
    let rivalBody='';
    if(rivalData) {
      const comparison=compareTeams({homePicks:picks,awayPicks:rivalData.picks.picks,live,players:state.bootstrap.elements,teams:state.bootstrap.teams,fixtures:state.fixtures,gameweek,event,homeOfficialPoints:review?.picks.entry_history?.points,awayOfficialPoints:rivalData.picks.entry_history?.points,homeTransferCost:review?.picks.entry_history?.event_transfers_cost,awayTransferCost:rivalData.picks.entry_history?.event_transfers_cost,homeRank:summary.rank,awayRank:rivalData.history?.current?.find(item=>item.event===gameweek)?.overall_rank??rivalData.picks.entry_history?.overall_rank,homeChip:review?.picks.active_chip,awayChip:rivalData.picks.active_chip});
      const homeName=review?.entry.name??(sample?'Your XI (illustrative)':'Your team');
      const awayName=rivalData.entry?.name??`Team ${rivalManager}`;
      const captainCell=captain=>captain?`<strong>${escape(captain.name)}</strong><span>${number(captain.points)} pts ×${captain.multiplier}</span>`:'<strong>—</strong><span>No captain published</span>';
      const diffList=rows=>`<div class="analysis-diff-list">${[...rows].sort((first,second)=>(second.contribution??-1)-(first.contribution??-1)).slice(0,5).map(row=>`<div class="analysis-diff-row"><span>${escape(row.name)}</span><small>${row.positionName} · ${escape(row.club)}</small><b>${number(row.contribution)}</b></div>`).join('')||'<p class="dash-empty">No differentials.</p>'}</div>`;
      const sharedNames=comparison.shared.map(row=>row.name);
      rivalBody=`<div class="analysis-scoreboard"><div><small>${escape(homeName)}</small><strong>${number(comparison.homeScore)}</strong><span>GW ${gameweek} points</span></div><b class="${polarity(comparison.margin)}">${comparison.margin===null?'—':(comparison.margin>0?'+':'')+number(comparison.margin)}</b><div><small>${escape(awayName)}</small><strong>${number(comparison.awayScore)}</strong><span>GW ${gameweek} points</span></div></div><div class="analysis-duel"><div><small>Your captain</small>${captainCell(comparison.homeCaptain)}</div><div><small>Rival captain</small>${captainCell(comparison.awayCaptain)}</div></div><p class="analysis-shared"><strong>${comparison.shared.length} shared players</strong>${sharedNames.length?' · '+escape(sharedNames.slice(0,6).join(', '))+(sharedNames.length>6?'…':''):''}. ${comparison.captainsSame?'Both captains are the same player.':'Different captains.'} ${comparison.differentialPoints===null?'Differential impact awaits complete live scores.':`Differential picks: ${signed(comparison.differentialPoints)} pts for you.`}</p>${comparison.homeChip||comparison.awayChip?`<p class="analysis-shared">Chips: ${escape(comparison.homeChip??'none')} vs ${escape(comparison.awayChip??'none')}.</p>`:''}<div class="analysis-diff-columns"><div><h3>Your differentials <span>${comparison.homeOnly.length}</span></h3>${diffList(comparison.homeOnly)}</div><div><h3>Rival differentials <span>${comparison.awayOnly.length}</span></h3>${diffList(comparison.awayOnly)}</div></div><p class="analysis-caption">${sample?'Illustrative squads and scores.':'Public picks from the official FPL API.'} Live scores are provisional; FPL’s checked gameweek total is authoritative. ${comparison.rankGap===null?'No comparable published overall ranks.':comparison.rankGap>0?`You lead by ${number(comparison.rankGap)} rank places.`:comparison.rankGap<0?`Rival leads by ${number(-comparison.rankGap)} rank places.`:'Published ranks are level.'}</p>`;
    } else {
      rivalBody=`<div class="analysis-empty compact"><h3>Compete head-to-head.</h3><p>Compare your GW ${gameweek} score, captain, rank and differential picks with any public FPL team. Link your team above, then enter a rival ID.</p></div>`;
    }
    const rivalCard=panel(`${icon('trophy')}Head-to-head`,rivalForm+rivalBody,'','analysis-rival-card');
    return intro+`<div class="analysis-grid">${summaryCard}${formCard}${tableCard}${focusCard}${rivalCard}</div>`;
  }
  function render() {
    const state=getState();if(!state.bootstrap)return;
    const teams=teamMap(state);if(gameweek===null)gameweek=currentGw(state);
    const selector=`<form class="team-link-form" novalidate><label for="fpl-team-id">FPL Team ID</label><input id="fpl-team-id" name="manager" inputmode="numeric" autocomplete="off" pattern="[1-9][0-9]{0,9}" placeholder="Enter your team ID" value="${escape(manager)}" aria-describedby="team-link-status"><button class="primary" ${loading?'disabled':''}>${loading?'Loading…':'Load team'}</button><span id="team-link-status" role="status" class="${managerError||reviewError?'team-link-error':''}">${escape(managerError||reviewError||(manager?(loading?'Updating your team…':'Team saved in this browser'):'Your ID is the number in your FPL team URL.'))}</span></form><div class="dashboard-toolbar"><div class="dashboard-subtabs"><button class="${!analysis?'active':''}" data-subtab="overview" aria-pressed="${!analysis}">Overview</button><button class="${analysis?'active':''}" data-subtab="analysis" aria-pressed="${analysis}">Gameweek Analysis</button></div><label>Gameweek <select id="review-gameweek" aria-label="Review gameweek">${state.bootstrap.events.map(event=>`<option value="${event.id}" ${event.id===gameweek?'selected':''}>${event.id}</option>`).join('')}</select></label></div>`;
    if(analysis){root.innerHTML=selector+renderAnalysis(state,teams);return;}
    const projected=projections(state);
    const date=value=>value?new Date(value).toLocaleDateString([],{month:'short',day:'numeric'}):'';
    const videoPanel=panel(`${icon('play')}Latest FPL Videos`,`<div class="dashboard-videos">${videos.map(video=>`<a href="${escape(video.url)}" target="_blank" rel="noopener noreferrer"><span class="video-thumbnail"><img src="https://i.ytimg.com/vi/${escape(video.id)}/hqdefault.jpg" data-video-id="${escape(video.id)}" alt="${escape(video.title)}" loading="lazy">${icon('play')}</span><span class="video-copy"><strong>${escape(video.title)}</strong><small>FPL VORTEX · ${date(video.published)}</small></span></a>`).join('')||'<p class="dash-empty">Loading your channel videos…</p>'}</div>`,`<a class="dash-link" href="https://www.youtube.com/@Fplvortex/videos" target="_blank" rel="noopener noreferrer">All videos ${icon('arrow')}</a>`,'videos-card');
    root.innerHTML=selector+`<div class="dashboard-upper">${renderReview(state,teams)}${renderFixtures(state,projected,teams)}${renderProjections(projected)}</div><div class="dashboard-lower">${renderLower(state,teams)}</div>${videoPanel}<div class="video-channel-links"><a href="https://www.youtube.com/@Fplvortex/videos" target="_blank" rel="noopener noreferrer">All uploads</a><a href="https://www.youtube.com/@Fplvortex/shorts" target="_blank" rel="noopener noreferrer">All Shorts</a><a href="https://www.youtube.com/@Fplvortex/streams" target="_blank" rel="noopener noreferrer">Live streams</a></div>`;
  }
  root.addEventListener('click',event=>{
    const availability=event.target.closest('[data-availability-player]');
    if(availability){openAvailability(Number(availability.dataset.availabilityPlayer),availability);return;}
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='sort-projections'){projectionDirection*=-1;render();}
    if(action==='sort-top'){topDirection*=-1;render();}
    if(action==='all-players')document.querySelector('[data-tab="forecasts"]').click();
    if(action==='change-team')root.querySelector('#fpl-team-id').focus();
    const player=event.target.closest('[data-open-player]');
    if(player)document.dispatchEvent(new CustomEvent('vortex:select-player',{detail:{id:Number(player.dataset.openPlayer)}}));
    const display=event.target.closest('[data-review-view]');
    if(display){reviewView=display.dataset.reviewView;try{localStorage.setItem('vortex-review-view',reviewView);}catch{}render();}
    const projection=event.target.closest('[data-projection]');
    if(projection){projectionMetric=projection.dataset.projection;projectionDirection=-1;render();}
    const transfer=event.target.closest('[data-transfer-sort]');
    if(transfer){transferDirection=transferSort===transfer.dataset.transferSort?-transferDirection:-1;transferSort=transfer.dataset.transferSort;transferPage=0;render();}
    const transferPaging=event.target.closest('[data-transfer-page]');if(transferPaging){transferPage+=Number(transferPaging.dataset.transferPage);render();}
    const injuryPaging=event.target.closest('[data-injury-page]');if(injuryPaging){injuryPage+=Number(injuryPaging.dataset.injuryPage);render();}
    const analysisSortButton=event.target.closest('[data-analysis-sort]');
    if(analysisSortButton){analysisDirection=analysisSort===analysisSortButton.dataset.analysisSort?-analysisDirection:-1;analysisSort=analysisSortButton.dataset.analysisSort;render();}
    const analysisScopeButton=event.target.closest('[data-analysis-scope]');
    if(analysisScopeButton){analysisScope=analysisScopeButton.dataset.analysisScope;render();}
    if(event.target.closest('[data-rival-clear]')){rivalVersion++;rivalManager='';rival=null;rivalError='';rivalLoading=false;try{localStorage.removeItem('vortex-rival-manager');}catch{}render();}
    const tab=event.target.closest('[data-subtab]');if(tab){analysis=tab.dataset.subtab==='analysis';render();}
  });
  root.addEventListener('submit',event=>{
    if(event.target.matches('.rival-form')){
      event.preventDefault();
      const value=String(new FormData(event.target).get('rival')??'').trim();
      if(!/^[1-9]\d{0,9}$/.test(value)){rivalError=value?'Use a numeric FPL Team ID, starting from 1.':'Enter a rival FPL Team ID to compare.';rival=null;render();return;}
      rivalManager=value;rival=null;rivalError='';loadRival();return;
    }
    if(!event.target.matches('.team-link-form'))return;
    event.preventDefault();
    const value=String(new FormData(event.target).get('manager')??'').trim();
    if(!/^[1-9]\d{0,9}$/.test(value)){
      managerError=value?'Use a numeric FPL Team ID, starting from 1.':'Enter your FPL Team ID to load your squad.';
      const status=root.querySelector('#team-link-status');status.textContent=managerError;status.className='team-link-error';return;
    }
    manager=value;managerError='';review=null;
    loadReview();
  });
  root.addEventListener('change',event=>{if(event.target.id==='review-gameweek'){gameweek=Number(event.target.value);review=null;liveSnapshot=null;loadReview();if(rivalManager&&getState().source!=='sample')loadRival();}});
  root.addEventListener('error',event=>{
    const image=event.target;if(image?.tagName!=='IMG'||image.classList.contains('player-photo'))return;
    if(image.dataset.videoId&&!image.dataset.retried){image.dataset.retried='true';image.src=`https://i.ytimg.com/vi/${image.dataset.videoId}/mqdefault.jpg`;return;}
    image.hidden=true;
  },true);
  fetch('/videos.json').then(response=>response.json()).then(data=>{videos=data.videos??[];render();}).catch(()=>{});
  fetch('/api/videos').then(response=>response.ok?response.json():null).then(data=>{
    if(Array.isArray(data)){videos=[...new Map([...data,...videos].map(video=>[video.id,video])).values()].sort((first,second)=>second.published.localeCompare(first.published));render();}
  }).catch(()=>{});
  return {render,onDataLoaded(){if(gameweek===null)gameweek=currentGw(getState());render();if(availabilityDialog.open)renderAvailabilityDetails();loadReview();if(rivalManager&&getState().source!=='sample')loadRival();}};
}
