/** Public-domain OpenFootball fixtures and community-reported scores.
 * Independently computed, transparent team-level Poisson model.
 * This is NOT official FPL gameweek/fixture scoring or an FPL player model.
 */
export const PUBLIC_LEAGUE_SOURCE = 'https://github.com/openfootball/football.json/blob/master/2026-27/en.1.json';
export const PUBLIC_LEAGUE_RAW = 'https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json';
const SEASON = '2026/27';
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const fixed = (number, decimals = 3) => Number(number.toFixed(decimals));
const PRIOR_MATCHES = 6;
const HOME_PRIOR = 1.48;
const AWAY_PRIOR = 1.12;

export const TEAM_CODES = Object.freeze({
  'Arsenal FC':'ARS', 'Aston Villa FC':'AVL', 'AFC Bournemouth':'BOU',
  'Brentford FC':'BRE', 'Brighton & Hove Albion FC':'BHA', 'Chelsea FC':'CHE',
  'Coventry City FC':'COV', 'Crystal Palace FC':'CRY', 'Everton FC':'EVE',
  'Fulham FC':'FUL', 'Hull City AFC':'HUL', 'Ipswich Town FC':'IPS',
  'Leeds United FC':'LEE', 'Liverpool FC':'LIV', 'Manchester City FC':'MCI',
  'Manchester United FC':'MUN', 'Newcastle United FC':'NEW',
  'Nottingham Forest FC':'NFO', 'Sunderland AFC':'SUN', 'Tottenham Hotspur FC':'TOT'
});

const finiteScore = value => Number.isInteger(value) && value >= 0 && value <= 30;
function validDate(value){
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
}
export function parseOpenFootball(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.matches) || raw.matches.length > 600 || raw.matches.length === 0) throw new TypeError('Invalid OpenFootball match list');
  if (typeof raw.name !== 'string' || !raw.name.includes('2026/27')) throw new RangeError('Expected 2026/27 season');
  const seen = new Set();
  const matches = raw.matches.map((row, index) => {
    if (!row || typeof row !== 'object' || !/^Matchday ([1-9]|[12]\d|3[0-8])$/.test(row.round)) throw new RangeError(`Invalid matchday at row ${index}`);
    if (!validDate(row.date)) throw new RangeError(`Invalid match date at row ${index}`);
    const gw = Number(row.round.slice('Matchday '.length));
    if (!Object.hasOwn(TEAM_CODES, row.team1) || !Object.hasOwn(TEAM_CODES, row.team2) || row.team1 === row.team2) throw new RangeError(`Unknown or duplicate teams at row ${index}`);
    const key = `${gw}/${row.team1}/${row.team2}`;
    if (seen.has(key)) throw new RangeError(`Duplicate fixture at row ${index}`);
    seen.add(key);
    // Only FT score objects are validated as reported results.
    // Placeholder arrays such as [0,0] MUST NOT be treated as verified draws.
    const score = row.score && !Array.isArray(row.score) && Array.isArray(row.score.ft) ? row.score.ft : null;
    if (score && (score.length !== 2 || !score.every(finiteScore))) throw new RangeError(`Invalid final score at row ${index}`);
    return {gameweek:gw,date:row.date,home:row.team1,away:row.team2,homeCode:TEAM_CODES[row.team1],awayCode:TEAM_CODES[row.team2],score:score?[...score]:null};
  });
  return {season:SEASON,source:PUBLIC_LEAGUE_SOURCE,sourceLicense:'CC0 / public domain (upstream declaration)',matches};
}
function pastMatches(season, targetGw, targetDate) {
  return season.matches.filter(match => match.gameweek < targetGw && match.date < targetDate && match.score);
}
function rates(history, team, home) {
  const matches = history.filter(match => home ? match.home === team : match.away === team);
  let scored=0, conceded=0;
  for (const match of matches) {
    scored += home ? match.score[0] : match.score[1];
    conceded += home ? match.score[1] : match.score[0];
  }
  // Home/away-specific base rates with six-match independent prior strength.
  return {n:matches.length,scored,conceded};
}
/** Forecast using only completed, earlier matchdays as inputs. */
export function forecastMatch(season, match) {
  const history=pastMatches(season,match.gameweek,match.date);
  const home=rates(history,match.home,true),away=rates(history,match.away,false);
  const homeAttack=(home.scored+HOME_PRIOR*PRIOR_MATCHES)/(home.n+PRIOR_MATCHES);
  const awayDefence=(away.conceded+HOME_PRIOR*PRIOR_MATCHES)/(away.n+PRIOR_MATCHES);
  const awayAttack=(away.scored+AWAY_PRIOR*PRIOR_MATCHES)/(away.n+PRIOR_MATCHES);
  const homeDefence=(home.conceded+AWAY_PRIOR*PRIOR_MATCHES)/(home.n+PRIOR_MATCHES);
  const expectedHome=clamp(homeAttack*awayDefence/HOME_PRIOR,.15,4.5);
  const expectedAway=clamp(awayAttack*homeDefence/AWAY_PRIOR,.15,4.5);
  return {
    homeGoals:fixed(expectedHome),awayGoals:fixed(expectedAway),
    homeCsProbability:fixed(Math.exp(-expectedAway)),awayCsProbability:fixed(Math.exp(-expectedHome)),
    priorMatches:history.length,
    trainingCutoff:`before GW${match.gameweek} and ${match.date}`,
    model:'Vortex independent shrinkage/Poisson baseline v0.5'
  };
}
function difficultyRows(season,gameweek){
  const matches=season.matches.filter(row=>row.gameweek===gameweek);
  const rows=[];
  for(const match of matches){
    const prediction=forecastMatch(season,match);
    rows.push({code:match.homeCode,team:match.home,opponent:match.awayCode,venue:'H',gameweek,date:match.date,projectedGoals:prediction.homeGoals,csProbability:prediction.homeCsProbability,opponentGoals:prediction.awayGoals,score:match.score?match.score.join('-'):null,rawDifficulty:prediction.awayGoals-prediction.homeGoals});
    rows.push({code:match.awayCode,team:match.away,opponent:match.homeCode,venue:'A',gameweek,date:match.date,projectedGoals:prediction.awayGoals,csProbability:prediction.awayCsProbability,opponentGoals:prediction.homeGoals,score:match.score?[...match.score].reverse().join('-'):null,rawDifficulty:prediction.homeGoals-prediction.awayGoals});
  }
  // Relative within-GW bands, not the official Premier League/FPL difficulty rating.
  const ranked=[...rows].sort((a,b)=>a.rawDifficulty-b.rawDifficulty||a.code.localeCompare(b.code));
  const rankedFdr=new Map(ranked.map((row,index)=>[row.code,Math.min(5,1+Math.floor(index*5/ranked.length))]));
  return rows.map(row=>({...row,fdr:rankedFdr.get(row.code)??3,projectedGoals:fixed(row.projectedGoals,2),csProbability:fixed(row.csProbability,3)}));
}
export function fixtureMatrix(season,startGw=7,weeks=10,sortGw=startGw) {
  if (![startGw,weeks,sortGw].every(Number.isInteger)||startGw<1||startGw>38||weeks<1||weeks>10||startGw+weeks>39||sortGw<startGw||sortGw>=startGw+weeks)throw new RangeError('Invalid matrix gameweek span');
  const all=Array.from({length:weeks},(_,i)=>difficultyRows(season,startGw+i));
  const byCode=new Map();
  for(let index=0;index<weeks;index++)for(const fixture of all[index]){
    const team=byCode.get(fixture.code)??{code:fixture.code,name:fixture.team,fixtures:[]};
    team.fixtures.push(fixture);byCode.set(fixture.code,team);
  }
  const rows=[...byCode.values()].sort((a,b)=>{
    const aa=a.fixtures.find(x=>x.gameweek===sortGw)?.fdr??6;
    const bb=b.fixtures.find(x=>x.gameweek===sortGw)?.fdr??6;
    return aa-bb || a.code.localeCompare(b.code);
  });
  return {source:season.source,license:season.sourceLicense,season:SEASON,startGw,weeks,sortGw,model:'Independent team-level shrinkage/Poisson baseline, not official FPL FDR',rows};
}
const asTimestamp = date => new Date(`${date}T23:59:59Z`).getTime();
export function leagueCoverage(season,now=new Date()) {
  const currentTime=now.getTime();
  const counts=[];
  for(let gw=1;gw<=38;gw++){
    const matches=season.matches.filter(match=>match.gameweek===gw);
    if(!matches.length)continue;
    const due=matches.filter(match=>asTimestamp(match.date)<=currentTime);
    const scored=due.filter(match=>match.score);
    counts.push({gameweek:gw,scheduled:matches.length,due:due.length,reported:scored.length,missing:due.length-scored.length,complete:due.length===matches.length&&scored.length===matches.length});
  }
  return {season:SEASON,provider:'OpenFootball community',license:season.sourceLicense,source:season.source,fixtureCount:season.matches.length,
    reportedResults:season.matches.filter(m=>m.score&&asTimestamp(m.date)<=currentTime).length,
    scoredWeeks:counts.filter(row=>row.reported>0).map(row=>row.gameweek),
    coverage:counts,warning:'Community-reported league scores/fixtures may be stale or incomplete; player minutes, official FPL points, injuries and xG/xA are NOT included.'};
}
const mean = values => values.length ? values.reduce((sum,x)=>sum+x,0)/values.length : null;
const poissonNll=(lambda, observed)=> lambda - observed*Math.log(lambda) + Array.from({length:observed},(_,i)=>Math.log(i+1)).reduce((sum,x)=>sum+x,0);
/** Clearly retrospective: generated now using only previous-GW results, not independently time-archived. */
export function retrospectiveTeamBacktest(season,startGw=1,endGw=6,now=new Date()) {
  if(!Number.isInteger(startGw)||!Number.isInteger(endGw)||startGw<1||endGw>38||endGw<startGw)throw new RangeError('Invalid retrospective range');
  const nowMillis=now.getTime();
  const summaries=[];
  for(let gw=startGw;gw<=endGw;gw++){
    const due=season.matches.filter(match=>match.gameweek===gw&&asTimestamp(match.date)<=nowMillis);
    const valid=due.filter(match=>match.score);
    const errors=[],squares=[],briers=[],baselines=[],poisson=[];
    for(const match of valid){
      const forecast=forecastMatch(season,match);
      for(const [pred,actual] of [
        [forecast.homeGoals,match.score[0]],
        [forecast.awayGoals,match.score[1]]
      ]){
        const error=pred-actual;
        errors.push(Math.abs(error));squares.push(error*error);
        poisson.push(poissonNll(pred,actual));
      }
      const homeCleanSheet=match.score[1]===0?1:0;
      const awayCleanSheet=match.score[0]===0?1:0;
      briers.push((forecast.homeCsProbability-homeCleanSheet)**2,(forecast.awayCsProbability-awayCleanSheet)**2);
      baselines.push(Math.abs(HOME_PRIOR-match.score[0]),Math.abs(AWAY_PRIOR-match.score[1]));
    }
    summaries.push({gameweek:gw,scheduled:due.length,withReportedScores:valid.length,missingScores:due.length-valid.length,
      evaluatedTeams:errors.length,goalMae:mean(errors)===null?null:fixed(mean(errors)),
      goalRmse:mean(squares)===null?null:fixed(Math.sqrt(mean(squares))),
      csBrier:mean(briers)===null?null:fixed(mean(briers)),
      poissonNll:mean(poisson)===null?null:fixed(mean(poisson)),
      baselineGoalMae:mean(baselines)===null?null:fixed(mean(baselines))});
  }
  return {mode:'retrospective-replay-not-archived-predictions',trained:false,season:SEASON,source:season.source,
    warnings:['These are retrospective team-goal and clean-sheet metrics, NOT player FPL points or independently archived pre-deadline forecasts.','Results are included only if the community source reports a full-time score before the evaluation cutoff. Missing results are never scored as 0–0.'],
    byGameweek:summaries};
}