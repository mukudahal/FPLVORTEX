import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseCsvRows } from '../server/odds';
import type { Report } from './export-my-team-plan';
import type { Snapshot } from '../src/lib/types';
import { filenameProjectionDate } from '../src/lib/projectionFreshness';

const digest=(raw:Buffer)=>createHash('sha256').update(raw).digest('hex');
const official='https://fantasy.premierleague.com/api/';
const access='Public read-only endpoint. Private research use here. Redistribution rights have not been established.';
type Source={name:string;class:string;provider:string;url:string;path:string;seasons:string[];gameweeks:number[]|null;players:number|null;
  teams:number|null;credentials:string;subscription:string;retrievedAt:string|null;providerUpdatedAt:string|null;
  completeness:string;access:string;lineage:string;detail?:unknown};

export async function auditPlanSources(snapshot:Snapshot,report:Report) {
  const sources:Source[]=[];
  const gws=snapshot.gameweeks.map(g=>g.id);
  const row:Source={name:'',class:'official observations',provider:'Premier League / FPL',url:official,path:'server/officialSnapshot.ts',
    seasons:[report.season],gameweeks:gws,players:snapshot.players.length,teams:snapshot.teams.length,credentials:'none',subscription:'none',
    retrievedAt:snapshot.meta.generatedAt,providerUpdatedAt:null,completeness:'',access,lineage:'Primary public FPL response'};
  const add=(entry:Partial<Source>&Pick<Source,'name'|'completeness'>)=>sources.push({...row,...entry});
  add({name:'Player roster, teams, prices, metrics, flags and GW deadlines',url:official+'bootstrap-static/',completeness:'Measured at snapshot. Subfield coverage is recorded when the deployment provides a quality audit.',detail:snapshot.meta.playerDataQuality??null});
  add({name:'Scheduled fixtures, assignments and results',url:official+'fixtures/',players:null,completeness:snapshot.fixtures.length+' fixtures; '+snapshot.fixtures.filter(f=>!f.kickoffTime).length+' missing kickoff times. Future assignments may change.'});
  add({name:'Official expected points',class:'third-party predictions',url:official+'bootstrap-static/',path:'server/normalize.ts',gameweeks:[snapshot.meta.nextEventId],
    completeness:'Frozen normalized epNext can fall back to epThis in old records. Raw missingness cannot be recovered.',lineage:'Official FPL forecast with opaque inputs. Benchmark only.'});
  add({name:'Per-player match history',url:official+'element-summary/{id}/',path:'src/lib/playerHistory.ts',gameweeks:null,players:null,teams:null,retrievedAt:null,completeness:'On demand. Full roster was not fetched for each personal report.'});
  add({name:'Official event outcomes',class:'historical outcomes',url:official+'event/{gw}/live/',path:'scripts/settle-forecasts.ts',gameweeks:null,players:null,teams:null,retrievedAt:null,completeness:'Final and checked event required. Settlement observations are dated separately below.'});
  for (const [name,suffix] of [['Manager profile',''],['Manager history','history/'],['Manager transfers','transfers/'],['Public deadline picks','event/{gw}/picks/']]) {
    add({name,url:official+'entry/'+report.entryId+'/'+suffix,path:'server/fpl.ts',players:suffix.includes('picks')?report.openingState.squad.length:null,teams:null,
      gameweeks:suffix==='history/'?report.history?.map(h=>h.gw)??null:[report.currentGameweek],retrievedAt:report.provenance?.entryAt??null,
      completeness:'Normalized public entry capture; individual endpoint retrieval times and unpublished actions are unavailable. '+report.stateBasis});
  }
  for(const l of report.miniLeagues??[]) add({name:l.name??'League '+l.id,url:official+'leagues-classic/'+l.id+'/standings/',path:'server/fpl.ts',
    gameweeks:[report.currentGameweek],players:l.rival?.squad?.squad.length??null,teams:null,retrievedAt:l.observedAt,
    completeness:'Returned standings page only. One significant rival assessed when official picks available.',detail:{id:l.id,rank:l.rank,rivalPickedGw:l.rival?.squad?.gameweek??null}});
  const dir='3_data_third_party';
  for (const name of (await readdir(dir)).filter(n=>n.toLowerCase().endsWith('.csv')).sort()) {
    const path=join(dir,name),raw=await readFile(path),parsed=parseCsvRows(raw.toString());
    const columns=Object.keys(parsed[0]??{});
    const weeks=columns.filter(c=>/^gw\d+_xpts$/.test(c)).map(c=>Number(c.match(/\d+/)![0]));
    const counts=Object.fromEntries(columns.map(k=>[k,parsed.filter(r=>r[k]?.trim()).length]));
    const isCopilot=name.toLowerCase().includes('fplcopilot');
    add({name,class:'third-party predictions',provider:isCopilot?'FPL Copilot':'Unverified CSV publisher',url:isCopilot?'https://fplcopilot.com/':'',path,
      seasons:[],gameweeks:weeks,players:new Set(parsed.map(r=>r.fpl_id).filter(Boolean)).size,teams:new Set(parsed.map(r=>r.team).filter(Boolean)).size,
      retrievedAt:null,credentials:'none for existing private file',subscription:'current provider entitlement unverified',
      completeness:'Filename date is not a provider publication or retrieval timestamp. Excluded from personal xPts.',
      access:'Existing private import. Live entitlement and redisplay licence unverified.',lineage:'Underlying model dependencies unverified.',
      detail:{filenameDate:filenameProjectionDate(name),sha256:digest(raw),rows:parsed.length,nonemptyByColumn:counts}});
  }
  const hist='data/fpl-match-history';
  for(const name of (await readdir(hist)).filter(n=>n.endsWith('.csv')).sort()){
    const path=join(hist,name),raw=await readFile(path),rows=parseCsvRows(raw.toString());
    add({name:'Historical fixture results '+name,class:'historical outcomes',provider:'Vaastav Fantasy Premier League archive',
      url:'https://github.com/vaastav/Fantasy-Premier-League',path,seasons:[...new Set(rows.map(r=>r.season))].sort(),
      gameweeks:[...new Set(rows.map(r=>Number(r.gameweek)))].sort((a,b)=>a-b),players:null,teams:new Set(rows.flatMap(r=>[r.home_team_code,r.away_team_code])).size,
      retrievedAt:null,completeness:rows.length+' results. Missing xG for '+rows.filter(r=>!r.home_xg||!r.away_xg).length+' matches.',
      access:'Repository source manifest cites upstream commits. Check underlying rights before redisplay.',lineage:'Historical official-derived scorelines; retrospective research.',
      detail:{sha256:digest(raw),manifest:JSON.parse(await readFile(join(hist,'vaastav-source-manifest.json'),'utf8'))}});
  }
  for(const name of (await readdir(hist)).filter(n=>/^\d{4}-\d{2}\.json$/.test(n))) {
    const path=join(hist,name),raw=await readFile(path);
    const h=JSON.parse(raw.toString()) as {season:string;matches:{homeTeamCode:number;awayTeamCode:number;versions:{event:number;observedAt:string}[]}[]};
    const observations=h.matches.flatMap(m=>m.versions);
    add({name:'Versioned FPL final match results',class:'historical outcomes',url:official+'fixtures/',path,seasons:[h.season],
      gameweeks:[...new Set(observations.map(r=>r.event))].sort((a,b)=>a-b),players:null,teams:new Set(h.matches.flatMap(r=>[r.homeTeamCode,r.awayTeamCode])).size,
      retrievedAt:observations.map(r=>r.observedAt).sort().at(-1)??null,completeness:h.matches.length+' unique matches.',detail:{sha256:digest(raw)}});
  }
  const archiveRoot='data/forecast-archive';
  const archive=[];
  for(const rel of (await readdir(archiveRoot,{recursive:true})).filter(n=>n.endsWith('.json.gz')).sort()) {
    const path=join(archiveRoot,rel),raw=await readFile(path),rec=JSON.parse(gunzipSync(raw).toString());
    archive.push({path,sha256:digest(raw),class:rec.outcomes?'historical outcomes':'locally calculated predictions',season:rec.season,gw:rec.targetGw,
      players:rec.predictions?.length??rec.outcomes?.length??null,teams:rec.snapshot?.teams?.length??null,model:rec.modelVersion,
      retrievedAt:rec.retrievedAt??rec.observedAt,computedAt:rec.computedAt??null,inputId:rec.inputId,deadline:rec.deadlineAt??null});
  }
  for(const kind of ['locally calculated predictions','historical outcomes']) {
    const subset=archive.filter(r=>r.class===kind);
    add({name:kind==='historical outcomes'?'Settled forecast archive':'Prospective player forecast archive',class:kind,provider:kind==='historical outcomes'?'Premier League / FPL':'FPL VORTEX',
      url:kind==='historical outcomes'?official+'event/{gw}/live/':'https://github.com/mukudahal/FPLVORTEX',path:archiveRoot,seasons:[...new Set(subset.map(r=>r.season))],
      gameweeks:[...new Set(subset.map(r=>r.gw))].sort((a,b)=>a-b),players:null,teams:null,retrievedAt:subset.map(r=>r.retrievedAt).sort().at(-1)??null,
      completeness:subset.length+' files. Per-observation coverage and input identities attached.',access:'Private repository research records.',
      lineage:kind==='historical outcomes'?'Official settlement matched to the recorded cohort.':'Generated from the archived official snapshot. Repeated dates do not create independent gameweeks.',detail:subset});
  }
  const recovery='public/data/fpl-snapshot.json',raw=await readFile(recovery),copy=JSON.parse(raw.toString()) as Snapshot;
  add({name:'Recovery snapshot',class:'unverified or incomplete information',url:'https://fplvortex.onrender.com/data/fpl-snapshot.json',path:recovery,
    seasons:[copy.meta.season],gameweeks:copy.gameweeks.map(g=>g.id),players:copy.players.length,teams:copy.teams.length,retrievedAt:copy.meta.generatedAt,
    completeness:'Recovery only. New serving time cannot refresh the provider observations.',detail:{sha256:digest(raw)}});
  const markets=[['The Odds API','https://the-odds-api.com/','provider key'],['Football-Data.co.uk','https://www.football-data.co.uk/fixtures.csv','none'],['ESPN scoreboard','https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard','none']];
  for (const [provider,url,credentials] of markets) add({name:'Bookmaker market inputs',class:'market-derived estimates',provider,url,path:'server/odds.ts',
    seasons:[],gameweeks:null,players:null,teams:null,retrievedAt:null,credentials,subscription:'Provider-specific entitlement unverified',access:'Public visibility alone does not establish redistribution rights.',
    completeness:'Market quotes are optional and excluded from the personal mean. Individual market timestamps and coverage require raw quotes.',lineage:'Market-implied probabilities; provider feeds can share bookmakers.',
    detail:snapshot.meta.oddsMeta?.feedDiagnostics??null});
  for (const n of snapshot.meta.repoData?.verifiedNotes??[]) add({name:'Dated football news',provider:new URL(n.sourceUrl).hostname,url:n.sourceUrl,path:'server/repoData.ts',
    players:n.playerId?1:null,teams:1,gameweeks:null,retrievedAt:n.checkedAt,completeness:'A dated note cannot establish current availability.',detail:{clubId:n.teamId,playerId:n.playerId??null}});
  for(const [name,url] of [['FPL Review','https://fplreview.com/'],['Fantasy Football Scout','https://www.fantasyfootballscout.co.uk/'],['Fantasy Football Hub','https://www.fantasyfootballhub.co.uk/']]) {
    add({name,class:'unverified or incomplete information',provider:name,url,path:'No integrated feed',seasons:[],gameweeks:null,players:null,teams:null,
      retrievedAt:null,credentials:'unverified',subscription:'unverified',completeness:'No licensed timestamped bulk projections available to this run.',
      access:'No subscriber content accessed; integration or redistribution rights unverified.',lineage:'Independence and overlapping inputs unknown.'});
  }
  for (const [name,url,provider,completeness] of [
    ['FPL Core Insights','https://github.com/olbauday/FPL-Core-Insights','FPL Core','Official-ID historical snapshots and curated Opta-like match statistics; not an authenticated Opta feed. Validate season, settled GW, field definitions and rights before import.'],
    ['Opta event statistics','https://www.statsperform.com/opta/','Stats Perform','Direct licensed feed not verified. Official FPL-derived metrics remain in the independent forecast; do not duplicate those metrics.'],
    ['FPL Data & Planner','https://docs.google.com/spreadsheets/d/1HcQsj3aVbvlak135JK_akFxQ68hG6ioV2HRtOpr-6JM/edit','Manager-provided spreadsheet','Reference only until runtime source authentication, latest settled GW, ID and metric checks are verified. Top 100 is not a top 10,000 cohort.'],
  ]) add({name,url,provider,class:'unverified or incomplete information',path:'Reference only; no live import',seasons:[],gameweeks:null,players:null,teams:null,retrievedAt:null,providerUpdatedAt:null,credentials:'not verified for workflow',subscription:'not verified',completeness,access:'Validate source permissions before ingest or redistribution.',lineage:'Excluded from model mean until validated.'});
  return sources;
}
