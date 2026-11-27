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

export function buildPlayerConsiderations(snapshot: Snapshot) {
  const next=snapshot.meta.nextEventId;
  const gameweeks=snapshot.gameweeks.filter(g=>g.id>=next).map(g=>g.id).sort((a,b)=>a-b).slice(0,5);
  const weeks=gameweeks.slice(0,3);
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
      fullName:player.fullName||player.name,
      availability:availability(player), chance:player.chance, priceTenths:player.cost,
      ownership:player.selectedByPercent, transfersIn:player.transfersInEvent,
      weeks:weeks.map(gw=>{
        const matches=snapshot.fixtures.filter(f=>f.event===gw&&(f.teamH===team.id||f.teamA===team.id))
          .sort((a,b)=>(a.kickoffTime??'').localeCompare(b.kickoffTime??'')||a.id-b.id);
        const fdr=matches.map(f=>{
          const home=f.teamH===team.id;
          return { difficulty:home?f.teamHDifficulty:f.teamADifficulty, home, opponent:teams.get(home?f.teamA:f.teamH)?.shortName??'TBC' };
        });
        const forecast=computePlayerXPts(element,gw,fixtureInputs,teamInputs,completed,gw-next,priors);
        return {gw,fdr,xPts:forecastMean(player,forecast,null,false)};
      }),
    };
  });
  return {gameweeks, weeks, snapshotAt:snapshot.meta.generatedAt, players};
}
export type PlayerConsiderations = ReturnType<typeof buildPlayerConsiderations>;
