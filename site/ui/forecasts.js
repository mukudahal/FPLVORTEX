import {playerPortrait} from './player-images.js';
import {availabilityFlag} from './availability.js';
import {expectedFixturePoints} from '/model/playerModel.js';
import {FORECAST_HORIZON,completedClubGames,seasonStatistics,projectedOutcomes,sortForecastRows,pageRows,upcomingGameweeks} from './forecast-data.js';

const positions={1:'GK',2:'DEF',3:'MID',4:'FWD'};
const columns=[
  ['price','£','Current FPL price in millions'],['form','Form','Official FPL form'],['ppg','PPG','Official points per appearance'],
  ['ownership','Own<small>%</small>','Current official ownership'],['minutes','Mins<small>per<br>game</small>','Season minutes divided by completed club fixtures, including nonappearances'],
  ['points','Pts','Season FPL points'],['points90','Pts<small>per 90</small>','Season points per 90 minutes'],
  ['xg','xG','Observed season expected goals'],['xg90','xG<small>per 90</small>','Observed season expected goals per 90'],
  ['assists90','A<small>per 90</small>','Actual season assists per 90'],['xgi','xGI','Observed season expected goal involvement'],
  ['defensive','DC','Season defensive contributions'],['defensive90','DC<small>per 90</small>','Season defensive contributions per 90'],
  ['cleanSheets','CS','Season clean sheets'],['xgc','xGC','Observed season expected goals conceded'],
  ['nextPoints','xP','VORTEX expected points next gameweek'],['horizonPoints','Σ xP','VORTEX expected points across the selected horizon'],
];

export function createForecastView(getState,escape,onSelect) {
  const root=document.querySelector('#view-forecasts');
  const search=root.querySelector('#search'),position=root.querySelector('#position'),horizon=root.querySelector('#horizon');
  const price=root.querySelector('#forecast-price'),ownership=root.querySelector('#forecast-ownership');
  const starting=root.querySelector('#forecast-starting');
  const pageSize=10;
  let mainPage=0,attackPage=0,mainSort='horizonPoints',mainDirection=-1,attackSort='returnChance',attackDirection=-1;
  let lastFilter='',renderedSignature='',cachedRows=[];
  const fixed=(value,digits=2)=>Number.isFinite(value)?value.toFixed(digits):'—';
  const percentage=value=>Number.isFinite(value)?(value*100).toFixed(1)+'%':'—';

  function buildRows() {
    const state=getState();
    const signature=[state.capturedAt,state.source,state.horizon,starting.checked].join(':');
    if(signature===renderedSignature)return cachedRows;
    const completed=completedClubGames(state.fixtures);
    cachedRows=state.rows.map(row=>{
      const weekly=row.weekly.map(forecast=>({...forecast,outcomes:projectedOutcomes(forecast,row.player,{assumeStarts:starting.checked,scoreFixture:expectedFixturePoints})}));
      const next=weekly[0]?.outcomes;
      return {...row,weekly,values:{...seasonStatistics(row.player,completed.get(row.player.team)??0),nextPoints:next?.points??0,
        horizonPoints:weekly.reduce((total,week)=>total+week.outcomes.points,0),goal:next?.goal??0,assist:next?.assist??0,
        projectedXg:next?.xg??0,projectedXa:next?.xa??0,returnChance:next?.returnChance??0,start:next?.start??0}};
    });
    renderedSignature=signature;return cachedRows;
  }

  function filteredRows() {
    const query=search.value.trim().toLocaleLowerCase(),selectedPosition=Number(position.value),maximum=Number(price.value);
    return buildRows().filter(row=>{
      if(selectedPosition&&row.position!==selectedPosition)return false;
      if(query&&!`${row.name} ${row.clubName}`.toLocaleLowerCase().includes(query))return false;
      if(maximum&&row.price>maximum)return false;
      if(ownership.value==='low5'&&!(row.values.ownership<5))return false;
      if(ownership.value==='low10'&&!(row.values.ownership<10))return false;
      if(ownership.value==='high10'&&!(row.values.ownership>=10))return false;
      if(ownership.value==='high25'&&!(row.values.ownership>=25))return false;
      return true;
    });
  }

  function fixtureTiles(row,onlyNext=false) {
    const state=getState(),weeks=onlyNext?state.weeks.slice(0,1):state.weeks;
    const teams=new Map(state.bootstrap.teams.map(team=>[team.id,team]));
    return `<div class="forecast-fixtures ${onlyNext?'single':''}" style="--forecast-fixture-count:${Math.min(4,weeks.length)}">${weeks.map(week=>{
      const fixtures=state.fixtures.filter(fixture=>fixture.event===week.id&&[fixture.team_h,fixture.team_a].includes(row.player.team));
      const outcome=row.weekly.find(item=>item.gw===week.id)?.outcomes;
      const title=`GW${week.id}: `+(fixtures.length?fixtures.map(fixture=>`${teams.get(fixture.team_h===row.player.team?fixture.team_a:fixture.team_h)?.name??'TBC'} (${fixture.team_h===row.player.team?'home':'away'})`).join(' + '):'No scheduled fixture');
      const difficulty=fixtures.length?Math.max(...fixtures.map(fixture=>fixture.team_h===row.player.team?fixture.team_h_difficulty:fixture.team_a_difficulty)):0;
      const labels=fixtures.map(fixture=>{
        const home=fixture.team_h===row.player.team;
        const opponent=teams.get(home?fixture.team_a:fixture.team_h)?.short_name??'TBC';
        return `${opponent.toUpperCase()}[${home?'H':'A'}]`;
      });
      return `<span class="forecast-fixture" data-difficulty="${difficulty}" title="${escape(title)} · ${fixed(outcome?.points)} xP"><small>GW${week.id}</small><b>${labels.length?labels.map(label=>`<span>${escape(label)}</span>`).join(''):'—'}</b><span>${fixed(outcome?.points,1)}</span></span>`;
    }).join('')}</div>`;
  }

  function playerCell(row,compact=false) {
    return `<div class="forecast-player-cell"><button class="forecast-player ${compact?'compact':''}" data-forecast-player="${row.id}" aria-haspopup="dialog" aria-controls="forecast-player-dialog" title="Inspect ${escape(row.name)}">${playerPortrait(row.player,escape)}<span><strong>${escape(row.name)}</strong><small>${escape(row.club)} · ${positions[row.position]}</small>${compact?`<small>Start ${percentage(row.values.start)}</small>`:''}</span></button>${availabilityFlag(row.player,escape)}</div>`;
  }

  function header(key,label,title,table='main') {
    const selected=table==='main'?mainSort:attackSort,direction=table==='main'?mainDirection:attackDirection;
    return `<th scope="col" aria-sort="${selected===key?(direction===-1?'descending':'ascending'):'none'}"><button data-forecast-sort="${key}" data-forecast-table="${table}" title="${escape(title)}"><span class="forecast-heading-label">${label}</span><span class="forecast-sort-indicator" aria-hidden="true">${selected===key?(direction===-1?'↓':'↑'):'↕'}</span></button></th>`;
  }

  function pager(table,page) {
    return `<span class="forecast-page-count">${page.total?`${page.page*pageSize+1}–${Math.min((page.page+1)*pageSize,page.total)} of ${page.total}`:'No matching players'} · Page ${page.page+1} of ${page.pages}</span><div class="forecast-page-buttons"><button type="button" data-forecast-page="-1" data-forecast-table="${table}" ${page.page===0?'disabled':''} aria-label="Previous ${table==='main'?'statistics':'next-gameweek'} page">← Prev</button><button type="button" data-forecast-page="1" data-forecast-table="${table}" ${page.page>=page.pages-1?'disabled':''} aria-label="Next ${table==='main'?'statistics':'next-gameweek'} page">Next →</button></div>`;
  }

  function formatValue(key,value) {
    if(value===null||value===undefined)return '—';
    if(['points','goals','defensive','cleanSheets'].includes(key))return fixed(value,0);
    if(key==='ownership')return fixed(value,1)+'%';
    if(['price','form','ppg'].includes(key))return fixed(value,1);
    if(key==='minutes')return fixed(value,0)+'′';
    return fixed(value,2);
  }

  function render() {
    const state=getState();if(!state.bootstrap)return;
    const filter=[search.value,position.value,price.value,ownership.value,starting.checked,state.horizon].join(':');
    if(filter!==lastFilter){mainPage=0;attackPage=0;lastFilter=filter;}
    const available=upcomingGameweeks(state.bootstrap.events,FORECAST_HORIZON);
    root.querySelectorAll('[data-forecast-horizon]').forEach(button=>{
      const weeks=Number(button.dataset.forecastHorizon);button.disabled=weeks>available.length;
      button.setAttribute('aria-pressed',String(weeks===state.horizon));
    });
    root.querySelectorAll('[data-forecast-position]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.forecastPosition===position.value)));
    const rows=filteredRows();
    const fixtureCounts=new Map();
    for(const fixture of state.fixtures)if(state.weeks.some(week=>week.id===fixture.event))for(const team of [fixture.team_h,fixture.team_a]){
      const key=fixture.event+':'+team;fixtureCounts.set(key,(fixtureCounts.get(key)??0)+1);
    }
    const maxFixtures=Math.max(1,...fixtureCounts.values()),fixtureRows=Math.max(1,Math.ceil(state.weeks.length/4));
    root.style.setProperty('--forecast-row-height',Math.max(108,fixtureRows*(48+(maxFixtures-1)*14)+(fixtureRows-1)*4+8)+'px');
    const main=pageRows(sortForecastRows(rows,mainSort,mainDirection),mainPage,pageSize);mainPage=main.page;
    const attack=pageRows(sortForecastRows(rows,attackSort,attackDirection),attackPage,pageSize);attackPage=attack.page;
    root.querySelector('#forecast-head').innerHTML=`<tr>${header('name','Player','Player name')}<th scope="col" class="fixtures-heading">Next fixtures<small>${state.weeks.length} GW · xP per GW</small></th>${columns.map(([key,label,title])=>header(key,key==='horizonPoints'?`xP ${state.weeks.length}`:label,title)).join('')}<th scope="col" class="forecast-add-heading">+</th></tr>`;
    root.querySelector('#players-body').innerHTML=main.rows.map(row=>`<tr class="${state.selected===row.id?'selected':''}"><td>${playerCell(row)}</td><td>${fixtureTiles(row)}</td>${columns.map(([key])=>`<td class="${['nextPoints','horizonPoints'].includes(key)?'forecast-xp':''}" title="${escape(columns.find(column=>column[0]===key)[2])}">${formatValue(key,row.values[key])}</td>`).join('')}<td><button type="button" class="add-player ${state.squad.includes(row.id)?'added':''}" data-add="${row.id}" aria-label="${state.squad.includes(row.id)?'Remove':'Add'} ${escape(row.name)}">${state.squad.includes(row.id)?'✓':'+'}</button></td></tr>`).join('')||`<tr><td colspan="${columns.length+3}" class="forecast-empty">No players match these filters.</td></tr>`;
    root.querySelector('#forecast-main-pager').innerHTML=pager('main',main);
    root.querySelector('#forecast-attack-head').innerHTML=`<tr>${header('name','Player','Player and estimated starting chance','attack')}<th scope="col">Fixture</th>${[['goal','Goal','Chance of at least one goal'],['assist','Assist','Chance of at least one assist'],['projectedXg','xG','Projected next-gameweek goals'],['projectedXa','xA','Projected next-gameweek assists'],['returnChance','Return','Chance of at least one goal or assist']].map(([key,label,title])=>header(key,label,title,'attack')).join('')}</tr>`;
    root.querySelector('#forecast-attack-body').innerHTML=attack.rows.map(row=>`<tr><td>${playerCell(row,true)}</td><td>${fixtureTiles(row,true)}</td><td><span class="forecast-probability goal">${percentage(row.values.goal)}</span></td><td><span class="forecast-probability assist">${percentage(row.values.assist)}</span></td><td>${fixed(row.values.projectedXg)}</td><td>${fixed(row.values.projectedXa)}</td><td><span class="forecast-probability return">${percentage(row.values.returnChance)}</span></td></tr>`).join('')||'<tr><td colspan="8" class="forecast-empty">No players match these filters.</td></tr>';
    root.querySelector('#forecast-attack-pager').innerHTML=pager('attack',attack);
    root.querySelector('#forecast-next-gw').textContent=state.weeks[0]?'GW '+state.weeks[0].id:'Season complete';
    root.querySelector('#forecast-window-label').textContent=state.weeks.length?`GW${state.weeks[0].id}–GW${state.weeks.at(-1).id}`:'No future gameweeks';
    root.querySelector('#table-footer').textContent=`${state.source==='sample'?'Illustrative data':state.source==='imported'?'Imported FPL snapshot':'Official FPL statistics'} · VORTEX model estimates${starting.checked?' · Starting scenario (availability preserved)':''}. Historical xG is on the left; projected xG is on the right.`;
    root.querySelector('#forecast-scenario-note').textContent=starting.checked?'Scenario: a 60+ minute start when available. Injury and suspension constraints still apply.':'Expected minutes and current availability. Goal/assist outcomes share the same appearance model.';
  }

  root.addEventListener('click',event=>{
    const availability=event.target.closest('[data-availability-player]');
    if(availability){document.dispatchEvent(new CustomEvent('vortex:availability',{detail:{playerId:Number(availability.dataset.availabilityPlayer),trigger:availability}}));return;}
    const horizonButton=event.target.closest('[data-forecast-horizon]');
    if(horizonButton){horizon.value=horizonButton.dataset.forecastHorizon;horizon.dispatchEvent(new Event('change'));return;}
    const positionButton=event.target.closest('[data-forecast-position]');
    if(positionButton){position.value=positionButton.dataset.forecastPosition;position.dispatchEvent(new Event('change'));return;}
    const sort=event.target.closest('[data-forecast-sort]');
    if(sort){
      if(sort.dataset.forecastTable==='attack'){attackDirection=attackSort===sort.dataset.forecastSort?-attackDirection:-1;attackSort=sort.dataset.forecastSort;attackPage=0;}
      else{mainDirection=mainSort===sort.dataset.forecastSort?-mainDirection:-1;mainSort=sort.dataset.forecastSort;mainPage=0;}
      render();return;
    }
    const paging=event.target.closest('[data-forecast-page]');
    if(paging){if(paging.dataset.forecastTable==='main')mainPage+=Number(paging.dataset.forecastPage);else attackPage+=Number(paging.dataset.forecastPage);render();return;}
    const player=event.target.closest('[data-forecast-player]');
    if(player){onSelect(Number(player.dataset.forecastPlayer));render();const dialog=root.querySelector('#forecast-player-dialog');if(!dialog.open)dialog.showModal();return;}
    if(event.target.closest('[data-close-forecast]'))root.querySelector('#forecast-player-dialog').close();
  });
  for(const input of [price,ownership,starting])input.addEventListener('change',render);
  const dialog=root.querySelector('#forecast-player-dialog');
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>root.querySelector(`[data-forecast-player="${getState().selected}"]`)?.focus());
  return {render,onShow(){render();}};
}
