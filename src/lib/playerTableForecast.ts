import { getSnapshotFreshness } from './snapshotFreshness';
import { toRepoElement } from './analytics';
import { buildProjectionContext, toRepoFixtures, toRepoTeams } from './fixtures';
import { computePlayerXPts, computePositionPriors } from './repoModel/xpts';
import { estimateMinutesDistribution } from './repoModel/minutes';
import type { PositionPriors } from './repoModel/xpts';
import type { SlimTeam } from './repoModel/types';
import type { EnrichedPlayer, Fixture, Player, Snapshot } from './types';

/**
 * Players-tab forecast adapter: the exact existing mechanistic model, once
 * per fixture, with fresh public FPL status applied at display time.
 * The different Colab notebook research model is NOT claimed as equivalent.
 */
export type ForecastAvailability = 'available' | 'doubtful' | 'out-next' | 'recovery-unverified' | 'stale';
export interface FixturePlayerForecast {
  fixtureId: number;
  gw: number;
  points: number | null;
  availability: ForecastAvailability;
}

export function forecastAvailability(player: Pick<Player, 'status' | 'chance'>, gw: number, nextGw: number): ForecastAvailability {
  const status = (player.status || '').toLowerCase();
  const limited = player.chance !== null && Number.isFinite(player.chance) && player.chance < 100;
  const out = ['i','s','u','n'].includes(status) || player.chance === 0;
  if (gw > nextGw && (out || status === 'd' || limited || status !== 'a')) return 'recovery-unverified';
  if (out) return 'out-next';
  if (status !== 'a' || limited) return 'doubtful';
  return 'available';
}

export interface PlayerForecastContext {
  snapshot: Snapshot;
  completedEvents: number;
  priors: PositionPriors;
  teamsMap: Map<number, SlimTeam>;
  officialPlayers: Map<number, Player>;
  fresh: boolean;
}
export function buildPlayerForecastContext(snapshot: Snapshot): PlayerForecastContext {
  const fresh = snapshot.meta.upstreamOk === true && getSnapshotFreshness(snapshot.meta).status === 'recent';
  const ctx = buildProjectionContext(snapshot.teams, snapshot.fixtures, snapshot.gameweeks, snapshot.meta.nextEventId);
  const elements = snapshot.players.map(toRepoElement);
  return { snapshot, completedEvents: ctx.completedEvents, priors: computePositionPriors(elements),
    teamsMap: new Map(toRepoTeams(snapshot.teams).map(t=>[t.id,t])),
    officialPlayers: new Map(snapshot.players.map(p=>[p.id,p])), fresh };
}
export function playerFixtureForecast(context: PlayerForecastContext,
    player: Pick<EnrichedPlayer,'id'|'teamId'>, fixture: Fixture, gw: number): FixturePlayerForecast {
  const blocked=(availability: ForecastAvailability):FixturePlayerForecast => ({fixtureId:fixture.id,gw,points:null,availability});
  const official = context.officialPlayers.get(player.id);
  if (!Number.isInteger(gw) || gw > 38 || gw >= context.snapshot.meta.nextEventId + 10 || !context.fresh || !official || official.teamId!==player.teamId) return blocked('stale');
  const availability = forecastAvailability(official,gw,context.snapshot.meta.nextEventId);
  if (availability!=='available' && availability!=='doubtful') return blocked(availability);
  if (!Number.isInteger(fixture.id) || fixture.id<=0 || fixture.event!==gw ||
      (fixture.teamH!==player.teamId && fixture.teamA!==player.teamId) ||
      !context.teamsMap.has(fixture.teamH) || !context.teamsMap.has(fixture.teamA) ||
      fixture.finished || gw<context.snapshot.meta.nextEventId) return blocked('stale');
  const result=computePlayerXPts(toRepoElement(official),gw,toRepoFixtures([fixture]),context.teamsMap,
    context.completedEvents,gw-context.snapshot.meta.nextEventId,context.priors);
  if (result.elementId!==player.id || result.fixtureCount!==1 || !Number.isFinite(result.xPts) ||
      result.xPts<0 || !Number.isFinite(result.p60) || !Number.isFinite(result.pSub)) return blocked('stale');
  return {fixtureId:fixture.id,gw,points:result.xPts,availability};
}
export function playerGameweekPoints(context: PlayerForecastContext, player: Pick<EnrichedPlayer,'id'|'teamId'>, gw: number): number|null {
  const matches=context.snapshot.fixtures.filter(f=>f.event===gw && (f.teamH===player.teamId || f.teamA===player.teamId));
  if (!matches.length || new Set(matches.map(f=>f.id)).size!==matches.length) return null;
  const results=matches.map(f=>playerFixtureForecast(context,player,f,gw));
  if (results.some(result=>result.points===null)) return null;
  return Math.round(results.reduce((sum,result)=>sum+(result.points??0),0)*100)/100;
}
export function playerHorizonPoints(context: PlayerForecastContext,player: Pick<EnrichedPlayer,'id'|'teamId'>,startGw:number,weeks=5):number|null {
  let total=0, hasFixture=false;
  for(let gw=startGw;gw<Math.min(startGw+weeks,39);gw++){
    const hasMatch=context.snapshot.fixtures.some(f=>f.event===gw&&(f.teamH===player.teamId||f.teamA===player.teamId));
    if(!hasMatch)continue;
    hasFixture=true;
    const points=playerGameweekPoints(context,player,gw);
    if(points===null)return null;
    total+=points;
  }
  return hasFixture?Math.round(total*100)/100:null;
}

/** Expected minutes from the SAME repo minutes model used by computePlayerXPts.
 * Doubles sum a separate fixture exposure; blanks or unverified recovery return null. */
export function playerGameweekExpectedMinutes(ctx:PlayerForecastContext, player:Pick<EnrichedPlayer,'id'|'teamId'>, gw:number):number|null {
 const official=ctx.officialPlayers.get(player.id);
 const games=ctx.snapshot.fixtures.filter(f=>f.event===gw&&(f.teamH===player.teamId||f.teamA===player.teamId));
 if(!Number.isInteger(gw)||gw>38||gw>=ctx.snapshot.meta.nextEventId+10||!ctx.fresh||!official||official.teamId!==player.teamId||!games.length||
    new Set(games.map(f=>f.id)).size!==games.length||
    games.some(f=>f.finished)||gw<ctx.snapshot.meta.nextEventId)return null;
 const av=forecastAvailability(official,gw,ctx.snapshot.meta.nextEventId);
 if(av!=='available'&&av!=='doubtful')return null;
 const mins=estimateMinutesDistribution(toRepoElement(official),ctx.completedEvents,gw-ctx.snapshot.meta.nextEventId);
 return Number.isFinite(mins.expectedMinutes)?Math.round(mins.expectedMinutes*games.length*10)/10:null;
}
