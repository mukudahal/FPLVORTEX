import { normalizeSnapshot, type RawFplData } from '../server/normalize';
import { toRepoElement } from '../src/lib/analytics';
import { toRepoFixtures, toRepoTeams } from '../src/lib/fixtures';
import { forecastMean } from '../src/lib/forecastPolicy';
import { computePlayerXPts, computePositionPriors } from '../src/lib/repoModel/xpts';
import type { Player, Snapshot } from '../src/lib/types';

const shirtByClub: Readonly<Record<string, string>> = {
  ARS:'#bc1730', AVL:'#721e42', BOU:'#aa142c', BRE:'#bf1831', BHA:'#0064ae',
  CHE:'#1545aa', COV:'#79bde5', CRY:'#194d99', EVE:'#1653a0', FUL:'#f2f1ec',
  HUL:'#e4a026', IPS:'#194d99', LEE:'#f3f0e5', LIV:'#b51730', MCI:'#83bedf',
  MUN:'#bb1d2f', NEW:'#20252b', NFO:'#ba1233', TOT:'#f1f2f6', SUN:'#c4142b',
};

function availability(player: Pick<Player, 'status' | 'chance'>) {
  if (player.status === 'i') return 'Injured';
  if (player.status === 's') return 'Suspended';
  if (player.status === 'd') return 'Doubtful';
  if (player.status !== 'a' || player.chance === 0) return 'Unavailable';
  return player.chance !== null && player.chance < 100 ? 'Doubtful' : 'Available';
}

export function buildPlayerConsiderations(snapshot: Snapshot, horizon = 5) {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 8) throw Error('Invalid consideration horizon.');
  const next=snapshot.meta.nextEventId;
  const gameweeks=snapshot.gameweeks.filter(g=>g.id>=next).map(g=>g.id).sort((a,b)=>a-b).slice(0,horizon);
  const weeks=gameweeks;
  const fixtureInputs=toRepoFixtures(snapshot.fixtures);
  const teamInputs=new Map(toRepoTeams(snapshot.teams).map(t=>[t.id,t]));
  const teams=new Map(snapshot.teams.map(t=>[t.id,t]));
  const priors=computePositionPriors(snapshot.players.map(toRepoElement));
  const completed=Math.max(1,snapshot.gameweeks.filter(g=>g.finished).length);
  const ranked=snapshot.players.filter(p=>Number.isSafeInteger(p.transfersInEvent)&&p.transfersInEvent>0)
    .sort((a,b)=>b.transfersInEvent-a.transfersInEvent||a.id-b.id).slice(0,6);
  const players=ranked.map(player=>{
    const team=teams.get(player.teamId);
    if(!team) throw Error('Club is missing for FPL player '+player.id);
    const element=toRepoElement(player);
    return {
      id:player.id, code:player.code, teamCode:team.code, club:team.shortName,
      shirt:player.position==='GKP' && team.shortName==='LEE' ? '#b0ead4' : (shirtByClub[team.shortName]??'#d8e4eb'),
      fullName:player.fullName||player.name, position:player.position,
      availability:availability(player), chance:player.chance, priceTenths:player.cost,
      ownership:player.selectedByPercent, transfersIn:player.transfersInEvent,
      weeks:weeks.map(gw=>{
        const matches=snapshot.fixtures.filter(f=>f.event===gw&&(f.teamH===team.id||f.teamA===team.id))
          .sort((a,b)=>(a.kickoffTime??'').localeCompare(b.kickoffTime??'')||a.id-b.id);
        const fdr=matches.map(f=>{
          const home=f.teamH===team.id;
          return { difficulty:home?f.teamHDifficulty:f.teamADifficulty, home, opponent:teams.get(home?f.teamA:f.teamH)?.shortName??'TBC' };
        });
        const xPts: number | null = forecastMean(player,computePlayerXPts(element,gw,fixtureInputs,teamInputs,completed,gw-next,priors),null,false);
        return {gw,fdr,xPts};
      }),
    };
  });
  return {gameweeks, weeks, snapshotAt:snapshot.meta.generatedAt, players};
}
export type PlayerConsiderations = ReturnType<typeof buildPlayerConsiderations>;

const official = 'https://fantasy.premierleague.com/api';

async function readOfficial<T>(path: string, verifyAge = false): Promise<T> {
  const read = async () => {
    const response = await fetch(official + path, {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { accept:'application/json', 'user-agent':'FPL-VORTEX/1.0' },
    });
    if (!response.ok) throw Error('Official FPL returned HTTP '+response.status+' for '+path);
    const age = response.headers.get('age');
    if (verifyAge && age !== null && Number(age) > 900) throw Error('Official transfer feed is older than 15 minutes.');
    return response.json() as Promise<T>;
  };
  try { return await read(); }
  catch { return read(); }
}

export async function fetchVerifiedPlayerConsiderations(next: number, horizon = 5) {
  const [bootstrap, fixtures] = await Promise.all([
    readOfficial<RawFplData['bootstrap']>('/bootstrap-static/',true),
    readOfficial<RawFplData['fixtures']>('/fixtures/'),
  ]);
  const event = Array.isArray(bootstrap?.events) && bootstrap.events.find(event => event.is_next === true);
  if (!event || event.id !== next || !(Date.parse(event.deadline_time) > Date.now()) ||
      !Array.isArray(bootstrap.teams) || !Array.isArray(bootstrap.elements) ||
      !Array.isArray(fixtures) || !fixtures.some(f => f.event === next)) {
    throw Error('The official FPL market and fixtures must cover the same upcoming gameweek as the planner.');
  }
  if (bootstrap.elements.some(p=>!Number.isSafeInteger(p.transfers_in_event)||p.transfers_in_event<0)) {
    throw Error('The official FPL feed has missing or invalid gameweek transfer totals.');
  }
  const selected=bootstrap.elements.filter(p=>p.transfers_in_event>0)
    .sort((a,b)=>b.transfers_in_event-a.transfers_in_event||a.id-b.id).slice(0,6);
  const owning=(value:unknown)=>typeof value==='string' && value.trim()!=='' && Number(value)>=0 && Number(value)<=100;
  if (selected.length!==6 || selected.some(p=>!Number.isSafeInteger(p.now_cost)||p.now_cost<=0||
      !owning(p.selected_by_percent)||typeof p.status!=='string'||!p.status.trim())) {
    throw Error('Six players with verified official price, ownership and availability are required.');
  }
  return buildPlayerConsiderations(normalizeSnapshot({bootstrap,fixtures,live:null},
    {source:'live',upstreamOk:true,stale:false}), horizon);
}
