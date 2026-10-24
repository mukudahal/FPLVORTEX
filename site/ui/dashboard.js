import { buildStrengths, projectMatch } from '/model/dashboardMath.js';
import { scoreLineup } from '/model/monteCarlo.js';
import { playerPortrait } from '/player-images.js';

export function createDashboard(getState, escape, toast) {
  const root = document.querySelector('#dashboard-mount');
  let gameweek = null, review = null, loading = false, requestVersion = 0, reviewError = '';
  let analysis = false, projectionMetric = 'goals', projectionDirection = -1;
  let topDirection = -1, transferSort = 'net', transferDirection = -1, injuryPage = 0, videos = [];
  let manager = '145784';
  try {manager = localStorage.getItem('vortex-linked-manager') || manager;} catch {}
  const money = value => '£' + (value / 10).toFixed(1) + 'm';
  const number = (value,digits=0) => Number.isFinite(value) ? value.toLocaleString(undefined,{maximumFractionDigits:digits}) : '—';
  const currentGw = state => state.bootstrap?.events.find(event=>event.is_current)?.id ?? state.bootstrap?.currentEvent ?? state.bootstrap?.events.find(event=>event.is_next)?.id ?? 1;
  const teamMap = state => new Map(state.bootstrap.teams.map(team=>[team.id,team]));
  const date = value => value ? new Date(value).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'TBC';
  const portrait = (player, large=false) => playerPortrait(player, escape, large);
  const badge = team => team?.code ? `<img class="club-badge" loading="lazy" src="https://resources.premierleague.com/premierleague/badges/t${Number(team.code)}.png" alt="${escape(team.short_name)}">` : `<span class="club-placeholder">${escape(team?.short_name??'?')}</span>`;
  const panel = (heading,content,extra='',className='') => `<section class="dash-card ${className}"><header><h2>${heading}</h2>${extra}</header>${content}</section>`;
  const playerLine = (player,teams) => `<div class="dash-player-line">${portrait(player)}<span><strong>${escape(player.web_name)}</strong><small>${escape(teams.get(player.team)?.short_name??'?')} · ${{1:'GK',2:'DEF',3:'MID',4:'FWD'}[player.element_type]} · ${money(player.now_cost)}</small></span></div>`;
  const metricButton = (name,label,active) => `<button class="${active?'selected':''}" data-projection="${name}">${label}</button>`;

  async function fetchJson(url){const response=await fetch(url,{signal:AbortSignal.timeout(16000)});if(!response.ok)throw new Error('The official gameweek feed is unavailable.');return response.json();}
  async function loadReview(){
    const state=getState();if(state.source==='sample'){review=null;render();return;}
    const version=++requestVersion;loading=true;review=null;reviewError='';render();
    try{
      const [entry,picks,live,history]=await Promise.all([fetchJson(`/api/entry/${manager}`),fetchJson(`/api/picks/${manager}/${gameweek}`),fetchJson(`/api/live/${gameweek}`),fetchJson(`/api/history/${manager}`)]);
      if(version!==requestVersion)return;
      if(!Array.isArray(picks.picks)||!Array.isArray(live.elements))throw new Error('The gameweek response is incomplete.');
      review={entry,picks,live,history};
    }catch(error){if(version===requestVersion)reviewError=error.message;}
    finally{if(version===requestVersion){loading=false;render();}}
  }

  function projections(state){
    const teams=teamMap(state);const strengths=buildStrengths(state.bootstrap.teams,state.bootstrap.elements,state.fixtures);
    return state.fixtures.filter(fixture=>fixture.event===gameweek).flatMap(fixture=>{
      const home=teams.get(fixture.team_h),away=teams.get(fixture.team_a);if(!home||!away)return[];
      const projection=projectMatch(strengths.get(home.id),strengths.get(away.id));
      return [{fixture,team:home,opponent:away,venue:'H',goals:projection.homeXg,cs:projection.homeCs,win:projection.homeWin},{fixture,team:away,opponent:home,venue:'A',goals:projection.awayXg,cs:projection.awayCs,win:projection.awayWin}];
    });
  }

  function renderReview(state,teams){
    const players=new Map(state.bootstrap.elements.map(player=>[player.id,player]));
    const live=new Map((review?.live.elements??[]).map(element=>[element.id,element.stats]));
    let picks=review?.picks.picks??[];
    if(state.source==='sample'){
      const positions={1:0,2:0,3:0,4:0};const required={1:2,2:5,3:5,4:3};const sample=[];
      for(const player of state.bootstrap.elements)if(positions[player.element_type]<required[player.element_type]){positions[player.element_type]++;sample.push(player);}
      const starters=[...sample.filter(player=>player.element_type===1).slice(0,1),...sample.filter(player=>player.element_type===2).slice(0,3),...sample.filter(player=>player.element_type===3).slice(0,4),...sample.filter(player=>player.element_type===4).slice(0,3)];
      const ordered=[...starters,...sample.filter(player=>!starters.includes(player))];
      picks=ordered.map((player,index)=>({element:player.id,position:index+1,is_captain:index===8,is_vice_captain:index===10,multiplier:index<11?index===8?2:1:0}));
    }
    const current=review?.history.current?.find(event=>event.event===gameweek);
    const previous=review?.history.current?.find(event=>event.event===gameweek-1);
    const rank=current?.overall_rank??review?.picks.entry_history?.overall_rank;
    const change=rank&&previous?.overall_rank?previous.overall_rank-rank:null;
    const starters=picks.filter(pick=>pick.position<=11),bench=picks.filter(pick=>pick.position>11);
    const captain=picks.find(pick=>pick.is_captain),vice=picks.find(pick=>pick.is_vice_captain);
    let points=null;
    if(review&&captain&&vice){points=scoreLineup({starters:starters.map(pick=>pick.element),bench:bench.map(pick=>pick.element),captainId:captain.element,viceId:vice.element},{pts:id=>live.get(id)?.total_points??0,played:id=>(live.get(id)?.minutes??0)>0,position:id=>players.get(id)?.element_type??0},review.picks.active_chip==='bboost'?'bb':review.picks.active_chip==='3xc'?'tc':undefined)-(review.picks.entry_history?.event_transfers_cost??0);}
    const event=state.bootstrap.events.find(item=>item.id===gameweek);
    const stats=[['GW Points',points],['Avg Points',event?.average_entry_score],['Overall Rank',rank],['OR Change',change],['GW Rank',current?.rank??review?.picks.entry_history?.rank]];
    const card=pick=>{const player=players.get(pick.element);if(!player)return'';const matches=state.fixtures.filter(fixture=>fixture.event===gameweek&&[fixture.team_h,fixture.team_a].includes(player.team));const label=matches.map(fixture=>`${teams.get(fixture.team_h===player.team?fixture.team_a:fixture.team_h)?.short_name??'?'} (${fixture.team_h===player.team?'H':'A'})`).join(', ')||'BLANK';const playing=live.get(player.id);const displayed=playing&&(playing.minutes>0||matches.every(fixture=>fixture.finished))?number(playing.total_points*(pick.position<=11?Math.max(pick.multiplier,1):1)):label;return`<div class="review-player">${pick.is_captain?'<b class="captain-badge">C</b>':pick.is_vice_captain?'<b class="captain-badge">V</b>':''}${portrait(player,true)}<strong>${escape(player.web_name)}</strong><span>${escape(displayed)}</span></div>`;};
    const pitch=picks.length?`<div class="review-pitch"><div class="pitch-sponsor"><span>FPL VORTEX</span><span>GAMEWEEK ${gameweek}</span></div><div class="pitch-lines"><i></i></div>${[1,2,3,4].map(position=>`<div class="review-row">${starters.filter(pick=>players.get(pick.element)?.element_type===position).map(card).join('')}</div>`).join('')}<div class="review-bench">${bench.map(card).join('')}</div></div>`:`<div class="review-loading">${loading?'Loading your current-gameweek review…':escape(reviewError||'Load your team to review the current gameweek.')}</div>`;
    const status=state.source==='sample'?'Illustrative lineup · not your actual squad':review?'Official selections · in-play scores are provisional':reviewError?'Review data unavailable':'Loading official selections';
    return panel(escape(review?.entry.name??'FPL VORTEX'),`<div class="review-stats">${stats.map(([label,value])=>`<div><strong>${number(value)}</strong><small>${label}</small></div>`).join('')}</div><p class="review-status">${status}</p>${pitch}`,`<button class="dash-link" data-action="change-team">Change team</button>`,'review-card');
  }

  function renderFixtures(state,rows,teams){
    const fixtures=state.fixtures.filter(fixture=>fixture.event===gameweek).sort((first,second)=>(first.kickoff_time??'9').localeCompare(second.kickoff_time??'9'));
    let previousDay='';const content=fixtures.map(fixture=>{const home=teams.get(fixture.team_h),away=teams.get(fixture.team_a);const day=fixture.kickoff_time?new Date(fixture.kickoff_time).toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'}):'Date to be confirmed';const group=day!==previousDay?`<div class="fixture-date">${escape(day)}</div>`:'';previousDay=day;const homeForecast=rows.find(row=>row.fixture.id===fixture.id&&row.venue==='H');const awayForecast=rows.find(row=>row.fixture.id===fixture.id&&row.venue==='A');const score=fixture.started?`${fixture.team_h_score??0} – ${fixture.team_a_score??0}`:fixture.kickoff_time?new Date(fixture.kickoff_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'TBC';return`${group}<div class="fixture-match"><div class="fixture-summary"><span>${escape(home?.short_name??'?')} ${badge(home)}</span><b>${score}</b><span>${badge(away)} ${escape(away?.short_name??'?')}</span></div><div class="fixture-bar"><span style="flex:${homeForecast?.goals??1}"></span><span style="flex:${awayForecast?.goals??1}"></span></div><div class="fixture-xg"><b>${number(homeForecast?.goals,2)}</b><span>Projected xG</span><b>${number(awayForecast?.goals,2)}</b></div><details class="fixture-model-detail"><summary>Model details</summary><p>Model projections: home win ${number((homeForecast?.win??0)*100,1)}%, away win ${number((awayForecast?.win??0)*100,1)}%. These are estimates, not observed xG.</p></details></div>`;}).join('');
    return panel(`GW ${gameweek} Fixtures`,`<div class="fixture-played">${fixtures.filter(fixture=>fixture.finished).length} of ${fixtures.length} played</div><div class="dash-scroll">${content||'<p class="dash-empty">No fixtures assigned.</p>'}</div>`,'','fixtures-card');
  }

  function renderProjections(rows){
    const sorted=[...rows].sort((first,second)=>projectionDirection*(first[projectionMetric]-second[projectionMetric]));const maximum=Math.max(...rows.map(row=>row[projectionMetric]),0.001);
    const content=sorted.map((row,index)=>`<div class="projection-row"><span class="row-rank">${index+1}.</span>${badge(row.team)}<b>${escape(row.team.short_name)}</b><small>${escape(row.opponent.short_name)} (${row.venue})</small><div class="dash-bar-track"><i style="width:${row[projectionMetric]/maximum*100}%"></i></div><strong>${projectionMetric==='goals'?number(row.goals,2):number(row[projectionMetric]*100,1)+'%'}</strong></div>`).join('');
    return panel(`<button data-action="sort-projections">GW ${gameweek} Projected Goals ${projectionDirection===-1?'↓':'↑'}</button>`,`<div class="dash-scroll">${content||'<p class="dash-empty">No projections available.</p>'}</div>`,`<div class="dash-segment">${metricButton('goals','Goals',projectionMetric==='goals')}${metricButton('cs','CS%',projectionMetric==='cs')}${metricButton('win','Win%',projectionMetric==='win')}</div>`,'projections-card');
  }

  function renderLower(state,teams){
    const live=new Map((review?.live.elements??[]).map(element=>[element.id,element.stats]));
    const points=player=>live.get(player.id)?.total_points??(gameweek===currentGw(state)?player.event_points:0)??0;
    const top=[...state.bootstrap.elements].sort((first,second)=>topDirection*(points(first)-points(second))).slice(0,10);
    const maximum=Math.max(...top.map(points),1);
    const topPanel=panel('<button data-action="sort-top">🏆 Top Players ↕</button>',`<div class="dash-scroll">${top.map((player,index)=>`<div class="top-row"><span class="row-rank">${index+1}.</span>${playerLine(player,teams)}<div class="dash-bar-track"><i style="width:${Math.max(0,points(player))/maximum*100}%"></i></div><b>${state.source==='sample'?'—':points(player)}</b></div>`).join('')}</div>`,`<span class="dash-muted">GW ${gameweek} points</span>`,'lower-card');
    const transferValue=player=>transferSort==='name'?player.web_name:transferSort==='percent'?(Number.isFinite(player.price_change_percent)?player.price_change_percent:-Infinity):transferSort==='in'?player.transfers_in_event??0:transferSort==='out'?player.transfers_out_event??0:(player.transfers_in_event??0)-(player.transfers_out_event??0);
    const transfers=[...state.bootstrap.elements].sort((first,second)=>{const left=transferValue(first),right=transferValue(second);return transferDirection*(typeof left==='string'?left.localeCompare(right):left-right)||first.id-second.id;}).slice(0,10);
    const headers=[['name','Player'],['percent','Price Δ%'],['in','In'],['out','Out'],['net','Net']];
    const transferPanel=panel('⇄ Price & Transfers',`<div class="dash-scroll"><table class="dash-transfer-table"><thead><tr>${headers.map(([key,label])=>`<th><button data-transfer-sort="${key}">${label} ↕</button></th>`).join('')}</tr></thead><tbody>${transfers.map(player=>`<tr><td>${playerLine(player,teams)}</td><td>${Number.isFinite(player.price_change_percent)?number(player.price_change_percent,1)+'%':'—'}</td><td>${number(player.transfers_in_event)}</td><td>${number(player.transfers_out_event)}</td><td>${number((player.transfers_in_event??0)-(player.transfers_out_event??0))}</td></tr>`).join('')}</tbody></table></div><p class="dash-footnote">Price-change percentages require a separate data source; missing values stay blank.</p>`,'','lower-card');
    const injuries=state.bootstrap.elements.filter(player=>player.status!=='a').sort((first,second)=>(first.chance_of_playing_next_round??-1)-(second.chance_of_playing_next_round??-1));
    const pages=Math.max(1,Math.ceil(injuries.length/10));injuryPage=Math.min(injuryPage,pages-1);
    const injuryPanel=panel('✚ Injuries & Suspensions',`<div class="dash-scroll">${injuries.slice(injuryPage*10,injuryPage*10+10).map(player=>`<div class="injury-row">${portrait(player)}<div><strong>${escape(player.web_name)}</strong><small>${escape(player.news||'Availability flagged')} · ${player.chance_of_playing_next_round==null?'Return unknown':player.chance_of_playing_next_round+'% chance of playing'}</small></div><span>⚠</span></div>`).join('')||'<p class="dash-empty">No flagged players in this snapshot.</p>'}</div><div class="dash-pager"><button data-injury-page="-1" ${injuryPage===0?'disabled':''}>‹ Prev</button><span>${injuryPage+1} / ${pages}</span><button data-injury-page="1" ${injuryPage===pages-1?'disabled':''}>Next ›</button></div>`,`<span class="dash-muted">${injuries.length} players</span>`,'lower-card');
    return topPanel+transferPanel+injuryPanel;
  }

  function render(){
    const state=getState();if(!state.bootstrap)return;const teams=teamMap(state);if(gameweek===null)gameweek=currentGw(state);
    const selector=`<div class="dashboard-toolbar"><div class="dashboard-subtabs"><button class="${!analysis?'active':''}" data-subtab="overview">Overview</button><button class="${analysis?'active':''}" data-subtab="analysis">Gameweek Analysis</button></div><label>Gameweek <select id="review-gameweek" aria-label="Dashboard gameweek">${state.bootstrap.events.map(event=>`<option value="${event.id}" ${event.id===gameweek?'selected':''}>${event.id}</option>`).join('')}</select></label></div>`;
    if(analysis){root.innerHTML=selector+panel('Gameweek Analysis','<div class="analysis-pending"><h3>Your analysis workspace.</h3><p>The subtab is ready. Its detailed contents will be designed in the next step.</p></div>');return;}
    const projected=projections(state);
    const videoPanel=panel('▶ Latest FPL Videos',`<div class="dashboard-videos">${videos.map(video=>`<a href="${escape(video.url)}" target="_blank" rel="noopener noreferrer"><img src="${escape(video.thumbnail)}" alt="" loading="lazy"><span><strong>${escape(video.title)}</strong><small>FPL VORTEX · ${date(video.published)}</small></span></a>`).join('')||'<p>Loading your channel videos…</p>'}</div>`,`<a class="dash-link" href="https://www.youtube.com/@Fplvortex/videos" target="_blank" rel="noopener noreferrer">All videos →</a>`,'videos-card');
    root.innerHTML=selector+`<div class="dashboard-upper">${renderReview(state,teams)}${renderFixtures(state,projected,teams)}${renderProjections(projected)}</div><div class="dashboard-lower">${renderLower(state,teams)}</div>${videoPanel}<div class="video-channel-links"><a href="https://www.youtube.com/@Fplvortex/videos" target="_blank" rel="noopener noreferrer">All uploads</a><a href="https://www.youtube.com/@Fplvortex/shorts" target="_blank" rel="noopener noreferrer">All Shorts</a><a href="https://www.youtube.com/@Fplvortex/streams" target="_blank" rel="noopener noreferrer">All live streams</a></div>`;
  }
  root.addEventListener('click',event=>{
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='sort-projections'){projectionDirection*=-1;render();}
    if(action==='sort-top'){topDirection*=-1;render();}
    if(action==='change-team'){
      const existing=root.querySelector('.manager-form');if(existing){existing.remove();return;}
      const form=document.createElement('form');form.className='manager-form';form.innerHTML='<label>FPL manager number <input inputmode="numeric" name="manager" pattern="[0-9]{1,10}" required placeholder="Enter your manager number"></label><button class="primary">Load review</button>';
      form.addEventListener('submit',submit=>{submit.preventDefault();const value=new FormData(form).get('manager');if(!/^\d{1,10}$/.test(value)||Number(value)<1){toast('Enter a valid numeric manager number.');return;}manager=value;try{localStorage.setItem('vortex-linked-manager',manager);}catch{}loadReview();});root.prepend(form);form.querySelector('input').focus();
    }
    const projection=event.target.closest('[data-projection]');if(projection){projectionMetric=projection.dataset.projection;projectionDirection=-1;render();}
    const transfer=event.target.closest('[data-transfer-sort]');if(transfer){transferDirection=transferSort===transfer.dataset.transferSort?-transferDirection:-1;transferSort=transfer.dataset.transferSort;render();}
    const page=event.target.closest('[data-injury-page]');if(page){injuryPage+=Number(page.dataset.injuryPage);render();}
    const tab=event.target.closest('[data-subtab]');if(tab){analysis=tab.dataset.subtab==='analysis';render();}
  });
  root.addEventListener('change',event=>{if(event.target.id==='review-gameweek'){gameweek=Number(event.target.value);loadReview();}});
  root.addEventListener('error',event=>{if(event.target?.tagName==='IMG'&&!event.target.classList.contains('player-photo'))event.target.hidden=true;},true);
  fetch('/videos.json').then(response=>response.json()).then(data=>{videos=data.videos??[];render();}).catch(()=>{});
  fetch('/api/videos').then(response=>response.ok?response.json():null).then(data=>{if(Array.isArray(data)){const merged=new Map([...data,...videos].map(video=>[video.id,video]));videos=[...merged.values()].sort((first,second)=>second.published.localeCompare(first.published));render();}}).catch(()=>{});
  return {render,onDataLoaded(){if(gameweek===null)gameweek=currentGw(getState());render();loadReview();}};
}
