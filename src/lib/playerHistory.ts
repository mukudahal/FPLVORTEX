/** Public, per-fixture CURRENT-SEASON history from FPL element-summary. */
export type RangeMetric = 'starts' | 'minutes' | 'totalPoints' | 'goals' | 'assists' | 'cleanSheets' | 'xG' | 'xA';
export const RANGE_METRICS: Array<{ key: RangeMetric; label: string; unit: string }> = [
 {key:'starts',label:'Starts',unit:''},
 {key:'minutes',label:'Minutes',unit:'min'},
 {key:'totalPoints',label:'FPL points',unit:'pts'},
 {key:'goals',label:'Goals',unit:''},
 {key:'assists',label:'Assists',unit:''},
 {key:'cleanSheets',label:'Clean sheets',unit:''},
 {key:'xG',label:'Expected goals',unit:'xG'},
 {key:'xA',label:'Expected assists',unit:'xA'},
];
export interface OfficialMatchHistory {
 fixtureId:number;
 gw:number;
 starts:number|null;
 minutes:number|null;
 totalPoints:number|null;
 goals:number|null;
 assists:number|null;
 cleanSheets:number|null;
 xG:number|null;
 xA:number|null;
}
export interface OfficialPlayerHistory {
 playerId:number;
 source:'official-fpl-element-summary';
 capturedAt:string;
 matches:OfficialMatchHistory[];
}
function num(value:unknown, signed=false):number|null {
 if(typeof value!=='number' && typeof value!=='string')return null;
 if(typeof value==='string' && !value.trim())return null;
 const number=Number(value);
 return Number.isFinite(number) && (signed||number>=0) ? number : null;
}
export function normalizePlayerMatchHistory(payload:unknown,playerId:number):OfficialMatchHistory[] {
 if(!payload || typeof payload!=='object' || !Array.isArray((payload as {history?:unknown}).history))throw Error('FPL player history missing');
 const seen=new Set<number>();
 const out:OfficialMatchHistory[]=[];
 for(const raw of (payload as {history:unknown[]}).history) {
  if(!raw || typeof raw!=='object')throw Error('Invalid FPL history row');
  const row=raw as Record<string,unknown>;
  const fixtureId=num(row.fixture),gw=num(row.round),el=num(row.element);
  if(!Number.isInteger(fixtureId)||!Number.isInteger(gw)||!fixtureId||!gw||gw>38||(el!==null&&el!==playerId)||seen.has(fixtureId))throw Error('Invalid or duplicate FPL fixture/identity');
  seen.add(fixtureId);
  out.push({fixtureId,gw,
   starts:num(row.starts),minutes:num(row.minutes),totalPoints:num(row.total_points,true),
   goals:num(row.goals_scored),assists:num(row.assists),cleanSheets:num(row.clean_sheets),
   xG:num(row.expected_goals),xA:num(row.expected_assists)});
 }
 return out.sort((a,b)=>a.gw-b.gw||a.fixtureId-b.fixtureId);
}
export function summarizePlayerRange(matches:OfficialMatchHistory[],startGw:number,endGw:number):Record<RangeMetric,number|null> {
 const relevant=matches.filter(row=>row.gw>=startGw&&row.gw<=endGw);
 const result={} as Record<RangeMetric,number|null>;
 for(const {key} of RANGE_METRICS) {
  const vals=relevant.map(row=>row[key]);
  result[key]=vals.length && vals.every((x):x is number=>x!==null&&Number.isFinite(x))
    ? Math.round(vals.reduce((sum,x)=>sum+(x??0),0)*100)/100 : null;
 }
 return result;
}
