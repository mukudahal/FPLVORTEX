import { buildStrengths, projectMatch } from '/model/dashboardMath.js';
import { playerPortrait } from '/player-images.js';
import { icon } from '/icons.js';

export function createDashboard(getState, escape, toast) {
  const root = document.querySelector('#dashboard-mount');
  let gameweek = null, review = null, loading = false, requestVersion = 0, reviewError = '';
  let liveSnapshot = null, managerError = '';
  const requestCache = new Map();
  let analysis = false, projectionMetric = 'goals', projectionDirection = -1;
  let topDirection = -1, transferSort = 'net', transferDirection = -1, transferPage = 0, injuryPage = 0, videos = [];
  let manager = '', reviewView = 'pitch';
  try {
    manager = localStorage.getItem('vortex-linked-manager') || manager;
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
    if(state.source==='sample') {
      const counts={1:0,2:0,3:0,4:0},required={1:2,2:5,3:5,4:3},sample=[];
      for(const player of state.bootstrap.elements)if(counts[player.element_type]<required[player.element_type]){counts[player.element_type]++;sample.push(player);}
      const starters=[...sample.filter(player=>player.element_type===1).slice(0,1),...sample.filter(player=>player.element_type===2).slice(0,3),...sample.filter(player=>player.element_type===3).slice(0,4),...sample.filter(player=>player.element_type===4).slice(0,3)];
      picks=[...starters,...sample.filter(player=>!starters.includes(player))].map((player,index)=>({element:player.id,position:index+1,is_captain:index===8,is_vice_captain:index===10,multiplier:index<11?index===8?2:1:0}));
    }
    const current=review?.history.current?.find(event=>event.event===gameweek);
    const previous=review?.history.current?.find(event=>event.event===gameweek-1);
    const rank=current?.overall_rank??review?.picks.entry_history?.overall_rank;
    const change=rank&&previous?.overall_rank?previous.overall_rank-rank:null;
    const starters=picks.filter(pick=>pick.position<=11),bench=picks.filter(pick=>pick.position>11);
    // Use the official review total. Applying final-match autosubs to an unfinished
    // gameweek would prematurely replace players whose fixtures have not started.
    const officialPoints=review?.picks.entry_history?.points;
    const points=Number.isFinite(officialPoints)?officialPoints:null;
    const event=state.bootstrap.events.find(item=>item.id===gameweek);
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
      return `<div class="review-player" title="${escape(player.web_name+' · '+label)}">${pick.is_captain?'<b class="captain-badge">C</b>':pick.is_vice_captain?'<b class="captain-badge">V</b>':''}${pick.position>11?`<small class="bench-order">${pick.position===12?'GK':'B'+(pick.position-12)}</small>`:''}${player.status!=='a'?`<span class="availability-flag" title="${escape(player.news||'Availability flagged')}" aria-label="${escape(player.news||'Availability flagged')}">${icon('warning')}</span>`:''}${portrait(player,true)}<strong>${escape(player.web_name)}</strong><span class="player-result" data-difficulty="${difficulty}" title="${escape(label)}${difficulty?' · FPL difficulty '+difficulty+'/5':''}">${escape(displayed)}</span></div>`;
    };
    const pitch=`<div class="review-pitch"><div class="pitch-sponsor"><span>FPL VORTEX</span><small>GAMEWEEK ${gameweek}</small></div><div class="pitch-lines"><i></i></div>${[1,2,3,4].map(position=>`<div class="review-row">${starters.filter(pick=>players.get(pick.element)?.element_type===position).map(card).join('')}</div>`).join('')}<div class="review-bench">${bench.map(card).join('')}</div></div>`;
    const table=`<div class="review-table-wrap"><table class="review-table"><thead><tr><th>Player</th><th>Fixture</th><th>Points</th></tr></thead><tbody>${picks.map(pick=>{const player=players.get(pick.element);if(!player)return'';const {label,difficulty}=fixtureInfo(player);return `<tr class="${pick.position>11?'bench-row':''}"><td>${playerLine(player,teams)}${pick.is_captain?'<span class="dash-muted">Captain</span>':pick.is_vice_captain?'<span class="dash-muted">Vice-captain</span>':''}</td><td class="player-result" data-difficulty="${difficulty}">${escape(label)}</td><td>${state.source==='sample'?'—':number(live.get(player.id)?.total_points)}</td></tr>`;}).join('')}</tbody></table></div>`;
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
      const chance=player.chance_of_playing_next_round;
      const condition=(player.news||'Availability flagged').split(' - ')[0];
      return `<div class="injury-row" title="${escape(player.news||'Availability flagged')}">${portrait(player)}<div><button class="player-open" data-open-player="${player.id}"><strong>${escape(player.web_name)}</strong></button><small>${escape(condition)} · ${chance==null?'Return unknown':chance+'% chance'}</small></div>${icon('warning')}</div>`;
    }).join('');
    const injuryPanel=panel(`${icon('medical')}Injuries & Suspensions`,`<div class="dash-scroll">${injuryRows||'<p class="dash-empty">No flagged players in this snapshot.</p>'}</div><div class="dash-pager"><button data-injury-page="-1" ${injuryPage===0?'disabled':''}>‹ Prev</button><span>${injuryPage+1} / ${injuryPages}</span><button data-injury-page="1" ${injuryPage===injuryPages-1?'disabled':''}>Next ›</button></div>`,`<span class="dash-muted">${injuries.length} players</span>`,'lower-card');
    return topPanel+transferPanel+injuryPanel;
  }
  function render() {
    const state=getState();if(!state.bootstrap)return;
    const teams=teamMap(state);if(gameweek===null)gameweek=currentGw(state);
    const selector=`<form class="team-link-form" novalidate><label for="fpl-team-id">FPL Team ID</label><input id="fpl-team-id" name="manager" inputmode="numeric" autocomplete="off" pattern="[1-9][0-9]{0,9}" placeholder="Enter your team ID" value="${escape(manager)}" aria-describedby="team-link-status"><button class="primary" ${loading?'disabled':''}>${loading?'Loading…':'Load team'}</button><span id="team-link-status" role="status" class="${managerError||reviewError?'team-link-error':''}">${escape(managerError||reviewError||(manager?(loading?'Updating your team…':'Team saved in this browser'):'Your ID is the number in your FPL team URL.'))}</span></form><div class="dashboard-toolbar"><div class="dashboard-subtabs"><button class="${!analysis?'active':''}" data-subtab="overview" aria-pressed="${!analysis}">Overview</button><button class="${analysis?'active':''}" data-subtab="analysis" aria-pressed="${analysis}">Gameweek Analysis</button></div><label>Gameweek <select id="review-gameweek" aria-label="Review gameweek">${state.bootstrap.events.map(event=>`<option value="${event.id}" ${event.id===gameweek?'selected':''}>${event.id}</option>`).join('')}</select></label></div>`;
    if(analysis){root.innerHTML=selector+panel('Gameweek Analysis','<div class="analysis-pending"><h3>Your analysis workspace.</h3><p>The subtab is ready. Its detailed contents will be designed in the next step.</p></div>');return;}
    const projected=projections(state);
    const date=value=>value?new Date(value).toLocaleDateString([],{month:'short',day:'numeric'}):'';
    const videoPanel=panel(`${icon('play')}Latest FPL Videos`,`<div class="dashboard-videos">${videos.map(video=>`<a href="${escape(video.url)}" target="_blank" rel="noopener noreferrer"><span class="video-thumbnail"><img src="https://i.ytimg.com/vi/${escape(video.id)}/hqdefault.jpg" data-video-id="${escape(video.id)}" alt="${escape(video.title)}" loading="lazy">${icon('play')}</span><span class="video-copy"><strong>${escape(video.title)}</strong><small>FPL VORTEX · ${date(video.published)}</small></span></a>`).join('')||'<p class="dash-empty">Loading your channel videos…</p>'}</div>`,`<a class="dash-link" href="https://www.youtube.com/@Fplvortex/videos" target="_blank" rel="noopener noreferrer">All videos ${icon('arrow')}</a>`,'videos-card');
    root.innerHTML=selector+`<div class="dashboard-upper">${renderReview(state,teams)}${renderFixtures(state,projected,teams)}${renderProjections(projected)}</div><div class="dashboard-lower">${renderLower(state,teams)}</div>${videoPanel}<div class="video-channel-links"><a href="https://www.youtube.com/@Fplvortex/videos" target="_blank" rel="noopener noreferrer">All uploads</a><a href="https://www.youtube.com/@Fplvortex/shorts" target="_blank" rel="noopener noreferrer">All Shorts</a><a href="https://www.youtube.com/@Fplvortex/streams" target="_blank" rel="noopener noreferrer">Live streams</a></div>`;
  }
  root.addEventListener('click',event=>{
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
    const tab=event.target.closest('[data-subtab]');if(tab){analysis=tab.dataset.subtab==='analysis';render();}
  });
  root.addEventListener('submit',event=>{
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
  root.addEventListener('change',event=>{if(event.target.id==='review-gameweek'){gameweek=Number(event.target.value);review=null;liveSnapshot=null;loadReview();}});
  root.addEventListener('error',event=>{
    const image=event.target;if(image?.tagName!=='IMG'||image.classList.contains('player-photo'))return;
    if(image.dataset.videoId&&!image.dataset.retried){image.dataset.retried='true';image.src=`https://i.ytimg.com/vi/${image.dataset.videoId}/mqdefault.jpg`;return;}
    image.hidden=true;
  },true);
  fetch('/videos.json').then(response=>response.json()).then(data=>{videos=data.videos??[];render();}).catch(()=>{});
  fetch('/api/videos').then(response=>response.ok?response.json():null).then(data=>{
    if(Array.isArray(data)){videos=[...new Map([...data,...videos].map(video=>[video.id,video])).values()].sort((first,second)=>second.published.localeCompare(first.published));render();}
  }).catch(()=>{});
  return {render,onDataLoaded(){if(gameweek===null)gameweek=currentGw(getState());render();loadReview();}};
}
