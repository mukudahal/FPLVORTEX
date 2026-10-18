/** FPLVORTEX Home. Real-source fields and research-modeled fields are never interchangeable. */
export type HomePlayer={id:number;name:string;fullName:string;club:string;position:string;points:number|null;gwPoints:number|null;priceTenths:number|null;selected:number|null;transferIn:number|null;transferOut:number|null;costChangeEvent:number|null;status:string;news:string;chance:number|null;photo:null};
export type HomeFixture={id:number|null;gameweek:number;date:string|null;kickoff:string|null;home:string;away:string;homeScore:number|null;awayScore:number|null;finished:boolean;started:boolean;provider:string};
export type HomePrediction={club:string;opponent:string;venue:string;xg:number;cs:number;win:number;fixture:string};
export type HomePick={id:number;position:number|null;multiplier:number|null;isCaptain:boolean;isViceCaptain:boolean;name:string|null;club:string|null;positionName:string|null;priceTenths:number|null;officialStatus:string|null};
export type HomePayload={entryId:number;asOf:string;currentGameweek:number;nextGameweek:number;entry:null|{entryId:number;teamName:string;overallRank:number|null;overallPoints:number|null;eventPoints:number|null;currentGameweek:number|null;bankInTenths:number|null;teamValueInTenths:number|null;picks:null|{gameweek:number;players:HomePick[]}};players:HomePlayer[];fixtures:HomeFixture[];predictions:HomePrediction[];live:{entry:boolean;players:boolean;fixtures:boolean;model:boolean};video:{ids:string[];channelUrl:string|null};notices:string[]};
export type HomeUi={goalSort:'xg'|'cs'|'win';leaderSort:'points'|'owned'|'value';leaderPage:number;fixturePage:number;marketPage:number;injuryFilter:'all'|'injury'|'suspension';preview:boolean;waiting:boolean;error:string};
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
const amount=(value:number|null,decimals=0)=>value===null?'—':value.toFixed(decimals);
const gbp=(tenths:number|null)=>tenths===null?'—':`£${(tenths/10).toFixed(1)}m`;
const compact=(n:number|null)=>n===null?'—':Math.abs(n)>=1000?`${(n/1000).toFixed(1)}k`:n.toLocaleString();
/** Club colors identify clubs; amber/red statuses identify availability risk, not club affiliation. */
const clubPalette:Record<string,{primary:string;secondary:string;text:string}>={
  ARS:{primary:'#bd1239',secondary:'#f53b65',text:'#fff'},AVL:{primary:'#660a34',secondary:'#a84d82',text:'#fff'},
  BHA:{primary:'#0958ad',secondary:'#238dde',text:'#fff'},BOU:{primary:'#bb1737',secondary:'#e53854',text:'#fff'},
  BRE:{primary:'#c71224',secondary:'#f44950',text:'#fff'},CHE:{primary:'#0630b9',secondary:'#3180f5',text:'#fff'},
  CRY:{primary:'#2338b3',secondary:'#e23c57',text:'#fff'},COV:{primary:'#0878a9',secondary:'#37a4da',text:'#fff'},
  EVE:{primary:'#0734ab',secondary:'#4269ec',text:'#fff'},FUL:{primary:'#303e52',secondary:'#64748b',text:'#fff'},
  HUL:{primary:'#b26205',secondary:'#ea9e1a',text:'#111827'},IPS:{primary:'#0046a9',secondary:'#317de8',text:'#fff'},
  LEE:{primary:'#e2b518',secondary:'#ffe85f',text:'#1d2939'},LIV:{primary:'#ac0b26',secondary:'#e8344c',text:'#fff'},
  MCI:{primary:'#1383c8',secondary:'#69c9f4',text:'#0b2742'},MUN:{primary:'#af1d18',secondary:'#ee4d49',text:'#fff'},
  NEW:{primary:'#18202d',secondary:'#596579',text:'#fff'},NFO:{primary:'#b91c1c',secondary:'#f04f55',text:'#fff'},
  SUN:{primary:'#ca1726',secondary:'#f15958',text:'#fff'},TOT:{primary:'#102443',secondary:'#3d5e8d',text:'#fff'}
};
const palette=(club:string)=>clubPalette[club]??{primary:'#135b77',secondary:'#24a0b4',text:'#fff'};
const availabilityTone=(status:string|null|undefined):'ready'|'doubt'|'out'|'unknown'=>{
  if(status==='a')return 'ready';if(status==='d')return 'doubt';
  if(['i','s','u','n'].includes(status??''))return 'out';return 'unknown';
};
const knownPhotos:Record<string,{name:string;url:string;license:string}>={
  'haaland':{name:'Bryan Berlin / WikiPortraits',url:'Erling_Haaland_France_v_Norway_26_June_26-008.jpg',license:'CC BY-SA 4.0'},
  'saka':{name:'Bryan Berlin / WikiPortraits',url:'Bukayo_Saka_England_v_Panama_27_June_26-108_(cropped).jpg',license:'CC BY-SA 4.0'},
  'watkins':{name:'Bryan Berlin / WikiPortraits',url:'Ollie_Watkins_England_v_Ghana_23_June_2026-076.jpg',license:'CC BY-SA 4.0'},
  'van dijk':{name:'Timmy96',url:'Virgil_van_Dijk_06042025_(1).jpg',license:'CC0 1.0'},
  'eze':{name:'Bryan Berlin / WikiPortraits',url:'Eberechi_Eze_England_v_Panama_27_June_26-231.jpg',license:'CC BY-SA 4.0'}
};
function portrait(name:string,club='',size='medium'){
  const key=name.toLowerCase().replace(/[^\p{L} ]/gu,'').trim();
  const credit=knownPhotos[key]??(key.includes('haaland')?knownPhotos.haaland:key.includes('saka')?knownPhotos.saka:key.includes('watkins')?knownPhotos.watkins:key.includes('van dijk')?knownPhotos['van dijk']:key==='eze'?knownPhotos.eze:undefined);
  const photo=credit?`<img loading="lazy" src="https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(credit.url)}?width=140" alt="${esc(name)}" title="${esc(credit.name)} · ${esc(credit.license)}" />`:'';
  const colors=palette(club);
  return `<span class="home-portrait home-portrait-${size}" style="--home-club:${colors.primary};--home-club-secondary:${colors.secondary};--home-club-ink:${colors.text}" aria-label="${esc(name)} portrait or initials"><b>${esc(name.split(/\s+/).map(x=>x[0]??'').slice(-2).join('').toUpperCase())}</b>${photo}</span>`;
}
function tab(key:string,label:string,selected:boolean,attr:string){return `<button type="button" class="home-tab ${selected?'is-selected':''}" data-${attr}="${esc(key)}" aria-pressed="${selected}">${esc(label)}</button>`;}
export function orderLeaders(players:HomePlayer[],by:HomeUi['leaderSort']){
  const value=(p:HomePlayer)=>by==='points'?(p.points??-1):by==='owned'?(p.selected??-1):(p.priceTenths&&p.points!==null?p.points/(p.priceTenths/10):-1);
  return [...players].sort((a,b)=>value(b)-value(a)||a.id-b.id);
}
export function orderPredictions(rows:HomePrediction[],by:HomeUi['goalSort']){
  return [...rows].sort((a,b)=>b[by]-a[by]||a.club.localeCompare(b.club));
}
const sectionTitle=(icon:string,title:string,subtitle:string)=>`<div class="home-card-heading"><div class="home-card-heading-left"><span class="home-heading-icon">${icon}</span><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div></div></div>`;
function pitch(data:HomePayload|null,ui:HomeUi){
  const entry=data?.entry;
  const picks=entry?.picks && entry.picks.gameweek===data?.currentGameweek?entry.picks.players:[];
  const catalog=new Map(data?.players.map(p=>[p.id,p])??[]);
  const selected=picks.filter(p=>(p.position??99)<=11).sort((a,b)=>(a.position??0)-(b.position??0));
  const bench=picks.filter(p=>(p.position??0)>11).sort((a,b)=>(a.position??0)-(b.position??0));
  const key=(p:HomePick)=>p.positionName??catalog.get(p.id)?.position??'MID';
  const card=(p:HomePick)=>{
    const source=catalog.get(p.id);const name=p.name??source?.name??`Player #${p.id}`;
    const pts=entry?.picks?.gameweek===data?.currentGameweek?source?.gwPoints:null;
    const club=p.club??source?.club??'';const colors=palette(club);
    const status=availabilityTone(source?.status??p.officialStatus);
    const statusLabel=status==='out'?'Reported unavailable':status==='doubt'?'Availability doubt':status==='ready'?'FPL available':'Availability not reported';
    return `<div class="home-pitch-player home-status-${status}" style="--home-club:${colors.primary};--home-club-secondary:${colors.secondary};--home-club-ink:${colors.text}" title="${esc(name)} · ${esc(club)} · ${pts??'GW points pending'} · ${esc(statusLabel)}"><div class="home-pitch-head">${portrait(name,club,'large')}${p.isCaptain?'<span class="home-pitch-captain" aria-label="Captain">C</span>':p.isViceCaptain?'<span class="home-pitch-vice" aria-label="Vice captain">V</span>':''}${status==='out'||status==='doubt'?`<span class="home-pitch-risk" aria-label="${esc(statusLabel)}">!</span>`:''}</div><div class="home-player-clubline">${esc(club||'TEAM')} · ${esc(key(p))}</div><b>${esc(name)}</b><small aria-label="${pts??'Unknown'} gameweek points">${pts??'—'} ${pts===null?'pending':'pts'}</small></div>`;
  };
  if(selected.length===0)return `<div class="home-pitch-empty"><span class="home-empty-mark">⚽</span><strong>${ui.waiting?'Connecting to your FPL squad…':'Your live squad goes here'}</strong><p>${esc(ui.error||'Use Refresh live data to retrieve your current 15-player team from FPL. No demo squad is presented as your real team.')}</p><button type="button" data-home-reload class="home-btn home-btn-lime">↻ Refresh live squad</button></div>`;
  const groups=['GKP','DEF','MID','FWD'].map(pos=>selected.filter(p=>key(p)===pos));
  const points=entry?.eventPoints;
  return `<div class="home-pitch"><span class="home-pitch-topline"></span><span class="home-pitch-midline"></span><span class="home-pitch-circle"></span>${groups.map((group,i)=>`<div class="home-pitch-row home-pitch-row-${i}">${group.map(card).join('')}</div>`).join('')}<div class="home-bench"><span class="home-bench-caption">SUBSTITUTES</span><div class="home-bench-row">${bench.map(card).join('')}</div></div></div><div class="home-pitch-caption">Source-reported FPL picks · GW${data?.currentGameweek} · ${points??'—'} GW points · Actual points may update during live matches</div>`;
}
function fixtures(data:HomePayload|null,ui:HomeUi){
  const matches=data?.fixtures??[];const rows=[...matches].sort((a,b)=>(a.kickoff??a.date??'').localeCompare(b.kickoff??b.date??''));
  if(!rows.length)return `<div class="home-blank"><span>◷</span><strong>No verified fixtures loaded</strong><p>Match results will appear here when the match-data source responds.</p></div>`;
  return `<div class="home-fixture-list">${rows.map(m=>{
    const date=m.date?new Date(m.date+'T00:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}):'Date TBC';
    const score=m.homeScore!==null&&m.awayScore!==null?`${m.homeScore} : ${m.awayScore}`:m.kickoff?new Date(m.kickoff).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}):'TBC';
    return `<div class="home-fixture"><span class="home-match-when">${esc(date)}</span><span class="home-match-teams"><b>${esc(m.home)}</b><span class="home-match-score ${m.started?'home-score-live':''}">${esc(score)}</span><b>${esc(m.away)}</b></span><span class="home-match-status ${m.finished?'is-ft':m.started?'is-live':''}">${m.finished?'FT':m.started?'LIVE':'—'}</span></div>`;
  }).join('')}</div><p class="home-source-foot">${data?.live.fixtures?'FPL website public fixtures':'OpenFootball community fixtures'} · scores may be delayed</p>`;
}
function projections(data:HomePayload|null,ui:HomeUi){
  const rows=orderPredictions(data?.predictions??[],ui.goalSort).slice(0,20);
  const pct=ui.goalSort==='xg'?false:true;
  return `<div class="home-section-tabs" role="group" aria-label="Sort projected team metrics">${tab('xg','Goals',ui.goalSort==='xg','home-goal')}${tab('cs','CS %',ui.goalSort==='cs','home-goal')}${tab('win','Win %',ui.goalSort==='win','home-goal')}</div>${rows.length?`<div class="home-projection-list">${rows.map((m,i)=>{
    const n=m[ui.goalSort],display=pct?`${Math.round(n*100)}%`:n.toFixed(2);
    const percent=pct?n*100:(n/3)*100;
    return `<div class="home-ranking-row"><span class="home-row-number">${i+1}</span><b class="home-team-badge">${esc(m.club)}</b><div class="home-ranked-team"><strong>${esc(m.club)}</strong><small>${esc(m.fixture)}</small></div><div class="home-rank-meter"><span style="width:${Math.max(2,Math.min(100,percent)).toFixed(0)}%"></span><b>${esc(display)}</b></div></div>`;
  }).join('')}</div>`:`<div class="home-blank"><span>◈</span><strong>Next-GW research estimates unavailable</strong><p>Sync the OpenFootball CC0 league snapshot to enable independently calculated team xG, CS% and win likelihoods.</p></div>`}<p class="home-source-foot">RESEARCH MODEL · independent Poisson baseline · not bookmaker odds or validated forecasts</p>`;
}
function leaders(data:HomePayload|null,ui:HomeUi){
  const pageSize=8, ordered=orderLeaders(data?.players??[],ui.leaderSort),max=Math.max(1,Math.ceil(ordered.length/pageSize)),index=Math.min(ui.leaderPage,max-1);
  const subset=ordered.slice(index*pageSize,(index+1)*pageSize);
  return `<div class="home-section-tabs">${tab('points','Points',ui.leaderSort==='points','home-leader')}${tab('owned','Ownership',ui.leaderSort==='owned','home-leader')}${tab('value','Value',ui.leaderSort==='value','home-leader')}</div>${subset.length?subset.map((p,i)=>{
    const metric=ui.leaderSort==='points'?String(p.points??'—'):ui.leaderSort==='owned'?`${(p.selected??0).toFixed(1)}%`:p.priceTenths?((p.points??0)/(p.priceTenths/10)).toFixed(1):'—';
    const relative=ui.leaderSort==='points'?((p.points??0)/Math.max(1,ordered[0]?.points??1))*100:ui.leaderSort==='owned'?p.selected??0:(p.priceTenths?(p.points??0)/(p.priceTenths/10)*6:0);
    return `<div class="home-player-rank"><span class="home-row-number">${index*pageSize+i+1}.</span>${portrait(p.name,p.club)}<div class="home-player-info"><strong>${esc(p.name)}</strong><small>${esc(p.club)} · ${esc(p.position)} · ${gbp(p.priceTenths)}</small></div><div class="home-player-bar"><div style="width:${Math.min(100,Math.max(0,relative)).toFixed(0)}%"></div><b>${esc(metric)}</b></div></div>`;
  }).join(''):`<div class="home-blank"><strong>Top player rankings will load from FPL</strong><p>Click Refresh live data above.</p></div>`}${pager('leaders',index,max)}`;
}
function pager(name:string,index:number,count:number){return `<div class="home-pager"><span>Page ${index+1} of ${count}</span><div><button type="button" data-home-page="${name}:previous" ${index===0?'disabled':''} aria-label="Previous page">← Previous</button><button type="button" data-home-page="${name}:next" ${index>=count-1?'disabled':''}>Next →</button></div></div>`;}
function market(data:HomePayload|null,ui:HomeUi){
  const players=data?.players??[];const marketPlayers=[...players].sort((a,b)=>Math.abs(b.costChangeEvent??0)-Math.abs(a.costChangeEvent??0));
  const risers=marketPlayers.filter(p=>(p.costChangeEvent??0)>0).slice(0,3);
  const fallers=marketPlayers.filter(p=>(p.costChangeEvent??0)<0).slice(0,3);
  const priceItem=(p:HomePlayer,mode:'up'|'down')=>`<div class="home-market-row">${portrait(p.name,p.club,'small')}<div><strong>${esc(p.name)}</strong><small>${esc(p.club)} · ${gbp(p.priceTenths)}</small></div><b class="home-market-change ${mode}">${mode==='up'?'+':''}${((p.costChangeEvent??0)/10).toFixed(1)}m</b></div>`;
  const transfers=[...players].filter(p=>p.transferIn!==null||p.transferOut!==null).sort((a,b)=>(b.transferIn??0)-(a.transferIn??0)).slice(ui.marketPage*4,ui.marketPage*4+4);
  const max=Math.max(1,Math.ceil(players.length/4));
  return `<div class="home-market-section"><div class="home-subpanel-title"><span>↗</span><h3>Price increases</h3><b class="home-chip home-chip-green">Official changes</b></div>${risers.length?risers.map(p=>priceItem(p,'up')).join(''):'<p class="home-mini-empty">No recorded increases in the available round.</p>'}<div class="home-subpanel-title"><span>↘</span><h3>Price decreases</h3><b class="home-chip home-chip-rose">Official changes</b></div>${fallers.length?fallers.map(p=>priceItem(p,'down')).join(''):'<p class="home-mini-empty">No recorded decreases in the available round.</p>'}<p class="home-source-foot">ETA for next rise/fall: not calibrated · no countdown shown</p></div><div class="home-market-section home-transfer-section"><div class="home-subpanel-title"><span>⇄</span><h3>Transfers in &amp; out</h3><b class="home-chip home-chip-blue">This GW</b></div><div class="home-transfers-head"><span>PLAYER</span><span>IN</span><span>OUT</span><span>NET</span></div>${transfers.map(p=>{const net=(p.transferIn??0)-(p.transferOut??0);return `<div class="home-transfer-row"><strong>${esc(p.name)} <small>${esc(p.club)}</small></strong><span>${compact(p.transferIn)}</span><span>${compact(p.transferOut)}</span><b class="${net>=0?'is-up':'is-down'}">${net>0?'+':''}${compact(net)}</b></div>`;}).join('')||'<p class="home-mini-empty">Transfer counts are unavailable until FPL responds.</p>'}${pager('market',ui.marketPage,max)}</div>`;
}
function injuries(data:HomePayload|null,ui:HomeUi){
 const all=(data?.players??[]).filter(p=>p.status!=='a'&&(p.news.length>0||p.chance!==null));
 const filtered=all.filter(p=>ui.injuryFilter==='all'||(ui.injuryFilter==='suspension'?/suspend|ban|red card|yellow card/i.test(p.news):!/suspend|ban|red card|yellow card/i.test(p.news))).sort((a,b)=>(a.chance??101)-(b.chance??101)).slice(0,10);
 return `<div class="home-section-tabs">${tab('all','All',ui.injuryFilter==='all','home-injury')}${tab('injury','Injuries',ui.injuryFilter==='injury','home-injury')}${tab('suspension','Suspensions',ui.injuryFilter==='suspension','home-injury')}</div>${filtered.length?filtered.map(p=>`<div class="home-injury-row">${portrait(p.name,p.club,'small')}<div><strong>${esc(p.name)} <small>${esc(p.club)} · ${esc(p.position)}</small></strong><p>${esc(p.news||'Availability flagged by FPL')}</p></div><span class="home-risk">${p.chance===null?'⚠':`${p.chance}%`}</span></div>`).join(''):`<div class="home-blank"><strong>${data?.players.length?'No matching FPL flags':'Availability data not loaded'}</strong><p>${data?.players.length?'Select another filter for more players.':'Refresh live FPL data for reported injuries and suspensions.'}</p></div>`}<p class="home-source-foot">FPL public availability flags · verify club updates before transfers</p>`;
}
function videos(data:HomePayload|null){
  const channel=data?.video.channelUrl;
  const ids=data?.video.ids??[];
  if(!ids.length)return `<div class="home-video-empty"><div class="home-video-illustration">▶</div><div><strong>Your YouTube uploads, on your Home page.</strong><p>Set FPLVORTEX_YOUTUBE_CHANNEL_URL and FPLVORTEX_YOUTUBE_VIDEO_IDS on the server. Videos will appear here without inventing an unverified channel or uploads.</p></div>${channel?`<a target="_blank" rel="noopener noreferrer" href="${esc(channel)}" class="home-btn home-btn-blue">Open channel ↗</a>`:''}</div>`;
  return `<div class="home-video-grid">${ids.map((id,i)=>`<a class="home-video-card" href="https://www.youtube.com/watch?v=${esc(id)}" target="_blank" rel="noopener noreferrer"><div class="home-video-image"><img loading="lazy" alt="YouTube video ${i+1} thumbnail" src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" /><span>▶</span></div><strong>Watch FPLVORTEX video ${i+1} ↗</strong></a>`).join('')}</div>`;
}
export function renderHome(data:HomePayload|null,ui:HomeUi){
 const gw=data?.currentGameweek??7,next=data?.nextGameweek??gw+1;const sync=data?.live.entry?'Live squad':'Waiting for FPL';
 return `<div class="home-v4"><div class="home-welcome"><div><span class="home-overline">FPLVORTEX / THE DECISION DESK</span><h1>Home <span>— your matchday command center.</span></h1><p>Actual FPL facts, sharp fixture insights and a cleaner view of your next move.</p></div><div class="home-welcome-actions"><span class="home-live-label ${data?.live.entry?'is-connected':''}">${data?.live.entry?'● Source connected':'○ Source pending'}</span><button type="button" class="home-btn home-btn-blue" data-home-reload ${ui.waiting?'disabled':''}>${ui.waiting?'◌ Connecting…':'↻ Refresh live data'}</button></div></div>
 <div class="home-info-strip"><span>♛ ${esc(data?.entry?.teamName??'Your FPL team')} · Entry #${esc(data?.entryId??145784)}</span><span>OVERALL RANK <strong>${data?.entry?.overallRank?.toLocaleString()??'—'}</strong></span><span>SEASON POINTS <strong>${data?.entry?.overallPoints??'—'}</strong></span><span>GW${gw} POINTS <strong>${data?.entry?.eventPoints??'—'}</strong></span><span>${data?.asOf?`Source checked ${esc(new Date(data.asOf).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}))}`:'Not synced yet'}</span></div>
 <div class="home-three-grid"><section class="home-card home-card-pitch"><div class="home-card-heading"><div class="home-card-heading-left"><span class="home-heading-icon">♟</span><div><h2>My live squad</h2><p>Real FPL selections · captain and bench</p></div></div><div class="home-week-nav"><button type="button" data-home-gw="previous" ${gw<=1?'disabled':''} aria-label="Previous gameweek">‹</button><strong>GW ${gw}</strong><button type="button" data-home-gw="next" ${gw>=38?'disabled':''} aria-label="Next gameweek">›</button></div></div>${pitch(data,ui)}</section>
 <section class="home-card home-card-matches"><div class="home-card-heading"><div class="home-card-heading-left"><span class="home-heading-icon">⚽</span><div><h2>Match center</h2><p>Gameweek ${gw} · results &amp; live scores</p></div></div><span class="home-chip home-chip-blue">MATCHDAY</span></div>${fixtures(data,ui)}</section>
 <section class="home-card home-card-projections"><div class="home-card-heading"><div class="home-card-heading-left"><span class="home-heading-icon">◈</span><div><h2>GW${next} team projections</h2><p>Expected goals · clean sheets · win likelihood</p></div></div></div>${projections(data,ui)}</section></div>
 <div class="home-lower-grid"><section class="home-card home-card-leaders">${sectionTitle('🏆','Top players','FPL season statistics · selectable ranking')}${leaders(data,ui)}</section><section class="home-card home-card-market">${sectionTitle('↗','Market intelligence','Prices and transfers clearly separated')}${market(data,ui)}</section><section class="home-card home-card-injuries">${sectionTitle('✚','Injuries & suspensions','Public FPL availability reports')}${injuries(data,ui)}</section></div>
 <section class="home-card home-videos">${sectionTitle('▶','Latest FPLVORTEX videos','Your own YouTube channel, once configured')}${videos(data)}</section><div class="home-disclosure">ⓘ Actual rank, points, player records and match scores are source-reported when FPL responds. Next-week xG/CS%/Win% are an experimental independent team model using OpenFootball scores, not verified professional odds. Images are separately credited when rights-cleared; other players show initials.</div></div>`;
}