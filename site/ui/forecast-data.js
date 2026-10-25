export const FORECAST_HORIZON = 8;

export function numberOrNull(value) {
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

export function upcomingGameweeks(events,limit=FORECAST_HORIZON,now=Date.now()) {
  const ordered=[...events].filter(event=>Number.isInteger(event.id)).sort((first,second)=>first.id-second.id);
  const next=ordered.find(event=>event.is_next)??ordered.find(event=>!event.finished&&(!event.is_current||Date.parse(event.deadline_time)>now));
  return next?ordered.filter(event=>event.id>=next.id).slice(0,limit):[];
}

export function completedClubGames(fixtures) {
  const matches=new Map(),seen=new Set();
  for(const fixture of fixtures) {
    if(!(fixture.finished||fixture.finished_provisional)||seen.has(fixture.id))continue;
    if(fixture.id!==undefined)seen.add(fixture.id);
    for(const team of [fixture.team_h,fixture.team_a])matches.set(team,(matches.get(team)??0)+1);
  }
  return matches;
}

export function seasonStatistics(player,completedClubMatches) {
  const minutes=numberOrNull(player.minutes);
  const per90=value=>minutes>0&&numberOrNull(value)!==null?Number(value)*90/minutes:null;
  const xg=numberOrNull(player.expected_goals),xa=numberOrNull(player.expected_assists);
  return {
    price:numberOrNull(player.now_cost)===null?null:Number(player.now_cost)/10,
    form:numberOrNull(player.form),ppg:numberOrNull(player.points_per_game),ownership:numberOrNull(player.selected_by_percent),
    minutes:completedClubMatches>0&&minutes!==null?minutes/completedClubMatches:null,
    points:numberOrNull(player.total_points),points90:per90(player.total_points),
    goals:numberOrNull(player.goals_scored),xg,xg90:per90(xg),assists90:per90(player.assists),xa90:per90(xa),
    xgi:numberOrNull(player.expected_goal_involvements)??(xg!==null&&xa!==null?xg+xa:null),
    defensive:numberOrNull(player.defensive_contribution),defensive90:per90(player.defensive_contribution),
    cleanSheets:numberOrNull(player.clean_sheets),xgc:numberOrNull(player.expected_goals_conceded),
  };
}

function availability(player) {
  if(['s','u','n'].includes(player.status))return 0;
  const chance=numberOrNull(player.chance_of_playing_next_round);
  if(chance!==null)return Math.max(0,Math.min(1,chance/100));
  return player.status==='i'?0:player.status==='d'?0.5:1;
}

export function projectedOutcomes(forecast,player,{assumeStarts=false,scoreFixture}={}) {
  const models=forecast?.fixtureModels??[];
  let xg=0,xa=0,noGoal=1,noAssist=1,noReturn=1,minutes=0,start=0,points=0;
  for(const original of models) {
    const model=assumeStarts?{...original,minutes:{...original.minutes,p60:availability(player),pSub:0,pStart:availability(player)}}:original;
    const distribution=model.minutes;
    let goal=0,assist=0,attackingReturn=0;
    for(const [weight,played] of [[distribution.p60,distribution.minutes60],[distribution.pSub,distribution.minutesShort]]) {
      const goals=model.goals90*played/90,assists=model.assists90*played/90;
      xg+=weight*goals;xa+=weight*assists;minutes+=weight*played;
      goal+=weight*-Math.expm1(-goals);
      assist+=weight*-Math.expm1(-assists);
      // Goal and assist outcomes share the same appearance state.
      attackingReturn+=weight*-Math.expm1(-(goals+assists));
    }
    noGoal*=1-goal;noAssist*=1-assist;noReturn*=1-attackingReturn;
    start+=distribution.pStart??distribution.p60;
    if(assumeStarts) {
      if(typeof scoreFixture!=='function')throw new TypeError('Starting scenarios require the shared points engine.');
      points+=Object.values(scoreFixture(model)).reduce((total,value)=>total+value,0);
    }
  }
  return {xg,xa,goal:1-noGoal,assist:1-noAssist,returnChance:1-noReturn,minutes,
    start:models.length?start/models.length:0,points:assumeStarts?points:forecast?.xPts??0};
}

export function sortForecastRows(rows,key,direction=-1) {
  return [...rows].sort((first,second)=>{
    const left=key==='name'?first.name:first.values[key],right=key==='name'?second.name:second.values[key];
    if(left===null||left===undefined||right===null||right===undefined)return left==null&&right==null?first.id-second.id:left==null?1:-1;
    return direction*(typeof left==='string'?left.localeCompare(right):left-right)||first.id-second.id;
  });
}

export function pageRows(rows,page,pageSize) {
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  const current=Math.max(0,Math.min(page,pages-1));
  return {page:current,pages,total:rows.length,rows:rows.slice(current*pageSize,(current+1)*pageSize)};
}
